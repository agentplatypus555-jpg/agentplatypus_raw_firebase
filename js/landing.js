import { listenMany } from "./db.js";
import { counts } from "./records.js";

const shows = [
  {
    name: "CRM",
    title: "Every relationship on one record.",
    body: "Colleges and customers stay with the organization that owns them. Status, owner, and the next follow-up sit on the same page.",
  },
  {
    name: "Team operations",
    title: "Work has a name next to it.",
    body: "Tasks leave the chat thread. Someone is assigned, and the rest of the team can see what is still open.",
  },
  {
    name: "HR and payroll",
    title: "People operations, when the screens exist.",
    body: "Attendance, leave, and payslips are part of the product direction. They are not in the signed-in app yet.",
  },
  {
    name: "Finance",
    title: "Money next to the work that caused it.",
    body: "Expenses, invoices, and billing are planned beside the same workspace. Prices and invoices are not live.",
  },
  {
    name: "Analytics",
    title: "Counts from records, not a slide.",
    body: "The workspace counts colleges, follow-ups, and projects you stored. The numbers below read that same board.",
  },
];

const stats = [
  { label: "Open tasks", value: 0, target: 0 },
  { label: "Follow-ups", value: 0, target: 0 },
  { label: "Projects", value: 0, target: 0 },
];

const root = document.querySelector(".lp");
const nav = document.querySelector(".site-nav");
const menu = document.querySelector(".site-nav .menu");
const panelTitle = document.getElementById("feature-title");
const panelBody = document.getElementById("feature-body");
const panel = document.getElementById("feature-panel");
const tabs = Array.from(document.querySelectorAll(".switcher [role='tab']"));
const metricEls = Array.from(document.querySelectorAll(".metrics article"));
const heroRows = document.getElementById("hero-rows");
const previewRows = document.getElementById("preview-rows");
const heroNote = document.getElementById("hero-note");
const insightNote = document.getElementById("insight-note");
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let frame = 0;
let counted = false;
let picked = 0;

if (reduced) root.classList.add("is-still");

function closeMenu() {
  nav.classList.remove("open");
  if (menu) menu.setAttribute("aria-expanded", "false");
  if (menu) menu.setAttribute("aria-label", "Open menu");
}

function pick(index) {
  picked = index;
  tabs.forEach((tab, i) => tab.setAttribute("aria-selected", String(i === index)));
  panel.setAttribute("id", "panel-" + index);
  panel.setAttribute("aria-labelledby", "tab-" + index);
  panelTitle.textContent = shows[index].title;
  panelBody.textContent = shows[index].body;
}

function renderStats() {
  const max = Math.max(...stats.map((row) => row.target), 1);
  metricEls.forEach((el, i) => {
    const stat = stats[i];
    el.querySelector("strong").textContent = String(stat.value);
    const bar = el.querySelector("i");
    bar.style.width = (stat.target ? (stat.value / max) * 100 : 0) + "%";
  });
}

