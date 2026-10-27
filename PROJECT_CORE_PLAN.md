
This is the product plan taken from the current app. Rebuild it on any stack. Keep the rules below. The technology (database, auth, frontend) can change.

Product name: **Profit Traders Developers Connect (PTDC)**  
Purpose: assign work, track tickets, and keep a permanent history of who did each job.

Two kinds of people sign in:

- **Admin** manages people, projects, tickets, and watches everyone’s progress.
- **Employee** sees only the work they are allowed to do, submits it, and keeps their own history.

There is one shared login. After sign-in, the account type decides the app they enter.

---

## 1. Screens

### Public

| Screen | What it does |
| --- | --- |
| Login | Email + password. Admin goes to the admin app. Employee goes to the employee app. Unknown account is signed out. |
| Forgot password | Sends a reset link to the email. |
| Employee registration | Public signup: name, employee code, mobile, email, department, designation, password. Creates an employee login. |
| First-admin setup | Only if zero admins exist. Creates the first admin, then enters the admin app. |

### Admin app

The phone tab bar and the side menu both open **Common Works first**.

| Screen | What it does |
| --- | --- |
| Common Works | Ticket board. Default page after login. |
| Dashboard | Counts and charts: employees, projects, today’s reports, pending, completed, monthly. |
| All Track | Card view of every admin’s own tickets and every employee job. Admin only. |
| Work Feed | Pending, completed, and all submitted work as a feed. |
| Projects | Create, edit, delete projects. |
| Employees | Create, edit, delete logins. Promote an employee to admin. |
| Manage Admins | Create, edit, delete admin logins. The last admin cannot be deleted. |
| Assignments | Attach an employee to a project. |
| Reports | Filter today’s, yesterday’s, or all reports. Export Excel. No delete. |
| Work History | Full history. No delete. Survives account edits and account removal. |
| Profile | Signed-in admin can change their own password. |

Phone tabs: **Common**, Track, Home, Feed, More.  
More opens the rest of the side menu.

### Employee app

**Common Works** is the first tab and the page after login.

| Screen | What it does |
| --- | --- |
| Common Works | Open tickets, my progress, completed. |
| Dashboard | Own counts, assigned projects, a few open common tickets. |
| My Work | Pick an assigned project and submit work. Finished common tickets are listed here too. |
| Work History | Own reports, filter by month, year, project, status. Includes common work. |
| Profile | Own details and password change. |

Phone tabs: **Common**, Home, My Work, History, Profile.

### Layout rules

- Phone layout behaves like an app: no sideways page scroll, full-width controls, 16px inputs, bottom tab bar, content padded above the tab bar.
- Wide tables become stacked cards on a small screen, with a label on each field.
- Light and dark theme, remembered on the device.

---

## 2. Main flows

### 2.1 Sign in

1. Person enters email and password.
2. If that user id is an admin, open the admin app.
3. Else if that user id is an employee, open the employee app.
4. Else sign them out and say the account is not recognized.
5. Logout returns to login. Session ends with the browser session.

### 2.2 Projects

Admin creates a project:

- Name (required)
- Code (required)
- Client
- Status: Active, Completed, Hold
- Start date, end date
- Description

Admin can edit or delete a project record. Deleting a project must **not** delete work reports. Reports keep the project name and code that were saved on the report.

### 2.3 Employees

Admin can create an employee (name, employee code, email, mobile, department, designation, password).

Admin can edit profile fields. Email stays the login email. Password for another person is a reset email. The signed-in admin can type a new password for themselves.

**Delete employee**

- Remove the employee profile and their current project assignments.
- Release any open or in-progress common ticket that was on them, so someone else can take it.
- Do **not** delete reports, projects, or completed common tickets.
- Work History still shows their name, employee code, project, and work text.
- Mark those rows “Account removed”.

**Make admin**

- Same login, same email, same password.
- Add an admin profile for that user.
- Remove the employee profile and active assignments.
- Keep every past report.

If an email was an employee, the profile was deleted, and the login still exists: creating an admin with that email must reuse that login. Ask for the current password, then save the admin profile on the same user. If the password is forgotten, send a reset email first.

### 2.4 Admins

- Create many admins: name, role, email, mobile, password.
- Edit name, role, mobile. Own password can be changed in the form. Another admin gets a reset email.
- Delete any admin except when only one admin remains.
- Deleting yourself signs you out.
- Do not delete work history when an admin is removed.

### 2.5 Assign a project

Admin picks an employee, a project, and a date. One employee cannot be assigned twice to the same project. Removing an assignment does not delete reports.

An employee only sees projects they are assigned to. They submit normal work only on those projects.

### 2.6 Normal work (employee)

1. Employee opens My Work and picks an assigned project.
2. They write the work details.
3. They submit as **Pending** or **Completed**.
4. The system stores a report with the employee name, employee code, project name, project code, text, date, time, and status.
5. The report appears in the employee’s history and in the admin feed, reports, work history, and All Track.

A report is a snapshot. Later edits to the person’s name do not rewrite old reports.

### 2.7 Common Works tickets

A common ticket is shared work. It is not the same as a normal project report until someone finishes it.

**Create (admin)**

- Title and details are required.
- Priority: Normal, High, Urgent.
- Type:
  - **Free ticket** — not linked to a project. If nobody is assigned, every employee can see it.
  - **Based on a project** — pick a project. Only employees already assigned to that project can see it.
- Optional **I will do this**. The admin tags the ticket to themselves.

**Who can see an open ticket**

| Ticket | Who sees it |
| --- | --- |
| Free, unassigned | Every employee |
| Project, unassigned | Only employees assigned to that project |
| Assigned to one employee | Only that employee |
| Tagged to an admin | No employee. Every admin can monitor it. |

