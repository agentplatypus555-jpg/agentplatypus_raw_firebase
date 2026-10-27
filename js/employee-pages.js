import { listenMany, paths, readList, saveRow } from "./db.js";
import { setSession } from "./session.js";
import { formatWhen } from "./records.js";
import { startPortal } from "./shell.js";
import { changeOwnPassword, claimTicket, completeTicket, submitWork } from "./store.js";
import { button, el, facts, field, loader, pill, prioritySort, setBusy, ticketVisibleTo } from "./ui.js";

function watch(keys, paint) {
  return listenMany(keys, (data, ready) => {
    if (ready) paint(data);
  }, () => paint(null));
}

function denied(panel) {
  panel.replaceChildren(el("p", "quiet", "Firebase refused this read. Check the database rules, then refresh."));
}

export function pageEmployeeCommon(session) {
  const ctx = startPortal(session, "employee");
  ctx.setHeading("Employee", "Common Works");
  const board = el("div", "board");
  board.append(loader("Loading tickets"));
  ctx.panel.append(board);
  watch(["tickets", "assignments"], (data) => {
    if (!data) return denied(ctx.panel);
    const mine = data.tickets.filter((row) => ticketVisibleTo(row, session, data.assignments) || (row.assignedTo === session.id && row.status === "completed"));
    const open = prioritySort(mine.filter((row) => row.status === "open"));
    const progress = prioritySort(mine.filter((row) => row.status === "progress"));
    const done = mine.filter((row) => row.status === "completed");
    board.replaceChildren(
      column("Open", open, (ticket) => openCard(ctx, ticket)),
      column("My progress", progress, (ticket) => progressCard(ctx, ticket, session)),
      column("Completed", done, (ticket) => doneCard(ticket)),
    );
  });
}

function column(title, tickets, render) {
  const section = el("section", "board-col");
  section.append(el("h2", null, `${title} · ${tickets.length}`));
  if (!tickets.length) section.append(el("p", "quiet", "Nothing here."));
  tickets.forEach((ticket) => section.append(render(ticket)));
  return section;
}

function openCard(ctx, ticket) {
  const card = el("article", "card");
  const head = el("div", "card-head");
  head.append(el("strong", null, ticket.title), pill(ticket.priority || "Normal"));
  card.append(head, el("p", null, ticket.details || ""), facts([
    ["Project", ticket.ticketType === "project" ? ticket.projectName : "Free ticket"],
    ["Created", formatWhen(ticket.createdDate)],
  ]), button("Add to my progress", "btn solid", async () => {
    try {
      await claimTicket(ticket.id, ctx.session);
      ctx.toast("Added to your progress");
    } catch (error) {
      ctx.toast(error.message || "Could not take that ticket.");
    }
  }));
  return card;
}

function progressCard(ctx, ticket, session) {
  const card = el("article", "card");
  const head = el("div", "card-head");
  head.append(el("strong", null, ticket.title), pill("progress"));
  const actions = el("div", "actions");
  actions.append(
    button("Save note", "btn ghost", async () => {
      const data = await ctx.openForm({
        title: "Progress note",
        fields: [{ key: "progressNote", label: "Note", type: "textarea", value: ticket.progressNote || "" }],
      });
      if (!data) return;
      await saveRow(paths.tickets, ticket.id, { progressNote: data.progressNote });
      ctx.toast("Note saved");
    }),
    button("Mark completed", "btn solid", async () => {
      await completeTicket(ticket, session);
      ctx.toast("Completed");
    }),
    button("Release", "btn ghost", async () => {
      await saveRow(paths.tickets, ticket.id, {
        assignedTo: "",
        assignedName: "",
        assignedCode: "",
        status: "open",
        takenAt: "",
      });
      ctx.toast("Released");
    }),
  );
  card.append(head, el("p", null, ticket.details || ""), facts([["Note", ticket.progressNote]]), actions);
  return card;
}

function doneCard(ticket) {
  const card = el("article", "card");
  const head = el("div", "card-head");
  head.append(el("strong", null, ticket.title), pill("completed"));
  card.append(head, facts([
    ["Finished", formatWhen(ticket.completedDate)],
    ["Note", ticket.progressNote],
  ]));
  return card;
}

