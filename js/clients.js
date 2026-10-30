import { channelDetail, employeeLocked, closeAccessDenied, showAccessDenied, socialBoard, workSetup } from "./client-work.js";
import { addRow, changeRow, deleteRow, listen, listenMany, paths, readList, saveRow } from "./db.js";
import { canControlAccess, canManageAdmins, canManageFollowups, isMaster, normalizeAdminRole } from "./roles.js";
import { startPortal } from "./shell.js";
import { button, el, field, loader } from "./ui.js";

export function clientHref(session, id) {
  const page = session.kind === "employee" ? "employee-client.html" : "admin-client.html";
  return `${page}?id=${encodeURIComponent(id)}`;
}

export function pageAdminClients(session) {
  return renderClients(session, "admin-clients", false);
}

export function pageEmployeeClients(session) {
  return renderClients(session, "employee-clients", true);
}

export function pageAdminClient(session) {
  return renderClientProfile(session, "admin-clients");
}

export function pageEmployeeClient(session) {
  return renderClientProfile(session, "employee-clients");
}

export function pageAdminClientDetails(session) {
  return renderClientDetails(session, "admin-clients");
}

export function pageEmployeeClientDetails(session) {
  return renderClientDetails(session, "employee-clients");
}

export function pageAdminClientSetup(session) {
  return renderClientSetup(session, "admin-clients");
}

export function pageAdminClientTeam(session) {
  return renderClientTeam(session, "admin-clients");
}

export function pageAdminClientDanger(session) {
  if (!isMaster(session)) {
    location.replace("admin-clients.html");
    return;
  }
  return renderClientDanger(session, "admin-clients");
}

export function pageAdminClientChannel(session) {
  return renderClientChannel(session, "admin-clients");
}

export function pageEmployeeClientChannel(session) {
  return renderClientChannel(session, "employee-clients");
}

export async function convertFollowup(ctx, row) {
  if (row.clientId) {
    location.href = clientHref(ctx.session, row.clientId);
    return row.clientId;
  }
  if (row.stage !== "success") {
    ctx.toast("Complete onboard success first.");
    return "";
  }
  if (!await ctx.ask(`Convert ${row.companyName || row.clientName} into a client?`)) return "";
  const clientCode = await nextClientCode();
  const ref = await addRow(paths.clients, {
    clientCode,
    followupId: row.id,
    clientName: row.clientName || "",
    companyName: row.companyName || "",
    location: row.location || "",
    address: row.address || "",
    city: row.city || "",
    state: row.state || "",
    pincode: row.pincode || "",
    contactPerson: row.clientName || "",
    designation: row.designation || "",
    contactNumber: row.contactNumber || "",
    alternateNumber: row.alternateNumber || "",
    email: row.email || "",
    website: row.website || "",
    industry: row.industry || "",
    gst: row.gst || "",
    initialResponse: row.initialResponse || "",
    quoteAmount: row.quoteAmount || "",
    quoteNotes: row.quoteNotes || "",
    expectations: row.expectations || "",
    paymentStatus: row.paymentStatus || "pending",
    paymentAmount: row.paymentAmount || "",
    finalAmount: row.finalAmount || "",
    assignedTo: row.assignedTo || "",
    assignedName: row.assignedName || "",
    assignedCode: row.assignedCode || "",
    status: "Active",
    notes: "",
    source: "followup",
    convertedBy: ctx.session.id,
    convertedByName: ctx.session.fullName,
    convertedAt: Date.now(),
  });
  await saveRow(paths.followups, row.id, { clientId: ref.key, clientCode });
  ctx.toast("Moved to Clients");
  location.href = clientHref(ctx.session, ref.key);
  return ref.key;
}

function visibleClients(rows, session) {
  return (rows || []).filter((row) => !employeeLocked(session, row));
}

function heldFrom(row, id) {
  return Boolean(row.accessHold && row.accessHold[id]);
}

const coding = new Set();

export async function nextClientCode() {
  const rows = await readList(paths.clients);
  let max = 1000;
  rows.forEach((row) => {
    const match = String(row.clientCode || "").match(/(\d+)$/);
    const number = match ? Number(match[1]) : 0;
    if (number > max) max = number;
  });
  return `CL-${max + 1}`;
}

export async function ensureClientCodes(rows) {
  const missing = (rows || []).filter((row) => row?.id && !row.clientCode && !coding.has(row.id));
  for (const row of missing) {
    coding.add(row.id);
    try {
      const clientCode = await nextClientCode();
      await saveRow(paths.clients, row.id, { clientCode });
      if (row.followupId) await saveRow(paths.followups, row.followupId, { clientCode });
    } catch (error) {
      coding.delete(row.id);
    }
  }
}

function paymentText(row) {
  if (row.paymentStatus === "paid") return `Paid${row.paymentAmount ? ` · ₹ ${row.paymentAmount}` : ""}`;
  if (row.paymentStatus === "failed") return "Failed";
  return row.paymentStatus === "pending" ? "Pending" : (row.paymentStatus || "—");
}

function when(ms) {
  return ms ? new Date(ms).toLocaleString() : "—";
}

function unique(rows, key) {
  return [...new Set(rows.map((row) => String(row[key] || "").trim()).filter(Boolean))].sort();
}

