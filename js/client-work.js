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
  if (row.paused) return true;
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

function startOfDay(ms = Date.now()) {
  const start = new Date(ms);
  start.setHours(0, 0, 0, 0);
  return start.getTime();
}

function endOfDay(ms) {
  const end = new Date(ms);
  end.setHours(23, 59, 59, 999);
  return end.getTime();
}

function dateValue(ms) {
  return dayKey(ms || Date.now());
}

function parseDay(value) {
  if (!value) return 0;
  const [year, month, day] = String(value).split("-").map(Number);
  if (!year || !month || !day) return 0;
  return new Date(year, month - 1, day).getTime();
}

function shortDate(ms) {
  return new Date(ms).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function periodDays(cadence) {
  if (cadence === "week") return 7;
  if (cadence === "month") return 30;
  return 1;
}

function compactDate(ms) {
  return new Date(ms).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function periodStart(cadence, at = Date.now(), origin = at) {
  const nowDay = startOfDay(at);
  if (cadence !== "week" && cadence !== "month") return nowDay;
  let start = startOfDay(origin);
  let guard = 0;
  while (nextPeriod(cadence, start) <= nowDay && guard < 800) {
    start = nextPeriod(cadence, start);
    guard += 1;
  }
  return start;
}

function nextPeriod(cadence, start) {
  const date = new Date(start);
  date.setDate(date.getDate() + periodDays(cadence));
  return date.getTime();
}

function periodEnd(cadence, start) {
  return nextPeriod(cadence, start) - 1;
}

function periodLabel(cadence, start, live = true) {
  if (cadence === "week") {
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return `${live ? "This week" : "Week"} · ${compactDate(start)} – ${compactDate(end.getTime())}`;
  }
  if (cadence === "month") {
    const end = new Date(start);
    end.setDate(end.getDate() + 29);
    return `${live ? "This month" : "Month"} · ${compactDate(start)} – ${compactDate(end.getTime())}`;
  }
  return `${live ? "Today" : "Day"} · ${compactDate(start)}`;
}

function runMode(source) {
  return source.runUntil === "date" ? "date" : "manual";
}

function runFrom(source) {
  return startOfDay(source.startedAt || Date.now());
}

function runUntil(source) {
  let until = endOfDay(Date.now());
  if (source.closedAt) until = Math.min(until, source.closedAt);
  if (runMode(source) === "date" && source.endDate) until = Math.min(until, endOfDay(parseDay(source.endDate)));
  return until;
}

function planState(source) {
  if (source.closedAt) return "closed";
  if (runMode(source) === "date" && source.endDate && Date.now() > endOfDay(parseDay(source.endDate))) return "expired";
  return "live";
}

function planStatusText(source) {
  const state = planState(source);
  if (state === "closed") return `Closed ${shortDate(source.closedAt)}`;
  if (state === "expired") return `Plan expired ${shortDate(parseDay(source.endDate))}`;
  if (runMode(source) === "date" && source.endDate) return `Until ${shortDate(parseDay(source.endDate))}`;
  return "Until closed";
}

function slotsFor(source) {
  const cadence = source.cadence === "week" || source.cadence === "month" ? source.cadence : "day";
  const goal = Math.max(1, Number(source.target) || 1);
  const posts = postsOf(source);
  const origin = runFrom(source);
  const from = startOfDay(origin);
  const until = Math.max(from, runUntil(source));
  const nowSlot = periodStart(cadence, Date.now(), origin);
  const slots = [];
  let cursor = from;
  let guard = 0;
  while (cursor <= until && cursor <= nowSlot && guard < 800) {
    const end = periodEnd(cadence, cursor);
    const done = posts.filter((post) => (post.at || 0) >= cursor && (post.at || 0) <= end).length;
    slots.push({
      start: cursor,
      end,
      cadence,
      goal,
      done,
      pending: done < goal,
      current: cursor === nowSlot,
      label: periodLabel(cadence, cursor, cursor === nowSlot),
    });
    cursor = nextPeriod(cadence, cursor);
    guard += 1;
  }
  return slots;
}

function pendingSlots(source) {
  return slotsFor(source).filter((slot) => slot.pending);
}

function lanePatch(source, extra = {}) {
  const next = {
    enabled: source.enabled !== false,
    cadence: source.cadence === "week" || source.cadence === "month" ? source.cadence : "day",
    target: Number(source.target) || 1,
    posts: source.posts || {},
    runUntil: runMode(source),
    endDate: source.endDate || "",
    startedAt: source.startedAt || Date.now(),
    closedAt: source.closedAt || 0,
    ...extra,
  };
  if (next.enabled && !next.startedAt) next.startedAt = Date.now();
  if (next.enabled && extra.enabled !== false && source.closedAt && extra.closedAt !== source.closedAt) {
    next.closedAt = extra.closedAt || 0;
  }
  return next;
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
      runUntil: channel.runUntil || "manual",
      endDate: channel.endDate || "",
      startedAt: channel.startedAt || 0,
      closedAt: channel.closedAt || 0,
    };
  }
  return { enabled: false, cadence: "day", target: 1, posts: {}, runUntil: "manual", endDate: "", startedAt: 0, closedAt: 0 };
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
    const meter = el("div", `soc-meter${line.expired ? " expired" : ""}`);
    const top = el("div", "soc-meter-top");
    top.append(el("span", null, line.label), el("b", null, line.text));
    const track = el("div", `dm-track${line.done >= line.goal ? " done" : ""}`);
    const fill = el("span");
    fill.style.width = `${line.percent}%`;
    track.append(fill);
    meter.append(top, track);
    if (line.note) meter.append(el("small", "soc-note", line.note));
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
    const slots = slotsFor(source);
    const live = slots.find((slot) => slot.current) || slots[slots.length - 1];
    const pending = slots.filter((slot) => slot.pending).length;
    const state = planState(source);
    const done = live?.done || 0;
    const goal = live?.goal || Math.max(1, Number(source.target) || 1);
    return {
      label,
      text: state === "expired" ? "Expired" : `${done}/${goal} ${unit}`,
      done,
      goal,
      percent: Math.min(100, Math.round((done / goal) * 100)),
      expired: state === "expired",
      note: state === "expired"
        ? planStatusText(source)
        : pending ? `${pending} pending` : planStatusText(source),
    };
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
      kinds.video = lanePatch({
        enabled: true,
        cadence: prev.cadence || "day",
        target: Number(prev.target) || 1,
        posts: prev.posts || {},
        runUntil: prev.runUntil,
        endDate: prev.endDate,
        startedAt: prev.startedAt || Date.now(),
      });
    }
    socials[item.id] = {
      ...prev,
      enabled: !prev.enabled,
      cadence: prev.cadence || "day",
      target: Number(prev.target) || 1,
      basics: prev.basics || {},
      posts: prev.posts || {},
      runUntil: prev.runUntil || "manual",
      endDate: prev.endDate || "",
      startedAt: prev.startedAt || Date.now(),
      closedAt: prev.closedAt || 0,
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
    main.append(...durationControls(ctx, row, item, "video", channel));
  }
  return rowEl;
}

