# AgentPlatypus

Static site: marketing landing page plus a workspace for colleges, tasks, and projects. Records live in [Firebase Realtime Database](https://agentplatypus-63aec-default-rtdb.firebaseio.com/).

Open `index.html` for the landing page. Sign in at `login.html`. Admin lands on `admin.html`. An employee lands on `employee.html`.

```
index.html
login.html
forgot.html
register.html
setup.html
admin.html
admin-dashboard.html
admin-track.html
admin-feed.html
admin-projects.html
admin-employees.html
admin-admins.html
admin-assignments.html
admin-reports.html
admin-history.html
admin-profile.html
employee.html
employee-dashboard.html
employee-work.html
employee-history.html
employee-profile.html
css/  js/  brand/
```

## GitHub Pages

The site has no build step. Relative links work at the domain root and under a project path such as `https://<user>.github.io/agentplatypus/`.

1. Push this folder to a GitHub repository.
2. In the repository, open Settings → Pages.
3. Deploy from the branch you push, folder `/` (root).
4. Wait until the Pages URL is live, then open it. The workspace writes to the same Firebase database from that URL.

`.nojekyll` is included so GitHub Pages serves the folders as they are.

## Database

The web app uses the Firebase web config in `js/db.js`. That api key is a client key; it identifies the project. It is not a server secret.

Paths:

- `admins`
- `employees`
- `projects`
- `assignments`
- `reports`
- `tickets`

The live database currently allows public reads and writes, which is why the static site can save without a login. Anyone who can open the site can change the board. Before you store real customer data, tighten the rules in the Firebase console (Realtime Database → Rules). A scoped copy is in `database.rules.json`. Those rules still allow public edits of `board`, and they reject records that do not match the app’s shape. Sign-in is not wired up yet.

## Local preview

From this folder:

```bash
python -m http.server 5500
```

Then open `http://localhost:5500`.
