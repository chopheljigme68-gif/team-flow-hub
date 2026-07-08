const { pool } = require("./pool");

/* ==================== users ==================== */

const USER_COLUMNS = `id, name, email, password_hash AS "passwordHash", color, initials,
  is_platform_admin AS "isPlatformAdmin", avatar_path AS "avatarPath", default_title AS "defaultTitle", created_at AS "createdAt"`;

async function getUserById(id) {
  const { rows } = await pool.query(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [id]);
  return rows[0] || null;
}

async function getUserByEmail(email) {
  const { rows } = await pool.query(`SELECT ${USER_COLUMNS} FROM users WHERE lower(email) = lower($1)`, [email]);
  return rows[0] || null;
}

const PALETTE = ["#E8A33D", "#6E9BFF", "#4FD1C5", "#E8615B", "#B48CFF", "#8FD16B", "#F0A6CA", "#7FD0E8"];
const initials = (name) => name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();

async function createUser({ name, email, passwordHash, defaultTitle }) {
  const { rows: countRows } = await pool.query("SELECT count(*)::int AS n FROM users");
  const color = PALETTE[countRows[0].n % PALETTE.length];
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, color, initials, default_title)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${USER_COLUMNS}`,
    [name, email, passwordHash, color, initials(name), defaultTitle || null]
  );
  return rows[0];
}

async function updateUserPassword(userId, passwordHash) {
  await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [passwordHash, userId]);
}

// Self-healing bootstrap: if this user's email is in PLATFORM_ADMIN_EMAILS,
// make sure they're flagged as a platform admin. Cheap to call on every
// login — an ops person can grant/verify admin access just by editing an
// env var and having that person log in again, no manual DB work needed.
async function ensurePlatformAdminFromEnv(user) {
  const allowlist = (process.env.PLATFORM_ADMIN_EMAILS || "")
    .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (allowlist.includes(user.email.toLowerCase()) && !user.isPlatformAdmin) {
    await pool.query("UPDATE users SET is_platform_admin = true WHERE id = $1", [user.id]);
    return { ...user, isPlatformAdmin: true };
  }
  return user;
}

async function updateUserAvatar(userId, avatarPath) {
  const { rows } = await pool.query(`UPDATE users SET avatar_path = $1 WHERE id = $2 RETURNING ${USER_COLUMNS}`, [avatarPath, userId]);
  return rows[0];
}

/* ==================== password resets ==================== */

async function createPasswordReset({ userId, tokenHash, expiresAt }) {
  await pool.query(
    "INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
    [userId, tokenHash, expiresAt]
  );
}

async function getValidPasswordReset(tokenHash) {
  const { rows } = await pool.query(
    `SELECT id, user_id AS "userId", expires_at AS "expiresAt", used
     FROM password_resets WHERE token_hash = $1 AND used = false AND expires_at > now()`,
    [tokenHash]
  );
  return rows[0] || null;
}

async function consumePasswordReset(id) {
  await pool.query("UPDATE password_resets SET used = true WHERE id = $1", [id]);
}

/* ==================== workspaces ==================== */

const slugify = (name) =>
  name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40);

async function getWorkspacesForUser(userId) {
  const { rows } = await pool.query(
    `SELECT w.id, w.name, w.slug, w.created_at AS "createdAt",
            wm.title, wm.role,
            (SELECT count(*)::int FROM workspace_members m2 WHERE m2.workspace_id = w.id) AS "memberCount",
            (SELECT count(*)::int FROM tasks t WHERE t.workspace_id = w.id) AS "taskCount",
            (SELECT count(*)::int FROM projects p WHERE p.workspace_id = w.id) AS "projectCount"
     FROM workspaces w
     JOIN workspace_members wm ON wm.workspace_id = w.id
     WHERE wm.user_id = $1
     ORDER BY w.created_at ASC`,
    [userId]
  );
  return rows;
}

async function getWorkspaceById(id) {
  const { rows } = await pool.query(`SELECT id, name, slug, created_by AS "createdBy", created_at AS "createdAt" FROM workspaces WHERE id = $1`, [id]);
  return rows[0] || null;
}

async function createWorkspace({ name, createdBy }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const base = slugify(name) || "workspace";
    let slug = base;
    let n = 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { rows: existing } = await client.query("SELECT 1 FROM workspaces WHERE slug = $1", [slug]);
      if (existing.length === 0) break;
      n += 1;
      slug = `${base}-${n}`;
    }
    const { rows } = await client.query(
      "INSERT INTO workspaces (name, slug, created_by) VALUES ($1, $2, $3) RETURNING id",
      [name, slug, createdBy]
    );
    const workspaceId = rows[0].id;
    await client.query(
      "INSERT INTO workspace_members (workspace_id, user_id, title, role) VALUES ($1, $2, 'Workspace Admin', 'admin')",
      [workspaceId, createdBy]
    );
    await client.query("COMMIT");
    return workspaceId;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function getMembership(workspaceId, userId) {
  const { rows } = await pool.query(
    `SELECT id, title, role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
    [workspaceId, userId]
  );
  return rows[0] || null;
}

