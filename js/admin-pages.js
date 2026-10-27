import { addRow, deleteRow, listenMany, paths, readList, saveRow } from "./db.js";
import { formatWhen, stamp, todayIso, yesterdayIso } from "./records.js";
import { canEditAdmin, canSeePasswords, isLastMaster, normalizeAdminRole, roleChoices } from "./roles.js";
import { setSession } from "./session.js";
import { startPortal } from "./shell.js";
import { createAdmin, createEmployee, deleteEmployee, updateAdmin, updateEmployee } from "./store.js";
import {
  accountRemoved,
  button,
  candidatesFor,
  downloadCsv,
  el,
  facts,
  field,
  loader,
  pill,
  setBusy,
  prioritySort,
} from "./ui.js";

function watch(keys, paint) {
  return listenMany(keys, (data, ready) => {
    if (ready) paint(data);
  }, () => paint(null));
}

function denied(panel) {
  panel.replaceChildren(el("p", "quiet", "Firebase refused this read. Check the database rules, then refresh."));
}

function column(title, tickets, renderCard) {
  const section = el("section", "board-col");
  section.append(el("h2", null, `${title} · ${tickets.length}`));
  if (!tickets.length) section.append(el("p", "quiet", "Nothing in this column."));
  tickets.forEach((ticket) => section.append(renderCard(ticket)));
  return section;
}

function audience(ticket, employees, assignments) {
  if (ticket.selfTag) return `Admin · ${ticket.createdByName || "Admin"}`;
  if (ticket.ticketType !== "project") return ticket.assignedName || "Every employee";
  const names = candidatesFor(ticket, employees, assignments).map((row) => row.fullName);
  if (ticket.assignedName) return ticket.assignedName;
  return names.length ? `Only ${names.join(", ")}` : "Nobody on this project yet";
}

export function pageCommon(session) {
  const ctx = startPortal(session, "admin");
  ctx.setHeading("Admin", "Common Works");
  let latest = { tickets: [], employees: [], projects: [], assignments: [] };
  ctx.actions.append(button("New ticket", "btn solid", () => createTicket(ctx, latest)));
  const board = el("div", "board");
  board.append(loader("Loading tickets"));
  ctx.panel.append(board);
  watch(["tickets", "employees", "projects", "assignments"], (data) => {
    if (!data) return denied(ctx.panel);
    latest = data;
    const open = prioritySort(data.tickets.filter((row) => row.status === "open" && !row.selfTag));
    const progress = prioritySort(data.tickets.filter((row) => row.status === "progress" && !row.selfTag));
    const mine = prioritySort(data.tickets.filter((row) => row.selfTag));
    board.replaceChildren(
      column("Open", open, (ticket) => ticketCard(ctx, ticket, data)),
      column("In progress", progress, (ticket) => ticketCard(ctx, ticket, data)),
      column("Admin work", mine, (ticket) => ticketCard(ctx, ticket, data)),
    );
  });
}

async function createTicket(ctx, latest) {
  const data = await ctx.openForm({
    title: "New ticket",
    submitLabel: "Create",
    fields: [
      { key: "title", label: "Title", required: true, maxlength: 140 },
      { key: "details", label: "Details", type: "textarea", required: true, maxlength: 2000 },
      { key: "priority", label: "Priority", type: "select", options: ["Normal", "High", "Urgent"], value: "Normal" },
      { key: "ticketType", label: "Type", type: "select", options: [{ value: "free", label: "Free ticket" }, { value: "project", label: "Based on a project" }], value: "free" },
      { key: "projectId", label: "Project", type: "select", options: [{ value: "", label: "None" }, ...latest.projects.map((row) => ({ value: row.id, label: `${row.name} (${row.code})` }))] },
      { key: "owner", label: "First owner", type: "select", options: [{ value: "open", label: "Leave open" }, { value: "self", label: "I will do this" }], value: "open" },
    ],
  });
  if (!data) return;
  const project = latest.projects.find((row) => row.id === data.projectId);
  if (data.ticketType === "project" && !project) {
    ctx.toast("Pick a project for this ticket.");
    return;
  }
  const when = stamp();
  await addRow(paths.tickets, {
    title: data.title,
    details: data.details,
    priority: data.priority || "Normal",
    ticketType: data.ticketType,
    projectId: project?.id || "",
    projectName: project?.name || "",
    projectCode: project?.code || "",
    status: "open",
    assignedTo: "",
    assignedName: "",
    assignedCode: "",
    selfTag: data.owner === "self",
    selfAdminId: data.owner === "self" ? ctx.session.id : "",
    progressNote: "",
    createdDate: when.createdDate,
    createdBy: ctx.session.id,
    createdByName: ctx.session.fullName,
    assignedAt: "",
    takenAt: "",
    completedAt: "",
    completedDate: "",
    completedTime: "",
    reportId: "",
  });
  ctx.toast("Ticket created");
}

