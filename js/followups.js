import { clientHref, convertFollowup } from "./clients.js";
import { addRow, changeRow, deleteRow, listen, listenMany, paths, saveRow } from "./db.js";
import { employeeLocked } from "./client-work.js";
import { canManageFollowups, isMaster, normalizeAdminRole } from "./roles.js";
import { startPortal } from "./shell.js";
import { button, el, field, loader } from "./ui.js";

export const STAGES = [
  { id: "target", label: "New target", color: "#2f7bff", icon: "M12 3v6M8 7h8M5 21h14l-2-10H7z" },
  { id: "contacted", label: "Contacted", color: "#2563eb", icon: "M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.4-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.5 2.7.6a2 2 0 0 1 1.8 2.1z" },
  { id: "response", label: "Response", color: "#7c3aed", icon: "M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z" },
  { id: "quote", label: "Quote", color: "#d97706", icon: "M14 2H6a2 2 0 0 0-2 2v16h16V8zM14 2v6h6M8 13h8M8 17h5" },
  { id: "expectations", label: "Expectations", color: "#0891b2", icon: "M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" },
  { id: "payment", label: "Payment", color: "#059669", icon: "M21 11V7H3v12h9M3 11h18M16 19l2 2 4-4" },
  { id: "amount", label: "Final amount", color: "#1d4ed8", icon: "M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" },
  { id: "success", label: "Onboard ready", color: "#16a34a", icon: "M22 11.1V12a10 10 0 1 1-5.9-9.1M22 4L12 14.1l-3-3" },
  { id: "failed", label: "Failed", color: "#dc2626", icon: "M18 6L6 18M6 6l12 12" },
];

const WORK = ["target", "contacted", "response", "quote", "expectations", "payment", "amount"];

function watch(keys, paint) {
  return listenMany(keys, (data, ready) => {
    if (ready) paint(data);
  }, () => paint(null));
}

function stageOf(id) {
  return STAGES.find((item) => item.id === id) || STAGES[0];
}

export function progressFor(row) {
  if (row.stage === "success") return 100;
  const index = Math.max(0, WORK.indexOf(row.stage === "failed" ? (row.lastWorkStage || "target") : row.stage));
  const base = Math.round(((index + 1) / WORK.length) * 90);
  return row.stage === "failed" ? Math.min(base, 90) : base;
}

function pathFillFor(row) {
  const ids = STAGES.map((item) => item.id);
  let index = ids.indexOf(row.stage);
  if (index < 0) index = 0;
  return (index / Math.max(ids.length - 1, 1)) * 100;
}

function pathGradient() {
  const colors = STAGES.map((item) => item.color);
  const parts = colors.length - 1;
  const stops = [];
  colors.slice(0, -1).forEach((color, index) => {
    const start = (index / parts) * 100;
    const end = ((index + 1) / parts) * 100;
    stops.push(`${color} ${start}%`, `${color} ${end}%`);
  });
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}

function missingForOnboard(row) {
  const gaps = [];
  if (!row.clientName) gaps.push("Client name");
  if (!row.companyName) gaps.push("Shop / company");
  if (!row.location) gaps.push("Location");
  if (!row.contactNumber) gaps.push("Contact number");
  if (!row.initialResponse) gaps.push("Initial response");
  if (!row.quoteAmount && !row.quoteNotes) gaps.push("Quote");
  if (!row.expectations) gaps.push("Client expectations");
  if (row.paymentStatus !== "paid") gaps.push("Successful payment");
  if (!row.finalAmount) gaps.push("Final fixed amount");
  if (!row.assignedTo) gaps.push("Assigned employee");
  return gaps;
}

function feedItems(row) {
  return Object.entries(row.feed || {})
    .map(([id, data]) => ({ id, ...(data || {}) }))
    .sort((a, b) => (b.at || 0) - (a.at || 0));
}

function when(ms) {
  return ms ? new Date(ms).toLocaleString() : "—";
}

