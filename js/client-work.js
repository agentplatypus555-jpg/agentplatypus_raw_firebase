import { changeRow, paths } from "./db.js";
import { canManageFollowups, isMaster } from "./roles.js";
import { button, el } from "./ui.js";

const PLATFORMS = [
  {
    id: "instagram",
    name: "Instagram",
    unit: "videos",
    color: "#d62976",
    basics: [
      ["profileName", "Profile name"],
      ["photo", "Profile photo"],
      ["bio", "Bio"],
      ["website", "Website link"],
      ["autoReply", "Auto message"],
      ["links", "Link in bio"],
      ["highlights", "Highlights"],
      ["contact", "Contact button"],
    ],
  },
  {
    id: "facebook",
    name: "Facebook",
    unit: "videos",
    color: "#1877f2",
    basics: [
      ["profileName", "Page name"],
      ["photo", "Profile photo"],
      ["cover", "Cover photo"],
      ["bio", "About"],
      ["website", "Website link"],
      ["autoReply", "Auto reply"],
      ["contact", "Call button"],
      ["links", "WhatsApp link"],
    ],
  },
  {
    id: "youtube",
    name: "YouTube",
    unit: "videos",
    color: "#ff0033",
    basics: [
      ["profileName", "Channel name"],
      ["photo", "Profile photo"],
      ["cover", "Banner"],
      ["bio", "About"],
      ["website", "Website link"],
      ["links", "Channel links"],
      ["highlights", "Channel trailer"],
      ["contact", "End screen"],
    ],
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    unit: "posts",
    color: "#0a66c2",
    basics: [
      ["profileName", "Page name"],
      ["photo", "Logo"],
      ["cover", "Cover"],
      ["bio", "About"],
      ["website", "Website link"],
      ["contact", "CTA button"],
      ["highlights", "Specialties"],
      ["autoReply", "Auto reply"],
    ],
  },
  {
    id: "x",
    name: "X",
    unit: "posts",
    color: "#111827",
    basics: [
      ["profileName", "Profile name"],
      ["photo", "Profile photo"],
      ["cover", "Header"],
      ["bio", "Bio"],
      ["website", "Website link"],
      ["links", "Link"],
      ["highlights", "Pinned post"],
      ["contact", "Location"],
    ],
  },
  {
    id: "tiktok",
    name: "TikTok",
    unit: "videos",
    color: "#111827",
    basics: [
      ["profileName", "Profile name"],
      ["photo", "Profile photo"],
      ["bio", "Bio"],
      ["website", "Website link"],
      ["links", "Link"],
      ["autoReply", "Auto reply"],
      ["highlights", "Playlist"],
      ["contact", "Contact"],
    ],
  },
  {
    id: "threads",
    name: "Threads",
    unit: "posts",
    color: "#111827",
    basics: [
      ["profileName", "Profile name"],
      ["photo", "Profile photo"],
      ["bio", "Bio"],
      ["website", "Website link"],
      ["links", "Link"],
      ["highlights", "Pinned thread"],
    ],
  },
  {
    id: "pinterest",
    name: "Pinterest",
    unit: "pins",
    color: "#e60023",
    basics: [
      ["profileName", "Profile name"],
      ["photo", "Profile photo"],
      ["bio", "About"],
      ["website", "Website link"],
      ["links", "Claimed website"],
      ["cover", "Cover"],
      ["highlights", "Boards"],
      ["contact", "Contact"],
    ],
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    unit: "updates",
    color: "#128c7e",
    basics: [
      ["profileName", "Business name"],
      ["photo", "Profile photo"],
      ["bio", "About"],
      ["website", "Website link"],
      ["highlights", "Catalog"],
      ["autoReply", "Away message"],
      ["links", "Greeting"],
      ["contact", "Address"],
    ],
  },
  {
    id: "google",
    name: "Google Business",
    unit: "posts",
    color: "#1a73e8",
    basics: [
      ["profileName", "Business name"],
      ["photo", "Logo"],
      ["cover", "Cover photo"],
      ["bio", "Description"],
      ["website", "Website link"],
      ["highlights", "Opening hours"],
      ["contact", "Phone"],
      ["links", "Services"],
    ],
  },
];