function ticketCard(ctx, ticket, data) {
  const card = el("article", "card");
  const head = el("div", "card-head");
  head.append(el("strong", null, ticket.title || "Untitled"), pill(ticket.status));
  const actions = el("div", "actions");
  actions.append(button("Edit", "btn ghost", () => editTicket(ctx, ticket)));
  if (ticket.createdBy === ctx.session.id) {
    actions.append(button("Delete", "btn warn", async () => {
      if (!await ctx.ask("Delete this ticket? Past reports stay.")) return;
      await deleteRow(paths.tickets, ticket.id);
      ctx.toast("Deleted");
    }));
  }
  if (!ticket.selfTag && ticket.status !== "completed") {
    const people = candidatesFor(ticket, data.employees, data.assignments);
    const select = document.createElement("select");
    select.append(el("option", null, "Assign"));
    select.lastChild.value = "";
    people.forEach((person) => {
      const option = el("option", null, person.fullName);
      option.value = person.id;
      if (person.id === ticket.assignedTo) option.selected = true;
    });
    const clear = el("option", null, "Open again");
    clear.value = "open";
    select.append(clear);
    select.addEventListener("change", async () => {
      if (!select.value) return;
      if (select.value === "open") {
        await saveRow(paths.tickets, ticket.id, { assignedTo: "", assignedName: "", assignedCode: "", status: "open", takenAt: "" });
        ctx.toast("Ticket is open");
        return;
      }
      const person = people.find((row) => row.id === select.value);
      await saveRow(paths.tickets, ticket.id, {
        assignedTo: person.id,
        assignedName: person.fullName,
        assignedCode: person.employeeCode,
        status: "progress",
        takenAt: Date.now(),
        selfTag: false,
        selfAdminId: "",
      });
      ctx.toast("Assigned");
    });
    actions.append(select);
  }
  if (ticket.selfTag && ticket.selfAdminId === ctx.session.id && ticket.status !== "completed") {
    actions.append(
      button("Save note", "btn ghost", () => saveNote(ctx, ticket)),
      button("Complete", "btn ghost", () => finishSelf(ctx, ticket)),
      button("Release", "btn ghost", async () => {
        await saveRow(paths.tickets, ticket.id, { selfTag: false, selfAdminId: "", status: "open", assignedTo: "", assignedName: "", assignedCode: "" });
        ctx.toast("Released to employees");
      }),
    );
  }
  if (ticket.status === "completed") {
    actions.append(button("Reopen", "btn ghost", async () => {
      const status = ticket.selfTag || ticket.assignedTo ? "progress" : "open";
      await saveRow(paths.tickets, ticket.id, { status });
      ctx.toast("Reopened");
    }));
  }
  card.append(
    head,
    el("p", null, ticket.details || ""),
    facts([
      ["Priority", ticket.priority || "Normal"],
      ["Who", audience(ticket, data.employees, data.assignments)],
      ["Project", ticket.ticketType === "project" ? `${ticket.projectName} (${ticket.projectCode})` : "Free ticket"],
      ["Note", ticket.progressNote || ""],
      ["Created", `${formatWhen(ticket.createdDate)} · ${ticket.createdByName || ""}`],
    ]),
    actions,
  );
  return card;
}

async function editTicket(ctx, ticket) {
  const data = await ctx.openForm({
    title: "Edit ticket",
    fields: [
      { key: "title", label: "Title", required: true, value: ticket.title },
      { key: "details", label: "Details", type: "textarea", required: true, value: ticket.details },
      { key: "priority", label: "Priority", type: "select", options: ["Normal", "High", "Urgent"], value: ticket.priority || "Normal" },
    ],
  });
  if (!data) return;
  await saveRow(paths.tickets, ticket.id, data);
  ctx.toast("Saved");
}

async function saveNote(ctx, ticket) {
  const data = await ctx.openForm({
    title: "Progress note",
    fields: [{ key: "progressNote", label: "Note", type: "textarea", required: true, value: ticket.progressNote || "" }],
  });
  if (!data) return;
  await saveRow(paths.tickets, ticket.id, { progressNote: data.progressNote });
  ctx.toast("Note saved");
}

async function finishSelf(ctx, ticket) {
  const when = stamp();
  await saveRow(paths.tickets, ticket.id, {
    status: "completed",
    completedAt: when.timestamp,
    completedDate: when.createdDate,
    completedTime: when.createdTime,
  });
  ctx.toast("Completed");
}

