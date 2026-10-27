export function loader(label = "Loading") {
  const node = el("div", "loader");
  node.setAttribute("role", "status");
  node.append(el("span", "spin"), el("p", null, label));
  return node;
}

export function setBusy(node, on) {
  node.disabled = on;
  node.classList.toggle("is-busy", on);
  node.setAttribute("aria-busy", String(on));
}

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function strokeIcon(d) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", d);
  svg.append(path);
  return svg;
}

const eyeOpen = "M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z";
const eyeShut = "M3 3l18 18M10.6 10.6A3 3 0 0 0 13.4 13.4M9.9 5.1A11 11 0 0 1 12 5c7 0 11 7 11 7a18 18 0 0 1-2.2 3.2M6.1 6.1A18 18 0 0 0 1 12s4 8 11 8a10 10 0 0 0 4.4-1";

function secretField(input) {
  const wrap = el("span", "secret");
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "secret-btn";
  toggle.setAttribute("aria-label", "Show password");
  toggle.append(strokeIcon(eyeOpen));
  toggle.addEventListener("click", () => {
    const hide = input.type === "text";
    input.type = hide ? "password" : "text";
    toggle.replaceChildren(strokeIcon(hide ? eyeOpen : eyeShut));
    toggle.setAttribute("aria-label", hide ? "Show password" : "Hide password");
  });
  wrap.append(input, toggle);
  return wrap;
}

export function field(spec) {
  const label = el("label", null, spec.label);
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
  } else {
    input = document.createElement("input");
    input.type = spec.type || "text";
  }
  input.name = spec.key;
  if (spec.required) input.required = true;
  if (spec.placeholder) input.placeholder = spec.placeholder;
  if (spec.maxlength) input.maxLength = spec.maxlength;
  if (spec.value != null) input.value = spec.value;
  label.append(spec.type === "password" ? secretField(input) : input);
  return label;
}

export function readForm(form, fields) {
  const data = {};
  fields.forEach((spec) => {
    data[spec.key] = String(form.elements[spec.key]?.value || "").trim();
  });
  return data;
}

export function button(label, className, onClick) {
  const node = el("button", className || "btn ghost", label);
  node.type = "button";
  node.addEventListener("click", (event) => {
    event.stopPropagation();
    onClick(event);
  });
  return node;
}

export function pill(status) {
  const node = el("span", "pill", labelFor(status));
  node.dataset.status = status || "";
  return node;
}

export function labelFor(status) {
  const names = {
    open: "Open",
    progress: "In progress",
    completed: "Completed",
    pending: "Pending",
    Active: "Active",
    Completed: "Completed",
    Hold: "Hold",
  };
  return names[status] || status || "—";
}

export function facts(pairs) {
  const list = el("dl", "facts");
  pairs.forEach(([name, value]) => {
    const row = el("div");
    row.append(el("dt", null, name), el("dd", null, value || "—"));
    list.append(row);
  });
  return list;
}

export function prioritySort(rows) {
  const rank = { Urgent: 0, High: 1, Normal: 2 };
  return rows.slice().sort((a, b) => {
    const diff = (rank[a.priority] ?? 9) - (rank[b.priority] ?? 9);
    if (diff) return diff;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });
}

export function ticketVisibleTo(ticket, employee, assignments) {
  if (!employee || ticket.selfTag) return false;
  if (ticket.assignedTo) return ticket.assignedTo === employee.id;
  if (ticket.status === "completed") return false;
  if (ticket.ticketType === "project") {
    return assignments.some((row) => row.employeeId === employee.id && row.projectId === ticket.projectId);
  }
  return true;
}

export function candidatesFor(ticket, employees, assignments) {
  if (ticket.ticketType !== "project") return employees;
  const ids = new Set(
    assignments.filter((row) => row.projectId === ticket.projectId).map((row) => row.employeeId),
  );
  return employees.filter((row) => ids.has(row.id));
}

export function accountRemoved(report, employees) {
  return report.employeeId && !employees.some((row) => row.id === report.employeeId);
}

export function downloadCsv(filename, header, rows) {
  const lines = [header, ...rows].map((cols) => cols.map(csvCell).join(","));
  const blob = new Blob([`\uFEFF${lines.join("\n")}`], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function csvCell(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function sameEmail(a, b) {
  return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
}
