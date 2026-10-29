import { paths, readList } from "./db.js";
import { homeFor, setSession, getSession } from "./session.js";
import { startCard } from "./shell.js";
import { createAdmin, createEmployee, findLogin, setPassword } from "./store.js";
import { el, field, loader, readForm, setBusy } from "./ui.js";

function errorLine() {
  const node = el("p", "form-error");
  node.hidden = true;
  return node;
}

function showError(node, message) {
  node.hidden = !message;
  node.textContent = message || "";
}

function form(fields, label, onSubmit) {
  const node = el("form", "form");
  fields.forEach((spec) => node.append(field(spec)));
  const error = errorLine();
  const submit = el("button", "btn solid", label);
  submit.type = "submit";
  node.append(error, submit);
  node.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = readForm(node, fields);
    const missing = fields.find((spec) => spec.required && !data[spec.key]);
    if (missing) {
      showError(error, `Add ${missing.label.toLowerCase()} first.`);
      return;
    }
    if (data.password && data.password.length < 6) {
      showError(error, "Use at least 6 characters for the password.");
      return;
    }
    setBusy(submit, true);
    try {
      await onSubmit(data);
    } catch (err) {
      showError(error, err.message || "Could not save.");
      setBusy(submit, false);
    }
  });
  return node;
}

export async function pageLogin() {
  const session = getSession();
  if (session) {
    location.replace(homeFor(session));
    return;
  }
  const card = startCard("Sign in");
  card.append(
    el("h1", null, "Sign in"),
    el("p", "lede", "Admin opens the admin pages. Employee opens the employee pages."),
    form(
      [
        { key: "email", label: "Email", type: "email", required: true },
        { key: "password", label: "Password", type: "password", required: true },
      ],
      "Sign in",
      async (data) => {
        const next = await findLogin(data.email, data.password);
        setSession(next);
        location.href = homeFor(next);
      },
    ),
  );
  const links = el("p", "auth-links");
  const forgot = el("a", null, "Forgot password");
  forgot.href = "forgot.html";
  const register = el("a", null, "Employee registration");
  register.href = "register.html";
  const setup = el("a", null, "First admin setup");
  setup.href = "setup.html";
  links.append(forgot, register, setup);
  card.append(links);
}

export async function pageForgot() {
  const card = startCard("New password", "login.html");
  card.append(
    el("h1", null, "New password"),
    el("p", "lede", "Set a new password for an email that already has a login."),
    form(
      [
        { key: "email", label: "Email", type: "email", required: true },
        { key: "password", label: "New password", type: "password", required: true },
      ],
      "Update password",
      async (data) => {
        await setPassword(data.email, data.password);
        location.href = "login.html";
      },
    ),
  );
  const back = el("a", null, "Back to sign in");
  back.href = "login.html";
  card.append(back);
}

export function pageRegister() {
  const card = startCard("Employee registration", "login.html");
  card.append(
    el("h1", null, "Employee registration"),
    el("p", "lede", "This creates an employee login."),
    form(
      [
        { key: "fullName", label: "Name", required: true },
        { key: "employeeCode", label: "Employee code", required: true },
        { key: "mobile", label: "Mobile" },
        { key: "email", label: "Email", type: "email", required: true },
        { key: "department", label: "Department" },
        { key: "designation", label: "Designation" },
        { key: "password", label: "Password", type: "password", required: true },
      ],
      "Create login",
      async (data) => {
        await createEmployee({ ...data, accountStatus: "pending" });
        card.replaceChildren(
          el("h1", null, "Request sent"),
          el("p", "lede", "Master Admin must approve this account before sign in works."),
        );
        const back = el("a", "btn solid", "Back to sign in");
        back.href = "login.html";
        card.append(back);
      },
    ),
  );
}

export async function pageSetup() {
  const card = startCard("First admin", "login.html");
  const slot = el("div");
  slot.append(loader("Checking for an admin"));
  card.append(slot);
  const admins = await readList(paths.admins);
  if (admins.length) {
    location.replace("login.html");
    return;
  }
  slot.replaceChildren(
    el("h1", null, "First admin"),
    el("p", "lede", "No admin exists yet. This account becomes the first one."),
    form(
      [
        { key: "fullName", label: "Name", required: true },
        { key: "role", label: "Role", value: "Master Admin" },
        { key: "email", label: "Email", type: "email", required: true },
        { key: "mobile", label: "Mobile" },
        { key: "password", label: "Password", type: "password", required: true },
      ],
      "Create admin",
      async (data) => {
        const id = await createAdmin({ ...data, createdBy: "setup", accountStatus: "active" });
        setSession({
          kind: "admin",
          id,
          email: data.email.trim(),
          fullName: data.fullName,
          role: data.role || "Master Admin",
          mobile: data.mobile || "",
        });
        location.href = "admin.html";
      },
    ),
  );
}