export function pageDashboard(session) {
  const ctx = startPortal(session, "admin-dashboard");
  ctx.setHeading("Admin", "Dashboard");
  const grid = el("section", "metrics");
  grid.append(loader("Loading the dashboard"));
  ctx.panel.append(grid);
  watch(["employees", "projects", "reports"], (data) => {
    if (!data) return denied(ctx.panel);
    const today = todayIso();
    const month = new Date().getMonth() + 1;
    const year = new Date().getFullYear();
    const todayReports = data.reports.filter((row) => row.createdDate === today).length;
    const pending = data.reports.filter((row) => row.status === "pending").length;
    const completed = data.reports.filter((row) => row.status === "completed").length;
    const monthly = data.reports.filter((row) => row.month === month && row.year === year).length;
    grid.replaceChildren(
      metric("Employees", data.employees.length),
      metric("Projects", data.projects.length),
      metric("Today's reports", todayReports),
      metric("Pending", pending),
      metric("Completed", completed),
      metric("This month", monthly),
    );
  });
}

function metric(label, value) {
  const article = el("article");
  article.append(el("span", null, label), el("strong", null, String(value)));
  return article;
}

export function pageTrack(session) {
  const ctx = startPortal(session, "admin-track");
  ctx.setHeading("Admin", "All Track");
  let tab = "admins";
  let query = "";
  let status = "all";
  let from = "";
  let to = "";
  let latest = { tickets: [], reports: [], employees: [] };
  const toolbar = el("div", "toolbar");
  const tabs = el("div", "switcher");
  [["admins", "Admin works"], ["employees", "Employee works"]].forEach(([id, label]) => {
    const node = button(label, "btn ghost", () => { tab = id; paint(); });
    node.dataset.tab = id;
    tabs.append(node);
  });
  const search = document.createElement("input");
  search.type = "search";
  search.placeholder = "Search name, title, project, or note";
  search.addEventListener("input", () => { query = search.value; paint(); });
  const statusSelect = selectOf([["all", "All statuses"], ["open", "Open"], ["progress", "In progress"], ["pending", "Pending"], ["completed", "Completed"]], (value) => { status = value; paint(); });
  const fromInput = document.createElement("input");
  fromInput.type = "date";
  fromInput.addEventListener("change", () => { from = fromInput.value; paint(); });
  const toInput = document.createElement("input");
  toInput.type = "date";
  toInput.addEventListener("change", () => { to = toInput.value; paint(); });
  const clear = button("Clear", "btn ghost", () => {
    query = ""; status = "all"; from = ""; to = "";
    search.value = ""; statusSelect.value = "all"; fromInput.value = ""; toInput.value = "";
    paint();
  });
  toolbar.append(tabs, search, statusSelect, fromInput, toInput, clear);
  const list = el("div", "stack");
  list.append(loader("Loading records"));
  ctx.panel.append(toolbar, list);
  const paint = () => {
    tabs.querySelectorAll("button").forEach((node) => node.classList.toggle("on", node.dataset.tab === tab));
    const cards = tab === "admins" ? adminTrack(latest) : employeeTrack(latest);
    const shown = cards.filter((card) => trackMatch(card, query, status, from, to));
    list.replaceChildren(...(shown.length ? shown.map(trackCard) : [el("p", "quiet", "Nothing matches.")]));
  };
  watch(["tickets", "reports", "employees"], (data) => {
    if (!data) return denied(list);
    latest = data;
    paint();
  });
}

function selectOf(options, onChange) {
  const select = document.createElement("select");
  options.forEach(([value, label]) => {
    const option = el("option", null, label);
    option.value = value;
    select.append(option);
  });
  select.addEventListener("change", () => onChange(select.value));
  return select;
}

function adminTrack(data) {
  return data.tickets.filter((row) => row.selfTag).map((row) => ({
    status: row.status,
    priority: row.priority,
    title: row.title,
    details: row.details,
    who: row.createdByName || "Admin",
    created: row.createdDate,
    createdTime: "",
    completed: row.completedDate || "",
    completedTime: row.completedTime || "",
    project: "Admin work",
    note: row.progressNote || "",
  }));
}

function employeeTrack(data) {
  const tickets = data.tickets
    .filter((row) => !row.selfTag && row.status !== "completed")
    .map((row) => ({
      status: row.status,
      priority: row.priority,
      title: row.title,
      details: row.details,
      who: row.assignedName || "Unassigned",
      created: row.createdDate,
      createdTime: "",
      completed: "",
      completedTime: "",
      project: row.ticketType === "project" ? row.projectName : "Free ticket",
      note: row.progressNote || "",
    }));
  const reports = data.reports.map((row) => ({
    status: row.status,
    priority: "",
    title: row.projectName || "Work",
    details: row.workDetails,
    who: accountRemoved(row, data.employees) ? `${row.employeeName} · Account removed` : row.employeeName,
    created: row.createdDate,
    createdTime: row.createdTime,
    completed: row.completedDate || "",
    completedTime: row.completedTime || "",
    project: row.source === "common" && !row.projectId ? "Free ticket" : row.projectName,
    note: "",
  }));
  return [...tickets, ...reports];
}