function renderClients(session, page, employeeOnly) {
  const ctx = startPortal(session, page);
  ctx.setHeading(employeeOnly ? "Employee" : "Admin", "Clients");
  if (!employeeOnly) ctx.actions.append(button("Add client", "btn solid", () => addClient(ctx)));
  let latest = [];
  const filters = {
    search: "",
    status: "All",
    payment: "All",
    location: "All",
    assigned: "All",
  };
  const tools = el("div", "toolbar cl-filters");
  const search = document.createElement("input");
  search.type = "search";
  search.placeholder = "Search company, person, phone, email";
  search.setAttribute("aria-label", "Search clients");
  search.addEventListener("input", () => {
    filters.search = search.value.trim().toLowerCase();
    paint();
  });
  const selects = el("div", "cl-filter-row");
  tools.append(search, selects);
  const list = el("div", "stack");
  list.append(loader("Loading clients"));
  ctx.panel.append(
    el("p", "lede", employeeOnly
      ? "Companies assigned to you."
      : "Add a new client, or open one converted from a follow-up. Nobody is assigned until you give access."),
    tools,
    list,
  );

  const paint = () => {
    ctx.setHeading(employeeOnly ? "Employee" : "Admin", `Clients · ${latest.length}`);
    const options = {
      status: ["All", "Active", "Hold", "Closed"],
      payment: ["All", "pending", "paid", "failed"],
      location: ["All", ...unique(latest, "location")],
      assigned: ["All", ...[...new Set(latest.flatMap((row) => accessPeople(row).map((person) => person.name)))].sort((a, b) => a.localeCompare(b))],
    };
    selects.replaceChildren(
      filterSelect("Status", filters.status, options.status, (value) => { filters.status = value; paint(); }),
    );
    if (!employeeOnly) {
      selects.append(filterSelect("Payment", filters.payment, options.payment.map((item) => (
        item === "pending" ? { value: "pending", label: "Pending" }
          : item === "paid" ? { value: "paid", label: "Paid" }
            : item === "failed" ? { value: "failed", label: "Failed" }
              : item
      )), (value) => { filters.payment = value; paint(); }));
    }
    selects.append(filterSelect("Location", filters.location, options.location, (value) => { filters.location = value; paint(); }));
    if (canManageAdmins(session)) {
      selects.append(filterSelect("Assigned", filters.assigned, options.assigned, (value) => { filters.assigned = value; paint(); }));
    }
    const shown = latest.filter((row) => matches(row, filters));
    if (!shown.length) {
      list.replaceChildren(el("p", "quiet", "No clients match these filters."));
      return;
    }
    const cards = el("div", "cl-cards");
    shown.forEach((row) => cards.append(clientAppCard(session, row)));
    list.replaceChildren(cards);
  };

  listen(paths.clients, (rows) => {
    if (!rows) {
      list.replaceChildren(el("p", "quiet", "Firebase refused this read. Check the database rules, then refresh."));
      return;
    }
    latest = visibleClients(rows, session);
    ensureClientCodes(latest);
    paint();
  });
}

function clientAppCard(session, row) {
  const card = el("article", "cl-app");
  card.tabIndex = 0;
  const top = el("div", "cl-app-top");
  const avatar = el("b", null, (row.companyName || row.clientName || "C").slice(0, 1).toUpperCase());
  const names = el("div");
  names.append(el("strong", null, row.companyName || "Company"), el("small", null, row.clientName || "Client"));
  top.append(avatar, names, el("em", null, row.paused ? "Paused" : (row.clientCode || "—")));
  card.append(top);
  const open = () => { location.href = clientHref(session, row.id); };
  card.addEventListener("click", open);
  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter") open();
  });
  return card;
}

function matches(row, filters) {
  if (filters.status !== "All" && (row.status || "Active") !== filters.status) return false;
  if (filters.payment !== "All" && (row.paymentStatus || "pending") !== filters.payment) return false;
  if (filters.location !== "All" && row.location !== filters.location) return false;
  if (filters.assigned !== "All" && !accessPeople(row).some((person) => person.name === filters.assigned)) return false;
  if (!filters.search) return true;
  const blob = [row.clientCode, row.companyName, row.clientName, row.contactNumber, row.email, row.location, row.gst, row.industry]
    .join(" ")
    .toLowerCase();
  return blob.includes(filters.search);
}

function filterSelect(label, value, options, onChange) {
  const wrap = el("label", "filter-label", label);
  const select = document.createElement("select");
  select.setAttribute("aria-label", label);
  options.forEach((option) => {
    const name = typeof option === "string" ? option : option.label;
    const val = typeof option === "string" ? option : option.value;
    const node = el("option", null, name);
    node.value = val;
    select.append(node);
  });
  select.value = value;
  select.addEventListener("change", () => onChange(select.value));
  wrap.append(select);
  return wrap;
}

function profileFields(row) {
  return [
    { key: "companyName", label: "Company name", required: true, value: row.companyName || "" },
    { key: "clientName", label: "Client name", required: true, value: row.clientName || "" },
    { key: "contactPerson", label: "Contact person", value: row.contactPerson || row.clientName || "" },
    { key: "designation", label: "Designation", value: row.designation || "" },
    { key: "contactNumber", label: "Primary phone", required: true, value: row.contactNumber || "" },
    { key: "alternateNumber", label: "Alternate phone", value: row.alternateNumber || "" },
    { key: "email", label: "Email", type: "email", value: row.email || "" },
    { key: "website", label: "Website", value: row.website || "" },
    { key: "industry", label: "Industry", value: row.industry || "" },
    { key: "gst", label: "GST / tax ID", value: row.gst || "" },
    { key: "address", label: "Street address", type: "textarea", value: row.address || "" },
    { key: "city", label: "City", value: row.city || "" },
    { key: "state", label: "State", value: row.state || "" },
    { key: "pincode", label: "PIN code", value: row.pincode || "" },
    { key: "location", label: "Location", value: row.location || "" },
    { key: "quoteAmount", label: "Quote amount", value: row.quoteAmount || "" },
    { key: "finalAmount", label: "Final amount", value: row.finalAmount || "" },
    { key: "paymentStatus", label: "Payment", type: "select", value: row.paymentStatus || "pending", options: [
      { value: "pending", label: "Pending" },
      { value: "paid", label: "Paid" },
      { value: "failed", label: "Failed" },
    ] },
    { key: "paymentAmount", label: "Payment amount", value: row.paymentAmount || "" },
    { key: "expectations", label: "Expectations", type: "textarea", value: row.expectations || "" },
    { key: "status", label: "Account status", type: "select", value: row.status || "Active", options: ["Active", "Hold", "Closed"] },
    { key: "notes", label: "Internal notes", type: "textarea", value: row.notes || "" },
  ];
}