export function pageEmployeeDashboard(session) {
  const ctx = startPortal(session, "employee-dashboard");
  ctx.setHeading("Employee", "Dashboard");
  const grid = el("section", "metrics");
  grid.append(loader("Loading your dashboard"));
  const extra = el("div", "split");
  ctx.panel.append(grid, extra);
  watch(["reports", "assignments", "projects", "tickets"], (data) => {
    if (!data) return denied(ctx.panel);
    const mine = data.reports.filter((row) => row.employeeId === session.id);
    const assigned = data.assignments.filter((row) => row.employeeId === session.id);
    const open = prioritySort(data.tickets.filter((row) => ticketVisibleTo(row, session, data.assignments) && row.status === "open")).slice(0, 4);
    grid.replaceChildren(
      metric("My reports", mine.length),
      metric("Pending", mine.filter((row) => row.status === "pending").length),
      metric("Completed", mine.filter((row) => row.status === "completed").length),
      metric("Projects", assigned.length),
    );
    const projects = el("section", "panel-card");
    projects.append(el("h2", null, "Assigned projects"));
    if (!assigned.length) projects.append(el("p", "quiet", "No project is assigned yet."));
    assigned.forEach((row) => {
      const project = data.projects.find((item) => item.id === row.projectId);
      projects.append(el("p", null, `${row.projectName}${project ? ` · ${project.status}` : ""}`));
    });
    const tickets = el("section", "panel-card");
    tickets.append(el("h2", null, "Open common tickets"));
    if (!open.length) tickets.append(el("p", "quiet", "No open ticket for you."));
    open.forEach((row) => tickets.append(el("p", null, row.title)));
    extra.replaceChildren(projects, tickets);
  });
}

function metric(label, value) {
  const article = el("article");
  article.append(el("span", null, label), el("strong", null, String(value)));
  return article;
}

export function pageEmployeeWork(session) {
  const ctx = startPortal(session, "employee-work");
  ctx.setHeading("Employee", "My Work");
  let latest = { assignments: [], projects: [], reports: [] };
  const form = el("form", "form narrow");
  const project = document.createElement("select");
  project.name = "projectId";
  project.required = true;
  const projectLabel = el("label", null, "Project");
  projectLabel.append(project);
  const details = document.createElement("textarea");
  details.required = true;
  details.placeholder = "What did you do?";
  const detailsLabel = el("label", null, "Work details");
  detailsLabel.append(details);
  const error = el("p", "form-error");
  error.hidden = true;
  const actions = el("div", "actions");
  const pending = el("button", "btn ghost", "Submit pending");
  pending.type = "submit";
  pending.dataset.status = "pending";
  const completed = el("button", "btn solid", "Submit completed");
  completed.type = "submit";
  completed.dataset.status = "completed";
  actions.append(pending, completed);
  form.append(projectLabel, detailsLabel, error, actions);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = event.submitter?.dataset.status || "pending";
    const chosen = latest.projects.find((row) => row.id === project.value);
    const assignment = latest.assignments.find((row) => row.employeeId === session.id && row.projectId === project.value);
    if (!chosen || !assignment) {
      error.textContent = "Pick one of your assigned projects.";
      error.hidden = false;
      return;
    }
    const busy = event.submitter || completed;
    setBusy(busy, true);
    try {
      await submitWork(session, chosen, details.value.trim(), status);
      details.value = "";
      error.hidden = true;
      ctx.toast("Work submitted");
    } catch (err) {
      error.textContent = err.message || "Could not submit.";
      error.hidden = false;
    } finally {
      setBusy(busy, false);
    }
  });
  const done = el("section", "stack");
  done.append(loader("Loading your work"));
  form.hidden = true;
  ctx.panel.append(form, el("h2", null, "Finished common work"), done);
  watch(["assignments", "projects", "reports"], (data) => {
    if (!data) return denied(ctx.panel);
    form.hidden = false;
    latest = data;
    const mine = data.assignments.filter((row) => row.employeeId === session.id);
    const current = project.value;
    project.replaceChildren();
    if (!mine.length) {
      const option = el("option", null, "No assigned project");
      option.value = "";
      project.append(option);
    }
    mine.forEach((row) => {
      const option = el("option", null, row.projectName);
      option.value = row.projectId;
      project.append(option);
    });
    if ([...project.options].some((option) => option.value === current)) project.value = current;
    const finished = data.reports.filter((row) => row.employeeId === session.id && row.source === "common");
    done.replaceChildren(...(finished.length ? finished.map((row) => {
      const card = el("article", "card");
      card.append(el("strong", null, row.projectName), facts([
        ["Work", row.workDetails],
        ["When", formatWhen(row.createdDate)],
      ]));
      return card;
    }) : [el("p", "quiet", "No finished common ticket yet.")]));
  });
}