function trackMatch(card, query, status, from, to) {
  if (status !== "all" && card.status !== status) return false;
  const days = [card.created, card.completed].filter(Boolean);
  if (from && days.length && days.every((day) => day < from)) return false;
  if (to && days.length && days.every((day) => day > to)) return false;
  const hay = [card.title, card.details, card.who, card.project, card.note].join(" ").toLowerCase();
  return !query.trim() || hay.includes(query.trim().toLowerCase());
}

function trackCard(card) {
  const article = el("article", "card");
  const head = el("div", "card-head");
  head.append(el("strong", null, card.title || "Work"), pill(card.status));
  article.append(head, facts([
    ["Priority", card.priority || "—"],
    ["Details", card.details],
    ["Who", card.who],
    ["Created", [formatWhen(card.created), card.createdTime].filter(Boolean).join(" · ")],
    ["Completed", card.completed ? [formatWhen(card.completed), card.completedTime].filter(Boolean).join(" · ") : "Not completed yet"],
    ["Project", card.project || "Free ticket"],
    ["Progress note", card.note],
  ]));
  return article;
}

export function pageFeed(session) {
  const ctx = startPortal(session, "admin-feed");
  ctx.setHeading("Admin", "Work Feed");
  let mode = "all";
  let latest = [];
  const switcher = el("div", "switcher");
  [["pending", "Pending"], ["completed", "Completed"], ["all", "All"]].forEach(([id, label]) => {
    const node = button(label, "btn ghost", () => { mode = id; paint(); });
    node.dataset.tab = id;
    switcher.append(node);
  });
  const list = el("div", "stack");
  list.append(loader("Loading records"));
  ctx.panel.append(switcher, list);
  const paint = () => {
    switcher.querySelectorAll("button").forEach((node) => node.classList.toggle("on", node.dataset.tab === mode));
    const rows = latest.filter((row) => mode === "all" || row.status === mode);
    list.replaceChildren(...(rows.length ? rows.map(reportCard) : [el("p", "quiet", "No reports in this feed.")]));
  };
  watch(["reports"], (data) => {
    if (!data) return denied(list);
    latest = data.reports;
    paint();
  });
}

function reportCard(row, employees = []) {
  const article = el("article", "card");
  const head = el("div", "card-head");
  const removed = employees.length ? accountRemoved(row, employees) : false;
  head.append(el("strong", null, row.employeeName || "Report"), pill(row.status));
  const pairs = [
    ["Employee code", row.employeeCode],
    ["Project", `${row.projectName || "—"} (${row.projectCode || "—"})`],
    ["Work", row.workDetails],
    ["When", `${formatWhen(row.createdDate)} ${row.createdTime || ""}`],
    ["Source", row.source === "common" ? "Common work" : "Project work"],
  ];
  if (employees.length) pairs.splice(1, 0, ["Account", removed ? "Account removed" : "Active"]);
  article.append(head, facts(pairs));
  return article;
}

export function pageProjects(session) {
  const ctx = startPortal(session, "admin-projects");
  ctx.setHeading("Admin", "Projects");
  ctx.actions.append(button("New project", "btn solid", () => editProject(ctx, null)));
  const list = el("div", "stack");
  list.append(loader("Loading records"));
  ctx.panel.append(list);
  watch(["projects"], (data) => {
    if (!data) return denied(list);
    list.replaceChildren(...(data.projects.length ? data.projects.map((row) => projectCard(ctx, row)) : [el("p", "quiet", "No projects yet.")]));
  });
}

function projectCard(ctx, row) {
  const article = el("article", "card");
  const head = el("div", "card-head");
  head.append(el("strong", null, `${row.name} · ${row.code}`), pill(row.status));
  article.append(head, facts([
    ["Client", row.clientName],
    ["Dates", `${formatWhen(row.startDate)} – ${formatWhen(row.endDate)}`],
    ["Description", row.description],
  ]), el("div", "actions"));
  article.querySelector(".actions").append(
    button("Edit", "btn ghost", () => editProject(ctx, row)),
    button("Delete", "btn warn", async () => {
      if (!await ctx.ask("Delete this project? Reports keep the saved project name.")) return;
      await deleteRow(paths.projects, row.id);
      ctx.toast("Deleted");
    }),
  );
  return article;
}