function activeEmployees(employees) {
  return (employees || [])
    .filter((row) => !row.accountStatus || row.accountStatus === "active")
    .sort((a, b) => String(a.fullName || "").localeCompare(String(b.fullName || "")));
}

function onCrew(row, id) {
  return Boolean(row.crew && row.crew[id]);
}

const CONTENT_KINDS = [
  ["video", "Video", "videos"],
  ["story", "Story", "stories"],
  ["post", "Post", "posts"],
  ["like", "Like", "likes"],
];

function canSetWork(session) {
  return canManageFollowups(session);
}

function splitWork(item) {
  return item.id === "instagram" || item.id === "youtube";
}

export function employeeLocked(session, row) {
  if (!session || !row || isMaster(session)) return false;
  if (row.accessHold && row.accessHold[session.id]) return true;
  return !(row.assignedTo === session.id || Boolean(row.crew && row.crew[session.id]));
}

export function showAccessDenied(session) {
  let dialog = document.getElementById("access-denied");
  if (!dialog) {
    dialog = document.createElement("dialog");
    dialog.id = "access-denied";
    dialog.className = "sheet access-denied";
    dialog.innerHTML = `<form>
      <header><h2>You don't have permission</h2></header>
      <p>This client is turned off for your account. You can't open it or change it. Contact the Master Admin.</p>
      <footer><button class="btn solid" type="submit">Back to clients</button></footer>
    </form>`;
    dialog.addEventListener("cancel", (event) => event.preventDefault());
    dialog.querySelector("form").addEventListener("submit", (event) => {
      event.preventDefault();
      location.href = dialog.dataset.back || "admin-clients.html";
    });
    document.body.append(dialog);
  }
  dialog.dataset.back = session?.kind === "employee" ? "employee-clients.html" : "admin-clients.html";
  if (!dialog.open) dialog.showModal();
}

export function closeAccessDenied() {
  const dialog = document.getElementById("access-denied");
  if (dialog?.open) dialog.close();
}

export function maintainsClient(session, row) {
  if (canSetWork(session)) return true;
  const held = Boolean(row.accessHold && row.accessHold[session?.id]);
  return session?.kind === "employee" && onCrew(row, session.id) && !held;
}

function channelOf(row, id) {
  return (row.socials && row.socials[id]) || {};
}

async function patch(ctx, row, updater, message) {
  try {
    let blocked = false;
    await changeRow(paths.clients, row.id, (current) => {
      if (!current) return current;
      if (employeeLocked(ctx.session, current)) {
        blocked = true;
        return undefined;
      }
      return updater(current);
    });
    if (blocked) {
      showAccessDenied();
      return;
    }
    if (message) ctx.toast(message);
  } catch (error) {
    ctx.toast(error.message || "Could not save.");
  }
}

function periodStart(cadence, now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (cadence === "week") {
    const day = start.getDay();
    start.setDate(start.getDate() - (day === 0 ? 6 : day - 1));
  } else if (cadence === "month") {
    start.setDate(1);
  }
  return start.getTime();
}

function periodLabel(cadence, start) {
  const date = new Date(start).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  if (cadence === "week") {
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const endLabel = end.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    return `This week · ${date} – ${endLabel}`;
  }
  if (cadence === "month") {
    return new Date(start).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  }
  return `Today · ${date}`;
}

function postsOf(channel) {
  return Object.entries(channel.posts || {})
    .map(([id, post]) => ({ id, ...(post || {}) }))
    .filter((post) => post.url)
    .sort((a, b) => (b.at || 0) - (a.at || 0));
}