function kindSetup(ctx, row, item, kindId, label, unit) {
  const lane = laneOf(channelOf(row, item.id), kindId);
  const line = el("div", `dm-kind${lane.enabled ? " on" : ""}`);
  line.append(el("strong", null, label));
  const turningOn = !lane.enabled;
  const toggle = button("", `dm-switch${lane.enabled ? " on" : ""}`, () => saveKind(ctx, row, item.id, kindId, turningOn
    ? { enabled: true, startedAt: lane.startedAt || Date.now(), closedAt: 0 }
    : { enabled: false }, lane.enabled ? `${label} hidden.` : `${label} enabled.`));
  toggle.setAttribute("aria-label", `${lane.enabled ? "Disable" : "Enable"} ${item.name} ${label}`);
  toggle.setAttribute("aria-pressed", String(Boolean(lane.enabled)));
  toggle.append(el("i"));
  line.append(toggle);
  if (lane.enabled) {
    line.append(...planControls(ctx, row, item, kindId, unit, lane));
    line.append(...durationControls(ctx, row, item, kindId, lane));
  }
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
  cadence.addEventListener("change", () => saveKind(ctx, row, item.id, kindId, {
    cadence: cadence.value,
    startedAt: Date.now(),
    closedAt: 0,
  }, cadence.value === "week" ? "Weekly plan starts today for 7 days." : cadence.value === "month" ? "Monthly plan starts today for 30 days." : "Daily plan starts today."));
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
  const group = el("div", "dm-plan-group");
  group.append(cadence, plan);
  return [group];
}