function chatWhen(ms) {
  if (!ms) return "";
  const d = new Date(ms);
  const sameDay = d.toDateString() === new Date().toDateString();
  return d.toLocaleString([], sameDay
    ? { hour: "2-digit", minute: "2-digit" }
    : { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function stroke(d) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", d);
  svg.append(path);
  return svg;
}

function actorStamp(session) {
  return { id: session.id, name: session.fullName, at: Date.now() };
}

function stageActors(row) {
  const named = { ...(row.stageBy || {}) };
  feedItems(row).forEach((item) => {
    if (!item.stage || named[item.stage]) return;
    named[item.stage] = { name: item.byName || "Team", id: item.by || "", at: item.at };
  });
  if (!named.target && row.createdByName) {
    named.target = { name: row.createdByName, id: row.createdBy || "", at: row.createdAt };
  }
  return named;
}

function actorLabel(actor) {
  if (!actor?.name) return "Pending";
  return actor.name;
}

function ownsStage(row, stage, session) {
  const actor = stageActors(row)[stage];
  if (!actor?.id && !actor?.name) return true;
  if (actor.id) return actor.id === session.id;
  return actor.name === session.fullName;
}

async function writeFeed(id, session, text, stage) {
  const at = Date.now();
  await saveRow(paths.followups, id, {
    [`feed/${at}`]: {
      at,
      by: session.id,
      byName: session.fullName,
      text,
      stage: stage || "",
    },
  });
}

function employeeOptions(employees) {
  return [
    { value: "", label: "Unassigned" },
    ...activePeople(employees).map((row) => ({ value: row.id, label: personLabel(row, "Employee") })),
  ];
}

function pickEmployee(employees, id) {
  return employees.find((row) => row.id === id) || null;
}

function activePeople(rows) {
  return (rows || []).filter((row) => !row.accountStatus || row.accountStatus === "active");
}

function cleanCode(code) {
  const text = String(code || "").trim();
  if (!text || text.toLowerCase() === "none") return "";
  return text;
}

function personLabel(row, role) {
  const code = cleanCode(row.employeeCode);
  return [row.fullName || "Account", role, code].filter(Boolean).join(" · ");
}

function packPerson(row, kind) {
  return {
    id: row.id,
    name: row.fullName || "Account",
    code: cleanCode(row.employeeCode),
    kind,
  };
}

function assigneeMap(row) {
  const map = { ...(row.assignees || {}) };
  if (row.assignedTo && !map[row.assignedTo]) {
    map[row.assignedTo] = { name: row.assignedName || "Account", code: cleanCode(row.assignedCode), kind: "employee" };
  }
  return map;
}

function assigneeLabel(row) {
  const names = Object.values(assigneeMap(row)).map((person) => person.name).filter(Boolean);
  return names.length ? names.join(", ") : "Unassigned";
}

function onFollowup(row, id) {
  return row.assignedTo === id || Boolean(row.assignees && row.assignees[id]);
}

function assignChoices(session, employees, admins) {
  const staff = activePeople(employees).map((row) => packPerson(row, "Employee"));
  if (normalizeAdminRole(session.role) === "HR Admin") return staff;
  const leaders = activePeople(admins)
    .filter((row) => normalizeAdminRole(row.role) !== "Master Admin")
    .map((row) => packPerson(row, normalizeAdminRole(row.role)));
  return [...staff, ...leaders];
}

function managerSees(session, row, clients) {
  if (isMaster(session) || !row.clientId) return true;
  const client = (clients || []).find((item) => item.id === row.clientId);
  return !client || !employeeLocked(session, client);
}

function openMultiAssign(ctx, row, employees, admins) {
  const chosen = new Set(Object.keys(assigneeMap(row)));
  const people = assignChoices(ctx.session, employees, admins);
  const employeesOnly = normalizeAdminRole(ctx.session.role) === "HR Admin";
  const dialog = document.createElement("dialog");
  dialog.className = "sheet team-sheet";
  const pop = el("div", "team-pop assign-pop");
  const head = el("header");
  const copy = el("div");
  copy.append(
    el("h2", null, "Assign follow-up"),
    el("p", "quiet", employeesOnly
      ? "Select the employees who should handle this follow-up."
      : "Select employees, HR Admins, or Admins. Master Admin already sees every follow-up."),
  );
  const close = button("×", "icon-btn", () => dialog.close());
  close.setAttribute("aria-label", "Close");
  head.append(copy, close);
  const search = document.createElement("input");
  search.type = "search";
  search.placeholder = "Search name or role";
  search.setAttribute("aria-label", "Search people");
  const host = el("div", "team-pop-list");
  const paint = () => {
    const query = search.value.trim().toLowerCase();
    const shown = people.filter((person) => !query || `${person.name} ${person.kind} ${person.code}`.toLowerCase().includes(query));
    if (!shown.length) {
      host.replaceChildren(el("p", "quiet", "No one matches."));
      return;
    }
    host.replaceChildren(...shown.map((person, index) => {
      const line = el("label", `assign-pick${chosen.has(person.id) ? " on" : ""}`);
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = chosen.has(person.id);
      box.addEventListener("change", () => {
        if (box.checked) chosen.add(person.id);
        else chosen.delete(person.id);
        line.classList.toggle("on", box.checked);
      });
      const text = el("span");
      text.append(el("strong", null, person.name), el("small", null, [person.kind, person.code].filter(Boolean).join(" · ")));
      line.append(el("b", "req-no", String(index + 1)), box, text);
      return line;
    }));
  };
  search.addEventListener("input", paint);
  const footer = el("footer");
  footer.append(
    button("Cancel", "btn ghost", () => dialog.close()),
    button("Save", "btn solid", async () => {
      const picked = people.filter((person) => chosen.has(person.id));
      dialog.close();
      await writeAssignees(ctx, row, picked);
    }),
  );
  pop.append(head, search, host, footer);
  dialog.append(pop);
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", () => dialog.remove());
  document.body.append(dialog);
  paint();
  dialog.showModal();
  search.focus();
}

async function writeAssignees(ctx, row, people) {
  const assignees = {};
  people.forEach((person) => {
    assignees[person.id] = { name: person.name, code: person.code || "", kind: person.kind };
  });
  const first = people[0];
  const names = people.map((person) => person.name).filter(Boolean);
  try {
    await changeRow(paths.followups, row.id, (current) => {
      if (!current) return current;
      return {
        ...current,
        assignees,
        assignedTo: first?.id || "",
        assignedName: names.join(", "),
        assignedCode: first?.code || "",
        assignedBy: ctx.session.id,
      };
    });
    await writeFeed(row.id, ctx.session, names.length ? `Assigned to ${names.join(", ")}.` : "Unassigned.", row.stage);
    ctx.toast(names.length ? `Assigned to ${names.join(", ")}` : "Unassigned");
  } catch (error) {
    ctx.toast(error.message || "Could not assign.");
  }
}

export function pageAdminFollowups(session) {
  return renderFollowups(session, "admin-followups", false);
}

export function pageEmployeeFollowups(session) {
  return renderFollowups(session, "employee-followups", true);
}

function nextStageId(row) {
  if (row.stage === "failed") return "failed";
  if (row.stage === "success") return "success";
  const index = WORK.indexOf(row.stage);
  if (index < 0) return "contacted";
  if (index >= WORK.length - 1) return "success";
  return WORK[index + 1];
}

function fieldsForStage(stage, row) {
  if (stage === "contacted") {
    return [{ key: "contactNote", label: "Call / contact update", type: "textarea", required: true, value: row.contactNote || "" }];
  }
  if (stage === "response") {
    return [{ key: "initialResponse", label: "Client response", type: "textarea", required: true, value: row.initialResponse || "" }];
  }
  if (stage === "quote") {
    return [
      { key: "quoteAmount", label: "Quote amount", required: true, value: row.quoteAmount || "" },
      { key: "quoteNotes", label: "Quote notes", type: "textarea", value: row.quoteNotes || "" },
    ];
  }
  if (stage === "expectations") {
    return [{ key: "expectations", label: "Client expectations", type: "textarea", required: true, value: row.expectations || "" }];
  }
  if (stage === "payment") {
    return [
      { key: "paymentStatus", label: "Payment result", type: "select", required: true, value: row.paymentStatus || "pending", options: [
        { value: "pending", label: "Pending" },
        { value: "paid", label: "Success" },
        { value: "failed", label: "Failed" },
      ] },
      { key: "paymentAmount", label: "Payment amount", value: row.paymentAmount || "" },
    ];
  }
  if (stage === "amount") {
    return [{ key: "finalAmount", label: "Final fixed amount", required: true, value: row.finalAmount || "" }];
  }
  if (stage === "success" || stage === "failed") {
    return [{
      key: "outcome",
      label: "Client result",
      type: "select",
      required: true,
      value: row.stage === "failed" ? "failed" : (row.stage === "success" ? "success" : (stage === "failed" ? "failed" : "success")),
      options: [
        { value: "success", label: "Success" },
        { value: "failed", label: "Failed" },
      ],
    }];
  }
  return [{ key: "note", label: "Update note", type: "textarea", required: true, value: "" }];
}

function renderFollowups(session, page, employeeOnly) {
  const ctx = startPortal(session, page);
  ctx.setHeading(employeeOnly ? "Employee" : "Admin", "Follow-ups");
  const manage = canManageFollowups(session) && !employeeOnly;
  if (manage) ctx.actions.append(button("New follow-up", "btn solid", () => createLead(ctx, latest.employees)));
  let latest = { followups: [], employees: [] };
  let stageFilter = "All";
  const chips = el("div", "fu-chips");
  const metrics = el("div", "fu-metrics");
  const list = el("div", "stack");
  const feedBox = el("section", "fu-feed-box");
  list.append(loader("Loading follow-ups"));
  ctx.panel.append(
    el("p", "lede", employeeOnly
      ? "Clients assigned to you. Complete every step before onboard."
      : "Track every client from first contact to onboard. Assign and reassign from HR or Admin."),
    metrics,
    chips,
    list,
    feedBox,
  );

  const allRows = () => employeeOnly
    ? latest.followups.filter((row) => onFollowup(row, session.id))
    : latest.followups.filter((row) => managerSees(session, row, latest.clients));

  const visible = () => {
    const rows = allRows();
    return stageFilter === "All" ? rows : rows.filter((row) => row.stage === stageFilter);
  };

  const paint = () => {
    const rows = allRows();
    ctx.setHeading(employeeOnly ? "Employee" : "Admin", `Follow-ups · ${rows.length}`);
    const stageCounts = Object.fromEntries(STAGES.map((item) => [item.id, rows.filter((row) => row.stage === item.id).length]));
    const open = rows.filter((row) => row.stage !== "success" && row.stage !== "failed").length;
    metrics.replaceChildren(
      metric("All", rows.length, "#2f7bff"),
      metric("Open", open, "#2563eb"),
      metric("Onboard ready", stageCounts.success || 0, "#16a34a"),
      metric("Failed", stageCounts.failed || 0, "#dc2626"),
    );
    chips.replaceChildren(
      stageChip("All", rows.length, stageFilter === "All", "#2f7bff", () => { stageFilter = "All"; paint(); }),
      ...STAGES.map((item) => stageChip(item.label, stageCounts[item.id] || 0, stageFilter === item.id, item.color, () => { stageFilter = item.id; paint(); })),
    );
    const shown = visible();
    if (!shown.length) {
      list.replaceChildren(el("p", "quiet", employeeOnly ? "No client follow-up is assigned to you yet." : "No follow-ups in this stage."));
    } else {
      list.replaceChildren(...shown.map((row) => leadCard(ctx, linkedFollowup(row, latest.clients), latest.employees, latest.admins || [], manage, stageCounts)));
    }
    const events = shown.flatMap((row) => feedItems(row).slice(0, 4).map((item) => ({ ...item, client: row.clientName })))
      .filter((item) => canManageFollowups(session) || !isMoneyUpdate(item))
      .sort((a, b) => (b.at || 0) - (a.at || 0))
      .slice(0, 12);
    feedBox.replaceChildren(el("h2", null, `Live feed · ${events.length}`), events.length ? feedList(events) : el("p", "quiet", "No updates yet."));
  };

  watch(["followups", "employees", "admins", "clients"], (data) => {
    if (!data) {
      list.replaceChildren(el("p", "quiet", "Firebase refused this read. Check the database rules, then refresh."));
      return;
    }
    latest = data;
    paint();
  });
}

function linkedFollowup(row, clients) {
  if (!row.clientId) return row;
  const client = (clients || []).find((item) => item.id === row.clientId);
  if (!client) return row;
  const keys = ["clientName", "companyName", "location", "contactNumber", "email", "address", "city", "state", "pincode", "website", "industry", "gst", "designation", "alternateNumber", "clientCode"];
  const patch = {};
  keys.forEach((key) => {
    if (client[key] && client[key] !== row[key]) patch[key] = client[key];
  });
  if (Object.keys(patch).length) saveRow(paths.followups, row.id, patch);
  return { ...row, ...patch };
}

function metric(label, value, color) {
  const article = el("article", "fu-metric");
  article.style.setProperty("--accent", color);
  article.append(el("span", null, label), el("strong", null, String(value)));
  return article;
}

function stageChip(label, count, on, color, onClick) {
  const node = button(`${label} · ${count}`, `fu-chip${on ? " on" : ""}`, onClick);
  node.style.setProperty("--accent", color);
  return node;
}

function leadCard(ctx, row, employees, admins, manage, stageCounts) {
  const stage = stageOf(row.stage);
  const card = el("article", "fu-card");
  card.style.setProperty("--accent", stage.color);
  const head = el("div", "fu-head");
  const title = el("div", "fu-title");
  const mark = el("span", "fu-mark");
  mark.append(stroke(stage.icon));
  mark.style.background = `${stage.color}22`;
  mark.style.color = stage.color;
  const names = el("div");
  names.append(
    el("strong", null, row.clientName || "Unnamed client"),
    el("p", "quiet", [row.clientCode, row.companyName || "No company", row.location || "No location"].filter(Boolean).join(" · ")),
  );
  title.append(mark, names);
  const badge = el("span", "fu-badge", `${stage.label} · ${stageCounts?.[row.stage] || 0}`);
  badge.style.background = `${stage.color}22`;
  badge.style.color = stage.color;
  const chatBtn = button("", "btn ghost fu-chat-btn", () => openTicketChat(ctx, row, row.stage));
  chatBtn.append(stroke("M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z"), el("span", null, `Chats · ${feedItems(row).length}`));
  const end = el("div", "fu-head-end");
  end.append(chatBtn, badge);
  head.append(title, end);
  const facts = el("div", "fu-facts");
  const money = canManageFollowups(ctx.session);
  const factItems = [
    { label: "Contact", value: row.contactNumber, color: stageOf("contacted").color },
    { label: "Response", value: row.initialResponse, color: stageOf("response").color },
    ...(money ? [{ label: "Quote", value: row.quoteAmount ? `₹ ${row.quoteAmount}` : row.quoteNotes, color: stageOf("quote").color }] : []),
    { label: "Expectations", value: row.expectations, color: stageOf("expectations").color },
    ...(money ? [
      { label: "Payment", value: paymentLabel(row), color: stageOf("payment").color },
      { label: "Final amount", value: row.finalAmount ? `₹ ${row.finalAmount}` : "", color: stageOf("amount").color },
    ] : []),
    { label: "Assigned", value: assigneeLabel(row), color: stageOf("target").color },
  ];
  factItems.forEach((spec, index) => {
    const item = el("article", "fu-fact");
    item.style.setProperty("--accent", spec.color);
    const disc = el("i", "fu-fact-disc", spec.label.slice(0, 1));
    const copy = el("div", "fu-fact-copy");
    copy.append(el("span", null, spec.label), el("b", null, spec.value || "—"));
    item.append(disc, copy);
    facts.append(item);
    if (index < factItems.length - 1) {
      const arrow = el("i", "fu-fact-curve");
      arrow.style.color = spec.color;
      arrow.innerHTML = `<svg viewBox="0 0 44 28" aria-hidden="true"><path d="M2 18 C 14 18, 16 6, 34 14"/><path d="M28 8 l 8 6 -8 6"/></svg>`;
      facts.append(arrow);
    }
  });
  const percent = progressFor(row);
  const actors = stageActors(row);
  const currentActor = actors[row.stage];
  const barLabel = el("p", "fu-bar-label", currentActor
    ? `${percent}% · ${stage.label} by ${currentActor.name}`
    : `${percent}% complete before onboard`);
  const gaps = missingForOnboard(row).filter((item) => canManageFollowups(ctx.session) || !["Quote", "Successful payment", "Final fixed amount"].includes(item));
  const gapLine = el("p", "fu-gaps", row.stage === "success"
    ? "Onboard setup is complete."
    : (gaps.length ? `Still needed: ${gaps.join(", ")}` : "Ready to mark onboard complete."));
  const path = el("div", "fu-path");
  const inner = el("div", "fu-path-inner");
  const track = el("div", "fu-path-track");
  const fill = el("span", "fu-path-fill");
  fill.style.width = `${pathFillFor(row)}%`;
  fill.style.background = pathGradient();
  if (row.stage === "success") fill.classList.add("won");
  track.append(fill);
  if (row.stage === "success") path.classList.add("won");
  const nodes = el("div", "fu-path-nodes");
  const currentIndex = STAGES.findIndex((item) => item.id === row.stage);
  STAGES.forEach((item, index) => {
    const actor = actors[item.id];
    const isCurrent = item.id === row.stage;
    const completed = !isCurrent && (
      row.stage === "success"
        ? item.id !== "failed"
        : index < currentIndex || Boolean(actor)
    );
    const wrap = el("div", `fu-step-wrap${isCurrent ? " on" : ""}${completed ? " done" : ""}`);
    wrap.style.setProperty("--accent", item.color);
    const step = el("button", "fu-step");
    step.type = "button";
    step.title = actor
      ? `${item.label} · last update by ${actor.name}${actor.at ? ` · ${when(actor.at)}` : ""}`
      : `${item.label} · not updated yet`;
    step.append(stroke(item.icon));
    step.addEventListener("click", () => openStageSpot(ctx, row, item.id));
    wrap.append(step, el("small", null, item.label), el("b", null, actorLabel(actor)));
    if (completed || row.stage === "success" && isCurrent) {
      const tick = el("i", "fu-achieved");
      tick.append(stroke("M20 6L9 17l-5-5"));
      wrap.append(tick);
    }
    nodes.append(wrap);
  });
  inner.append(track, nodes);
  path.append(inner);
  const actions = el("div", "actions");
  if (row.stage === "success" && row.clientId) {
    actions.append(button("Open client", "btn solid", () => { location.href = clientHref(ctx.session, row.clientId); }));
  } else if (row.stage === "success") {
    actions.append(button("Convert to client", "btn solid", () => convertFollowup(ctx, row)));
  } else {
    const next = nextStageId(row);
    actions.append(button(next === row.stage ? "Update" : `Next · ${stageOf(next).label}`, "btn solid", () => openStageSpot(ctx, row, next)));
  }
  if (manage) {
    actions.append(button(Object.keys(assigneeMap(row)).length ? "Reassign" : "Assign", "btn ghost", () => assignLead(ctx, row, employees, admins)));
    actions.append(button("Delete", "btn warn", async () => {
      if (!await ctx.ask(`Remove follow-up for ${row.clientName}?`)) return;
      await deleteRow(paths.followups, row.id);
      ctx.toast("Removed");
    }));
  }
  card.append(head, facts, path, barLabel, gapLine, actions);
  return card;
}

function bubbleNode(item, session) {
  const mine = item.by === session.id;
  const bubble = el("div", mine ? "fu-bubble me" : "fu-bubble them");
  if (!mine) bubble.append(el("strong", null, item.byName || "Team"));
  bubble.append(el("p", null, item.text));
  bubble.append(el("small", null, chatWhen(item.at)));
  return bubble;
}

function stageMessages(row, id, session) {
  const items = feedItems(row).slice().reverse();
  const grouped = items.filter((item) => (item.stage || row.stage || "target") === id);
  return messagesForStage(row, id, grouped, session);
}

function paintStageThread(thread, row, session, stageId) {
  const msgs = stageMessages(row, stageId, session);
  const wrap = el("div", "fu-chat-col");
  if (!msgs.length) wrap.append(el("p", "fu-empty", "No messages yet. Send an update."));
  else msgs.forEach((msg) => wrap.append(bubbleNode(msg, session)));
  thread.replaceChildren(wrap);
  thread.scrollTop = thread.scrollHeight;
}

function paintGroupedChat(thread, row, session, focusId) {
  const items = feedItems(row).slice().reverse();
  const groups = Object.fromEntries(STAGES.map((item) => [item.id, []]));
  items.forEach((item) => {
    const id = groups[item.stage] ? item.stage : (row.stage || "target");
    groups[id].push(item);
  });
  const wrap = el("div", "fu-chat-col");
  STAGES.forEach((item) => {
    const msgs = messagesForStage(row, item.id, groups[item.id] || [], session);
    if (!msgs.length && item.id !== focusId) return;
    const section = el("section", `fu-chat-section${item.id === focusId ? " focus" : ""}`);
    section.dataset.stage = item.id;
    const title = el("h3", null, item.label);
    title.style.setProperty("--accent", item.color);
    section.append(title);
    if (!msgs.length) section.append(el("p", "fu-empty", "Start this step with a message"));
    else msgs.forEach((msg) => section.append(bubbleNode(msg, session)));
    wrap.append(section);
  });
  thread.replaceChildren(wrap);
  const focus = thread.querySelector(`[data-stage="${focusId}"]`);
  (focus || thread.lastElementChild)?.scrollIntoView({ block: "end" });
}

function paymentLabel(row) {
  if (row.paymentStatus === "paid") return `Paid${row.paymentAmount ? ` · ₹ ${row.paymentAmount}` : ""}`;
  if (row.paymentStatus === "failed") return "Payment failed";
  return row.paymentStatus === "pending" ? "Payment pending" : "";
}

function contentForStage(row, id) {
  if (id === "target") {
    return [
      row.clientName && `Client: ${row.clientName}`,
      row.companyName && `Shop: ${row.companyName}`,
      row.location && `Location: ${row.location}`,
      row.contactNumber && `Contact: ${row.contactNumber}`,
    ].filter(Boolean).join("\n");
  }
  if (id === "contacted") return row.contactNote || "";
  if (id === "response") return row.initialResponse || "";
  if (id === "quote") {
    return [row.quoteAmount && `Quote: ₹ ${row.quoteAmount}`, row.quoteNotes].filter(Boolean).join("\n");
  }
  if (id === "expectations") return row.expectations || "";
  if (id === "payment") return paymentLabel(row);
  if (id === "amount") return row.finalAmount ? `Final amount: ₹ ${row.finalAmount}` : "";
  if (id === "success") return row.stage === "success" ? "Client result: Success" : "";
  if (id === "failed") return row.failReason || (row.stage === "failed" ? "Client result: Failed" : "");
  return "";
}

function isGenericStatus(text) {
  const value = String(text || "").trim();
  return /^(new target|already contacted|contacted|response|quote|expectations|payment|final amount|onboard ready|failed) updated\.?$/i.test(value)
    || /^(new target|already contacted) opened/i.test(value);
}

function isMoneyUpdate(item) {
  if (["quote", "payment", "amount"].includes(item.stage)) return true;
  return /₹|quote\s*:|payment\s*:|final amount/i.test(String(item.text || ""));
}

function messagesForStage(row, id, msgs, session) {
  if (session && !canManageFollowups(session) && ["quote", "payment", "amount"].includes(id)) return [];
  const content = contentForStage(row, id);
  const useful = msgs.filter((item) => item.text && !isGenericStatus(item.text));
  const hasContent = content && useful.some((item) => item.text.includes(content.split("\n")[0]));
  if (content && !hasContent) {
    const actor = stageActors(row)[id] || {};
    useful.unshift({
      by: actor.id || row.createdBy || "",
      byName: actor.name || row.createdByName || "Team",
      text: content,
      at: actor.at || row.updatedAt || row.createdAt,
      stage: id,
    });
  }
  return useful;
}

function feedList(events) {
  const list = el("ul", "fu-feed");
  events.forEach((item) => {
    const li = el("li");
    li.append(
      el("strong", null, item.client ? `${item.client} · ${item.byName || "Team"}` : (item.byName || "Team")),
      el("span", null, item.text),
      el("small", null, when(item.at)),
    );
    list.append(li);
  });
  return list;
}

async function createLead(ctx, employees) {
  const data = await ctx.openForm({
    title: "New follow-up",
    submitLabel: "Create",
    fields: [
      { key: "leadType", label: "Start as", type: "select", required: true, options: ["New target", "Already contacted"] },
      { key: "clientName", label: "Client name", required: true },
      { key: "companyName", label: "Shop / company name", required: true },
      { key: "location", label: "Location", required: true },
      { key: "contactNumber", label: "Contact number", required: true },
      { key: "initialResponse", label: "Initial response", type: "textarea" },
      { key: "assignedTo", label: "Assign to employee", type: "select", options: employeeOptions(employees) },
    ],
  });
  if (!data) return;
  const person = pickEmployee(employees, data.assignedTo);
  const stage = data.leadType === "Already contacted" ? "contacted" : "target";
  const ref = await addRow(paths.followups, {
    clientName: data.clientName,
    companyName: data.companyName,
    location: data.location,
    contactNumber: data.contactNumber,
    initialResponse: data.initialResponse || "",
    leadType: data.leadType,
    stage,
    lastWorkStage: stage,
    quoteAmount: "",
    quoteNotes: "",
    expectations: "",
    paymentStatus: "pending",
    paymentAmount: "",
    finalAmount: "",
    failReason: "",
    assignedTo: person?.id || "",
    assignedName: person?.fullName || "",
    assignedCode: person?.employeeCode || "",
    assignedBy: ctx.session.id,
    createdBy: ctx.session.id,
    createdByName: ctx.session.fullName,
    stageBy: { [stage]: actorStamp(ctx.session) },
    feed: {},
  });
  await writeFeed(
    ref.key,
    ctx.session,
    [
      `${data.leadType} created`,
      `Client: ${data.clientName}`,
      `Shop: ${data.companyName}`,
      `Location: ${data.location}`,
      `Contact: ${data.contactNumber}`,
      data.initialResponse && `Response: ${data.initialResponse}`,
      person && `Assigned to ${person.fullName}`,
    ].filter(Boolean).join("\n"),
    stage,
  );
  ctx.toast("Follow-up created");
}

async function assignLead(ctx, row, employees, admins = []) {
  openMultiAssign(ctx, row, employees, admins);
}

function fillExtras(extras, row, focus, session) {
  extras.replaceChildren();
  extras.classList.remove("on");
  const specs = [];
  if (focus === "success" || focus === "failed") {
    specs.push(...fieldsForStage(focus, row).filter((spec) => spec.key === "outcome"));
  }
  if (ownsStage(row, focus, session) && canManageFollowups(session)) {
    specs.push(...fieldsForStage(focus, row).filter((spec) => ["quoteAmount", "quoteNotes", "paymentStatus", "paymentAmount", "finalAmount"].includes(spec.key)));
  }
  if (!specs.length) return;
  extras.classList.add("on");
  specs.forEach((spec) => extras.append(field({ ...spec, required: false })));
}

async function sendStageUpdate(ctx, row, focus, extras, input) {
  const text = input.value.trim();
  const data = {};
  extras.querySelectorAll("input, select, textarea").forEach((node) => {
    if (node.name) data[node.name] = node.value.trim();
  });
  const extraLines = [
    data.quoteAmount && `Quote: ₹ ${data.quoteAmount}`,
    data.quoteNotes,
    data.paymentStatus && `Payment: ${data.paymentStatus}${data.paymentAmount ? ` · ₹ ${data.paymentAmount}` : ""}`,
    data.finalAmount && `Final amount: ₹ ${data.finalAmount}`,
    data.outcome === "success" && "Client result: Success",
    data.outcome === "failed" && "Client result: Failed",
  ].filter(Boolean);
  const body = [text, ...extraLines].filter(Boolean).join("\n");
  if ((focus === "success" || focus === "failed") && !data.outcome) {
    ctx.toast("Choose Success or Failed.");
    return false;
  }
  if (!body) {
    ctx.toast("Add the update details or a message.");
    return false;
  }
  const currentIndex = STAGES.findIndex((item) => item.id === row.stage);
  const focusIndex = STAGES.findIndex((item) => item.id === focus);
  const patch = {};
  if (data.outcome === "success" || data.outcome === "failed") {
    patch.stage = data.outcome;
    patch.lastWorkStage = WORK.includes(row.stage) ? row.stage : (row.lastWorkStage || "amount");
    patch[`stageBy/${data.outcome}`] = actorStamp(ctx.session);
    if (data.outcome === "failed" && text) patch.failReason = text;
  } else if (focusIndex >= currentIndex && row.stage !== "success" && row.stage !== "failed") {
    patch.stage = focus;
    patch.lastWorkStage = WORK.includes(focus) ? focus : (row.lastWorkStage || "target");
    patch[`stageBy/${focus}`] = actorStamp(ctx.session);
  }
  if (ownsStage(row, focus, ctx.session)) {
    ["quoteAmount", "quoteNotes", "paymentStatus", "paymentAmount", "finalAmount"].forEach((key) => {
      if (data[key]) patch[key] = data[key];
    });
    if (text) {
      if (focus === "response" && !row.initialResponse) patch.initialResponse = text;
      if (focus === "expectations" && !row.expectations) patch.expectations = text;
      if (focus === "contacted" && !row.contactNote) patch.contactNote = text;
      if (focus === "quote" && !row.quoteNotes) patch.quoteNotes = text;
    }
  }
  if (Object.keys(patch).length) await saveRow(paths.followups, row.id, patch);
  await writeFeed(row.id, ctx.session, body, data.outcome || focus);
  input.value = "";
  input.focus();
  return true;
}

function bindCompose(input, send) {
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send.click();
    }
  });
}

