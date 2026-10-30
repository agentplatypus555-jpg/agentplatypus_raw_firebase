import { pageAdmins, pageAdminFile, pageEmployeeFile, pageEmployees, pageProfile as pageAdminProfile } from "./admin-pages.js";
import { pageRequests } from "./requests.js";
import { pageEmployeeProfile } from "./employee-pages.js";
import { pageAdminClient, pageAdminClientChannel, pageAdminClientDanger, pageAdminClientDetails, pageAdminClients, pageAdminClientSetup, pageAdminClientTeam, pageEmployeeClient, pageEmployeeClientChannel, pageEmployeeClientDetails, pageEmployeeClients } from "./clients.js";
import { pageAdminFollowups, pageEmployeeFollowups } from "./followups.js";
import { pageForgot, pageLogin, pageRegister, pageSetup } from "./public-pages.js";
import { canManageAdmins, canManageFollowups, isMaster } from "./roles.js";
import { guard, homeFor } from "./session.js";

const pages = {
  login: pageLogin,
  forgot: pageForgot,
  register: pageRegister,
  setup: pageSetup,
  "admin-profile": pageAdminProfile,
  "admin-employees": pageEmployees,
  "admin-employee": pageEmployeeFile,
  "admin-admins": pageAdmins,
  "admin-admin": pageAdminFile,
  "admin-requests": pageRequests,
  "admin-followups": pageAdminFollowups,
  "admin-clients": pageAdminClients,
  "admin-client": pageAdminClient,
  "admin-client-details": pageAdminClientDetails,
  "admin-client-setup": pageAdminClientSetup,
  "admin-client-team": pageAdminClientTeam,
  "admin-client-danger": pageAdminClientDanger,
  "admin-client-channel": pageAdminClientChannel,
  "employee-profile": pageEmployeeProfile,
  "employee-followups": pageEmployeeFollowups,
  "employee-clients": pageEmployeeClients,
  "employee-client": pageEmployeeClient,
  "employee-client-details": pageEmployeeClientDetails,
  "employee-client-channel": pageEmployeeClientChannel,
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
if (gate.ok && gate.session && page === "admin-requests" && !isMaster(gate.session)) {
  location.replace(homeFor(gate.session));
} else if (gate.ok && gate.session && ["admin-employee", "admin-admin"].includes(page) && !isMaster(gate.session)) {
  location.replace(homeFor(gate.session));
} else if (gate.ok && gate.session && page === "admin-admins" && !canManageAdmins(gate.session)) {
  location.replace("admin-employees.html");
} else if (gate.ok && gate.session && page === "admin-followups" && !canManageFollowups(gate.session)) {
  location.replace(homeFor(gate.session));
} else if (gate.ok && gate.session && page === "admin-client-danger" && !isMaster(gate.session)) {
  location.replace("admin-clients.html");
} else if (gate.ok && gate.session && ["admin-clients", "admin-client", "admin-client-details", "admin-client-setup", "admin-client-team", "admin-client-channel", "admin-client-danger"].includes(page) && !canManageFollowups(gate.session)) {
  location.replace(homeFor(gate.session));
} else if (gate.ok && gate.session && retired.has(page)) {
  location.replace(homeFor(gate.session));
} else if (gate.ok) {
  const run = pages[page];
  if (run) run(gate.session);
}
