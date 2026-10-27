import { addRow, changeRow, deleteRow, paths, readList, saveRow } from "./db.js";
import { stamp } from "./records.js";
import { normalizeAdminRole } from "./roles.js";
import { hashPassword } from "./session.js";
import { sameEmail } from "./ui.js";

async function passwordFields(password) {
  return {
    password,
    passwordHash: await hashPassword(password),
  };
}

export async function emailTaken(email, except) {
  const [admins, employees] = await Promise.all([
    readList(paths.admins),
    readList(paths.employees),
  ]);
  const hit = [...admins, ...employees].find((row) => sameEmail(row.email, email) && row.id !== except?.id);
  return hit || null;
}

export async function createAdmin(data) {
  if (await emailTaken(data.email)) throw new Error("That email already has a login.");
  if (!data.password || data.password.length < 6) throw new Error("Use at least 6 characters for the password.");
  const ref = await addRow(paths.admins, {
    fullName: data.fullName,
    role: normalizeAdminRole(data.role || "Admin"),
    email: data.email.trim(),
    mobile: data.mobile || "",
    ...(await passwordFields(data.password)),
    createdBy: data.createdBy || "",
  });
  return ref.key;
}

export async function createEmployee(data) {
  if (await emailTaken(data.email)) throw new Error("That email already has a login.");
  const employees = await readList(paths.employees);
  if (employees.some((row) => String(row.employeeCode || "").toLowerCase() === data.employeeCode.toLowerCase())) {
    throw new Error("That employee code is already used.");
  }
  if (!data.password || data.password.length < 6) throw new Error("Use at least 6 characters for the password.");
  const ref = await addRow(paths.employees, {
    fullName: data.fullName,
    employeeCode: data.employeeCode,
    email: data.email.trim(),
    mobile: data.mobile || "",
    department: data.department || "",
    designation: data.designation || "",
    ...(await passwordFields(data.password)),
  });
  return ref.key;
}

export async function updateEmployee(id, data) {
  if (await emailTaken(data.email, { id })) throw new Error("That email already has a login.");
  const employees = await readList(paths.employees);
  if (employees.some((row) => row.id !== id && String(row.employeeCode || "").toLowerCase() === data.employeeCode.toLowerCase())) {
    throw new Error("That employee code is already used.");
  }
  const patch = {
    fullName: data.fullName,
    employeeCode: data.employeeCode,
    email: data.email.trim(),
    mobile: data.mobile || "",
    department: data.department || "",
    designation: data.designation || "",
  };
  if (data.password) {
    if (data.password.length < 6) throw new Error("Use at least 6 characters for the password.");
    Object.assign(patch, await passwordFields(data.password));
  }
  await saveRow(paths.employees, id, patch);
}

export async function updateAdmin(id, data) {
  if (await emailTaken(data.email, { id })) throw new Error("That email already has a login.");
  const patch = {
    fullName: data.fullName,
    role: normalizeAdminRole(data.role || "Admin"),
    email: data.email.trim(),
    mobile: data.mobile || "",
  };
  if (data.password) {
    if (data.password.length < 6) throw new Error("Use at least 6 characters for the password.");
    Object.assign(patch, await passwordFields(data.password));
  }
  await saveRow(paths.admins, id, patch);
}

export async function findLogin(email, password) {
  const passwordHash = await hashPassword(password);
  const [admins, employees] = await Promise.all([
    readList(paths.admins),
    readList(paths.employees),
  ]);
  const admin = admins.find((row) => sameEmail(row.email, email));
  if (admin) {
    if (admin.passwordHash !== passwordHash) throw new Error("Wrong password.");
    return {
      kind: "admin",
      id: admin.id,
      email: admin.email,
      fullName: admin.fullName,
      role: normalizeAdminRole(admin.role),
      mobile: admin.mobile || "",
    };
  }
  const employee = employees.find((row) => sameEmail(row.email, email));
  if (employee) {
    if (employee.passwordHash !== passwordHash) throw new Error("Wrong password.");
    return {
      kind: "employee",
      id: employee.id,
      email: employee.email,
      fullName: employee.fullName,
      employeeCode: employee.employeeCode,
      mobile: employee.mobile || "",
      department: employee.department || "",
      designation: employee.designation || "",
    };
  }
  throw new Error("This account is not recognized.");
}

