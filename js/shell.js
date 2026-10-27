import { canManageAdmins, canManageFollowups, normalizeAdminRole } from "./roles.js";
import { clearSession } from "./session.js";
import { listenMany, watchConnection } from "./db.js";
import { button, el, field, loader, readForm } from "./ui.js";

export const employeeLinks = [
  ["employee-profile", "Profile", "employee-profile.html"],
  ["employee-followups", "Follow-ups", "employee-followups.html"],
  ["employee-clients", "Clients", "employee-clients.html"],
];

export function linksFor(session) {
  if (session?.kind !== "admin") return employeeLinks;
  const links = [
    ["admin-profile", "Profile", "admin-profile.html"],
    ["admin-employees", "Employees", "admin-employees.html"],
  ];
  if (canManageFollowups(session)) {
    links.push(["admin-followups", "Follow-ups", "admin-followups.html"]);
    links.push(["admin-clients", "Clients", "admin-clients.html"]);
  }
  if (canManageAdmins(session)) {
    links.push(["admin-admins", "Admins", "admin-admins.html"]);
  }
  return links;
}

let formResolve = null;
let askResolve = null;

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("ap_theme", theme);
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    document.head.append(meta);
  }
  meta.setAttribute("content", theme === "dark" ? "#121a22" : "#ffffff");
}

const navIcons = {
  admin: "M4 5h7v7H4zM13 5h7v4h-7zM13 12h7v7h-7zM4 15h7v4H4z",
  "admin-dashboard": "M4 13h6V4H4zM14 20h6V4h-6zM4 20h6v-5H4z",
  "admin-track": "M4 6h16M4 12h16M4 18h10",
  "admin-feed": "M5 6h14v12H5zM8 10h8M8 14h5",
  "admin-projects": "M4 7h16v12H4zM4 7l8 6 8-6",
  "admin-employees": "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM4 19a5 5 0 0 1 10 0M17 11a2.5 2.5 0 1 0 0-5M16 19a4 4 0 0 1 4-4",
  "admin-admins": "M12 3l2 4 4 .5-3 3 .8 4.5L12 13l-3.8 2 0.8-4.5-3-3L8 7z",
  "admin-assignments": "M8 7h12M8 12h12M8 17h8M4 7h.01M4 12h.01M4 17h.01",
  "admin-reports": "M7 3h7l5 5v13H7zM14 3v5h5M9 13h6M9 17h6",
  "admin-history": "M12 7v5l3 2M12 21a9 9 0 1 0-9-9",
  "admin-profile": "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5 20a7 7 0 0 1 14 0",
  "admin-followups": "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  "admin-clients": "M3 21h18M5 21V8l7-4 7 4v13M9 21v-6h6v6",
  "admin-client": "M3 21h18M5 21V8l7-4 7 4v13M9 21v-6h6v6",
  employee: "M4 5h7v7H4zM13 5h7v4h-7zM13 12h7v7h-7zM4 15h7v4H4z",
  "employee-dashboard": "M4 13h6V4H4zM14 20h6V4h-6zM4 20h6v-5H4z",
  "employee-work": "M5 6h14v12H5zM8 10h8M8 14h5",
  "employee-history": "M12 7v5l3 2M12 21a9 9 0 1 0-9-9",
  "employee-profile": "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5 20a7 7 0 0 1 14 0",
  "employee-followups": "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  "employee-clients": "M3 21h18M5 21V8l7-4 7 4v13M9 21v-6h6v6",
  "employee-client": "M3 21h18M5 21V8l7-4 7 4v13M9 21v-6h6v6",
};

function icon(id) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", navIcons[id] || navIcons.admin);
  svg.append(path);
  return svg;
}

function linkList(links, page) {
  const nav = el("nav");
  links.forEach(([id, label, href]) => {
    const link = el("a", id === page ? "on" : "");
    link.href = href;
    link.dataset.page = id;
    link.append(icon(id), el("span", null, label), el("em", "count", "0"));
    if (id === page) link.setAttribute("aria-current", "page");
    nav.append(link);
  });
  return nav;
}

function brandLink() {
  const brand = el("a", "brand");
  brand.href = "index.html";
  const mark = document.createElement("img");
  mark.src = "brand/icon.png";
  mark.alt = "";
  const brandText = el("span", "brand-text");
  brandText.append(el("strong", null, "AgentPlatypus"), el("small", null, "Workspace"));
  brand.append(mark, brandText);
  return brand;
}

