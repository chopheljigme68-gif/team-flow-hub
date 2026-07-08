# Team Flow Hub — full stack, multi-workspace, projects, roles, attachments

A real, deployable task board with proper hierarchy: **workspaces** contain
**projects**, and every task lives inside a project. Three roles —
**Admin**, **Lead**, **Member** — control who can create work and who can
only see what's assigned to them. Every boundary below is enforced by the
server, not just hidden in the UI, and was tested live before being shipped.

## What's new in this round (client feedback)

- **Fixed the real session bug behind several reports** — "admin can't
  assign team lead," "refreshing sends me to a check-again page," and
  "analytics isn't working" all traced back to the same root cause: on
  page refresh, the workspace/project contexts were briefly resolving to
  "nothing here" *before* the login session had actually finished loading,
  because they used a bare `!user` check instead of also waiting on auth's
  own loading state. Fixed in both `WorkspaceContext` and `ProjectContext`.
- **Milestone tab** — exactly one per project (a real DB unique constraint,
  not just app logic), editable by admin/lead, viewable by everyone.
- **Project deadline** at creation, and **mark project complete** (admin/lead) —
  moves it to Project History in the switcher. Nothing is deleted; tasks,
  files, comments, and the milestone all stay exactly where they are.
- **Bulk add got smarter**: paste lines like `Leo: 9:00 AM - Meeting with
  Director` and it's assigned to Leo automatically (matched by name or
  initials); indent a line underneath to make it a checklist item instead
  of a new task — matches how the source activity logs are actually
  structured. A live preview shows exactly what will be created before
  you confirm.
- **"2 days left" reminders** — a scheduler checks hourly for tasks due in
  exactly 2 days and pushes a realtime notification to the assignee, once
  per task (tracked so it never repeats, and resets if the due date changes).
- **Post/designation captured at signup** (e.g. "Product Designer") and
  used as your starting title when you're added to the workspace, instead
  of a generic "Team member" default — still editable afterwards.
- **Multiple links at once** — a "Paste multiple" toggle on the Links
  section accepts one per line (`Label | https://...` or a bare URL).
- **Removed workspace creation from the UI** — there's one workspace;
  the switcher no longer offers to add more.
- **Team Lead is now impossible to miss** — a dedicated banner at the top
  of the Team page names the current Admin and Lead, not just a small
  crown icon on an avatar.
- **Profile photo upload is now visibly discoverable** — a persistent small
  pencil badge on your avatar in the sidebar, not just a hover-only overlay.

- **Optional time-of-day on tasks.** Built to match real activity-log
  formats where entries are like "9:00 AM — Meeting with Director," not
  just a due date. Shows as a chip on task cards, sorts the board and
  calendar chronologically within a day.
- **Bulk add.** A "Bulk add" button next to "New task" (admin/lead only)
  opens a paste-a-list box — one line per task, same assignee/due date for
  all of them. A leading time like `9:00 AM -` or `2:30 PM` on any line is
  automatically pulled into that task's time field and stripped from the
  title. Built for pasting a whole day's worth of a written log in one go
  instead of opening the task dialog once per line.

- **Comments, with replies.** A flat, chronological thread on every task —
  the admin/lead writes an instruction, the assignee replies in the same
  thread. No nested reply UI to learn; it reads like a chat. Same access
  rule as everything else: a member can only comment on their own tasks.
  Posting one fires a realtime notification to "the other side" of the
  conversation.
- **Links, alongside file attachments.** Add a labeled URL to any task you
  can already edit — a Google Doc, a GitHub PR, a reference page — without
  needing to upload anything. Validated server-side (must be a real
  `http(s)://` URL; `javascript:` and other unsafe schemes are rejected).
- **Post/designation, separate from role.** Each person's **post** (e.g.
  "Chief Program Officer") is independent of their **role**
  (Admin/Lead/Member) and editable by the person themselves or by the
  admin, with common job-title suggestions via autocomplete.
- **New accounts no longer create a workspace.** Registering just creates
  an account; a "platform admin" concept (set via an env var, no manual DB
  work) is the only one who can stand up a new workspace. Everyone else
  waits to be invited, with a clear "you're not on a workspace yet" screen
  instead of a confusing self-service setup step.
- **Profile photos.** Real faces instead of colored initials, everywhere —
  task cards, comments, the team roster. Click your own avatar in the
  sidebar to change it.
- **Project-level Files.** Beyond per-task attachments (already there),
  there's now a dedicated Files area per project for shared reference
  material — visible to everyone on the project, uploaded only by admin/lead.

*(An earlier pass explored ministry-specific naming/suggestions for a
civil-service deployment; that's been reverted back to plain, generic
"workspace" language per feedback — the app makes no assumptions about the
kind of organization using it.)*