function runCounters() {
  if (reduced) {
    stats.forEach((row) => { row.value = row.target; });
    renderStats();
    return;
  }
  const start = performance.now();
  const from = stats.map((row) => row.value);
  const step = (now) => {
    const t = Math.min(1, (now - start) / 900);
    const ease = 1 - Math.pow(1 - t, 3);
    stats.forEach((row, i) => {
      row.value = Math.round(from[i] + (row.target - from[i]) * ease);
    });
    renderStats();
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function fillRows(node, rows, empty) {
  if (!node) return;
  node.replaceChildren();
  const source = rows.length ? rows.slice(0, 3) : [{ name: empty, status: "" }];
  source.forEach((row) => {
    const line = document.createElement("div");
    line.className = "row";
    const name = document.createElement("b");
    name.textContent = row.name || "Untitled";
    const status = document.createElement("em");
    status.textContent = row.status || "";
    line.append(name, status);
    node.append(line);
  });
}

function applyBoard(board) {
  const live = counts(board);
  stats[0].target = live.tasks;
  stats[1].target = live.followUps;
  stats[2].target = live.projects;
  const preview = (board.projects || []).map((row) => ({ name: row.name, status: row.status }));
  const rows = preview.length ? preview : (board.tickets || []).map((row) => ({ name: row.title, status: row.status }));
  fillRows(heroRows, rows, "No projects yet");
  fillRows(previewRows, rows, "No projects yet");
  if (heroNote) heroNote.textContent = "Live from the workspace.";
  if (insightNote) insightNote.textContent = "Open tickets, pending reports, and active projects stored in the realtime database.";
  if (counted || reduced) {
    stats.forEach((row) => { row.value = row.target; });
    renderStats();
  }
}

const onScroll = () => {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    nav.classList.toggle("scrolled", window.scrollY > 12);
    if (!reduced) {
      const hero = root.querySelector(".hero");
      const height = hero?.clientHeight || window.innerHeight;
      root.style.setProperty("--p", String(Math.min(1, window.scrollY / height)));
    }
  });
};

const onMove = (event) => {
  if (reduced || window.innerWidth < 900) return;
  const hero = root.querySelector(".hero");
  if (!hero) return;
  const box = hero.getBoundingClientRect();
  if (event.clientY > box.bottom) return;
  root.style.setProperty("--mx", ((event.clientX - box.left) / box.width - 0.5).toFixed(3));
  root.style.setProperty("--my", ((event.clientY - box.top) / box.height - 0.5).toFixed(3));
};

menu.addEventListener("click", () => {
  const open = !nav.classList.contains("open");
  nav.classList.toggle("open", open);
  menu.setAttribute("aria-expanded", String(open));
  menu.setAttribute("aria-label", open ? "Close menu" : "Open menu");
});

document.querySelector(".site-nav .brand").addEventListener("click", (event) => {
  event.preventDefault();
  closeMenu();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

nav.querySelectorAll("nav a, .nav-cta a").forEach((link) => {
  link.addEventListener("click", closeMenu);
});

tabs.forEach((tab, i) => {
  tab.addEventListener("click", () => pick(i));
});

window.addEventListener("scroll", onScroll, { passive: true });
window.addEventListener("pointermove", onMove, { passive: true });
window.addEventListener("resize", () => {
  if (window.innerWidth > 1040) closeMenu();
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeMenu();
});

const io = new IntersectionObserver(
  (entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (visible?.target.id === "insights" && !counted) {
      counted = true;
      runCounters();
    }
  },
  { threshold: [0.35] },
);
["platform", "workspace", "showcase", "flow", "solutions", "insights"].forEach((id) => {
  const section = document.getElementById(id);
  if (section) io.observe(section);
});

const navWatch = new IntersectionObserver(
  (entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible?.target.id) return;
    nav.querySelectorAll("nav a").forEach((link) => {
      link.classList.toggle("on", link.getAttribute("href") === "#" + visible.target.id);
    });
  },
  { threshold: [0.35] },
);
["platform", "workspace", "showcase", "flow", "solutions"].forEach((id) => {
  const section = document.getElementById(id);
  if (section) navWatch.observe(section);
});

const reveal = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (entry.isIntersecting) entry.target.classList.add("in");
  }
}, { threshold: 0.18 });
root.querySelectorAll(".reveal").forEach((node) => reveal.observe(node));

pick(0);
renderStats();
onScroll();

listenMany(["projects", "tickets", "reports"], (board, ready) => {
  if (ready) applyBoard(board);
}, () => {
  if (heroNote) heroNote.textContent = "The workspace could not be reached.";
  if (insightNote) insightNote.textContent = "The workspace could not be reached. Counts stay at zero.";
  fillRows(heroRows, [], "Workspace offline");
  fillRows(previewRows, [], "Workspace offline");
});