function profileHref(session, id) {
  const page = session.kind === "employee" ? "employee-client.html" : "admin-client.html";
  return `${page}?id=${encodeURIComponent(id)}`;
}

function openClient(session, navPage, title, back, render, keys = ["clients"]) {
  const ctx = startPortal(session, navPage);
  const id = new URLSearchParams(location.search).get("id") || "";
  ctx.setHeading(session.kind === "employee" ? "Employee" : "Admin", title);
  ctx.setBack(back.href(id), back.label);
  const stage = el("div", "stack");
  stage.append(loader("Loading client"));
  ctx.panel.append(stage);
  if (!id) {
    stage.replaceChildren(el("p", "quiet", "This client link is missing."));
    return;
  }
  listenMany(keys, (data) => {
    if (!data) {
      stage.replaceChildren(el("p", "quiet", "Firebase refused this read. Check the database rules, then refresh."));
      return;
    }
    const row = (data.clients || []).find((item) => item.id === id);
    if (row && !row.clientCode) ensureClientCodes([row]);
    if (!row) {
      stage.replaceChildren(el("p", "quiet", "This client was not found."));
      return;
    }
    if (employeeLocked(session, row)) {
      ctx.setHeading(session.kind === "employee" ? "Employee" : "Admin", row.companyName || title);
      stage.replaceChildren(el("p", "quiet", "This client is turned off for your account. Contact the Master Admin."));
      showAccessDenied(session);
      return;
    }
    closeAccessDenied();
    ctx.setHeading(session.kind === "employee" ? "Employee" : "Admin", row.companyName || title);
    stage.replaceChildren(render(ctx, row, data));
  });
}

function renderClientProfile(session, navPage) {
  const list = session.kind === "employee" ? "employee-clients.html" : "admin-clients.html";
  openClient(session, navPage, "Client", { label: "Back to clients", href: () => list }, (ctx, row) => resumeCard(ctx, row));
}

function renderClientTeam(session, navPage) {
  openClient(session, navPage, "People", {
    label: "Back to profile",
    href: (id) => profileHref(session, id),
  }, (ctx, row, data) => teamBoard(ctx, row, data.employees || [], data.admins || []), ["clients", "employees", "admins"]);
}

function renderClientDanger(session, navPage) {
  openClient(session, navPage, "Danger zone", {
    label: "Back to profile",
    href: (id) => profileHref(session, id),
  }, (ctx, row, data) => dangerBoard(ctx, row, data.employees || [], data.admins || [], data.followups || []), ["clients", "employees", "admins", "followups"]);
}

function renderClientDetails(session, navPage) {
  openClient(session, navPage, "Profile details", {
    label: "Back to profile",
    href: (id) => profileHref(session, id),
  }, (ctx, row) => profileDetails(ctx, row));
}

function renderClientSetup(session, navPage) {
  openClient(session, navPage, "Social settings", {
    label: "Back to profile",
    href: (id) => profileHref(session, id),
  }, (ctx, row, data) => workSetup(ctx, row, data.employees || []), ["clients", "employees"]);
}

function renderClientChannel(session, navPage) {
  const platform = new URLSearchParams(location.search).get("platform") || "";
  openClient(session, navPage, "Social work", {
    label: "Back to profile",
    href: (id) => profileHref(session, id),
  }, (ctx, row) => channelDetail(ctx, row, platform));
}

function accessPeople(row) {
  const map = new Map();
  if (row.assignedTo) map.set(row.assignedTo, row.assignedName || "Employee");
  Object.entries(row.crew || {}).forEach(([id, info]) => {
    if (!info) return;
    map.set(id, info.name || map.get(id) || "Employee");
  });
  return [...map.entries()].map(([id, name]) => ({ id, name, paused: heldFrom(row, id) }));
}

const teamUi = { clientId: "", query: "" };
let assignDialog = null;

function teamBoard(ctx, row, employees, admins) {
  if (teamUi.clientId !== row.id) {
    teamUi.clientId = row.id;
    teamUi.query = "";
    assignDialog?.close();
  }
  const page = el("div", "stack");
  const head = el("div", "team-head");
  const hr = normalizeAdminRole(ctx.session.role) === "HR Admin";
  head.append(
    el("p", "quiet", hr
      ? "Pause hides this client from that employee. Remove takes their access away."
      : "Assign or remove employees, HR Admins, and Admins. Master Admin already sees every client."),
    button(hr ? "Assign employee" : "Assign person", "btn solid", () => openAssignDialog(ctx, row, employees, admins)),
  );
  page.append(head, handlerTable(ctx, row, employees, admins));
  if (assignDialog?.open) paintAssignList(assignDialog, ctx, row, employees, admins);
  return page;
}

const SOCIAL_LABELS = {
  instagram: "Instagram",
  facebook: "Facebook",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  x: "X",
};

function dangerBoard(ctx, row, employees, admins, followups) {
  const page = el("div", "stack");
  page.append(el("p", "lede", "Review linked data and assigned people before you pause or delete this client."));
  page.append(linkedSnapshot(row, employees, admins, followups));
  page.append(masterClientControls(ctx, row));
  return page;
}