export function pageEmployeeHistory(session) {
  const ctx = startPortal(session, "employee-history");
  ctx.setHeading("Employee", "Work History");
  let month = "all";
  let year = "all";
  let project = "all";
  let status = "all";
  let latest = [];
  const toolbar = el("div", "toolbar");
  const monthSelect = document.createElement("select");
  const yearSelect = document.createElement("select");
  const projectSelect = document.createElement("select");
  const statusSelect = document.createElement("select");
  [["all", "All months"], ...Array.from({ length: 12 }, (_, i) => [String(i + 1), ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][i]])].forEach(([value, label]) => {
    const option = el("option", null, label);
    option.value = value;
    monthSelect.append(option);
  });
  monthSelect.addEventListener("change", () => { month = monthSelect.value; paint(); });
  yearSelect.addEventListener("change", () => { year = yearSelect.value; paint(); });
  projectSelect.addEventListener("change", () => { project = projectSelect.value; paint(); });
  [["all", "All statuses"], ["pending", "Pending"], ["completed", "Completed"]].forEach(([value, label]) => {
    const option = el("option", null, label);
    option.value = value;
    statusSelect.append(option);
  });
  statusSelect.addEventListener("change", () => { status = statusSelect.value; paint(); });
  toolbar.append(monthSelect, yearSelect, projectSelect, statusSelect);
  const list = el("div", "stack");
  list.append(loader("Loading history"));
  ctx.panel.append(toolbar, list);
  const paint = () => {
    const years = [...new Set(latest.map((row) => String(row.year)))].sort();
    fillSelect(yearSelect, "All years", years.map((value) => [value, value]), year);
    const projects = [...new Set(latest.map((row) => row.projectName || "Common Works"))];
    fillSelect(projectSelect, "All projects", projects.map((value) => [value, value]), project);
    const rows = latest.filter((row) => {
      if (month !== "all" && String(row.month) !== month) return false;
      if (year !== "all" && String(row.year) !== year) return false;
      if (project !== "all" && (row.projectName || "Common Works") !== project) return false;
      if (status !== "all" && row.status !== status) return false;
      return true;
    });
    list.replaceChildren(...(rows.length ? rows.map((row) => {
      const card = el("article", "card");
      const head = el("div", "card-head");
      head.append(el("strong", null, row.projectName || "Common Works"), pill(row.status));
      card.append(head, facts([
        ["Work", row.workDetails],
        ["Date", `${formatWhen(row.createdDate)} ${row.createdTime || ""}`],
        ["Source", row.source === "common" ? "Common work" : "Project work"],
      ]));
      return card;
    }) : [el("p", "quiet", "No history for that filter.")]));
  };
  watch(["reports"], (data) => {
    if (!data) return denied(list);
    latest = data.reports.filter((row) => row.employeeId === session.id);
    paint();
  });
}

function fillSelect(select, first, options, current) {
  select.replaceChildren();
  const all = el("option", null, first);
  all.value = "all";
  select.append(all);
  options.forEach(([value, label]) => {
    const option = el("option", null, label);
    option.value = value;
    select.append(option);
  });
  select.value = [...select.options].some((option) => option.value === current) ? current : "all";
}

export async function pageEmployeeProfile(session) {
  const ctx = startPortal(session, "employee-profile");
  ctx.setHeading("Employee", "Profile");
  ctx.panel.append(loader("Loading profile"));
  const rows = await readList(paths.employees);
  const row = rows.find((item) => item.id === session.id);
  if (!row) {
    ctx.panel.replaceChildren(el("p", "quiet", "This employee profile is no longer in the database."));
    return;
  }
  const fields = [
    { key: "fullName", label: "Name", required: true, value: row.fullName || "" },
    { key: "employeeCode", label: "Employee code", required: true, value: row.employeeCode || "" },
    { key: "mobile", label: "Mobile", value: row.mobile || "" },
    { key: "department", label: "Department", value: row.department || "" },
    { key: "designation", label: "Designation", value: row.designation || "" },
  ];
  const form = el("form", "form narrow");
  fields.forEach((spec) => form.append(field(spec)));
  const email = document.createElement("input");
  email.value = row.email || session.email || "";
  email.readOnly = true;
  const emailLabel = el("label", null, "Email");
  emailLabel.append(email, el("small", "hint", "Email stays the login and cannot be edited."));
  form.append(emailLabel);
  const error = el("p", "form-error");
  error.hidden = true;
  const submit = el("button", "btn solid", "Save profile");
  submit.type = "submit";
  form.append(error, submit);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = {
      fullName: form.elements.fullName.value.trim(),
      employeeCode: form.elements.employeeCode.value.trim(),
      mobile: form.elements.mobile.value.trim(),
      department: form.elements.department.value.trim(),
      designation: form.elements.designation.value.trim(),
    };
    if (!data.fullName || !data.employeeCode) {
      error.textContent = "Name and employee code are required.";
      error.hidden = false;
      return;
    }
    setBusy(submit, true);
    try {
      await saveRow(paths.employees, row.id, data);
      const next = { ...session, ...data, email: row.email };
      setSession(next);
      ctx.setName(data.fullName);
      error.hidden = true;
      ctx.toast("Profile saved");
    } catch (err) {
      error.textContent = err.message || "Could not save.";
      error.hidden = false;
    } finally {
      setBusy(submit, false);
    }
  });
  ctx.panel.replaceChildren(form);
}