async function editProject(ctx, row) {
  const data = await ctx.openForm({
    title: row ? "Edit project" : "New project",
    fields: [
      { key: "name", label: "Name", required: true, value: row?.name || "" },
      { key: "code", label: "Code", required: true, value: row?.code || "" },
      { key: "clientName", label: "Client", value: row?.clientName || "" },
      { key: "status", label: "Status", type: "select", options: ["Active", "Completed", "Hold"], value: row?.status || "Active" },
      { key: "startDate", label: "Start date", type: "date", value: row?.startDate || "" },
      { key: "endDate", label: "End date", type: "date", value: row?.endDate || "" },
      { key: "description", label: "Description", type: "textarea", value: row?.description || "" },
    ],
  });
  if (!data) return;
  if (row) await saveRow(paths.projects, row.id, data);
  else await addRow(paths.projects, data);
  ctx.toast("Saved");
}

function passwordField(ctx, row, required) {
  const master = canSeePasswords(ctx.session);
  if (required) {
    return {
      key: "password",
      label: "Password",
      type: "password",
      required: true,
      value: master ? (row?.password || "") : "",
    };
  }
  return {
    key: "password",
    label: master ? "Password" : "New password",
    type: "password",
    value: master ? (row?.password || "") : "",
  };
}

function tableWrap(headers, rows) {
  if (!rows.length) return el("p", "quiet", "No accounts match this filter.");
  const wrap = el("div", "table-wrap");
  const table = document.createElement("table");
  table.className = "data-table";
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  headers.forEach((label) => headRow.append(el("th", null, label)));
  head.append(headRow);
  const body = document.createElement("tbody");
  rows.forEach((cells) => {
    const tr = document.createElement("tr");
    cells.forEach((cell, index) => {
      const td = document.createElement("td");
      td.dataset.label = headers[index];
      if (cell instanceof Node) td.append(cell);
      else td.textContent = cell || "—";
      tr.append(td);
    });
    body.append(tr);
  });
  table.append(head, body);
  wrap.append(table);
  return wrap;
}

function roleFilter(options, onChange) {
  const bar = el("div", "toolbar");
  const label = el("label", "filter-label", "Role");
  const select = document.createElement("select");
  select.setAttribute("aria-label", "Filter by role");
  ["All", ...options].forEach((name) => {
    const option = el("option", null, name);
    option.value = name;
    select.append(option);
  });
  select.addEventListener("change", () => onChange(select.value));
  label.append(select);
  bar.append(label);
  return { bar, select };
}

export function pageEmployees(session) {
  const ctx = startPortal(session, "admin-employees");
  ctx.setHeading("Admin", "Employees");
  ctx.actions.append(button("Add account", "btn solid", () => createEmp(ctx)));
  const showPassword = canSeePasswords(session);
  const headers = ["Name", "Code", "Email", "Mobile", "Department", "Role", ...(showPassword ? ["Password"] : []), "Actions"];
  let latest = [];
  let role = "All";
  const filter = roleFilter([], (value) => {
    role = value;
    paint();
  });
  const list = el("div", "stack");
  list.append(loader("Loading employees"));
  ctx.panel.append(el("p", "lede", "All employee accounts."), filter.bar, list);
  const paint = () => {
    ctx.setHeading("Admin", `Employees · ${latest.length}`);
    const roles = [...new Set(latest.map((row) => row.designation).filter(Boolean))].sort();
    const current = filter.select.value;
    filter.select.replaceChildren();
    ["All", ...roles].forEach((name) => {
      const count = name === "All" ? latest.length : latest.filter((row) => row.designation === name).length;
      const option = el("option", null, `${name} · ${count}`);
      option.value = name;
      filter.select.append(option);
    });
    filter.select.value = roles.includes(current) || current === "All" ? current : "All";
    role = filter.select.value;
    const rows = latest.filter((row) => role === "All" || row.designation === role);
    list.replaceChildren(tableWrap(headers, rows.map((row) => {
      const actions = el("div", "actions");
      actions.append(
        button("Edit", "btn ghost", () => editEmp(ctx, row)),
        button("Delete", "btn warn", async () => {
          if (!await ctx.ask(`Remove ${row.fullName}? Reports stay.`)) return;
          await deleteEmployee(row);
          ctx.toast("Removed");
        }),
      );
      const cells = [
        row.fullName,
        row.employeeCode,
        row.email,
        row.mobile,
        row.department,
        row.designation || "Employee",
      ];
      if (showPassword) cells.push(row.password || "Not stored yet");
      cells.push(actions);
      return cells;
    })));
  };
  watch(["employees"], (data) => {
    if (!data) return denied(list);
    latest = data.employees;
    paint();
  });
}