async function getWorkspaceMembers(workspaceId) {
  const { rows } = await pool.query(
    `SELECT u.id, u.name, u.email, u.color, u.initials,
            CASE WHEN u.avatar_path IS NOT NULL THEN '/api/users/' || u.id || '/avatar' ELSE NULL END AS "avatarUrl",
            wm.title, wm.role
     FROM workspace_members wm
     JOIN users u ON u.id = wm.user_id
     WHERE wm.workspace_id = $1
     ORDER BY (wm.role = 'admin') DESC, (wm.role = 'lead') DESC, wm.joined_at ASC`,
    [workspaceId]
  );
  return rows;
}

async function countAdmins(workspaceId) {
  const { rows } = await pool.query(
    "SELECT count(*)::int AS n FROM workspace_members WHERE workspace_id = $1 AND role = 'admin'",
    [workspaceId]
  );
  return rows[0].n;
}

async function addWorkspaceMember({ workspaceId, userId, title }) {
  const { rows } = await pool.query(
    `INSERT INTO workspace_members (workspace_id, user_id, title)
     VALUES ($1, $2, COALESCE($3, 'Team member'))
     ON CONFLICT (workspace_id, user_id) DO NOTHING
     RETURNING id`,
    [workspaceId, userId, title]
  );
  return rows[0] || null;
}

async function updateMemberTitle(workspaceId, userId, title) {
  await pool.query("UPDATE workspace_members SET title = $1 WHERE workspace_id = $2 AND user_id = $3", [title, workspaceId, userId]);
}