function durationControls(ctx, row, item, kindId, source) {
  const state = planState(source);
  const nodes = [];
  const mode = document.createElement("select");
  mode.className = "dm-run-select";
  mode.setAttribute("aria-label", `${item.name} ${kindId} duration`);
  [["manual", "Until closed"], ["date", "End date"]].forEach(([value, label]) => {
    const option = el("option", null, label);
    option.value = value;
    mode.append(option);
  });
  mode.value = runMode(source);
  mode.addEventListener("change", () => saveKind(ctx, row, item.id, kindId, {
    runUntil: mode.value,
    closedAt: 0,
    startedAt: source.startedAt || Date.now(),
  }, "Duration saved."));
  nodes.push(mode);
  if (runMode(source) === "date") {
    const end = document.createElement("input");
    end.type = "date";
    end.className = "dm-run-date";
    end.value = source.endDate || "";
    end.min = dateValue(source.startedAt || Date.now());
    end.setAttribute("aria-label", `${item.name} ${kindId} end date`);
    end.addEventListener("change", () => {
      if (!end.value) {
        ctx.toast("Pick an end date, or choose until closed.");
        return;
      }
      saveKind(ctx, row, item.id, kindId, { runUntil: "date", endDate: end.value, closedAt: 0, startedAt: source.startedAt || Date.now() }, "End date saved.");
    });
    nodes.push(end);
  }
  nodes.push(el("em", `dm-run-chip${state === "expired" ? " expired" : ""}`, planStatusText(source)));
  if (canSetWork(ctx.session)) {
    if (state === "live" && runMode(source) === "manual") {
      nodes.push(button("Close", "btn ghost dm-mini", () => saveKind(ctx, row, item.id, kindId, { closedAt: Date.now() }, "Plan closed.")));
    }
    if (state === "expired" || state === "closed") {
      nodes.push(button("Extend", "btn solid dm-mini", () => {
        const next = new Date();
        next.setDate(next.getDate() + 30);
        saveKind(ctx, row, item.id, kindId, {
          runUntil: "date",
          endDate: dateValue(next.getTime()),
          closedAt: 0,
          startedAt: source.startedAt || Date.now(),
        }, "Plan extended.");
      }));
    }
  }
  const group = el("div", "dm-run-group");
  group.append(...nodes);
  return [group];
}