async function createEmp(ctx) {
  const data = await ctx.openForm({
    title: "New employee",
    submitLabel: "Create",
    fields: [
      { key: "fullName", label: "Name", required: true },
      { key: "employeeCode", label: "Employee code", required: true },
      { key: "email", label: "Email", type: "email", required: true },
      { key: "mobile", label: "Mobile" },
      { key: "department", label: "Department" },
      { key: "designation", label: "Designation" },
      passwordField(ctx, null, true),
    ],
  });
  if (!data) return;
  try {
    await createEmployee(data);
    ctx.toast("Employee created");
  } catch (error) {
    ctx.toast(error.message || "Could not create.");
  }
}

async function editEmp(ctx, row) {
  const data = await ctx.openForm({
    title: "Edit employee",
    fields: [
      { key: "fullName", label: "Name", required: true, value: row.fullName },
      { key: "employeeCode", label: "Employee code", required: true, value: row.employeeCode || "" },
      { key: "email", label: "Email", type: "email", required: true, value: row.email || "" },
      { key: "mobile", label: "Mobile", value: row.mobile || "" },
      { key: "department", label: "Department", value: row.department || "" },
      { key: "designation", label: "Designation", value: row.designation || "" },
      passwordField(ctx, row, false),
    ],
  });
  if (!data) return;
  try {
    await updateEmployee(row.id, data);
    ctx.toast("Saved");
  } catch (error) {
    ctx.toast(error.message || "Could not save.");
  }
}

export function pageAdmins(session) {
  const ctx = startPortal(session, "admin-admins");
  ctx.setHeading("Admin", "Admins");
  ctx.actions.append(button("Add account", "btn solid", () => createAdm(ctx)));
  const showPassword = canSeePasswords(session);
  const headers = ["Name", "Role", "Email", "Mobile", ...(showPassword ? ["Password"] : []), "Actions"];
  let latest = [];
  let role = "All";
  const filter = roleFilter(roleChoices(session), (value) => {
    role = value;
    paint();
  });
  const list = el("div", "stack");
  list.append(loader("Loading admins"));
  ctx.panel.append(el("p", "lede", "All admin accounts."), filter.bar, list);
  const paint = () => {
    const current = filter.select.value || "All";
    filter.select.replaceChildren();
    ["All", ...roleChoices(session)].forEach((name) => {
      const count = name === "All" ? latest.length : latest.filter((row) => normalizeAdminRole(row.role) === name).length;
      const option = el("option", null, `${name} · ${count}`);
      option.value = name;
      filter.select.append(option);
    });
    filter.select.value = current;
    role = current;
    ctx.setHeading("Admin", `Admins · ${latest.length}`);
    const rows = latest.filter((row) => role === "All" || normalizeAdminRole(row.role) === role);
    list.replaceChildren(tableWrap(headers, rows.map((row) => {
      const actions = el("div", "actions");
      if (canEditAdmin(ctx.session, row)) {
        actions.append(button("Edit", "btn ghost", () => editAdm(ctx, row)));
        actions.append(button("Delete", "btn warn", async () => {
          if (latest.length <= 1) {
            ctx.toast("The last admin cannot be deleted.");
            return;
          }
          if (isLastMaster(latest, row)) {
            ctx.toast("The last Master Admin cannot be deleted.");
            return;
          }
          if (!await ctx.ask(`Delete ${row.fullName}? Work history stays.`)) return;
          await deleteRow(paths.admins, row.id);
          if (row.id === ctx.session.id) {
            const { clearSession } = await import("./session.js");
            clearSession();
            location.href = "login.html";
            return;
          }
          ctx.toast("Deleted");
        }));
      }
      const cells = [row.fullName, normalizeAdminRole(row.role), row.email, row.mobile];
      if (showPassword) cells.push(row.password || "Not stored yet");
      cells.push(actions);
      return cells;
    })));
  };
  watch(["admins"], (data) => {
    if (!data) return denied(list);
    latest = data.admins;
    paint();
  });
}

async function createAdm(ctx) {
  const data = await ctx.openForm({
    title: "Add account",
    submitLabel: "Create",
    fields: [
      { key: "fullName", label: "Name", required: true },
      { key: "role", label: "Role", type: "select", required: true, options: roleChoices(ctx.session) },
      { key: "email", label: "Email", type: "email", required: true },
      { key: "mobile", label: "Mobile" },
      passwordField(ctx, null, true),
    ],
  });
  if (!data) return;
  try {
    await createAdmin({ ...data, createdBy: ctx.session.id });
    ctx.toast("Account created");
  } catch (error) {
    ctx.toast(error.message || "Could not create.");
  }
}