function themeGlyph(mode) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", mode === "dark"
    ? "M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"
    : "M21 14.5A8.5 8.5 0 1 1 9.5 3 7 7 0 0 0 21 14.5z");
  svg.append(path);
  return svg;
}

function themeButton() {
  const theme = document.createElement("button");
  theme.type = "button";
  theme.className = "theme-btn";
  const paint = () => {
    const dark = document.documentElement.dataset.theme === "dark";
    theme.replaceChildren(themeGlyph(dark ? "dark" : "light"));
    const label = dark ? "Switch to light mode" : "Switch to dark mode";
    theme.setAttribute("aria-label", label);
    theme.title = label;
  };
  theme.addEventListener("click", () => {
    applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
    paint();
  });
  paint();
  return theme;
}

function roleLabel(session) {
  if (!session) return "";
  if (session.kind === "employee") return "Employee";
  return normalizeAdminRole(session.role);
}

function mountBar({ title, session }) {
  applyTheme(localStorage.getItem("ap_theme") || "light");
  const bar = el("header", "appbar");
  const heading = el("p", session ? "appbar-title role-mark" : "appbar-title", title || "AgentPlatypus");
  if (session) heading.dataset.role = title;
  const end = el("div", "appbar-end");
  const live = el("p", "live wait");
  live.append(el("i"), el("span", null, "Connecting"));
  end.append(live, themeButton());
  let chipName = null;
  if (session) {
    const user = el("div", "user-chip");
    const initial = el("b", null, (session.fullName || "A").slice(0, 1).toUpperCase());
    const userText = el("span");
    chipName = el("strong", null, session.fullName);
    userText.append(chipName, el("small", null, session.email || ""));
    user.append(initial, userText);
    const out = button("Log out", "logout", () => {
      clearSession();
      location.href = "login.html";
    });
    end.append(user, out);
  } else if (!location.pathname.endsWith("login.html")) {
    const sign = el("a", "btn solid", "Sign in");
    sign.href = "login.html";
    end.append(sign);
  }
  bar.append(brandLink(), heading, end);
  watchConnection((on) => {
    live.classList.toggle("on", on);
    live.classList.toggle("wait", !on);
    live.querySelector("span").textContent = on ? "Live" : "Connecting";
  });
  return {
    bar,
    setTitle(text) { heading.textContent = text; },
    setName(name) {
      if (!chipName) return;
      chipName.textContent = name;
      const initial = bar.querySelector(".user-chip b");
      if (initial) initial.textContent = (name || "A").slice(0, 1).toUpperCase();
    },
  };
}

export function startPortal(session, page) {
  const root = document.getElementById("root");
  root.replaceChildren();
  const links = linksFor(session);
  const chrome = mountBar({ title: roleLabel(session), session });
  const portal = el("div", "portal");
  const side = el("aside", "side");
  side.append(linkList(links, page));
  const stage = el("main", "stage");
  const top = el("div", "top");
  const titles = el("div", "titles");
  const heading = el("h1", null, "");
  titles.append(heading);
  const actions = el("div", "top-actions actions");
  top.append(titles, actions);
  const panel = el("div", "panel");
  stage.append(top, panel);
  const tabBar = el("nav", "tabs");
  tabBar.style.gridTemplateColumns = `repeat(${Math.max(links.length, 1)}, 1fr)`;
  links.forEach(([id, label, href]) => {
    const link = el("a", id === page ? "on" : "");
    link.href = href;
    link.dataset.page = id;
    link.append(icon(id), el("span", null, label), el("em", "count", "0"));
    if (id === page) link.setAttribute("aria-current", "page");
    tabBar.append(link);
  });
  portal.append(side, stage, tabBar);
  root.append(chrome.bar, portal, ensureForm(), ensureAsk());
  bindNavCounts(session, portal);
  return {
    session,
    panel,
    actions,
    setHeading(_kicker, titleText) { heading.textContent = titleText || ""; },
    setName: chrome.setName,
    openForm,
    ask,
    toast,
  };
}

