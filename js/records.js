export function todayIso() {
  return isoOffset(0);
}

export function yesterdayIso() {
  return isoOffset(-1);
}

function isoOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

export function stamp() {
  const d = new Date();
  return {
    createdDate: todayIso(),
    createdTime: d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    month: d.getMonth() + 1,
    year: d.getFullYear(),
    timestamp: d.getTime(),
  };
}

export function counts(board) {
  const tickets = board.tickets || [];
  const reports = board.reports || [];
  const projects = board.projects || [];
  return {
    tasks: tickets.filter((row) => row.status === "open" || row.status === "progress").length,
    followUps: reports.filter((row) => row.status === "pending").length,
    projects: projects.filter((row) => row.status === "Active").length,
  };
}

export function formatWhen(iso) {
  if (!iso) return "No date";
  const [year, month, day] = String(iso).split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const index = Number(month) - 1;
  if (!year || !months[index] || !day) return String(iso);
  return `${Number(day)} ${months[index]} ${year}`;
}