function linkedSnapshot(row, employees, admins, followups) {
  const wrap = el("div", "stack");
  wrap.append(snapshotCard("Client snapshot", [
    ["Client code", row.clientCode],
    ["Company", row.companyName],
    ["Person", row.clientName],
    ["Location", [row.city, row.state, row.location].filter(Boolean).join(", ")],
    ["Status", row.paused ? "Paused (Master only)" : "Live"],
    ["Paused at", row.paused && row.pausedAt ? new Date(row.pausedAt).toLocaleString() : ""],
  ]));

  const followCard = el("section", "profile-card");
  followCard.append(el("h2", null, "Linked follow-up"));
  const follow = (followups || []).find((item) => item.id === row.followupId);
  if (!row.followupId) {
    followCard.append(el("p", "quiet", "No follow-up is linked."));
  } else if (!follow) {
    followCard.append(el("p", "quiet", `Linked follow-up ${row.followupId} is missing.`));
  } else {
    followCard.append(kvTable([
      ["Company", follow.companyName],
      ["Person", follow.clientName],
      ["Stage", follow.stage],
      ["Follow-up ID", follow.id],
    ]));
  }
  wrap.append(followCard);

  const peopleCard = el("section", "profile-card");
  peopleCard.append(el("h2", null, "Assigned people"));
  const people = accessPeople(row);
  if (!people.length) {
    peopleCard.append(el("p", "quiet", "No employees, HR Admins, or Admins are assigned."));
  } else {
    peopleCard.append(dataTable(["S.No", "Name", "Role", "Email", "Mobile", "Access"], people.map((person, index) => {
      const record = accountRecord(person.id, employees, admins);
      return [
        serialMark(index + 1),
        person.name || record.fullName || "Account",
        record.role || "Employee",
        record.email || "—",
        record.mobile || "—",
        el("span", person.paused ? "req-status hold" : "req-status live", person.paused ? "Paused" : "Active"),
      ];
    })));
  }
  wrap.append(peopleCard);

  const socialCard = el("section", "profile-card");
  socialCard.append(el("h2", null, "Social pages & work"));
  const socials = Object.entries(row.socials || {});
  if (!socials.length) {
    socialCard.append(el("p", "quiet", "No social pages are saved."));
  } else {
    socialCard.append(dataTable(["S.No", "Platform", "On", "Basics done", "Posts / links"], socials.map(([id, channel], index) => [
      serialMark(index + 1),
      SOCIAL_LABELS[id] || id,
      channel?.enabled ? "Enabled" : "Off",
      String(Object.values(channel?.basics || {}).filter(Boolean).length),
      String(channelPostCount(channel)),
    ])));
  }
  wrap.append(socialCard);

  wrap.append(snapshotCard("Deal & notes", [
    ["Quote", row.quoteAmount],
    ["Payment", row.paymentAmount],
    ["Final", row.finalAmount],
    ["Notes", row.notes],
  ]));
  return wrap;
}

function snapshotCard(title, pairs) {
  const card = el("section", "profile-card");
  card.append(el("h2", null, title));
  card.append(kvTable(pairs));
  return card;
}

function kvTable(pairs) {
  return dataTable(["Field", "Value"], pairs.map(([label, value]) => [label, value == null || value === "" ? "—" : String(value)]));
}

function channelPostCount(channel) {
  const own = Object.keys(channel?.posts || {}).length;
  const kinds = Object.values(channel?.kinds || {}).reduce((inner, lane) => inner + Object.keys(lane?.posts || {}).length, 0);
  return own + kinds;
}

function handlerTable(ctx, row, employees, admins) {
  const people = accessPeople(row);
  if (!people.length) return el("p", "quiet", "No one is assigned yet.");
  return dataTable(["S.No", "Person", "Contact", "Status", "Action"], people.map((person, index) => {
    const record = accountRecord(person.id, employees, admins);
    const allowed = canControlAccess(ctx.session, record.person);
    const actions = el("div", "req-actions");
    if (allowed) {
      actions.append(
        button(person.paused ? "Resume" : "Pause", "btn ghost", () => runTeam(ctx, () => setHold(row, person.id, !person.paused), person.paused ? "Client is visible again." : "Client is hidden for this account.")),
        button("Remove", "btn warn", async () => {
          if (!await ctx.ask(`Remove ${person.name} from this client?`)) return;
          runTeam(ctx, () => dropAccess(row, person.id), "Access removed");
        }),
      );
    } else {
      actions.append(el("span", "quiet", "Managed above you"));
    }
    return [
      serialMark(index + 1),
      personCell(person.name, record.code),
      contactCell(record.email, record.mobile),
      el("span", person.paused ? "req-status hold" : "req-status live", person.paused ? "Paused" : "Active"),
      actions,
    ];
  }));
}

function openAssignDialog(ctx, row, employees, admins) {
  assignDialog?.close();
  const dialog = document.createElement("dialog");
  dialog.className = "sheet team-sheet";
  const pop = el("div", "team-pop");
  const head = el("header");
  const copy = el("div");
  const hr = normalizeAdminRole(ctx.session.role) === "HR Admin";
  copy.append(
    el("h2", null, hr ? "Assign employee" : "Assign person"),
    el("p", "quiet", hr
      ? `Choose the employees who can handle ${row.companyName || "this client"}.`
      : `Choose an employee, HR Admin, or Admin for ${row.companyName || "this client"}.`),
  );
  const close = button("×", "icon-btn", () => dialog.close());
  close.setAttribute("aria-label", "Close");
  head.append(copy, close);
  const search = document.createElement("input");
  search.type = "search";
  search.placeholder = "Search name, role, or email";
  search.setAttribute("aria-label", "Search people");
  search.value = teamUi.query;
  const host = el("div", "team-pop-list");
  search.addEventListener("input", () => {
    teamUi.query = search.value;
    paintAssignList(dialog, ctx, row, employees, admins);
  });
  pop.append(head, search, host);
  dialog.append(pop);
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", () => {
    dialog.remove();
    if (assignDialog === dialog) assignDialog = null;
  });
  document.body.append(dialog);
  assignDialog = dialog;
  paintAssignList(dialog, ctx, row, employees, admins);
  dialog.showModal();
  search.focus();
}