function openStageSpot(ctx, startRow, stageId) {
  document.getElementById("fu-chat-screen")?.close();
  document.getElementById("fu-spot")?.remove();
  let row = startRow;
  const focus = stageId || row.stage || "target";
  const stage = stageOf(focus);
  const dialog = document.createElement("dialog");
  dialog.id = "fu-spot";
  dialog.className = "fu-spot";
  dialog.style.setProperty("--accent", stage.color);
  const head = el("header", "fu-spot-head");
  const close = button("", "fu-back", () => dialog.close());
  close.setAttribute("aria-label", "Close");
  close.append(stroke("M18 6L6 18M6 6l12 12"));
  const who = el("div", "fu-spot-who");
  who.append(el("strong", null, stage.label), el("small", null, row.clientName || "Client"));
  head.append(who, close);
  const thread = el("div", "fu-spot-body");
  const extras = el("div", "fu-chat-extras");
  const compose = el("div", "fu-compose");
  const input = document.createElement("textarea");
  input.rows = 1;
  input.placeholder = `Message · ${stage.label}`;
  const send = button("", "fu-send", async () => {
    send.disabled = true;
    try {
      await sendStageUpdate(ctx, row, focus, extras, input);
    } finally {
      send.disabled = false;
    }
  });
  send.setAttribute("aria-label", "Send");
  send.append(stroke("M22 2L11 13M22 2l-7 20-4-9-9-4z"));
  bindCompose(input, send);
  compose.append(input, send);
  const foot = el("div", "fu-spot-foot");
  foot.append(extras, compose);
  dialog.append(head, thread, foot);
  document.body.append(dialog);

  const paint = (next) => {
    row = next;
    paintStageThread(thread, row, ctx.session, focus);
    fillExtras(extras, row, focus, ctx.session);
  };
  paint(row);
  const stop = listen(paths.followups, (rows) => {
    if (!rows) return;
    const fresh = rows.find((item) => item.id === row.id);
    if (fresh) paint(fresh);
  });
  dialog.addEventListener("close", () => {
    stop();
    dialog.remove();
  });
  dialog.showModal();
  input.focus();
}