function linkFor(raw) {
  const text = String(raw || "").trim();
  if (!text) return "";
  if (/^https?:\/\//i.test(text)) return text;
  return `https://${text}`;
}

function laneOf(channel, kindId) {
  const stored = channel.kinds && channel.kinds[kindId];
  if (stored) return stored;
  if (kindId === "video" && !channel.kinds) {
    return {
      enabled: true,
      cadence: channel.cadence || "day",
      target: Number(channel.target) || 1,
      posts: channel.posts || {},
    };
  }
  return { enabled: false, cadence: "day", target: 1, posts: {} };
}

export function socialBoard(session, row) {
  if (row.serviceLine !== "Digital marketing" || !maintainsClient(session, row)) return null;
  const enabled = PLATFORMS.filter((item) => channelOf(row, item.id).enabled);
  if (!enabled.length) return el("p", "quiet", "No social page is turned on yet.");
  const wrap = el("div", "soc-grid");
  enabled.forEach((item) => wrap.append(socialSquare(session, row, item)));
  return wrap;
}

export function workSetup(ctx, row, employees) {
  return setupCard(ctx, row, employees);
}

export function channelDetail(ctx, row, platformId) {
  const item = PLATFORMS.find((platform) => platform.id === platformId);
  if (!item || row.serviceLine !== "Digital marketing" || !channelOf(row, item.id).enabled) {
    return el("p", "quiet", "This social page is not turned on.");
  }
  if (!maintainsClient(ctx.session, row)) return el("p", "quiet", "You are not assigned to maintain this client.");
  return platformCard(ctx, row, item);
}

function socialSquare(session, row, item) {
  const channel = channelOf(row, item.id);
  const page = session.kind === "employee" ? "employee-client-channel.html" : "admin-client-channel.html";
  const link = el("a", "soc-tile");
  link.href = `${page}?id=${encodeURIComponent(row.id)}&platform=${encodeURIComponent(item.id)}`;
  const head = el("div", "soc-tile-head");
  const mark = el("b", null, item.name.slice(0, 1));
  mark.style.background = item.color;
  head.append(mark, el("strong", null, item.name));
  const meters = el("div", "soc-meters");
  progressLines(item, channel).forEach((line) => {
    const meter = el("div", "soc-meter");
    const top = el("div", "soc-meter-top");
    top.append(el("span", null, line.label), el("b", null, line.text));
    const track = el("div", `dm-track${line.done >= line.goal ? " done" : ""}`);
    const fill = el("span");
    fill.style.width = `${line.percent}%`;
    track.append(fill);
    meter.append(top, track);
    meters.append(meter);
  });
  if (!meters.childElementCount) meters.append(el("p", "quiet", "No plan yet"));
  link.append(head, basicSummary(item, channel), meters);
  return link;
}

function basicSummary(item, channel) {
  const done = item.basics.filter(([key]) => channel.basics && channel.basics[key]).length;
  const block = el("div", "soc-basic");
  const top = el("div", "soc-meter-top");
  top.append(el("span", null, "Basic work"), el("b", null, `${done}/${item.basics.length}`));
  const track = el("div", `dm-track${done >= item.basics.length ? " done" : ""}`);
  const fill = el("span");
  fill.style.width = `${Math.round((done / item.basics.length) * 100)}%`;
  track.append(fill);
  const titles = el("div", "soc-basic-titles");
  item.basics.forEach(([key, label]) => titles.append(el("span", channel.basics && channel.basics[key] ? "on" : "", label)));
  block.append(top, track, titles);
  return block;
}

function basicPanel(ctx, row, item) {
  const channel = channelOf(row, item.id);
  const done = item.basics.filter(([key]) => channel.basics && channel.basics[key]).length;
  const block = el("div", "dm-basic");
  block.append(el("h4", null, `Basic work · ${done}/${item.basics.length}`));
  const track = el("div", `dm-track${done >= item.basics.length ? " done" : ""}`);
  const fill = el("span");
  fill.style.width = `${Math.round((done / Math.max(item.basics.length, 1)) * 100)}%`;
  track.append(fill);
  block.append(track, basicTasks(ctx, row, item));
  return block;
}

function basicTasks(ctx, row, item) {
  const channel = channelOf(row, item.id);
  const tasks = el("div", "dm-tasks");
  item.basics.forEach(([key, label]) => {
    const on = Boolean(channel.basics && channel.basics[key]);
    const task = button(label, `dm-task${on ? " on" : ""}`, () => patch(ctx, row, (current) => {
      const socials = { ...(current.socials || {}) };
      const prev = socials[item.id] || {};
      socials[item.id] = { ...prev, basics: { ...(prev.basics || {}), [key]: !prev.basics?.[key] } };
      return { ...current, socials };
    }, ""));
    task.setAttribute("aria-pressed", String(on));
    task.prepend(el("i", null, on ? "✓" : ""));
    tasks.append(task);
  });
  return tasks;
}

function progressLines(item, channel) {
  const lanes = splitWork(item)
    ? CONTENT_KINDS.filter(([kindId]) => laneOf(channel, kindId).enabled).map(([kindId, label, unit]) => [laneOf(channel, kindId), label, unit])
    : [[channel, item.unit === "videos" ? "Video" : "Work", item.unit]];
  return lanes.map(([source, label, unit]) => {
    const cadence = source.cadence === "week" || source.cadence === "month" ? source.cadence : "day";
    const goal = Math.max(1, Number(source.target) || 1);
    const done = postsOf(source).filter((post) => (post.at || 0) >= periodStart(cadence)).length;
    return { label, text: `${done}/${goal} ${unit}`, done, goal, percent: Math.min(100, Math.round((done / goal) * 100)) };
  });
}

export function workBoard(ctx, row, employees) {
  const nodes = [];
  const manager = canSetWork(ctx.session);
  if (manager) nodes.push(setupCard(ctx, row, employees));
  if (row.serviceLine === "Digital marketing" && maintainsClient(ctx.session, row)) {
    const enabled = PLATFORMS.filter((item) => channelOf(row, item.id).enabled);
    if (enabled.length) nodes.push(...enabled.map((item) => platformCard(ctx, row, item)));
    else if (manager) nodes.push(el("p", "quiet", "Turn on the social pages this client actually uses. Only those cards show on the profile."));
  }
  return nodes;
}

function setupCard(ctx, row, employees) {
  const card = el("section", "profile-card dm-setup");
  card.append(el("h2", null, "Work setup"));
  card.append(el("p", "quiet", "Mark a digital marketing client, choose who maintains it, then enable only the social pages they use."));
  const line = document.createElement("select");
  line.setAttribute("aria-label", "Client work type");
  [["", "General client"], ["Digital marketing", "Digital marketing"]].forEach(([value, label]) => {
    const option = el("option", null, label);
    option.value = value;
    line.append(option);
  });
  line.value = row.serviceLine === "Digital marketing" ? "Digital marketing" : "";
  line.addEventListener("change", () => patch(ctx, row, (current) => {
    const next = { ...current, serviceLine: line.value };
    if (line.value === "Digital marketing" && !current.crew && current.assignedTo) {
      next.crew = { [current.assignedTo]: { name: current.assignedName || "Employee" } };
    }
    return next;
  }, line.value ? "Digital marketing is on." : "Saved as a general client."));
  const type = el("label", "dm-type", "Work type");
  type.append(line);
  card.append(type);
  if (row.serviceLine === "Digital marketing") card.append(crewPicker(ctx, row, employees), socialSetup(ctx, row));
  return card;
}

function crewPicker(ctx, row, employees) {
  const block = el("div", "dm-block");
  block.append(el("h3", null, "Who maintains this client"));
  const people = activeEmployees(employees);
  if (!people.length) {
    block.append(el("p", "quiet", "No active employees to assign."));
    return block;
  }
  const list = el("div", "dm-crew");
  people.forEach((person) => {
    const on = onCrew(row, person.id);
    const chip = button(person.fullName || "Employee", `dm-person${on ? " on" : ""}`, () => patch(ctx, row, (current) => {
      const crew = { ...(current.crew || {}) };
      if (crew[person.id]) delete crew[person.id];
      else crew[person.id] = { name: person.fullName || "Employee" };
      return { ...current, crew };
    }, on ? "Removed from this client." : "Assigned to this client."));
    chip.setAttribute("aria-pressed", String(on));
    list.append(chip);
  });
  block.append(list);
  return block;
}

function socialSetup(ctx, row) {
  const block = el("div", "dm-block");
  block.append(el("h3", null, "Social pages"));
  const list = el("div", "dm-socials");
  PLATFORMS.forEach((item) => list.append(socialRow(ctx, row, item)));
  block.append(list);
  return block;
}

function socialRow(ctx, row, item) {
  const channel = channelOf(row, item.id);
  const rowEl = el("div", `dm-soc${channel.enabled ? " on" : ""}`);
  const mark = el("b", null, item.name.slice(0, 1));
  mark.style.background = item.color;
  const name = el("strong", null, item.name);
  const toggle = button("", `dm-switch${channel.enabled ? " on" : ""}`, () => patch(ctx, row, (current) => {
    const socials = { ...(current.socials || {}) };
    const prev = socials[item.id] || {};
    const kinds = { ...(prev.kinds || {}) };
    if (splitWork(item) && !prev.kinds) {
      kinds.video = {
        enabled: true,
        cadence: prev.cadence || "day",
        target: Number(prev.target) || 1,
        posts: prev.posts || {},
      };
    }
    socials[item.id] = {
      ...prev,
      enabled: !prev.enabled,
      cadence: prev.cadence || "day",
      target: Number(prev.target) || 1,
      basics: prev.basics || {},
      posts: prev.posts || {},
      ...(splitWork(item) ? { kinds } : {}),
    };
    return { ...current, socials };
  }, channel.enabled ? `${item.name} hidden.` : `${item.name} enabled.`));
  toggle.setAttribute("aria-label", `${channel.enabled ? "Disable" : "Enable"} ${item.name}`);
  toggle.setAttribute("aria-pressed", String(Boolean(channel.enabled)));
  toggle.append(el("i"));
  const main = el("div", "dm-soc-main");
  main.append(mark, name, toggle);
  rowEl.append(main);
  if (!channel.enabled) return rowEl;
  rowEl.append(basicPanel(ctx, row, item));
  if (splitWork(item)) {
    const kinds = el("div", "dm-kinds");
    CONTENT_KINDS.forEach(([kindId, label, unit]) => kinds.append(kindSetup(ctx, row, item, kindId, label, unit)));
    rowEl.append(kinds);
  } else {
    main.append(...planControls(ctx, row, item, "video", item.unit, channel));
  }
  return rowEl;
}

function kindSetup(ctx, row, item, kindId, label, unit) {
  const lane = laneOf(channelOf(row, item.id), kindId);
  const line = el("div", `dm-kind${lane.enabled ? " on" : ""}`);
  line.append(el("strong", null, label));
  const toggle = button("", `dm-switch${lane.enabled ? " on" : ""}`, () => saveKind(ctx, row, item.id, kindId, { enabled: !lane.enabled }, lane.enabled ? `${label} hidden.` : `${label} enabled.`));
  toggle.setAttribute("aria-label", `${lane.enabled ? "Disable" : "Enable"} ${item.name} ${label}`);
  toggle.setAttribute("aria-pressed", String(Boolean(lane.enabled)));
  toggle.append(el("i"));
  line.append(toggle);
  if (lane.enabled) line.append(...planControls(ctx, row, item, kindId, unit, lane));
  return line;
}

function planControls(ctx, row, item, kindId, unit, source) {
  const cadence = document.createElement("select");
  cadence.setAttribute("aria-label", `${item.name} ${kindId} schedule`);
  [["day", "Daily"], ["week", "Weekly"], ["month", "Monthly"]].forEach(([value, label]) => {
    const option = el("option", null, label);
    option.value = value;
    cadence.append(option);
  });
  cadence.value = source.cadence === "week" || source.cadence === "month" ? source.cadence : "day";
  cadence.addEventListener("change", () => saveKind(ctx, row, item.id, kindId, { cadence: cadence.value }, "Plan saved."));
  const count = document.createElement("input");
  count.type = "number";
  count.min = "1";
  count.max = "99";
  count.value = String(Math.max(1, Number(source.target) || 1));
  count.setAttribute("aria-label", `${item.name} ${unit} target`);
  count.addEventListener("change", () => {
    const target = Math.max(1, Math.min(99, Number(count.value) || 1));
    count.value = String(target);
    saveKind(ctx, row, item.id, kindId, { target }, "Plan saved.");
  });
  const plan = el("label", "dm-plan-set", unit);
  plan.prepend(count);
  return [cadence, plan];
}

function saveKind(ctx, row, id, kindId, patchKind, message) {
  return patch(ctx, row, (current) => {
    const socials = { ...(current.socials || {}) };
    const prev = socials[id] || {};
    if (!splitWork(PLATFORMS.find((item) => item.id === id) || {})) {
      socials[id] = { ...prev, ...patchKind, enabled: true };
      return { ...current, socials };
    }
    const kinds = { ...(prev.kinds || {}) };
    const before = kinds[kindId] || laneOf(prev, kindId);
    kinds[kindId] = {
      enabled: before.enabled !== false,
      cadence: before.cadence || "day",
      target: Number(before.target) || 1,
      posts: before.posts || {},
      ...patchKind,
    };
    socials[id] = { ...prev, kinds };
    return { ...current, socials };
  }, message);
}

function platformCard(ctx, row, item) {
  const channel = channelOf(row, item.id);
  const card = el("article", "dm-card");
  card.style.setProperty("--dm", item.color);
  const head = el("header", "dm-head");
  const mark = el("b", null, item.name.slice(0, 1));
  const title = el("div");
  const doneBasics = item.basics.filter(([key]) => channel.basics && channel.basics[key]).length;
  const basicPercent = Math.round((doneBasics / item.basics.length) * 100);
  title.append(el("strong", null, item.name), el("small", null, `Basic work ${doneBasics}/${item.basics.length}`));
  head.append(mark, title, el("em", null, `${basicPercent}%`));
  const basicBar = el("div", "dm-track");
  const basicFill = el("span");
  basicFill.style.width = `${basicPercent}%`;
  basicBar.append(basicFill);
  card.append(head, basicBar, basicTasks(ctx, row, item));
  const lanes = splitWork(item)
    ? CONTENT_KINDS.filter(([kindId]) => laneOf(channel, kindId).enabled)
    : [["video", "Work", item.unit]];
  if (!lanes.length) {
    card.append(el("p", "quiet", "No video, story, post, or like plan is turned on yet."));
    return card;
  }
  lanes.forEach(([kindId, label, unit]) => card.append(laneBlock(ctx, row, item, kindId, label, unit)));
  return card;
}

function laneBlock(ctx, row, item, kindId, label, unit) {
  const source = splitWork(item) ? laneOf(channelOf(row, item.id), kindId) : channelOf(row, item.id);
  const cadence = source.cadence === "week" || source.cadence === "month" ? source.cadence : "day";
  const start = periodStart(cadence);
  const goal = Math.max(1, Number(source.target) || 1);
  const posts = postsOf(source);
  const current = posts.filter((post) => (post.at || 0) >= start);
  const percent = Math.min(100, Math.round((current.length / goal) * 100));
  const block = el("section", "dm-lane");
  const plan = el("div", "dm-plan");
  const planTop = el("div", "dm-plan-top");
  planTop.append(el("span", null, `${label} · ${periodLabel(cadence, start)}`), el("b", null, `${current.length} / ${goal} ${unit}`));
  const bar = el("div", `dm-track${current.length >= goal ? " done" : ""}`);
  const fill = el("span");
  fill.style.width = `${percent}%`;
  bar.append(fill);
  plan.append(planTop, bar);
  block.append(plan, composer(ctx, row, item, kindId, label), feedTable(ctx, row, item, kindId, posts));
  return block;
}

function composer(ctx, row, item, kindId, label) {
  const form = el("form", "dm-compose");
  const url = document.createElement("input");
  url.type = "url";
  url.placeholder = `Paste the ${label.toLowerCase()} link`;
  url.setAttribute("aria-label", `${item.name} ${label} link`);
  const note = document.createElement("input");
  note.type = "text";
  note.placeholder = "Note";
  note.setAttribute("aria-label", `${item.name} ${label} note`);
  const add = button("Add", "btn solid", () => {});
  add.type = "submit";
  const slot = el("div", "dm-preview-slot");
  const paintLive = () => {
    const href = linkFor(url.value);
    const box = href && href !== "https://" ? previewBox(href) : previewBox("");
    if (!href || href === "https://") box.classList.add("empty");
    slot.replaceChildren(box);
  };
  paintLive();
  url.addEventListener("input", paintLive);
  form.append(slot, url, note, add);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const href = linkFor(url.value);
    if (!href || href === "https://") {
      ctx.toast("Paste a link first.");
      return;
    }
    const postId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const entry = {
      url: href,
      note: note.value.trim(),
      at: Date.now(),
      by: ctx.session.id,
      byName: ctx.session.fullName || "Team",
    };
    patch(ctx, row, (current) => {
      const socials = { ...(current.socials || {}) };
      const prev = socials[item.id] || {};
      if (!splitWork(item)) {
        socials[item.id] = { ...prev, posts: { ...(prev.posts || {}), [postId]: entry } };
        return { ...current, socials };
      }
      const kinds = { ...(prev.kinds || {}) };
      const before = kinds[kindId] || laneOf(prev, kindId);
      kinds[kindId] = { ...before, posts: { ...(before.posts || {}), [postId]: entry } };
      socials[item.id] = { ...prev, kinds };
      return { ...current, socials };
    }, "Link added.");
  });
  return form;
}