function paintAssignList(dialog, ctx, row, employees, admins) {
  const host = dialog.querySelector(".team-pop-list");
  if (!host) return;
  const query = teamUi.query.trim().toLowerCase();
  const taken = new Set(accessPeople(row).map((person) => person.id));
  const list = assignCandidates(ctx.session, employees, admins).filter((person) => {
    if (!query) return true;
    return [person.fullName, person.employeeCode, person.email, person.mobile, person.label].join(" ").toLowerCase().includes(query);
  });
  if (!list.length) {
    host.replaceChildren(el("p", "quiet", "No one matches."));
    return;
  }
  host.replaceChildren(dataTable(["S.No", "Person", "Contact", "Action"], list.map((person, index) => {
    const on = taken.has(person.id);
    const action = on
      ? el("span", "req-status live", "Assigned")
      : button("Assign", "btn solid", () => runTeam(ctx, () => grantAccess(row, person), `${person.fullName || "Account"} can now handle this client.`));
    return [
      serialMark(index + 1),
      personCell(person.fullName || "Account", person.label),
      contactCell(person.email, person.mobile),
      action,
    ];
  })));
}

function accountRecord(id, employees, admins) {
  const admin = (admins || []).find((item) => item.id === id);
  if (admin) {
    return {
      person: { kind: "admin", role: admin.role },
      code: normalizeAdminRole(admin.role),
      role: normalizeAdminRole(admin.role),
      email: admin.email,
      mobile: admin.mobile,
      fullName: admin.fullName,
    };
  }
  const employee = (employees || []).find((item) => item.id === id);
  return {
    person: { kind: "employee" },
    code: cleanCode(employee?.employeeCode),
    role: "Employee",
    email: employee?.email,
    mobile: employee?.mobile,
    fullName: employee?.fullName,
  };
}

function assignCandidates(session, employees, admins) {
  const staff = activeStaff(employees).map((person) => ({
    ...person,
    label: "Employee",
    person: { kind: "employee" },
  }));
  if (normalizeAdminRole(session.role) === "HR Admin") return staff.filter((person) => canControlAccess(session, person.person));
  const leaders = activeStaff(admins)
    .filter((person) => normalizeAdminRole(person.role) !== "Master Admin")
    .map((person) => ({
      ...person,
      label: normalizeAdminRole(person.role),
      person: { kind: "admin", role: person.role },
    }));
  return [...staff, ...leaders].filter((person) => canControlAccess(session, person.person));
}

function cleanCode(code) {
  const text = String(code || "").trim();
  if (!text || text.toLowerCase() === "none") return "";
  return text;
}

function dataTable(headers, rows) {
  const wrap = el("div", "table-wrap req-wrap");
  const table = document.createElement("table");
  table.className = "data-table req-table";
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
      if (index === cells.length - 1) td.className = "req-action-cell";
      td.append(cell instanceof Node ? cell : document.createTextNode(cell || "—"));
      tr.append(td);
    });
    body.append(tr);
  });
  table.append(head, body);
  wrap.append(table);
  return wrap;
}

function serialMark(serial) {
  return el("span", "req-no", String(serial));
}

function personCell(name, code) {
  const cell = el("div", "req-person");
  cell.append(el("b", null, (name || "E").slice(0, 1).toUpperCase()));
  const copy = el("div");
  copy.append(el("strong", null, name || "Employee"));
  if (code) copy.append(el("small", null, code));
  cell.append(copy);
  return cell;
}

function contactCell(email, mobile) {
  const cell = el("div", "req-contact");
  cell.append(document.createTextNode(email || "—"));
  if (mobile) cell.append(el("small", null, mobile));
  return cell;
}

async function runTeam(ctx, work, message) {
  try {
    await work();
    ctx.toast(message);
  } catch (error) {
    ctx.toast(error.message || "Could not update access.");
  }
}

function setHold(row, id, paused) {
  return changeRow(paths.clients, row.id, (current) => {
    const accessHold = { ...(current.accessHold || {}) };
    if (paused) accessHold[id] = true;
    else delete accessHold[id];
    return { ...current, accessHold };
  });
}

function dropAccess(row, id) {
  return changeRow(paths.clients, row.id, (current) => {
    const crew = { ...(current.crew || {}) };
    delete crew[id];
    const accessHold = { ...(current.accessHold || {}) };
    delete accessHold[id];
    const next = { ...current, crew, accessHold };
    if (current.assignedTo === id) {
      next.assignedTo = "";
      next.assignedName = "";
      next.assignedCode = "";
    }
    return next;
  });
}

function grantAccess(row, person) {
  return changeRow(paths.clients, row.id, (current) => {
    const crew = { ...(current.crew || {}) };
    crew[person.id] = { ...(crew[person.id] || {}), name: person.fullName || "Employee" };
    const accessHold = { ...(current.accessHold || {}) };
    delete accessHold[person.id];
    return { ...current, crew, accessHold };
  });
}

function activeStaff(employees) {
  return (employees || [])
    .filter((person) => !person.accountStatus || person.accountStatus === "active")
    .sort((a, b) => String(a.fullName || "").localeCompare(String(b.fullName || "")));
}