## Previously shipped

- **Admin can remove someone from the team.** Their task history is kept
  (nothing silently deletes), but they lose access to the workspace
  immediately and get a realtime notification. Blocked from removing
  yourself, and blocked from removing the workspace's last remaining admin.
- **Photos and files on tasks.** Upload images or documents (20MB limit,
  common types only) to any task you can already edit. Members can attach
  files to their own tasks; admin/lead to any task. Access to view/download
  a file follows the exact same rule as the task itself — a member can't
  fetch a file from a teammate's task even with a direct link.
- **"Active workload" on the Team page now actually reflects reality.** It
  used to only count tasks in whichever project you had open, which made it
  look broken the moment a team had more than one project. It's now a
  dedicated, admin/lead-only endpoint that sums a person's workload across
  every project in the workspace.
- **Removed the Dashboard's "Team lead alerts" panel** per request. The
  Analytics page's own overdue list and workload-balance view are untouched
  — those are a separate, project-scoped feature.

## Roles

| Role | Can do |
|---|---|
| **Admin** | Everything. Assigns the Lead, promotes/demotes/removes anyone, creates projects, creates/assigns/edits/deletes tasks, sees all analytics. Exactly one admin minimum per workspace. |
| **Lead** | Same task/project powers as Admin (create projects, create and assign tasks, see analytics, upload files to any task) but can't change anyone's role or remove them. Only one Lead per workspace at a time. |
| **Member** | Sees **only tasks assigned to them**, enforced in the SQL query. Can drag their own cards, tick their own checklist, and attach photos/files to their own tasks. Cannot create tasks, reassign anything, edit task details, remove teammates, or see analytics/workload. |

## What's real here — verified, not assumed

- **File upload**: uploaded a real PNG as a Member to their own task, downloaded
  it back, diffed the bytes — identical. A different Member was blocked
  (`403`) from even listing that task's attachments; the Lead could see and
  download it without restriction.
- **Member removal**: a non-admin got `403` trying to remove someone. The
  admin got blocked trying to remove themselves, and again trying to remove
  the last admin. A real removal succeeded, the removed person's workspace
  list went to empty immediately, and they received a realtime notification.
- **Workload endpoint**: confirmed the numbers returned match a hand-count
  of that person's tasks across both seeded projects combined, and that a
  Member gets `403` requesting it.
- **Migration**: simulated an existing pre-projects, pre-roles database, ran
  today's schema on top of it, and confirmed roles and a "General" project
  backfilled correctly — nothing is lost when you upgrade.
- **Comments**: a Lead's comment and the assignee's reply both landed in the
  same thread; a different Member got `403` trying to comment on a task
  that wasn't theirs; both sides received a realtime notification.
- **Post/designation editing**: a Member editing their own post succeeded; a
  different Member editing *someone else's* post got `403`; the admin
  editing anyone's succeeded.
- **New-user experience**: registered a fresh account with `PLATFORM_ADMIN_EMAILS`
  unset for it — confirmed `isPlatformAdmin: false` and an empty workspace
  list, which is exactly the state the frontend's "you're not on a
  workspace yet" screen (no create option) is built to handle.
- **Project documents**: a Member was blocked (`403`) from uploading, but
  could view and byte-for-byte download a document an admin uploaded —
  confirmed reference material is visible to the whole team, not gated
  like task attachments are.
- **Avatars**: uploaded a real JPEG, fetched it back as a different user,
  diffed the bytes — identical.

## Logo

The uploaded Bhutanese Kitchen Initiative mark has been background-removed
(transparent PNG) and is used as the real app icon — sidebar, all auth
screens, and the browser favicon. Source files: `frontend/public/logo.png`
and `favicon.png`.

## Requirements

- Node.js 18+
- A Postgres database (Supabase or local)

## Quick start (Supabase)