const feedMemory = new Map();

function memoryFor(row, item, kindId) {
  const key = `${row.id}:${item.id}:${kindId}`;
  if (!feedMemory.has(key)) feedMemory.set(key, { search: "", from: "", to: "" });
  return feedMemory.get(key);
}

function dayKey(ms) {
  const date = new Date(ms);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Link";
  }
}

function youtubeThumb(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    let id = "";
    if (host === "youtu.be") id = parsed.pathname.slice(1);
    else if (host.endsWith("youtube.com")) {
      if (parsed.pathname.startsWith("/watch")) id = parsed.searchParams.get("v") || "";
      else if (parsed.pathname.startsWith("/shorts/") || parsed.pathname.startsWith("/embed/")) id = parsed.pathname.split("/")[2] || "";
    }
    id = id.split(/[?&#/]/)[0];
    return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : "";
  } catch {
    return "";
  }
}

function previewBox(url) {
  const box = el("a", "dm-preview");
  if (!url) {
    box.append(el("span", null, "Preview"));
    box.removeAttribute("href");
    return box;
  }
  box.href = url;
  box.target = "_blank";
  box.rel = "noopener";
  const thumb = youtubeThumb(url);
  if (thumb) {
    const img = document.createElement("img");
    img.alt = "";
    img.src = thumb;
    box.append(img);
    return box;
  }
  box.append(el("span", null, hostOf(url)));
  fetch(`https://noembed.com/embed?url=${encodeURIComponent(url)}`)
    .then((response) => response.json())
    .then((data) => {
      if (!data?.thumbnail_url || !box.isConnected) return;
      const img = document.createElement("img");
      img.alt = data.title || "";
      img.src = data.thumbnail_url;
      box.replaceChildren(img);
    })
    .catch(() => {});
  return box;
}

function feedTable(ctx, row, item, kindId, posts) {
  const memory = memoryFor(row, item, kindId);
  const block = el("div", "dm-feed");
  block.append(el("h3", null, "Fed links"));
  const tools = el("div", "dm-tools");
  const search = document.createElement("input");
  search.type = "search";
  search.placeholder = "Search link, note, or person";
  search.value = memory.search;
  search.setAttribute("aria-label", `${item.name} link search`);
  const from = document.createElement("input");
  from.type = "date";
  from.value = memory.from;
  from.setAttribute("aria-label", "From date");
  const to = document.createElement("input");
  to.type = "date";
  to.value = memory.to;
  to.setAttribute("aria-label", "To date");
  tools.append(search, from, to);
  const bodyHost = el("div", "dm-feed-body");
  block.append(tools, bodyHost);
  const paint = () => {
    memory.search = search.value.trim().toLowerCase();
    memory.from = from.value;
    memory.to = to.value;
    const shown = posts.filter((post) => {
      const hay = `${post.note || ""} ${post.url || ""} ${post.byName || ""}`.toLowerCase();
      if (memory.search && !hay.includes(memory.search)) return false;
      const key = post.at ? dayKey(post.at) : "";
      if (memory.from && key < memory.from) return false;
      if (memory.to && key > memory.to) return false;
      return true;
    });
    if (!shown.length) {
      bodyHost.replaceChildren(el("p", "quiet", posts.length ? "No links match this search." : "Nothing has been fed yet."));
      return;
    }
    bodyHost.replaceChildren(linkTable(ctx, row, item, kindId, shown));
  };
  search.addEventListener("input", paint);
  from.addEventListener("change", paint);
  to.addEventListener("change", paint);
  paint();
  return block;
}

function linkTable(ctx, row, item, kindId, posts) {
  const wrap = el("div", "table-wrap dm-feed-wrap");
  const table = document.createElement("table");
  table.className = "data-table dm-feed-table";
  const headers = ["S.No", "Preview", "Link", "By", "Date", ""];
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  headers.forEach((label) => headRow.append(el("th", null, label)));
  head.append(headRow);
  const body = document.createElement("tbody");
  posts.forEach((post, index) => {
    const tr = document.createElement("tr");
    const when = post.at ? new Date(post.at).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—";
    const link = el("a", null, post.note || hostOf(post.url));
    link.href = post.url;
    link.target = "_blank";
    link.rel = "noopener";
    link.title = post.url;
    const cells = [
      el("span", "req-no", String(index + 1)),
      previewBox(post.url),
      link,
      post.byName || "Team",
      when,
      button("Remove", "btn ghost", async () => {
        if (!await ctx.ask("Remove this link?")) return;
        patch(ctx, row, (current) => {
          const socials = { ...(current.socials || {}) };
          const prev = socials[item.id] || {};
          if (!splitWork(item)) {
            const nextPosts = { ...(prev.posts || {}) };
            delete nextPosts[post.id];
            socials[item.id] = { ...prev, posts: nextPosts };
            return { ...current, socials };
          }
          const kinds = { ...(prev.kinds || {}) };
          const before = kinds[kindId] || laneOf(prev, kindId);
          const nextPosts = { ...(before.posts || {}) };
          delete nextPosts[post.id];
          kinds[kindId] = { ...before, posts: nextPosts };
          socials[item.id] = { ...prev, kinds };
          return { ...current, socials };
        }, "Link removed.");
      }),
    ];
    cells.forEach((cell, cellIndex) => {
      const td = document.createElement("td");
      td.dataset.label = headers[cellIndex] || "Action";
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