async function addClient(ctx) {
  const data = await ctx.openForm({
    title: "New client",
    submitLabel: "Onboard",
    fields: [
      { key: "companyName", label: "Company name", required: true },
      { key: "clientName", label: "Client name", required: true },
      { key: "contactNumber", label: "Primary phone", required: true },
      { key: "email", label: "Email", type: "email" },
      { key: "designation", label: "Designation" },
      { key: "location", label: "Location" },
      { key: "address", label: "Street address", type: "textarea" },
      { key: "city", label: "City" },
      { key: "industry", label: "Industry" },
      { key: "expectations", label: "Expectations", type: "textarea" },
      { key: "quoteAmount", label: "Quote amount" },
      { key: "finalAmount", label: "Final amount" },
      { key: "paymentStatus", label: "Payment", type: "select", options: [
        { value: "pending", label: "Pending" },
        { value: "paid", label: "Paid" },
        { value: "failed", label: "Failed" },
      ] },
    ],
  });
  if (!data) return;
  try {
    const clientCode = await nextClientCode();
    const ref = await addRow(paths.clients, {
      clientCode,
      companyName: data.companyName,
      clientName: data.clientName,
      contactPerson: data.clientName,
      contactNumber: data.contactNumber,
      email: data.email || "",
      designation: data.designation || "",
      location: data.location || "",
      address: data.address || "",
      city: data.city || "",
      industry: data.industry || "",
      expectations: data.expectations || "",
      quoteAmount: data.quoteAmount || "",
      finalAmount: data.finalAmount || "",
      paymentStatus: data.paymentStatus || "pending",
      paymentAmount: "",
      assignedTo: "",
      assignedName: "",
      assignedCode: "",
      crew: ctx.session?.id ? { [ctx.session.id]: { name: ctx.session.fullName || "Account" } } : {},
      status: "Active",
      notes: "",
      source: "manual",
      convertedBy: ctx.session.id,
      convertedByName: ctx.session.fullName,
      convertedAt: Date.now(),
    });
    ctx.toast("Client onboarded. Assign someone when you are ready.");
    location.href = clientHref(ctx.session, ref.key);
  } catch (error) {
    ctx.toast(error.message || "Could not add the client.");
  }
}

function resumeCard(ctx, row) {
  const page = el("article", "profile");
  const hero = el("header", "profile-hero");
  const photo = el("b", "profile-photo", (row.companyName || row.clientName || "C").slice(0, 1).toUpperCase());
  const who = el("div", "profile-who");
  who.append(
    el("h1", null, row.companyName || "Company"),
    el("p", null, [row.contactPerson || row.clientName, row.designation].filter(Boolean).join(" · ") || "Client"),
  );
  const chips = el("div", "profile-chips");
  if (row.paused) chips.append(el("span", "profile-chip paused", "Paused"));
  [["status", row.status || "Active"], ["industry", row.industry || "Industry"], ["location", row.location || "Location"]].forEach(([key, text]) => {
    chips.append(el("span", `profile-chip ${key}`, text));
  });
  chips.prepend(el("span", "profile-chip code", row.clientCode || "Assigning ID"));
  who.append(chips);
  const tools = el("div", "profile-tools");
  if (canManageFollowups(ctx.session)) {
    tools.append(toolLink(`admin-client-team.html?id=${encodeURIComponent(row.id)}`, "People", "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"));
  }
  const details = sessionKindPage(ctx.session, "details");
  tools.append(toolLink(`${details}?id=${encodeURIComponent(row.id)}`, "Details", "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5 20a7 7 0 0 1 14 0"));
  if (canManageFollowups(ctx.session)) {
    tools.append(toolLink(`admin-client-setup.html?id=${encodeURIComponent(row.id)}`, "Settings", "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 15a7.8 7.8 0 0 0 .1-2l2-1.2-2-3.4-2.3.6a7 7 0 0 0-1.7-1L15 5h-4l-.5 2.9a7 7 0 0 0-1.7 1L6.5 8.4l-2 3.4L6.5 13a7.8 7.8 0 0 0 0 2l-2 1.2 2 3.4 2.3-.6a7 7 0 0 0 1.7 1L11 22h4l.5-2.9a7 7 0 0 0 1.7-1l2.3.6 2-3.4z"));
  }
  if (isMaster(ctx.session)) {
    tools.append(toolLink(`admin-client-danger.html?id=${encodeURIComponent(row.id)}`, "Danger zone", "M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01", true));
  }
  hero.append(photo, who, tools);
  page.append(hero);
  if (row.paused) page.append(el("p", "quiet", "This client is paused. Only Master Admin can see it until it is resumed."));
  const board = socialBoard(ctx.session, row);
  if (board) page.append(board);
  return page;
}

function sessionKindPage(session, name) {
  const who = session.kind === "employee" ? "employee" : "admin";
  return `${who}-client-${name}.html`;
}

function toolLink(href, label, path, danger) {
  const link = el("a", danger ? "profile-tool danger" : "profile-tool");
  link.href = href;
  link.setAttribute("aria-label", label);
  link.title = label;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const shape = document.createElementNS("http://www.w3.org/2000/svg", "path");
  shape.setAttribute("d", path);
  svg.append(shape);
  link.append(svg, el("span", null, label));
  return link;
}