export async function setPassword(email, password) {
  const passwordHash = await hashPassword(password);
  const [admins, employees] = await Promise.all([
    readList(paths.admins),
    readList(paths.employees),
  ]);
  const admin = admins.find((row) => sameEmail(row.email, email));
  if (admin) {
    await saveRow(paths.admins, admin.id, { passwordHash, password });
    return;
  }
  const employee = employees.find((row) => sameEmail(row.email, email));
  if (employee) {
    await saveRow(paths.employees, employee.id, { passwordHash, password });
    return;
  }
  throw new Error("This account is not recognized.");
}

export async function changeOwnPassword(session, current, next) {
  const path = session.kind === "admin" ? paths.admins : paths.employees;
  const rows = await readList(path);
  const row = rows.find((item) => item.id === session.id);
  if (!row) throw new Error("This account is not recognized.");
  if (row.passwordHash !== await hashPassword(current)) throw new Error("Current password is wrong.");
  await saveRow(path, session.id, { passwordHash: await hashPassword(next), password: next });
}

export async function releaseEmployeeTickets(employeeId) {
  const tickets = await readList(paths.tickets);
  const open = tickets.filter((row) => row.assignedTo === employeeId && row.status !== "completed");
  await Promise.all(open.map((row) => saveRow(paths.tickets, row.id, {
    assignedTo: "",
    assignedName: "",
    assignedCode: "",
    status: "open",
    takenAt: "",
  })));
}

export async function removeAssignmentsFor(employeeId) {
  const rows = await readList(paths.assignments);
  await Promise.all(
    rows.filter((row) => row.employeeId === employeeId).map((row) => deleteRow(paths.assignments, row.id)),
  );
}

export async function deleteEmployee(employee) {
  await removeAssignmentsFor(employee.id);
  await releaseEmployeeTickets(employee.id);
  await deleteRow(paths.employees, employee.id);
}

export async function promoteEmployee(employee, createdBy) {
  await addRow(paths.admins, {
    fullName: employee.fullName,
    role: "Admin",
    email: employee.email,
    mobile: employee.mobile || "",
    passwordHash: employee.passwordHash,
    password: employee.password || "",
    createdBy,
  });
  await removeAssignmentsFor(employee.id);
  await releaseEmployeeTickets(employee.id);
  await deleteRow(paths.employees, employee.id);
}

export async function claimTicket(ticketId, person) {
  const result = await changeRow(paths.tickets, ticketId, (current) => {
    if (current.status !== "open" || current.assignedTo || current.selfTag) return undefined;
    return {
      ...current,
      status: "progress",
      assignedTo: person.id,
      assignedName: person.fullName,
      assignedCode: person.employeeCode || "",
      takenAt: Date.now(),
    };
  });
  if (!result.committed) throw new Error("That ticket was already taken.");
}

export async function completeTicket(ticket, person) {
  if (ticket.reportId) return ticket.reportId;
  const when = stamp();
  const free = ticket.ticketType !== "project";
  const report = await addRow(paths.reports, {
    employeeId: person.id,
    employeeName: person.fullName,
    employeeCode: person.employeeCode || person.assignedCode || "",
    projectId: free ? "" : (ticket.projectId || ""),
    projectName: free ? "Common Works" : (ticket.projectName || ""),
    projectCode: free ? "COMMON" : (ticket.projectCode || ""),
    workDetails: ticket.progressNote || ticket.details || ticket.title,
    status: "completed",
    ...when,
    completedDate: when.createdDate,
    completedTime: when.createdTime,
    source: "common",
    commonWorkId: ticket.id,
  });
  await saveRow(paths.tickets, ticket.id, {
    status: "completed",
    reportId: report.key,
    completedAt: when.timestamp,
    completedDate: when.createdDate,
    completedTime: when.createdTime,
    assignedTo: person.id,
    assignedName: person.fullName,
    assignedCode: person.employeeCode || "",
  });
  return report.key;
}

export async function submitWork(employee, project, workDetails, status) {
  const when = stamp();
  await addRow(paths.reports, {
    employeeId: employee.id,
    employeeName: employee.fullName,
    employeeCode: employee.employeeCode,
    projectId: project.id,
    projectName: project.name,
    projectCode: project.code,
    workDetails,
    status,
    ...when,
    completedDate: status === "completed" ? when.createdDate : "",
    completedTime: status === "completed" ? when.createdTime : "",
    source: "normal",
    commonWorkId: "",
  });
}