function openTicketChat(ctx, startRow, focusStage) {
  document.getElementById("fu-spot")?.close();
  document.getElementById("fu-chat-screen")?.remove();
  let row = startRow;
  let focus = focusStage || row.stage || "target";
  const dialog = document.createElement("dialog");
  dialog.id = "fu-chat-screen";
  dialog.className = "fu-screen";
  const head = el("header", "fu-screen-head");
  const back = button("", "fu-back", () => dialog.close());
  back.setAttribute("aria-label", "Back");
  back.append(stroke("M15 18l-6-6 6-6"));
  const avatar = el("b", "fu-avatar", (row.clientName || "C").slice(0, 1).toUpperCase());
  const who = el("div", "fu-screen-who");
  who.append(el("strong", null, row.clientName || "Client"), el("small", null, `${row.companyName || ""} · ${row.location || ""}`.replace(/^ · | · $/g, "")));
  head.append(back, avatar, who);
  const steps = el("nav", "fu-chat-steps");
  const thread = el("div", "fu-chat-body");
  const extras = el("div", "fu-chat-extras");
  const compose = el("div", "fu-compose");
  const input = document.createElement("textarea");
  input.rows = 1;
  input.placeholder = `Message · ${stageOf(focus).label}`;
  const send = button("", "fu-send", async () => {
    send.disabled = true;
    try {
      await sendStageUpdate(ctx, row, focus, extras, input);
    } finally {
      send.disabled = false;
    }
  });
  send.setAttribute("aria-label", "Send");
  send.append(stroke("M22 2L11 13M22 2l-7 20-4-9-9-4z"));
  bindCompose(input, send);
  compose.append(input, send);
  const foot = el("div", "fu-screen-foot");
  foot.append(extras, compose);
  dialog.append(head, steps, thread, foot);
  document.body.append(dialog);

  const paintSteps = () => {
    steps.replaceChildren();
    STAGES.forEach((item) => {
      const chip = button(item.label, `fu-mini${item.id === focus ? " on" : ""}`, () => {
        focus = item.id;
        paint(row);
        input.focus();
      });
      chip.style.setProperty("--accent", item.color);
      steps.append(chip);
    });
  };

  const paint = (next) => {
    row = next;
    input.placeholder = `Message · ${stageOf(focus).label}`;
    paintSteps();
    paintGroupedChat(thread, row, ctx.session, focus);
    fillExtras(extras, row, focus, ctx.session);
  };

  paint(row);
  const stop = listen(paths.followups, (rows) => {
    if (!rows) return;
    const fresh = rows.find((item) => item.id === row.id);
    if (fresh) paint(fresh);
  });
  dialog.addEventListener("close", () => {
    stop();
    dialog.remove();
  });
  dialog.showModal();
  input.focus();
}