function profileDetails(ctx, row) {
  const page = el("div", "profile");
  const stats = el("div", "profile-stats");
  const statItems = [];
  if (canManageFollowups(ctx.session)) {
    statItems.push(
      ["blue", "Quote", displayValue(row, "quoteAmount")],
      ["green", "Final amount", displayValue(row, "finalAmount")],
      ["amber", "Payment", displayValue(row, "paymentStatus")],
    );
  }
  if (canManageAdmins(ctx.session)) statItems.push(["violet", "Assigned", row.assignedName || "Unassigned"]);
  if (statItems.length) {
  statItems.forEach(([tone, label, value]) => {
    const card = el("article", `profile-stat ${tone}`);
    const copy = el("div");
    copy.append(el("span", null, label), el("strong", null, value));
    card.append(el("i", null, label.slice(0, 1)), copy);
    stats.append(card);
  });
  }
  const grid = el("div", "profile-grid");
  grid.append(
    section(ctx, row, "Company", ["companyName", "industry", "website", "gst"], [
      ["Client ID", row.clientCode || "—"],
    ]),
    section(ctx, row, "Contact", ["clientName", "contactPerson", "designation", "contactNumber", "alternateNumber", "email"]),
    section(ctx, row, "Address", ["address", "city", "state", "pincode", "location"]),
    section(ctx, row, "Deal", canManageFollowups(ctx.session)
      ? ["quoteAmount", "finalAmount", "paymentStatus", "paymentAmount", "expectations"]
      : ["expectations"]),
  );
  if (canManageAdmins(ctx.session)) {
    grid.append(section(ctx, row, "Account", ["status", "notes"], [
      ["Assigned", row.assignedName || "—"],
      ["Converted by", row.convertedByName || "—"],
      ["Converted", when(row.convertedAt || row.createdAt)],
    ]));
  }
  if (statItems.length) page.append(stats);
  page.append(grid);
  return page;
}

function masterClientControls(ctx, row) {
  const wrap = el("div", "stack");
  const pause = el("section", "profile-card");
  pause.append(el("h2", null, "Pause client"));
  pause.append(el("p", "quiet", row.paused
    ? "This client is hidden from Admin, HR Admin, and employees. Resume it to give them access again."
    : "Pause hides this client from every login except Master Admin. Work already saved stays."));
  pause.append(button(row.paused ? "Resume client" : "Pause client", row.paused ? "btn solid" : "btn ghost", () => toggleClientPause(ctx, row)));
  const packed = clientDataCount(row);
  const danger = el("section", "profile-card danger-zone");
  danger.append(el("h2", null, "Delete project"));
  const emptyRow = el("div", "danger-row");
  const emptyCopy = el("div");
  emptyCopy.append(
    el("strong", null, "Delete empty client"),
    el("p", "quiet", packed
      ? `This client has ${packed}. Use delete with data below.`
      : "No social work, quote, or notes yet. This only removes the empty client."),
  );
  const emptyBtn = button("Delete empty client", "btn warn", () => deleteClient(ctx, row, false));
  if (packed) {
    emptyBtn.disabled = true;
    emptyBtn.title = "This client has data";
  }
  emptyRow.append(emptyCopy, emptyBtn);
  const fullRow = el("div", "danger-row");
  const fullCopy = el("div");
  fullCopy.append(
    el("strong", null, "Delete client and all data"),
    el("p", "quiet", "Permanently delete social work, assignments, and records. Type the company name to confirm, like GitHub."),
  );
  fullRow.append(fullCopy, button("Delete all data", "btn warn", () => deleteClient(ctx, row, true)));
  danger.append(emptyRow, fullRow);
  wrap.append(pause, danger);
  return wrap;
}

function clientDataCount(row) {
  const posts = Object.values(row.socials || {}).reduce((sum, channel) => {
    const own = Object.keys(channel?.posts || {}).length;
    const kinds = Object.values(channel?.kinds || {}).reduce((inner, lane) => inner + Object.keys(lane?.posts || {}).length, 0);
    return sum + own + kinds;
  }, 0);
  const pages = Object.values(row.socials || {}).filter((channel) => channel?.enabled).length;
  const crew = Object.keys(row.crew || {}).length;
  const bits = [];
  if (posts) bits.push(`${posts} fed link${posts === 1 ? "" : "s"}`);
  if (pages) bits.push(`${pages} social page${pages === 1 ? "" : "s"}`);
  if (crew) bits.push(`${crew} assigned`);
  if (row.notes) bits.push("notes");
  if (row.quoteAmount || row.finalAmount || row.paymentAmount) bits.push("deal money");
  return bits.join(", ");
}

async function toggleClientPause(ctx, row) {
  const next = !row.paused;
  const ok = await ctx.ask(next
    ? `Pause ${row.companyName || "this client"}? Admin, HR Admin, and employees will not see it until you resume.`
    : `Resume ${row.companyName || "this client"}? Assigned people will see it again.`);
  if (!ok) return;
  try {
    await changeRow(paths.clients, row.id, (current) => {
      if (!current) return current;
      return { ...current, paused: next, pausedAt: next ? Date.now() : 0, pausedBy: next ? ctx.session.id : "" };
    });
    ctx.toast(next ? "Client paused" : "Client resumed");
  } catch (error) {
    ctx.toast(error.message || "Could not update the client.");
  }
}

async function deleteClient(ctx, row, withData) {
  const name = String(row.companyName || row.clientName || "").trim();
  if (withData) {
    const typed = await confirmDeleteName(row, name);
    if (!typed) return;
  } else {
    if (clientDataCount(row)) {
      ctx.toast("This client has data. Use delete all data.");
      return;
    }
    if (!await ctx.ask(`Delete empty client ${name || "this client"}? This cannot be undone.`)) return;
  }
  try {
    if (row.followupId) {
      await saveRow(paths.followups, row.followupId, { clientId: "", clientCode: row.clientCode || "" });
    }
    await deleteRow(paths.clients, row.id);
    ctx.toast(withData ? "Client and all data deleted" : "Empty client deleted");
    location.href = "admin-clients.html";
  } catch (error) {
    ctx.toast(error.message || "Could not delete the client.");
  }
}