1. Connection string: **Project Settings → Database → Connection string**.
   If the direct connection times out (common — it's IPv6-only), use the
   **Session pooler** string instead.
2. Backend:
   ```bash
   cd backend
   cp .env.example .env
   # paste DATABASE_URL, set PGSSL=true, set a real JWT_SECRET,
   # set PLATFORM_ADMIN_EMAILS to your own email (comma-separated for more than one)
   npm install
   npm run migrate   # idempotent — safe on a fresh DB or an existing one
   npm run seed        # demo workspace + 2 projects + roles (no-ops if data exists)
   npm run dev
   ```
3. Frontend:
   ```bash
   cd frontend
   cp .env.example .env
   npm install
   npm run dev
   ```
4. Open `http://localhost:5173`.

## Quick start (local Postgres)

```bash
createdb team_flow_hub
cd backend
cp .env.example .env
# DATABASE_URL=postgresql://postgres:postgres@localhost:5432/team_flow_hub, PGSSL=false
npm install && npm run migrate && npm run seed && npm run dev
```

### Demo logins

Workspace **Product Studio**, password `password123` for everyone:

| Email | Name | Post | Role |
|---|---|---|---|
| daniel@flowhub.dev | Daniel Cho | Founder | **Admin** (also `PLATFORM_ADMIN_EMAILS` default) |
| priya@flowhub.dev | Priya Nair | Product Designer | **Lead** |
| leo@flowhub.dev | Leo Marchetti | Frontend Engineer | Member |
| sena@flowhub.dev | Sena Osei | Backend Engineer | Member |
| astrid@flowhub.dev | Astrid Voss | QA Engineer | Member |
| ravi@flowhub.dev | Ravi Kapoor | Founding Engineer | Member |

Two seeded projects: **Website Relaunch** and **Mobile App v2**.

### Trying the new features yourself

1. Register a brand-new account (an email *not* in `PLATFORM_ADMIN_EMAILS`) —
   you'll land on "you're not on a workspace yet" with no create option.
2. Log in as `daniel@flowhub.dev` (the platform admin) and create a second
   workspace from the switcher.
3. Open any task and try the Comments box as the assignee vs. as the lead —
   post as one, watch the notification bell light up for the other.
4. On the same task, add a **Link** (any `https://` URL) — try it as a
   Member on their own task vs. someone else's.
5. On the Team page, click the pencil next to your own post/designation and
   change it — then try editing someone else's (blocked unless you're admin).
6. Click your own avatar in the sidebar to upload a real photo — watch it
   replace your initials everywhere, including on task cards.
7. Open the new **Files** tab for a project and upload a document as admin —
   then log in as a Member and confirm you can view/download it but not
   delete it.
8. Still on Files, try a task's own **attachments** (in the task dialog) as
   a Member on their own task vs. someone else's — the "Add photo or file"
   button only appears where you're allowed to use it.
9. With more than one project in a workspace, check the Team page's "Active
   workload" chart — it totals correctly across all of them, not just
   whichever project happens to be open.

## Project layout

```
backend/
  db/schema.sql             workspaces, roles, projects, tasks, attachments,
                              comments, project documents, platform admin,
                              notifications, password resets (+ backfill logic)
  uploads/                  uploaded files live here on disk (gitignored):
                              tasks/, projects/, avatars/ subfolders
  src/
    db.js                      every query — attachment/comment/document CRUD,
                                 workspace-wide workload, member removal, and
                                 the PLATFORM_ADMIN_EMAILS bootstrap all live here
    utils/upload.js              multer config: task/project/avatar uploaders,
                                   size limits + extension whitelist per type
    middleware/workspace.js      requireWorkspaceMember, requireRole,
                                   requireProjectInWorkspace, requirePlatformAdmin
    routes/
      auth.routes.js               register/login/me (+ platform admin bootstrap)
      users.routes.js               avatar upload/serving
      workspaces.routes.js         members/invite/role/title/removal/workload,
                                     workspace creation gated to platform admins
      projects.routes.js            list/create/delete + project-level documents
      tasks.routes.js                 tasks + nested attachments and comments,
                                        all permission-checked per request
      analytics.routes.js             project-scoped, admin/lead only
frontend/
  public/logo.png, favicon.png   background-removed logo
  src/
    context/  Auth, Theme, Workspace, Project
    App.jsx     dashboard/board/team/files/calendar/analytics, workspace +
                 project switchers, comments, avatar uploader, editable posts,
                 role-aware controls throughout
```

## Deploying

Set in production: `DATABASE_URL` / `PGSSL=true`, `JWT_SECRET`,
`CORS_ORIGIN`, `APP_URL`, `PLATFORM_ADMIN_EMAILS`, and SMTP vars for real
password-reset email delivery. Run `npm run migrate && npm run seed` once
against production. `backend/uploads/` needs to persist across
deploys/restarts — if you deploy somewhere with an ephemeral filesystem
(e.g. most serverless hosts), mount a persistent volume there or swap
`utils/upload.js` for S3/R2 storage.

## ⚠️ Still open: enable Row Level Security on Supabase

Unrelated to this update but still outstanding — Supabase exposes every
`public` table via its auto-generated REST API to anyone with the project's
anon key, regardless of this app's own auth. Since this backend connects as
the Postgres owner (which bypasses RLS), turning RLS on with no permissive
policies closes that hole without breaking anything here:

```sql
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subtasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_resets ENABLE ROW LEVEL SECURITY;
```