async function editAdm(ctx, row) {
  const choices = roleChoices(ctx.session);
  const current = normalizeAdminRole(row.role);
  const options = choices.includes(current) ? choices : [current, ...choices];
  const data = await ctx.openForm({
    title: "Edit admin",
    fields: [
      { key: "fullName", label: "Name", required: true, value: row.fullName },
      { key: "role", label: "Role", type: "select", required: true, value: current, options },
      { key: "email", label: "Email", type: "email", required: true, value: row.email || "" },
      { key: "mobile", label: "Mobile", value: row.mobile || "" },
      passwordField(ctx, row, false),
    ],
  });
  if (!data) return;
  try {
    await updateAdmin(row.id, { ...data, role: canSeePasswords(ctx.session) ? data.role : (choices.includes(data.role) ? data.role : current) });
    if (row.id === ctx.session.id) {
      const next = {
        ...ctx.session,
        fullName: data.fullName,
        role: normalizeAdminRole(data.role),
        email: data.email.trim(),
        mobile: data.mobile || "",
      };
      setSession(next);
      ctx.session = next;
      ctx.setName(data.fullName);
    }
    ctx.toast("Saved");
  } catch (error) {
    ctx.toast(error.message || "Could not save.");
  }
}

export function pageAssignments(session) {
  const ctx = startPortal(session, "admin-assignments");
  ctx.setHeading("Admin", "Assignments");
  let latest = { employees: [], projects: [], assignments: [] };
  ctx.actions.append(button("Assign", "btn solid", () => assign(ctx, latest)));
  const list = el("div", "stack");
  list.append(loader("Loading records"));
  ctx.panel.append(list);
  watch(["employees", "projects", "assignments"], (data) => {
    if (!data) return denied(list);
    latest = data;
    list.replaceChildren(...(data.assignments.length ? data.assignments.map((row) => assignmentCard(ctx, row)) : [el("p", "quiet", "Nobody is assigned yet.")]));
  });
}

function assignmentCard(ctx, row) {
  const article = el("article", "card");
  article.append(el("strong", null, row.employeeName), facts([
    ["Code", row.employeeCode],
    ["Project", row.projectName],
    ["Date", formatWhen(row.assignedDate)],
  ]));
  article.append(button("Remove", "btn warn", async () => {
    if (!await ctx.ask("Remove this assignment? Reports stay.")) return;
    await deleteRow(paths.assignments, row.id);
    ctx.toast("Removed");
  }));
  return article;
}

async function assign(ctx, latest) {
  const data = await ctx.openForm({
    title: "Assign a project",
    submitLabel: "Assign",
    fields: [
      { key: "employeeId", label: "Employee", type: "select", required: true, options: latest.employees.map((row) => ({ value: row.id, label: `${row.fullName} · ${row.employeeCode}` })) },
      { key: "projectId", label: "Project", type: "select", required: true, options: latest.projects.map((row) => ({ value: row.id, label: `${row.name} (${row.code})` })) },
      { key: "assignedDate", label: "Date", type: "date", required: true, value: todayIso() },
    ],
  });
  if (!data) return;
  if (latest.assignments.some((row) => row.employeeId === data.employeeId && row.projectId === data.projectId)) {
    ctx.toast("That employee is already on this project.");
    return;
  }
  const employee = latest.employees.find((row) => row.id === data.employeeId);
  const project = latest.projects.find((row) => row.id === data.projectId);
  await addRow(paths.assignments, {
    employeeId: employee.id,
    employeeName: employee.fullName,
    employeeCode: employee.employeeCode,
    projectId: project.id,
    projectName: project.name,
    assignedDate: data.assignedDate,
  });
  ctx.toast("Assigned");
}