function confirmDeleteName(row, name) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      dialog.close();
      resolve(ok);
    };
    const dialog = document.createElement("dialog");
    dialog.className = "sheet danger-sheet";
    const form = document.createElement("form");
    const head = el("header");
    head.append(el("h2", null, "Are you absolutely sure?"));
    const copy = el("div", "danger-copy");
    copy.append(
      el("p", null, "This cannot be undone. This will permanently delete the client, social work, assignments, and records."),
      el("p", null, `Please type ${name} to confirm.`),
    );
    const field = document.createElement("input");
    field.type = "text";
    field.autocomplete = "off";
    field.placeholder = name;
    field.setAttribute("aria-label", "Type the company name");
    const footer = el("footer");
    const cancel = button("Cancel", "btn ghost", () => finish(false));
    cancel.type = "button";
    const go = button("I understand, delete this client", "btn warn");
    go.type = "submit";
    go.disabled = true;
    const match = () => field.value.trim().toLowerCase() === name.toLowerCase();
    field.addEventListener("input", () => { go.disabled = !match(); });
    footer.append(cancel, go);
    form.append(head, copy, field, footer);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!match()) return;
      finish(true);
    });
    dialog.addEventListener("close", () => {
      dialog.remove();
      finish(false);
    });
    dialog.append(form);
    document.body.append(dialog);
    dialog.showModal();
    field.focus();
  });
}

function specByKey(row, key) {
  return profileFields(row).find((item) => item.key === key);
}

function displayValue(row, key) {
  if (key === "paymentStatus") return paymentText(row);
  if (["quoteAmount", "finalAmount", "paymentAmount"].includes(key) && row[key]) return `₹ ${row[key]}`;
  return row[key] || "—";
}

function section(ctx, row, title, keys, locked) {
  const block = el("section", "profile-card");
  block.append(el("h2", null, title));
  const list = el("div", "profile-tiles");
  (locked || []).forEach(([label, value]) => list.append(lockedTile(label, value)));
  keys.forEach((key) => list.append(fieldTile(ctx, row, specByKey(row, key))));
  block.append(list);
  return block;
}

function tileMark(label) {
  return el("i", "rich-mark", (label || "•").slice(0, 1).toUpperCase());
}

function lockedTile(label, value) {
  const item = el("div", "profile-tile locked");
  const top = el("div", "profile-tile-top");
  top.append(tileMark(label));
  item.append(top, el("span", null, label), el("b", null, value || "—"));
  return item;
}

const LINKED_FIELDS = new Set([
  "clientName", "companyName", "location", "address", "city", "state", "pincode",
  "contactNumber", "alternateNumber", "email", "website", "industry", "gst", "designation",
  "quoteAmount", "quoteNotes", "expectations", "paymentStatus", "paymentAmount", "finalAmount", "initialResponse",
]);

async function syncLinkedFollowup(row, key, value) {
  if (!row.followupId || !LINKED_FIELDS.has(key)) return;
  await saveRow(paths.followups, row.followupId, { [key]: value });
}

function fieldTile(ctx, row, spec) {
  const item = el("div", "profile-tile");
  paintTile(item, ctx, row, spec);
  return item;
}

function paintTile(item, ctx, row, spec) {
  item.classList.remove("editing");
  const top = el("div", "profile-tile-top");
  const edit = button("", "profile-pen", () => openField(ctx, row, spec, item));
  edit.setAttribute("aria-label", `Edit ${spec.label}`);
  edit.append(editIcon());
  top.append(tileMark(spec.label), edit);
  item.replaceChildren(top, el("span", null, spec.label), el("b", null, displayValue(row, spec.key)));
}

function openField(ctx, row, spec, item) {
  if (item.classList.contains("editing")) return;
  item.classList.add("editing");
  const label = el("span", null, spec.label);
  const input = editorControl(spec);
  const actions = el("div", "profile-row-actions");
  const save = button("Save", "btn solid", async () => {
    const next = input.value.trim();
    if (spec.required && !next) {
      ctx.toast(`${spec.label} is required.`);
      return;
    }
    save.disabled = true;
    let blocked = false;
    await changeRow(paths.clients, row.id, (current) => {
      if (!current) return current;
      if (employeeLocked(ctx.session, current)) {
        blocked = true;
        return undefined;
      }
      return { ...current, [spec.key]: next };
    });
    if (blocked) {
      showAccessDenied();
      save.disabled = false;
      return;
    }
    await syncLinkedFollowup(row, spec.key, next);
    ctx.toast("Saved");
  });
  const cancel = button("Cancel", "btn ghost", () => paintTile(item, ctx, row, specByKey(row, spec.key)));
  actions.append(save, cancel);
  const stack = el("div", "profile-edit");
  stack.append(input, actions);
  const top = el("div", "profile-tile-top");
  top.append(tileMark(spec.label));
  item.replaceChildren(top, label, stack);
  input.focus();
}

function editorControl(spec) {
  let input;
  if (spec.type === "select") {
    input = document.createElement("select");
    (spec.options || []).forEach((option) => {
      const value = typeof option === "string" ? option : option.value;
      const name = typeof option === "string" ? option : option.label;
      const node = el("option", null, name);
      node.value = value;
      input.append(node);
    });
  } else if (spec.type === "textarea") {
    input = document.createElement("textarea");
    input.rows = 3;
  } else {
    input = document.createElement("input");
    input.type = spec.type || "text";
  }
  input.className = "profile-input";
  input.value = spec.value || "";
  input.setAttribute("aria-label", spec.label);
  return input;
}

function editIcon() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z");
  svg.append(path);
  return svg;
}
