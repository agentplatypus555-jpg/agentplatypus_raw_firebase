import { pageAdmins, pageEmployees, pageProfile as pageAdminProfile } from "./admin-pages.js";
import { pageEmployeeProfile } from "./employee-pages.js";
import { pageAdminClient, pageAdminClients, pageEmployeeClient, pageEmployeeClients } from "./clients.js";
import { pageAdminFollowups, pageEmployeeFollowups } from "./followups.js";
import { pageForgot, pageLogin, pageRegister, pageSetup } from "./public-pages.js";
import { canManageAdmins, canManageFollowups } from "./roles.js";
import { guard, homeFor } from "./session.js";

const pages = {
  login: pageLogin,
  forgot: pageForgot,
  register: pageRegister,
  setup: pageSetup,
  "admin-profile": pageAdminProfile,
  "admin-employees": pageEmployees,
  "admin-admins": pageAdmins,
  "admin-followups": pageAdminFollowups,
  "admin-clients": pageAdminClients,
  "admin-client": pageAdminClient,
  "employee-profile": pageEmployeeProfile,
  "employee-followups": pageEmployeeFollowups,
  "employee-clients": pageEmployeeClients,
  "employee-client": pageEmployeeClient,
};

const retired = new Set([
  "admin",
  "admin-dashboard",
  "admin-track",
  "admin-feed",
  "admin-projects",
  "admin-assignments",
  "admin-reports",
  "admin-history",
  "employee",
  "employee-dashboard",
  "employee-work",
  "employee-history",
]);

const page = document.body.dataset.page;
const gate = guard(page);
if (gate.ok && gate.session && page === "admin-admins" && !canManageAdmins(gate.session)) {
  location.replace("admin-employees.html");
} else if (gate.ok && gate.session && page === "admin-followups" && !canManageFollowups(gate.session)) {
  location.replace(homeFor(gate.session));
} else if (gate.ok && gate.session && (page === "admin-clients" || page === "admin-client") && !canManageFollowups(gate.session)) {
  location.replace(homeFor(gate.session));
} else if (gate.ok && gate.session && retired.has(page)) {
  location.replace(homeFor(gate.session));
} else if (gate.ok) {
  const run = pages[page];
  if (run) run(gate.session);
}
