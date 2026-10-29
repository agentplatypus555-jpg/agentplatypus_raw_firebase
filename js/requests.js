import { addRow, deleteRow, listenMany, paths, saveRow } from "./db.js";
import { ADMIN_ROLES, normalizeAdminRole } from "./roles.js";
import { startPortal } from "./shell.js";
import { button, el, loader } from "./ui.js";

const ROLES = ["Employee", ...ADMIN_ROLES];

export function pageRequests(session) {
  const ctx = startPortal(session, "admin-requests");
  ctx.setHeading("Admin", "Onboard requests");
  let latest = { employees: [], admins: [] };
  let filter = "Pending";
  const chips = el("div", "fu-chips");
  const list = el("div", "stack");
  list.append(loader("Loading requests"));
  ctx.panel.append(
    el("p", "lede", "New employee and admin accounts stay blocked until you approve them."),
    chips,
    list,
  );

  const rows = () => [
    ...latest.employees.map((row) => ({ ...row, kind: "employee" })),
    ...latest.admins.map((row) => ({ ...row, kind: "admin" })),
  ].filter((row) => row.accountStatus && row.accountStatus !== "active");

  const paint = () => {
    const all = rows();
    const counts = {
      Pending: all.filter((row) => row.accountStatus === "pending").length,
      Hold: all.filter((row) => row.accountStatus === "hold").length,
      Rejected: all.filter((row) => row.accountStatus === "rejected").length,
    };
    ctx.setHeading("Admin", `Onboard requests · ${counts.Pending}`);
    chips.replaceChildren(
      ...["Pending", "Hold", "Rejected"].map((name) => {
        const chip = button(`${name} · ${counts[name]}`, `fu-chip${filter === name ? " on" : ""}`, () => {
          filter = name;
          paint();
        });
        return chip;
      }),
    );
    const shown = all
      .filter((row) => row.accountStatus === filter.toLowerCase())
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));
    if (!shown.length) {
      list.replaceChildren(el("p", "quiet", `No ${filter.toLowerCase()} requests.`));
      return;
    }
    list.replaceChildren(requestTable(ctx, shown));
  };

  listenMany(["employees", "admins"], (data) => {
    if (!data) {
      list.replaceChildren(el("p", "quiet", "Firebase refused this read. Check the database rules, then refresh."));
      return;
    }
    latest = data;
    paint();
  });
}

function requestTable(ctx, shown) {
  const wrap = el("div", "table-wrap req-wrap");
  const table = document.createElement("table");
  table.className = "data-table req-table";
  const headers = ["S.No", "Account", "Contact", "Role", "Status", "Action"];
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  headers.forEach((label) => headRow.append(el("th", null, label)));
  head.append(headRow);
  const body = document.createElement("tbody");
  shown.forEach((row, index) => body.append(requestRow(ctx, row, index + 1, headers)));
  table.append(head, body);
  wrap.append(table);
  return wrap;
}

function requestRow(ctx, row, serial, headers) {
  const role = document.createElement("select");
  role.setAttribute("aria-label", `Role for ${row.fullName || "account"}`);
  ROLES.forEach((name) => {
    const option = el("option", null, name);
    option.value = name;
    role.append(option);
  });
  role.value = row.kind === "employee" ? "Employee" : normalizeAdminRole(row.role);
  const actions = el("div", "req-actions");
  actions.append(
    button("Approve", "btn solid", () => run(ctx, () => placeAccount(row, role.value, "active"), "Approved. Login is open.")),
    button("Hold", "btn ghost", () => run(ctx, () => placeAccount(row, role.value, "hold"), "Account is on hold.")),
    button("Reject", "btn warn", () => run(ctx, () => placeAccount(row, role.value, "rejected"), "Account rejected.")),
  );
  role.addEventListener("change", () => run(ctx, () => placeAccount(row, role.value, row.accountStatus), "Role updated"));
  const cells = [
    serialMark(serial),
    accountCell(row),
    contactCell(row),
    role,
    el("span", `req-status ${row.accountStatus}`, labelFor(row.accountStatus)),
    actions,
  ];
  const tr = document.createElement("tr");
  cells.forEach((cell, index) => {
    const td = document.createElement("td");
    td.dataset.label = headers[index];
    if (index === cells.length - 1) td.className = "req-action-cell";
    if (cell instanceof Node) td.append(cell);
    else td.textContent = cell || "—";
    tr.append(td);
  });
  return tr;
}

function serialMark(serial) {
  return el("span", "req-no", String(serial));
}

function accountCell(row) {
  const who = el("div", "req-person");
  const name = row.fullName || "Account";
  who.append(
    el("b", null, name.slice(0, 1).toUpperCase()),
    el("strong", null, name),
  );
  return who;
}

function contactCell(row) {
  const box = el("div", "req-contact");
  box.append(el("span", null, row.email || "—"), el("small", null, row.mobile || "No mobile"));
  return box;
}

function labelFor(status) {
  if (status === "hold") return "Hold";
  if (status === "rejected") return "Rejected";
  return "Pending";
}

async function run(ctx, work, message) {
  try {
    await work();
    ctx.toast(message);
  } catch (error) {
    ctx.toast(error.message || "Could not update.");
  }
}

async function placeAccount(row, role, accountStatus) {
  const shared = {
    fullName: row.fullName || "",
    email: row.email || "",
    mobile: row.mobile || "",
    password: row.password || "",
    passwordHash: row.passwordHash || "",
    accountStatus,
    createdBy: row.createdBy || "",
  };
  if (role === "Employee") {
    if (row.kind === "employee") {
      await saveRow(paths.employees, row.id, { accountStatus });
      return;
    }
    await addRow(paths.employees, {
      ...shared,
      employeeCode: row.employeeCode || `RQ${String(row.id).replace(/[^a-z0-9]/gi, "").slice(-6) || "1001"}`,
      department: row.department || "",
      designation: row.designation || "",
    });
    await deleteRow(paths.admins, row.id);
    return;
  }
  const adminRole = normalizeAdminRole(role);
  if (row.kind === "admin") {
    await saveRow(paths.admins, row.id, { role: adminRole, accountStatus });
    return;
  }
  await addRow(paths.admins, { ...shared, role: adminRole });
  await deleteRow(paths.employees, row.id);
}
