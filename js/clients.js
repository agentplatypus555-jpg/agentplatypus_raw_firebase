import { addRow, listen, listenMany, paths, saveRow } from "./db.js";
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
  const ref = await addRow(paths.clients, {
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
  await saveRow(paths.followups, row.id, { clientId: ref.key });
  ctx.toast("Moved to Clients");
  location.href = clientHref(ctx.session, ref.key);
  return ref.key;
}

function visibleClients(rows, session, employeeOnly) {
  if (!employeeOnly) return rows;
  return rows.filter((row) => row.assignedTo === session.id || row.convertedBy === session.id);
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
      ? "Companies converted from your completed follow-ups."
      : "Every company converted from a successful follow-up."),
    tools,
    list,
  );

  const paint = () => {
    ctx.setHeading(employeeOnly ? "Employee" : "Admin", `Clients · ${latest.length}`);
    const options = {
      status: ["All", "Active", "Hold", "Closed"],
      payment: ["All", "pending", "paid", "failed"],
      location: ["All", ...unique(latest, "location")],
      assigned: ["All", ...unique(latest, "assignedName")],
    };
    selects.replaceChildren(
      filterSelect("Status", filters.status, options.status, (value) => { filters.status = value; paint(); }),
      filterSelect("Payment", filters.payment, options.payment.map((item) => (
        item === "pending" ? { value: "pending", label: "Pending" }
          : item === "paid" ? { value: "paid", label: "Paid" }
            : item === "failed" ? { value: "failed", label: "Failed" }
              : item
      )), (value) => { filters.payment = value; paint(); }),
      filterSelect("Location", filters.location, options.location, (value) => { filters.location = value; paint(); }),
      filterSelect("Assigned", filters.assigned, options.assigned, (value) => { filters.assigned = value; paint(); }),
    );
    const shown = latest.filter((row) => matches(row, filters));
    if (!shown.length) {
      list.replaceChildren(el("p", "quiet", "No clients match these filters."));
      return;
    }
    const headers = ["Company", "Client", "Contact", "Location", "Quote", "Final amount", "Payment", "Status", "Assigned"];
    const wrap = el("div", "table-wrap");
    const table = document.createElement("table");
    table.className = "data-table cl-table";
    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    headers.forEach((label) => headRow.append(el("th", null, label)));
    head.append(headRow);
    const body = document.createElement("tbody");
    shown.forEach((row) => {
      const tr = document.createElement("tr");
      tr.tabIndex = 0;
      tr.title = `Open ${row.companyName || row.clientName}`;
      const company = el("button", "linkish", row.companyName || "—");
      company.addEventListener("click", (event) => {
        event.stopPropagation();
        location.href = clientHref(session, row.id);
      });
      [
        company,
        row.clientName,
        row.contactNumber,
        row.location,
        row.quoteAmount ? `₹ ${row.quoteAmount}` : "",
        row.finalAmount ? `₹ ${row.finalAmount}` : "",
        paymentText(row),
        row.status || "Active",
        row.assignedName,
      ].forEach((cell, index) => {
        const td = document.createElement("td");
        td.dataset.label = headers[index];
        if (cell instanceof Node) td.append(cell);
        else td.textContent = cell || "—";
        tr.append(td);
      });
      tr.addEventListener("click", () => { location.href = clientHref(session, row.id); });
      tr.addEventListener("keydown", (event) => {
        if (event.key === "Enter") location.href = clientHref(session, row.id);
      });
      body.append(tr);
    });
    table.append(head, body);
    wrap.append(table);
    list.replaceChildren(wrap);
  };

  listen(paths.clients, (rows) => {
    if (!rows) {
      list.replaceChildren(el("p", "quiet", "Firebase refused this read. Check the database rules, then refresh."));
      return;
    }
    latest = visibleClients(rows, session, employeeOnly);
    paint();
  });
}