The admin board shows names on a project ticket: “Only Ashok, Kavi”. If nobody is on that project yet, the ticket stays on the admin board until someone is assigned to the project.

**Assign**

- Drag the ticket onto an employee, or use Assign.
- A project ticket can only go to people assigned to that project.
- Dropping it back to the open column clears the person.
- Assign to “everyone” / “people on this project” makes it open again.

**Employee actions**

- **Add to my progress** takes an open ticket. Two people cannot take the same ticket. The second person is told it was taken.
- On their progress list they can save a progress note, mark completed, or release it.
- Release puts a free ticket back for everyone, or a project ticket back for people on that project.

**Admin self-work**

- The admin’s column is “My work”.
- They save a progress note. Other admins see that note and cannot edit it.
- They can mark it completed or release it to employees.
- Only the admin who created a ticket can delete it. Other admins can still assign, edit, and reopen it.
- Completed self-work stays visible to every admin.

**When an employee completes a common ticket**

Store it like normal work:

- A report is written for that employee.
- It shows in My Work and Work History.
- Free ticket report uses a common marker (not a real project).
- Project ticket report uses the real project id, name, and code, and is still marked as common work.
- The ticket stores the report id so it is not saved twice.

**Ticket status**

`open` → `progress` → `completed`  
Reopen goes back to `progress` if someone is still on it, otherwise `open`.

Priority sort: Urgent, then High, then Normal, then newest.

### 2.8 All Track (admin only)

Two tabs:

- **Admin works** — every ticket an admin tagged to themselves, any status.
- **Employee works** — employee reports, plus common tickets that are not finished and not an admin’s own work.

Each card shows:

- Status
- Priority, if any
- Title and details
- Who is doing it or who finished it
- Created date and time
- Completed date and time, or “Not completed yet”
- Project or “Free ticket”
- Progress note, if any

Filters:

- Search name, title, project, or note
- Status: All, Open, In progress, Pending, Completed
- From date and To date (match created date or completed date)
- Clear resets all three

Cards must stay normal width for every status. Do not reuse a UI library class named `progress` on the card.

### 2.9 Reports, feed, and history

- Feed: pending, completed, or all reports.
- Reports: filter by today, yesterday, all, employee, project, date, status. Download Excel. No delete button.
- Admin Work History: every report, searchable. No delete button. If the employee account is gone, still show the saved name and mark “Account removed”.
- Employee history: only that employee’s reports, with month, year, project (including Common Works), and status.

---

## 3. Rules that must not change

1. At least one admin account always remains.
2. Only the admin who created a common ticket can delete that ticket.
3. Deleting a person never deletes their past work, the project name on that work, or who did it.
4. Old reports store the name and project at the time of the work. Do not rewrite them when a profile or project is edited later.
5. A project common ticket is visible only to employees assigned to that project, until one of them takes it or an admin assigns it to one of them.
6. An admin’s self-tagged ticket is hidden from employees and visible to all admins.
7. Two employees cannot take the same open ticket.
8. Common work that an employee finishes is stored on that employee’s My Work list and Work History.
9. All Track is admin-only.
10. Common Works is the first screen for both admin and employee.

---

## 4. Data to store

Use any database. These are the records and the fields the product needs. Copy names onto the report so history survives deletes.

### Admin

`id, fullName, role, email, mobile, createdAt, createdBy`

### Employee

`id, fullName, employeeCode, email, mobile, department, designation, createdAt`

### Project

`id, name, code, clientName, status (Active|Completed|Hold), startDate, endDate, description, createdAt, updatedAt`

### Assignment

`id, employeeId, employeeName, employeeCode, projectId, projectName, assignedDate, createdAt`

Unique pair: one employee + one project.

### Report (permanent work record)

`id, employeeId, employeeName, employeeCode, projectId, projectName, projectCode, workDetails, status (pending|completed), createdDate, createdTime, completedDate, completedTime, month, year, timestamp, source (normal|common), commonWorkId`

`employeeName`, `employeeCode`, `projectName`, and `projectCode` are copies. Never delete this record from the product UI.

### Common ticket

`id, title, details, priority (Normal|High|Urgent), ticketType (free|project), projectId, projectName, projectCode, status (open|progress|completed), assignedTo, assignedName, assignedCode, selfTag (true|false), selfAdminId, progressNote, createdAt, createdDate, createdBy, createdByName, assignedAt, takenAt, completedAt, completedDate, completedTime, updatedAt, reportId`

Empty assignee is an empty value, not a missing record wipe. `reportId` is set after the completion report is written.

---

## 5. Suggested build order

Build in this order so each step can be tested alone.

1. Auth, roles, login routing, logout, password reset.
2. Admin and employee profiles. Last-admin protection.
3. Projects and assignments.
4. Employee normal work submit, then admin feed and reports.
5. Permanent work history that ignores later profile edits and deletions.
6. Common tickets: free, project-limited, take, note, complete, release.
7. Completion of a common ticket writes a report.
8. Admin self-tag, progress visible to other admins, creator-only delete.
9. All Track with search, status filter, and date filter.
10. Promote employee to admin. Recreate a removed employee email as an admin on the same login.
11. Phone layout: bottom tabs, Common Works first, stacked tables, no horizontal page scroll.
12. Excel export of reports.

---

## 6. What to improve in the new stack

The current app is static pages talking to a public database. The new stack should do these on the server:

- Enforce “last admin cannot be deleted”.
- Enforce “only the creator can delete a common ticket”.
- Enforce who can read a project ticket.
- Delete or disable the login itself when an account is removed, while keeping reports.
- Let an admin set another person’s password without knowing the old one.
- Stop writing secrets into the frontend.

Do not change the user-facing rules in section 3 when you do that.