export function pageReports(session) {
  const ctx = startPortal(session, "admin-reports");
  ctx.setHeading("Admin", "Reports");
  let mode = "all";
  let employeeId = "all";
  let projectId = "all";
  let status = "all";
  let from = "";
  let to = "";
  let latest = { reports: [], employees: [], projects: [] };
  const toolbar = el("div", "toolbar");
  const modeSelect = selectOf([["all", "All dates"], ["today", "Today"], ["yesterday", "Yesterday"]], (value) => { mode = value; paint(); });
  const employeeSelect = document.createElement("select");
  const projectSelect = document.createElement("select");
  const statusSelect = selectOf([["all", "All statuses"], ["pending", "Pending"], ["completed", "Completed"]], (value) => { status = value; paint(); });
  const fromInput = document.createElement("input");
  fromInput.type = "date";
  fromInput.addEventListener("change", () => { from = fromInput.value; paint(); });
  const toInput = document.createElement("input");
  toInput.type = "date";
  toInput.addEventListener("change", () => { to = toInput.value; paint(); });
  employeeSelect.addEventListener("change", () => { employeeId = employeeSelect.value; paint(); });
  projectSelect.addEventListener("change", () => { projectId = projectSelect.value; paint(); });
  const exportBtn = button("Export Excel", "btn solid", () => {
    const rows = filteredReports();
    downloadCsv("reports.csv", ["Employee", "Code", "Project", "Project code", "Work", "Status", "Date", "Time", "Source"], rows.map((row) => [
      row.employeeName, row.employeeCode, row.projectName, row.projectCode, row.workDetails, row.status, row.createdDate, row.createdTime, row.source,
    ]));
  });
  toolbar.append(modeSelect, employeeSelect, projectSelect, statusSelect, fromInput, toInput, exportBtn);
  const list = el("div", "stack");
  list.append(loader("Loading records"));
  ctx.panel.append(toolbar, list);
  const filteredReports = () => latest.reports.filter((row) => {
    if (mode === "today" && row.createdDate !== todayIso()) return false;
    if (mode === "yesterday" && row.createdDate !== yesterdayIso()) return false;
    if (employeeId !== "all" && row.employeeId !== employeeId) return false;
    if (projectId !== "all" && row.projectId !== projectId) return false;
    if (status !== "all" && row.status !== status) return false;
    if (from && row.createdDate < from) return false;
    if (to && row.createdDate > to) return false;
    return true;
  });
  const paint = () => {
    fillPeople(employeeSelect, "All employees", latest.employees.map((row) => [row.id, row.fullName]), employeeId);
    fillPeople(projectSelect, "All projects", latest.projects.map((row) => [row.id, row.name]), projectId);
    const rows = filteredReports();
    list.replaceChildren(...(rows.length ? rows.map((row) => reportCard(row, latest.employees)) : [el("p", "quiet", "No reports match.")]));
  };
  watch(["reports", "employees", "projects"], (data) => {
    if (!data) return denied(list);
    latest = data;
    paint();
  });
}

function fillPeople(select, first, options, current) {
  const value = current;
  select.replaceChildren();
  const all = el("option", null, first);
  all.value = "all";
  select.append(all);
  options.forEach(([id, label]) => {
    const option = el("option", null, label);
    option.value = id;
    select.append(option);
  });
  select.value = [...select.options].some((option) => option.value === value) ? value : "all";
}

export function pageHistory(session) {
  const ctx = startPortal(session, "admin-history");
  ctx.setHeading("Admin", "Work History");
  let query = "";
  let latest = { reports: [], employees: [] };
  const search = document.createElement("input");
  search.type = "search";
  search.className = "search";
  search.placeholder = "Search name, project, or work";
  search.addEventListener("input", () => { query = search.value; paint(); });
  const list = el("div", "stack");
  list.append(loader("Loading records"));
  ctx.panel.append(search, list);
  const paint = () => {
    const q = query.trim().toLowerCase();
    const rows = latest.reports.filter((row) => {
      const hay = [row.employeeName, row.employeeCode, row.projectName, row.workDetails].join(" ").toLowerCase();
      return !q || hay.includes(q);
    });
    list.replaceChildren(...(rows.length ? rows.map((row) => reportCard(row, latest.employees)) : [el("p", "quiet", "No history yet.")]));
  };
  watch(["reports", "employees"], (data) => {
    if (!data) return denied(list);
    latest = data;
    paint();
  });
}

export async function pageProfile(session) {
  const ctx = startPortal(session, "admin-profile");
  ctx.setHeading("Admin", "Profile");
  ctx.panel.append(loader("Loading profile"));
  const rows = await readList(paths.admins);
  const row = rows.find((item) => item.id === session.id);
  if (!row) {
    ctx.panel.replaceChildren(el("p", "quiet", "This admin profile is no longer in the database."));
    return;
  }
  const fields = [
    { key: "fullName", label: "Name", required: true, value: row.fullName || "" },
    { key: "mobile", label: "Mobile", value: row.mobile || "" },
  ];
  const form = el("form", "form narrow");
  fields.forEach((spec) => form.append(field(spec)));
  const role = document.createElement("input");
  role.value = normalizeAdminRole(row.role || session.role || "Admin");
  role.readOnly = true;
  role.name = "role";
  const roleLabel = el("label", null, "Role");
  roleLabel.append(role, el("small", "hint", "Admin roles are changed in Admins."));
  form.append(roleLabel);
  const email = document.createElement("input");
  email.value = row.email || session.email || "";
  email.readOnly = true;
  email.name = "email";
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
      mobile: form.elements.mobile.value.trim(),
    };
    if (!data.fullName) {
      error.textContent = "Name is required.";
      error.hidden = false;
      return;
    }
    setBusy(submit, true);
    try {
      await saveRow(paths.admins, row.id, data);
      const next = { ...session, ...data, email: row.email };
      setSession(next);
      ctx.session = next;
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