async function setMemberRole(workspaceId, userId, role) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (role === "lead") {
      // only one lead at a time — demote whoever currently holds it
      await client.query("UPDATE workspace_members SET role = 'member' WHERE workspace_id = $1 AND role = 'lead'", [workspaceId]);
    }
    await client.query("UPDATE workspace_members SET role = $3 WHERE workspace_id = $1 AND user_id = $2", [workspaceId, userId, role]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/* ==================== invites ==================== */

async function createInvite({ workspaceId, email, invitedBy }) {
  const { rows } = await pool.query(
    `INSERT INTO workspace_invites (workspace_id, email, invited_by)
     VALUES ($1, lower($2), $3)
     ON CONFLICT (workspace_id, email) DO UPDATE SET invited_by = EXCLUDED.invited_by
     RETURNING id, workspace_id AS "workspaceId", email`,
    [workspaceId, email, invitedBy]
  );
  return rows[0];
}

async function getPendingInvitesForEmail(email) {
  const { rows } = await pool.query(
    `SELECT id, workspace_id AS "workspaceId", email FROM workspace_invites
     WHERE lower(email) = lower($1) AND accepted_at IS NULL`,
    [email]
  );
  return rows;
}

async function acceptInvite(inviteId, userId) {
  const { rows } = await pool.query(
    `UPDATE workspace_invites SET accepted_at = now() WHERE id = $1 RETURNING workspace_id AS "workspaceId"`,
    [inviteId]
  );
  const invite = rows[0];
  if (invite) {
    const user = await getUserById(userId);
    await addWorkspaceMember({ workspaceId: invite.workspaceId, userId, title: user?.defaultTitle || null });
  }
  return invite;
}

/* ==================== projects ==================== */

async function getProjectsForWorkspace(workspaceId) {
  const { rows } = await pool.query(
    `SELECT p.id, p.name, p.description, to_char(p.deadline, 'YYYY-MM-DD') AS deadline,
            p.completed_at AS "completedAt", p.completed_by AS "completedBy",
            p.created_by AS "createdBy", p.created_at AS "createdAt",
            (SELECT count(*)::int FROM tasks t WHERE t.project_id = p.id) AS "taskCount",
            (SELECT count(*)::int FROM tasks t WHERE t.project_id = p.id AND t.status = 'done') AS "doneCount"
     FROM projects p WHERE p.workspace_id = $1 ORDER BY p.created_at ASC`,
    [workspaceId]
  );
  return rows;
}

async function getProjectById(id) {
  const { rows } = await pool.query(
    `SELECT id, workspace_id AS "workspaceId", name, description, to_char(deadline, 'YYYY-MM-DD') AS deadline,
            completed_at AS "completedAt", completed_by AS "completedBy",
            created_by AS "createdBy", created_at AS "createdAt"
     FROM projects WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function createProject({ workspaceId, name, description, deadline, createdBy }) {
  const { rows } = await pool.query(
    `INSERT INTO projects (workspace_id, name, description, deadline, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, workspace_id AS "workspaceId", name, description, to_char(deadline, 'YYYY-MM-DD') AS deadline,
               completed_at AS "completedAt", created_by AS "createdBy", created_at AS "createdAt"`,
    [workspaceId, name, description || "", deadline || null, createdBy]
  );
  return rows[0];
}

async function deleteProject(id) {
  await pool.query("DELETE FROM projects WHERE id = $1", [id]); // cascades to tasks/subtasks
}

async function setProjectComplete(id, completedBy, isComplete) {
  const { rows } = await pool.query(
    `UPDATE projects SET completed_at = $2, completed_by = $3 WHERE id = $1
     RETURNING id, workspace_id AS "workspaceId", name, description, to_char(deadline, 'YYYY-MM-DD') AS deadline,
               completed_at AS "completedAt", completed_by AS "completedBy", created_by AS "createdBy", created_at AS "createdAt"`,
    [id, isComplete ? new Date() : null, isComplete ? completedBy : null]
  );
  return rows[0];
}

/* ==================== project milestone (exactly one per project) ==================== */

async function getMilestone(projectId) {
  const { rows } = await pool.query(
    `SELECT id, project_id AS "projectId", title, description, to_char(target_date, 'YYYY-MM-DD') AS "targetDate",
            created_by AS "createdBy", updated_at AS "updatedAt"
     FROM project_milestones WHERE project_id = $1`,
    [projectId]
  );
  return rows[0] || null;
}

async function upsertMilestone({ projectId, title, description, targetDate, createdBy }) {
  const { rows } = await pool.query(
    `INSERT INTO project_milestones (project_id, title, description, target_date, created_by, updated_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (project_id) DO UPDATE SET title = $2, description = $3, target_date = $4, updated_at = now()
     RETURNING id, project_id AS "projectId", title, description, to_char(target_date, 'YYYY-MM-DD') AS "targetDate",
               created_by AS "createdBy", updated_at AS "updatedAt"`,
    [projectId, title, description || "", targetDate || null, createdBy]
  );
  return rows[0];
}

async function deleteMilestone(projectId) {
  await pool.query("DELETE FROM project_milestones WHERE project_id = $1", [projectId]);
}

/* ==================== tasks (project-scoped) ==================== */

const TASK_SELECT = `
  SELECT
    t.id, t.title, t.description, t.status, t.priority,
    t.assignee_id AS "assigneeId", t.created_by AS "createdBy",
    t.workspace_id AS "workspaceId", t.project_id AS "projectId",
    to_char(t.due, 'YYYY-MM-DD') AS due,
    to_char(t.due_time, 'HH24:MI') AS "dueTime",
    t.created_at AS "createdAt", t.completed_at AS "completedAt", t.updated_at AS "updatedAt",
    COALESCE(
      json_agg(json_build_object('id', s.id, 'text', s.text, 'done', s.done) ORDER BY s.position)
      FILTER (WHERE s.id IS NOT NULL), '[]'
    ) AS subtasks,
    (SELECT count(*)::int FROM task_attachments a WHERE a.task_id = t.id) AS "attachmentCount"
  FROM tasks t
  LEFT JOIN subtasks s ON s.task_id = t.id
`;

// restrictToUserId: pass a user id to only return tasks assigned to them
// (used for the 'member' role, enforced server-side, not just hidden in the UI).
async function getTasks(projectId, restrictToUserId) {
  const params = [projectId];
  let where = "t.project_id = $1";
  if (restrictToUserId) {
    params.push(restrictToUserId);
    where += ` AND t.assignee_id = $${params.length}`;
  }
  const { rows } = await pool.query(`${TASK_SELECT} WHERE ${where} GROUP BY t.id ORDER BY t.created_at ASC`, params);
  return rows;
}

async function getTaskById(id) {
  const { rows } = await pool.query(`${TASK_SELECT} WHERE t.id = $1 GROUP BY t.id`, [id]);
  return rows[0] || null;
}

async function createTask(data) {
  const client = await pool.connect();
  let taskId;
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `INSERT INTO tasks (title, description, status, priority, assignee_id, created_by, due, due_time, workspace_id, project_id, completed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CASE WHEN $3 = 'done' THEN now() ELSE NULL END)
       RETURNING id`,
      [
        data.title, data.description || "", data.status || "todo", data.priority || "medium",
        data.assigneeId, data.createdBy || null, data.due || null, data.dueTime || null, data.workspaceId, data.projectId,
      ]
    );
    taskId = rows[0].id;
    const subtasks = data.subtasks || [];
    for (let i = 0; i < subtasks.length; i++) {
      await client.query("INSERT INTO subtasks (task_id, text, done, position) VALUES ($1, $2, $3, $4)", [taskId, subtasks[i].text, !!subtasks[i].done, i]);
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return getTaskById(taskId);
}

async function updateTask(id, patch) {
  const before = await getTaskById(id);
  if (!before) return null;

  const fields = [];
  const values = [];
  let i = 1;
  const columnMap = { title: "title", description: "description", status: "status", priority: "priority", assigneeId: "assignee_id", due: "due", dueTime: "due_time" };
  for (const [key, col] of Object.entries(columnMap)) {
    if (patch[key] !== undefined) {
      fields.push(`${col} = $${i++}`);
      values.push(patch[key]);
    }
  }
  if (patch.status && patch.status !== before.status) {
    fields.push(patch.status === "done" ? "completed_at = now()" : "completed_at = NULL");
  }
  if (patch.due !== undefined && patch.due !== before.due) {
    fields.push("due_reminder_sent = false");
  }
  fields.push("updated_at = now()");
  values.push(id);

  await pool.query(`UPDATE tasks SET ${fields.join(", ")} WHERE id = $${i}`, values);
  const task = await getTaskById(id);
  return { task, prevStatus: before.status, prevAssignee: before.assigneeId };
}

async function replaceSubtasks(id, subtasks) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM subtasks WHERE task_id = $1", [id]);
    for (let i = 0; i < subtasks.length; i++) {
      await client.query("INSERT INTO subtasks (task_id, text, done, position) VALUES ($1, $2, $3, $4)", [id, subtasks[i].text, !!subtasks[i].done, i]);
    }
    await client.query("UPDATE tasks SET updated_at = now() WHERE id = $1", [id]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return getTaskById(id);
}

async function deleteTask(id) {
  await pool.query("DELETE FROM tasks WHERE id = $1", [id]);
}

/* ==================== task attachments ==================== */

const ATTACHMENT_SELECT = `
  SELECT a.id, a.task_id AS "taskId", a.uploaded_by AS "uploadedBy", a.file_name AS "fileName",
         a.mime_type AS "mimeType", a.size_bytes AS "sizeBytes", a.created_at AS "createdAt",
         u.name AS "uploaderName"
  FROM task_attachments a
  LEFT JOIN users u ON u.id = a.uploaded_by
`;

async function getAttachmentsForTask(taskId) {
  const { rows } = await pool.query(`${ATTACHMENT_SELECT} WHERE a.task_id = $1 ORDER BY a.created_at ASC`, [taskId]);
  return rows;
}

async function getAttachmentById(id) {
  const { rows } = await pool.query(
    `SELECT id, task_id AS "taskId", uploaded_by AS "uploadedBy", file_name AS "fileName",
            mime_type AS "mimeType", size_bytes AS "sizeBytes", storage_path AS "storagePath", created_at AS "createdAt"
     FROM task_attachments WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function addAttachment({ taskId, uploadedBy, fileName, mimeType, sizeBytes, storagePath }) {
  const { rows } = await pool.query(
    `INSERT INTO task_attachments (task_id, uploaded_by, file_name, mime_type, size_bytes, storage_path)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [taskId, uploadedBy, fileName, mimeType, sizeBytes, storagePath]
  );
  const attachments = await getAttachmentsForTask(taskId);
  return attachments.find((a) => a.id === rows[0].id);
}

async function deleteAttachment(id) {
  const attachment = await getAttachmentById(id);
  if (!attachment) return null;
  await pool.query("DELETE FROM task_attachments WHERE id = $1", [id]);
  return attachment; // caller unlinks the file on disk using storagePath
}

/* ==================== workspace-wide workload (not project-scoped) ==================== */

async function getWorkspaceWorkload(workspaceId) {
  const { rows } = await pool.query(
    `SELECT u.id, u.name, u.color,
            count(t.id) FILTER (WHERE t.status != 'done')::int AS active,
            count(t.id) FILTER (WHERE t.status = 'done')::int AS shipped,
            count(t.id)::int AS total
     FROM workspace_members wm
     JOIN users u ON u.id = wm.user_id
     LEFT JOIN tasks t ON t.assignee_id = u.id AND t.workspace_id = wm.workspace_id
     WHERE wm.workspace_id = $1
     GROUP BY u.id, u.name, u.color
     ORDER BY u.name`,
    [workspaceId]
  );
  return rows;
}

/* ==================== remove member ==================== */

async function removeMember(workspaceId, userId) {
  await pool.query("DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2", [workspaceId, userId]);
}

const NOTIF_SELECT = `SELECT id, user_id AS "userId", type, task_id AS "taskId", task_title AS "taskTitle", workspace_id AS "workspaceId", message, read, created_at AS "createdAt" FROM notifications`;

/* ==================== due-soon reminders ==================== */

// Tasks due in exactly 2 days that haven't been reminded about yet and
// aren't already done. Used by the reminder sweep in index.js.
async function getTasksDueInTwoDays() {
  const { rows } = await pool.query(
    `SELECT t.id, t.title, t.assignee_id AS "assigneeId", t.workspace_id AS "workspaceId", t.project_id AS "projectId"
     FROM tasks t
     WHERE t.status != 'done' AND t.due_reminder_sent = false
       AND t.due = (current_date + interval '2 days')::date`
  );
  return rows;
}

async function markDueReminderSent(taskId) {
  await pool.query("UPDATE tasks SET due_reminder_sent = true WHERE id = $1", [taskId]);
}

/* ==================== notifications ==================== */

async function getNotificationsForUser(userId) {
  const { rows } = await pool.query(`${NOTIF_SELECT} WHERE user_id = $1 ORDER BY created_at DESC LIMIT 200`, [userId]);
  return rows;
}

async function createNotification({ userId, type, taskId, taskTitle, workspaceId, message }) {
  const { rows } = await pool.query(
    `INSERT INTO notifications (user_id, type, task_id, task_title, workspace_id, message)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, user_id AS "userId", type, task_id AS "taskId", task_title AS "taskTitle", workspace_id AS "workspaceId", message, read, created_at AS "createdAt"`,
    [userId, type, taskId || null, taskTitle || null, workspaceId || null, message]
  );
  return rows[0];
}

async function markNotificationRead(id, userId) {
  const { rows } = await pool.query(
    `UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2
     RETURNING id, user_id AS "userId", type, task_id AS "taskId", task_title AS "taskTitle", workspace_id AS "workspaceId", message, read, created_at AS "createdAt"`,
    [id, userId]
  );
  return rows[0] || null;
}

async function markAllRead(userId) {
  await pool.query("UPDATE notifications SET read = true WHERE user_id = $1", [userId]);
}

/* ==================== task comments (flat, chronological) ==================== */

const COMMENT_SELECT = `
  SELECT c.id, c.task_id AS "taskId", c.user_id AS "userId", c.body, c.created_at AS "createdAt",
         u.name AS "userName", u.color AS "userColor", u.initials AS "userInitials",
         CASE WHEN u.avatar_path IS NOT NULL THEN '/api/users/' || u.id || '/avatar' ELSE NULL END AS "userAvatarUrl"
  FROM task_comments c
  LEFT JOIN users u ON u.id = c.user_id
`;

async function getCommentsForTask(taskId) {
  const { rows } = await pool.query(`${COMMENT_SELECT} WHERE c.task_id = $1 ORDER BY c.created_at ASC`, [taskId]);
  return rows;
}

async function addComment({ taskId, userId, body }) {
  const { rows } = await pool.query(
    "INSERT INTO task_comments (task_id, user_id, body) VALUES ($1, $2, $3) RETURNING id",
    [taskId, userId, body]
  );
  const comments = await getCommentsForTask(taskId);
  return comments.find((c) => c.id === rows[0].id);
}

/* ==================== project documents (reference files, not task-specific) ==================== */

const DOCUMENT_SELECT = `
  SELECT d.id, d.project_id AS "projectId", d.uploaded_by AS "uploadedBy", d.file_name AS "fileName",
         d.mime_type AS "mimeType", d.size_bytes AS "sizeBytes", d.created_at AS "createdAt",
         u.name AS "uploaderName"
  FROM project_documents d
  LEFT JOIN users u ON u.id = d.uploaded_by
`;

async function getDocumentsForProject(projectId) {
  const { rows } = await pool.query(`${DOCUMENT_SELECT} WHERE d.project_id = $1 ORDER BY d.created_at DESC`, [projectId]);
  return rows;
}

async function getDocumentById(id) {
  const { rows } = await pool.query(
    `SELECT id, project_id AS "projectId", uploaded_by AS "uploadedBy", file_name AS "fileName",
            mime_type AS "mimeType", size_bytes AS "sizeBytes", storage_path AS "storagePath", created_at AS "createdAt"
     FROM project_documents WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function addDocument({ projectId, uploadedBy, fileName, mimeType, sizeBytes, storagePath }) {
  const { rows } = await pool.query(
    `INSERT INTO project_documents (project_id, uploaded_by, file_name, mime_type, size_bytes, storage_path)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [projectId, uploadedBy, fileName, mimeType, sizeBytes, storagePath]
  );
  const docs = await getDocumentsForProject(projectId);
  return docs.find((d) => d.id === rows[0].id);
}

async function deleteDocument(id) {
  const doc = await getDocumentById(id);
  if (!doc) return null;
  await pool.query("DELETE FROM project_documents WHERE id = $1", [id]);
  return doc;
}

/* ==================== task links (external URLs) ==================== */

const LINK_SELECT = `
  SELECT l.id, l.task_id AS "taskId", l.added_by AS "addedBy", l.label, l.url, l.created_at AS "createdAt",
         u.name AS "adderName"
  FROM task_links l
  LEFT JOIN users u ON u.id = l.added_by
`;

async function getLinksForTask(taskId) {
  const { rows } = await pool.query(`${LINK_SELECT} WHERE l.task_id = $1 ORDER BY l.created_at ASC`, [taskId]);
  return rows;
}

async function addLink({ taskId, addedBy, label, url }) {
  const { rows } = await pool.query(
    "INSERT INTO task_links (task_id, added_by, label, url) VALUES ($1, $2, $3, $4) RETURNING id",
    [taskId, addedBy, label, url]
  );
  const links = await getLinksForTask(taskId);
  return links.find((l) => l.id === rows[0].id);
}

async function getLinkById(id) {
  const { rows } = await pool.query(`SELECT id, task_id AS "taskId" FROM task_links WHERE id = $1`, [id]);
  return rows[0] || null;
}

async function deleteLink(id) {
  await pool.query("DELETE FROM task_links WHERE id = $1", [id]);
}

module.exports = {
  getUserById, getUserByEmail, createUser, updateUserPassword, ensurePlatformAdminFromEnv, updateUserAvatar,
  createPasswordReset, getValidPasswordReset, consumePasswordReset,
  getWorkspacesForUser, getWorkspaceById, createWorkspace,
  getMembership, getWorkspaceMembers, countAdmins, addWorkspaceMember, setMemberRole, updateMemberTitle, removeMember,
  getWorkspaceWorkload,
  createInvite, getPendingInvitesForEmail, acceptInvite,
  getProjectsForWorkspace, getProjectById, createProject, deleteProject, setProjectComplete,
  getMilestone, upsertMilestone, deleteMilestone,
  getTasks, getTaskById, createTask, updateTask, replaceSubtasks, deleteTask,
  getAttachmentsForTask, getAttachmentById, addAttachment, deleteAttachment,
  getCommentsForTask, addComment,
  getLinksForTask, addLink, getLinkById, deleteLink,
  getDocumentsForProject, getDocumentById, addDocument, deleteDocument,
  getTasksDueInTwoDays, markDueReminderSent,
  getNotificationsForUser, createNotification, markNotificationRead, markAllRead,
};
