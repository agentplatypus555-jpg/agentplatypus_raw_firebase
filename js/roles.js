export const ADMIN_ROLES = ["HR Admin", "Admin", "Master Admin"];

export function normalizeAdminRole(role) {
  const raw = String(role || "").trim().toLowerCase();
  if (raw === "master" || raw === "master admin" || raw === "masteradmin") return "Master Admin";
  if (raw === "hr" || raw === "hr admin" || raw === "hradmin") return "HR Admin";
  if (raw === "admin") return "Admin";
  return role ? String(role).trim() : "Admin";
}

export function isMaster(session) {
  return normalizeAdminRole(session?.role) === "Master Admin";
}

export function canManageAdmins(session) {
  const role = normalizeAdminRole(session?.role);
  return role === "Master Admin" || role === "Admin";
}

export function canManageFollowups(session) {
  if (session?.kind !== "admin") return false;
  const role = normalizeAdminRole(session.role);
  return role === "Master Admin" || role === "Admin" || role === "HR Admin";
}

export function roleChoices(session) {
  return isMaster(session) ? ADMIN_ROLES : ["HR Admin", "Admin"];
}

export function canSeePasswords(session) {
  return isMaster(session);
}

export function canEditAdmin(session, row) {
  if (isMaster(session)) return true;
  return normalizeAdminRole(row?.role) !== "Master Admin";
}

export function isLastMaster(all, row) {
  if (normalizeAdminRole(row?.role) !== "Master Admin") return false;
  return all.filter((item) => normalizeAdminRole(item.role) === "Master Admin").length <= 1;
}