function matches(row, filters) {
  if (filters.status !== "All" && (row.status || "Active") !== filters.status) return false;
  if (filters.payment !== "All" && (row.paymentStatus || "pending") !== filters.payment) return false;
  if (filters.location !== "All" && row.location !== filters.location) return false;
  if (filters.assigned !== "All" && row.assignedName !== filters.assigned) return false;
  if (!filters.search) return true;
  const blob = [row.companyName, row.clientName, row.contactNumber, row.email, row.location, row.gst, row.industry]
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

function renderClientProfile(session, navPage) {
  const ctx = startPortal(session, navPage);
  const id = new URLSearchParams(location.search).get("id") || "";
  ctx.setHeading(session.kind === "employee" ? "Employee" : "Admin", "Client");
  ctx.actions.append(button("Back to clients", "btn ghost", () => {
    location.href = session.kind === "employee" ? "employee-clients.html" : "admin-clients.html";
  }));
  const stage = el("div", "stack");
  stage.append(loader("Loading client"));
  ctx.panel.append(stage);
  if (!id) {
    stage.replaceChildren(el("p", "quiet", "This client link is missing."));
    return;
  }
  listenMany(["clients"], (data) => {
    if (!data) {
      stage.replaceChildren(el("p", "quiet", "Firebase refused this read. Check the database rules, then refresh."));
      return;
    }
    const row = (data.clients || []).find((item) => item.id === id);
    if (!row) {
      stage.replaceChildren(el("p", "quiet", "This client was not found."));
      return;
    }
    ctx.setHeading(session.kind === "employee" ? "Employee" : "Admin", row.companyName || "Client");
    stage.replaceChildren(resumeCard(ctx, row));
  });
}

function resumeCard(ctx, row) {
  const cv = el("article", "cv");
  const side = el("aside", "cv-side");
  const photo = el("b", "cv-photo", (row.companyName || row.clientName || "C").slice(0, 1).toUpperCase());
  side.append(
    photo,
    el("h2", null, row.companyName || "Company"),
    el("p", "cv-role", row.industry || "Client account"),
    el("p", "cv-tag", row.status || "Active"),
    contactLine("Phone", row.contactNumber),
    contactLine("Email", row.email),
    contactLine("Web", row.website),
    contactLine("GST", row.gst),
    contactLine("Place", [row.city, row.state, row.location].filter(Boolean).join(", ")),
  );
  const main = el("div", "cv-main");
  const head = el("div", "cv-head");
  const titles = el("div");
  titles.append(
    el("h1", null, row.contactPerson || row.clientName || "Client"),
    el("p", "quiet", [row.designation, row.companyName].filter(Boolean).join(" · ")),
  );
  const edit = button("", "cv-edit", () => editClient(ctx, row));
  edit.setAttribute("aria-label", "Edit client profile");
  edit.append(editIcon());
  head.append(titles, edit);
  main.append(
    head,
    section("Company", [
      ["Company", row.companyName],
      ["Industry", row.industry],
      ["Website", row.website],
      ["GST / tax ID", row.gst],
    ]),
    section("Contact", [
      ["Person", row.contactPerson || row.clientName],
      ["Designation", row.designation],
      ["Phone", row.contactNumber],
      ["Alternate", row.alternateNumber],
      ["Email", row.email],
    ]),
    section("Address", [
      ["Street", row.address],
      ["City", row.city],
      ["State", row.state],
      ["PIN", row.pincode],
      ["Location", row.location],
    ]),
    section("Deal", [
      ["Quote", row.quoteAmount ? `₹ ${row.quoteAmount}` : ""],
      ["Final amount", row.finalAmount ? `₹ ${row.finalAmount}` : ""],
      ["Payment", paymentText(row)],
      ["Paid amount", row.paymentAmount ? `₹ ${row.paymentAmount}` : ""],
      ["Expectations", row.expectations],
    ]),
    section("Account", [
      ["Status", row.status || "Active"],
      ["Assigned", row.assignedName],
      ["Converted by", row.convertedByName],
      ["Converted", when(row.convertedAt || row.createdAt)],
      ["Notes", row.notes],
    ]),
  );
  cv.append(side, main);
  return cv;
}

function contactLine(label, value) {
  const node = el("p", "cv-line");
  node.append(el("span", null, label), el("b", null, value || "—"));
  return node;
}

function section(title, pairs) {
  const block = el("section", "cv-block");
  block.append(el("h3", null, title));
  const grid = el("div", "cv-grid");
  pairs.forEach(([label, value]) => {
    const item = el("div");
    item.append(el("span", null, label), el("b", null, value || "—"));
    grid.append(item);
  });
  block.append(grid);
  return block;
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

async function editClient(ctx, row) {
  const data = await ctx.openForm({
    title: `Edit · ${row.companyName || "Client"}`,
    submitLabel: "Save profile",
    fields: profileFields(row),
  });
  if (!data) return;
  await saveRow(paths.clients, row.id, data);
  ctx.toast("Client profile saved");
}