function saveKind(ctx, row, id, kindId, patchKind, message) {
  return patch(ctx, row, (current) => {
    const socials = { ...(current.socials || {}) };
    const prev = socials[id] || {};
    const platform = PLATFORMS.find((item) => item.id === id) || {};
    if (!splitWork(platform)) {
      socials[id] = lanePatch({ ...prev, enabled: true }, patchKind);
      return { ...current, socials };
    }
    const kinds = { ...(prev.kinds || {}) };
    const before = kinds[kindId] || laneOf(prev, kindId);
    kinds[kindId] = lanePatch(before, patchKind);
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
  const state = planState(source);
  const slots = slotsFor(source);
  const live = slots.find((slot) => slot.current) || slots[slots.length - 1];
  const pending = slots.filter((slot) => slot.pending).length;
  const block = el("section", `dm-lane${state === "expired" ? " expired" : ""}`);
  const plan = el("div", "dm-plan");
  const planTop = el("div", "dm-plan-top");
  const title = state === "expired"
    ? `${label} · Plan expired`
    : `${label} · ${live ? live.label : periodLabel(source.cadence === "week" || source.cadence === "month" ? source.cadence : "day", periodStart(source.cadence, Date.now(), runFrom(source)))}`;
  const count = live ? `${live.done} / ${live.goal} ${unit}` : `0 / ${Math.max(1, Number(source.target) || 1)} ${unit}`;
  planTop.append(el("span", null, title), el("b", null, count), el("em", `dm-run-chip${state === "expired" ? " expired" : ""}`, planStatusText(source)));
  const bar = el("div", `dm-track${live && live.done >= live.goal ? " done" : ""}`);
  const fill = el("span");
  fill.style.width = `${live ? Math.min(100, Math.round((live.done / live.goal) * 100)) : 0}%`;
  bar.append(fill);
  plan.append(planTop, bar);
  block.append(plan, workRecord(ctx, row, item, kindId, label, unit, source, state, pending));
  return block;
}

function slotPosts(source, slot) {
  return postsOf(source).filter((post) => (post.at || 0) >= slot.start && (post.at || 0) <= slot.end);
}

function writePost(ctx, row, item, kindId, postId, entry, message) {
  return patch(ctx, row, (current) => {
    const socials = { ...(current.socials || {}) };
    const prev = socials[item.id] || {};
    if (!splitWork(item)) {
      const posts = { ...(prev.posts || {}) };
      if (entry) posts[postId] = { ...(posts[postId] || {}), ...entry };
      else delete posts[postId];
      socials[item.id] = { ...prev, posts };
      return { ...current, socials };
    }
    const kinds = { ...(prev.kinds || {}) };
    const before = kinds[kindId] || laneOf(prev, kindId);
    const posts = { ...(before.posts || {}) };
    if (entry) posts[postId] = { ...(posts[postId] || {}), ...entry };
    else delete posts[postId];
    kinds[kindId] = { ...before, posts };
    socials[item.id] = { ...prev, kinds };
    return { ...current, socials };
  }, message);
}

const feedMemory = new Map();
const workEdit = new Set();

function workLines(source) {
  const lines = [];
  slotsFor(source).forEach((slot) => {
    const existing = slotPosts(source, slot);
    existing.forEach((post) => lines.push({ slot, post }));
    const missing = Math.max(0, slot.goal - existing.length);
    for (let index = 0; index < missing; index += 1) lines.push({ slot, post: null });
  });
  return lines;
}

function workRecord(ctx, row, item, kindId, label, unit, source, state, pending) {
  const memory = memoryFor(row, item, kindId);
  const wrap = el("div", "dm-feed");
  wrap.append(el("h3", null, pending ? `Work record · ${pending} pending` : "Work record"));
  const tools = el("div", "dm-tools");
  const search = document.createElement("input");
  search.type = "search";
  search.placeholder = "Search date, link, or note";
  search.value = memory.search;
  const from = document.createElement("input");
  from.type = "date";
  from.value = memory.from;
  const to = document.createElement("input");
  to.type = "date";
  to.value = memory.to;
  tools.append(search, from, to);
  const host = el("div", "dm-feed-body");
  wrap.append(tools, host);
  const paint = () => {
    memory.search = search.value.trim().toLowerCase();
    memory.from = from.value;
    memory.to = to.value;
    const lines = workLines(source).filter((line) => {
      const date = dayKey(line.slot.start);
      if (memory.from && date < memory.from) return false;
      if (memory.to && date > memory.to) return false;
      const hay = `${line.slot.label} ${line.post?.url || ""} ${line.post?.note || ""} ${line.post?.byName || ""}`.toLowerCase();
      return !memory.search || hay.includes(memory.search);
    });
    if (!lines.length) {
      host.replaceChildren(el("p", "quiet", state === "expired" ? "Plan expired. Extend it in settings, then fill missed dates." : "No dates in this plan yet."));
      return;
    }
    host.replaceChildren(recordTable(ctx, row, item, kindId, label, lines, paint));
  };
  search.addEventListener("input", paint);
  from.addEventListener("change", paint);
  to.addEventListener("change", paint);
  paint();
  return wrap;
}

function recordTable(ctx, row, item, kindId, label, lines, paint) {
  const wrap = el("div", "table-wrap dm-feed-wrap");
  const table = document.createElement("table");
  table.className = "data-table dm-feed-table dm-work-table";
  const headers = ["S.No", "Date", "Status", "Preview", "Link", "Note", "Action"];
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  headers.forEach((name) => headRow.append(el("th", null, name)));
  head.append(headRow);
  const body = document.createElement("tbody");
  lines.forEach((line, index) => body.append(recordRow(ctx, row, item, kindId, label, line, index + 1, paint)));
  table.append(head, body);
  wrap.append(table);
  return wrap;
}

function recordRow(ctx, row, item, kindId, label, line, serial, paint) {
  const tr = document.createElement("tr");
  const saved = Boolean(line.post);
  const editing = saved && workEdit.has(line.post.id);
  tr.className = saved && !editing ? "done" : "open";
  const date = el("div", "dm-date");
  const endDay = startOfDay(line.slot.end);
  const range = line.slot.cadence === "day"
    ? shortDate(line.slot.start)
    : `${compactDate(line.slot.start)} – ${compactDate(endDay)}`;
  const sub = line.slot.cadence === "week" ? (line.slot.current ? "This week · 7 days" : "7 days")
    : line.slot.cadence === "month" ? (line.slot.current ? "This month · 30 days" : "30 days")
    : (line.slot.current ? "Today" : "Day");
  date.append(el("strong", null, range), el("small", null, sub));
  const status = el("span", `req-status ${saved && !editing && line.slot.done >= line.slot.goal ? "live" : "hold"}`, saved && !editing ? "Done" : `Pending ${line.slot.done}/${line.slot.goal}`);
  const cells = [
    el("span", "req-no", String(serial)),
    date,
    status,
  ];
  if (!saved || editing) {
    const url = document.createElement("input");
    url.type = "url";
    url.placeholder = `Paste ${label.toLowerCase()} link`;
    url.value = line.post?.url || "";
    const note = document.createElement("input");
    note.type = "text";
    note.placeholder = "Note";
    note.value = line.post?.note || "";
    const preview = el("div", "dm-preview-slot");
    const paintPreview = () => {
      const href = linkFor(url.value);
      const box = href && href !== "https://" ? previewBox(href) : previewBox("");
      if (!href || href === "https://") box.classList.add("empty");
      preview.replaceChildren(box);
    };
    url.addEventListener("input", paintPreview);
    paintPreview();
    const actions = el("div", "req-actions");
    actions.append(button("Save", "btn solid dm-mini", () => {
      const href = linkFor(url.value);
      if (!href || href === "https://") {
        ctx.toast("Paste a link first.");
        return;
      }
      const postId = line.post?.id || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      if (line.post) workEdit.delete(line.post.id);
      writePost(ctx, row, item, kindId, postId, {
        url: href,
        note: note.value.trim(),
        at: line.post?.at || (line.slot.current ? Date.now() : line.slot.end),
        by: ctx.session.id,
        byName: ctx.session.fullName || "Team",
        forStart: line.slot.start,
      }, saved ? "Link updated." : "Link saved.");
    }));
    if (saved) {
      actions.append(button("Cancel", "btn ghost dm-mini", () => {
        workEdit.delete(line.post.id);
        paint();
      }));
    }
    cells.push(preview, url, note, actions);
  } else {
    const link = el("a", null, line.post.note || hostOf(line.post.url));
    link.href = line.post.url;
    link.target = "_blank";
    link.rel = "noopener";
    const actions = el("div", "req-actions");
    actions.append(
      button("Edit", "btn ghost dm-mini", () => {
        workEdit.add(line.post.id);
        paint();
      }),
      button("Remove", "btn warn dm-mini", async () => {
        if (!await ctx.ask("Remove this link?")) return;
        writePost(ctx, row, item, kindId, line.post.id, null, "Link removed.");
      }),
    );
    cells.push(previewBox(line.post.url), link, line.post.note || "—", actions);
  }
  cells.forEach((cell, cellIndex) => {
    const td = document.createElement("td");
    td.dataset.label = ["S.No", "Date", "Status", "Preview", "Link", "Note", "Action"][cellIndex];
    if (cell instanceof Node) td.append(cell);
    else td.textContent = cell;
    tr.append(td);
  });
  return tr;
}

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
