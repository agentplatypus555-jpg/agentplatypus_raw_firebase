const KEY = "ap_session";

const publicPages = new Set(["login", "forgot", "register", "setup"]);

export async function hashPassword(password) {
  const bytes = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, "0")).join("");
}

export function getSession() {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) || "null");
  } catch {
    return null;
  }
}

export function setSession(session) {
  sessionStorage.setItem(KEY, JSON.stringify(session));
}

export function clearSession() {
  sessionStorage.removeItem(KEY);
}

export function homeFor(session) {
  return session?.kind === "employee" ? "employee-profile.html" : "admin-profile.html";
}

export function guard(page) {
  const session = getSession();
  if (publicPages.has(page)) return { ok: true, session };
  if (!session) {
    location.replace("login.html");
    return { ok: false, session: null };
  }
  const adminPage = page === "admin" || page.startsWith("admin-");
  const employeePage = page === "employee" || page.startsWith("employee-");
  if (adminPage && session.kind !== "admin") {
    location.replace("employee.html");
    return { ok: false, session };
  }
  if (employeePage && session.kind !== "employee") {
    location.replace("admin.html");
    return { ok: false, session };
  }
  return { ok: true, session };
}