function bindNavCounts(session, portal) {
  const keys = session.kind === "admin" ? ["employees", "admins", "followups", "clients"] : ["followups", "clients"];
  listenMany(keys, (data, ready) => {
    if (!ready) return;
    const followups = session.kind === "employee"
      ? (data.followups || []).filter((row) => row.assignedTo === session.id)
      : (data.followups || []);
    const clients = session.kind === "employee"
      ? (data.clients || []).filter((row) => row.assignedTo === session.id || row.convertedBy === session.id)
      : (data.clients || []);
    const counts = {
      "admin-employees": (data.employees || []).length,
      "admin-admins": (data.admins || []).length,
      "admin-followups": followups.length,
      "admin-clients": clients.length,
      "employee-followups": followups.length,
      "employee-clients": clients.length,
    };
    portal.querySelectorAll("a[data-page]").forEach((link) => {
      const badge = link.querySelector(".count");
      if (!badge) return;
      const value = counts[link.dataset.page];
      if (value == null) {
        badge.hidden = true;
        return;
      }
      badge.hidden = false;
      badge.textContent = String(value);
    });
  });
}

export function startCard(title) {
  const root = document.getElementById("root");
  const chrome = mountBar({ title: title || "Sign in", session: null });
  const wrap = el("div", "auth");
  const card = el("section", "auth-card");
  wrap.append(card);
  root.replaceChildren(chrome.bar, wrap, ensureForm(), ensureAsk());
  return card;
}

function ensureForm() {
  let dialog = document.getElementById("form-dialog");
  if (dialog) return dialog;
  dialog = document.createElement("dialog");
  dialog.id = "form-dialog";
  dialog.className = "sheet";
  dialog.innerHTML = `<form>
    <header><h2></h2><button class="icon-btn" type="button" data-close aria-label="Close">×</button></header>
    <div class="fields"></div>
    <p class="form-error" hidden></p>
    <footer>
      <button class="btn ghost" type="button" data-close>Cancel</button>
      <button class="btn solid" type="submit">Save</button>
    </footer>
  </form>`;
  dialog.addEventListener("close", () => {
    if (formResolve) {
      formResolve(null);
      formResolve = null;
    }
  });
  dialog.querySelectorAll("[data-close]").forEach((node) => {
    node.addEventListener("click", () => dialog.close());
  });
  dialog.querySelector("form").addEventListener("submit", (event) => {
    event.preventDefault();
    const specs = dialog._fields || [];
    const data = readForm(event.target, specs);
    const missing = specs.find((spec) => spec.required && !data[spec.key]);
    const error = dialog.querySelector(".form-error");
    const save = event.target.querySelector("[type=submit]");
    if (missing) {
      error.textContent = `Add ${missing.label.toLowerCase()} first.`;
      error.hidden = false;
      save.classList.remove("is-busy");
      return;
    }
    save.classList.add("is-busy");
    const resolve = formResolve;
    formResolve = null;
    dialog.close();
    save.classList.remove("is-busy");
    resolve?.(data);
  });
  return dialog;
}

export function openForm({ title, fields, submitLabel = "Save" }) {
  const dialog = ensureForm();
  dialog._fields = fields;
  dialog.querySelector("h2").textContent = title;
  dialog.querySelector("[type=submit]").textContent = submitLabel;
  const box = dialog.querySelector(".fields");
  box.replaceChildren(...fields.map(field));
  const error = dialog.querySelector(".form-error");
  error.hidden = true;
  return new Promise((resolve) => {
    formResolve = resolve;
    dialog.showModal();
    box.querySelector("input, select, textarea")?.focus();
  });
}

function ensureAsk() {
  let dialog = document.getElementById("ask-dialog");
  if (dialog) return dialog;
  dialog = document.createElement("dialog");
  dialog.id = "ask-dialog";
  dialog.className = "sheet";
  dialog.innerHTML = `<form method="dialog">
    <header><h2>Confirm</h2></header>
    <p class="ask-copy"></p>
    <footer>
      <button class="btn ghost" value="no">Cancel</button>
      <button class="btn solid" value="yes">Continue</button>
    </footer>
  </form>`;
  dialog.addEventListener("close", () => {
    const yes = dialog.returnValue === "yes";
    askResolve?.(yes);
    askResolve = null;
  });
  return dialog;
}

export function ask(message) {
  const dialog = ensureAsk();
  dialog.querySelector(".ask-copy").textContent = message;
  return new Promise((resolve) => {
    askResolve = resolve;
    dialog.showModal();
  });
}

let toastTimer = 0;
export function toast(message) {
  let node = document.getElementById("toast");
  if (!node) {
    node = el("p", "toast");
    node.id = "toast";
    document.body.append(node);
  }
  node.textContent = message;
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { node.hidden = true; }, 2200);
}
