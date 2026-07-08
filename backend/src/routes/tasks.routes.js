const express = require("express");
const fs = require("fs");
const {
  getTasks, getTaskById, createTask, updateTask, replaceSubtasks, deleteTask, getWorkspaceMembers,
  getAttachmentsForTask, getAttachmentById, addAttachment, deleteAttachment,
  getCommentsForTask, addComment,
  getLinksForTask, addLink, getLinkById, deleteLink,
} = require("../db");
const { authenticate } = require("../auth");
const { requireWorkspaceMember, requireProjectInWorkspace } = require("../middleware/workspace");
const { notify, broadcastTaskChange } = require("../utils/notify");
const { taskUpload } = require("../utils/upload");

const router = express.Router({ mergeParams: true });
router.use(authenticate, requireWorkspaceMember, requireProjectInWorkspace);

const STAGE_LABEL = { todo: "Tasks", done: "Completed" };
const isManager = (req) => req.membership.role === "admin" || req.membership.role === "lead";

// Parses "9:00 AM", "2:30 pm", or "14:30" into a 24-hour "HH:MM" string, or
// null if it doesn't look like a time. Used by bulk-add to pull a leading
// time off a pasted line like "9:00 AM - Meeting with X".
function parseClockTime(raw) {
  const m = raw.trim().match(/^(\d{1,2})[:.](\d{2})\s*(AM|PM|am|pm)?$/);
  if (!m) return null;
  let hours = parseInt(m[1], 10);
  const minutes = parseInt(m[2], 10);
  const meridiem = m[3]?.toUpperCase();
  if (hours > 23 || minutes > 59) return null;
  if (meridiem === "PM" && hours < 12) hours += 12;
  if (meridiem === "AM" && hours === 12) hours = 0;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
const canTouchTask = (req, task) => isManager(req) || task.assigneeId === req.user.id;

async function assertBelongsToProject(taskId, projectId) {
  const task = await getTaskById(taskId);
  if (!task || task.projectId !== projectId) return null;
  return task;
}

async function assertAssigneeIsMember(workspaceId, assigneeId) {
  const members = await getWorkspaceMembers(workspaceId);
  return members.some((m) => m.id === assigneeId);
}

// Members only ever see tasks assigned to them — enforced here, not just
// hidden client-side. Admin/lead see everything in the project.
router.get("/", async (req, res, next) => {
  try {
    const restrictTo = isManager(req) ? null : req.user.id;
    res.json({ tasks: await getTasks(req.params.projectId, restrictTo) });
  } catch (err) { next(err); }
});

// Only admin/lead can create and assign tasks — members can't create work
// for themselves or anyone else.
router.post("/", async (req, res, next) => {
  try {
    if (!isManager(req)) return res.status(403).json({ error: "Only the workspace admin or team lead can create tasks" });

    const { title, description, status, priority, assigneeId, due, dueTime, subtasks } = req.body || {};
    if (!title || !title.trim()) return res.status(400).json({ error: "Title is required" });
    if (!assigneeId) return res.status(400).json({ error: "Assignee is required" });
    if (!(await assertAssigneeIsMember(req.params.workspaceId, assigneeId))) {
      return res.status(400).json({ error: "Assignee must be a member of this workspace" });
    }

    const task = await createTask({
      title: title.trim(), description, status, priority, assigneeId, due, dueTime, subtasks,
      createdBy: req.user.id, workspaceId: req.params.workspaceId, projectId: req.params.projectId,
    });

    if (assigneeId !== req.user.id) {
      await notify({
        userId: assigneeId, type: "assigned", taskId: task.id, taskTitle: task.title,
        workspaceId: req.params.workspaceId, message: `${req.user.name} assigned you "${task.title}" in ${req.project.name}`,
      });
    }

    broadcastTaskChange(req.params.workspaceId, { reason: "created", taskId: task.id, projectId: req.params.projectId });
    res.status(201).json({ task });
  } catch (err) { next(err); }
});

// Bulk create — one line of pasted text per task. Built for logs like
// "9:00 AM - Meeting with X" / "Draft the proposal" pasted straight from a
// day's list, all going to the same assignee/due date in one submission
// instead of opening the dialog once per line.
// Bulk create — built for pasting straight from a written activity log:
// one task per entry, each with its own assignee (parsed client-side from
// lines like "Leo: 9:00 AM - Meeting with Director"), optional leading time,
// and optional subtasks (parsed from indented lines underneath).
router.post("/bulk", async (req, res, next) => {
  try {
    if (!isManager(req)) return res.status(403).json({ error: "Only the workspace admin or team lead can create tasks" });

    const { tasks, due, priority } = req.body || {};
    if (!Array.isArray(tasks) || tasks.length === 0) return res.status(400).json({ error: "Paste at least one line" });

    const items = tasks.slice(0, 100);
    for (const t of items) {
      if (!t.title || !t.title.trim()) return res.status(400).json({ error: "Every task needs a title" });
      if (!t.assigneeId) return res.status(400).json({ error: `Missing assignee for "${t.title}"` });
      if (!(await assertAssigneeIsMember(req.params.workspaceId, t.assigneeId))) {
        return res.status(400).json({ error: `Assignee for "${t.title}" isn't a member of this workspace` });
      }
    }

    const created = [];
    const notifyTargets = new Map(); // assigneeId -> count, so each person gets one summary notification

    for (const t of items) {
      const title = t.title.trim();
      const timeMatch = title.match(/^(\d{1,2}[:.]\d{2}\s*(?:AM|PM|am|pm)?)\s*[-–—]?\s*(.*)$/);
      let taskTitle = title;
      let taskTime = t.dueTime || null;
      if (timeMatch && timeMatch[2].trim()) {
        const parsed = parseClockTime(timeMatch[1]);
        if (parsed) { taskTime = parsed; taskTitle = timeMatch[2].trim(); }
      }

      const subtasks = Array.isArray(t.subtasks) ? t.subtasks.filter(Boolean).map((s) => ({ text: s, done: false })) : [];

      const task = await createTask({
        title: taskTitle, description: "", status: "todo", priority: t.priority || priority || "medium",
        assigneeId: t.assigneeId, due: t.due || due, dueTime: taskTime, subtasks,
        createdBy: req.user.id, workspaceId: req.params.workspaceId, projectId: req.params.projectId,
      });
      created.push(task);
      if (t.assigneeId !== req.user.id) notifyTargets.set(t.assigneeId, (notifyTargets.get(t.assigneeId) || 0) + 1);
    }

    for (const [userId, count] of notifyTargets) {
      await notify({
        userId, type: "assigned", taskId: created[0].id, taskTitle: created[0].title,
        workspaceId: req.params.workspaceId,
        message: `${req.user.name} assigned you ${count} task${count > 1 ? "s" : ""} in ${req.project.name}`,
      });
    }

    broadcastTaskChange(req.params.workspaceId, { reason: "created", projectId: req.params.projectId });
    res.status(201).json({ tasks: created });
  } catch (err) { next(err); }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const existing = await assertBelongsToProject(req.params.id, req.params.projectId);
    if (!existing) return res.status(404).json({ error: "Task not found" });

    const manager = isManager(req);
    const isOwnTask = existing.assigneeId === req.user.id;

    if (!manager) {
      // Members can only touch their own task, and only its status
      // (checklist has its own endpoint; drag-and-drop just changes status).
      if (!isOwnTask) return res.status(403).json({ error: "You can only update tasks assigned to you" });
      const requestedKeys = Object.keys(req.body || {});
      const allowed = requestedKeys.every((k) => k === "status");
      if (!allowed) return res.status(403).json({ error: "You can only change the status of your own tasks" });
    }

    const patch = {};
    ["title", "description", "status", "priority", "assigneeId", "due", "dueTime"].forEach((k) => {
      if (req.body[k] !== undefined) patch[k] = req.body[k];
    });
    if (patch.assigneeId && !(await assertAssigneeIsMember(req.params.workspaceId, patch.assigneeId))) {
      return res.status(400).json({ error: "Assignee must be a member of this workspace" });
    }

    const { task, prevStatus, prevAssignee } = await updateTask(req.params.id, patch);
    const members = await getWorkspaceMembers(req.params.workspaceId);
    const admin = members.find((m) => m.role === "admin");

    if (patch.assigneeId && patch.assigneeId !== prevAssignee && patch.assigneeId !== req.user.id) {
      await notify({
        userId: patch.assigneeId, type: "reassigned", taskId: task.id, taskTitle: task.title,
        workspaceId: req.params.workspaceId, message: `${req.user.name} reassigned "${task.title}" to you`,
      });
    }
    if (patch.status && patch.status !== prevStatus && task.assigneeId !== req.user.id) {
      await notify({
        userId: task.assigneeId, type: "moved", taskId: task.id, taskTitle: task.title,
        workspaceId: req.params.workspaceId, message: `"${task.title}" moved to ${STAGE_LABEL[patch.status] || patch.status}`,
      });
    }
    if (patch.status === "done" && prevStatus !== "done" && admin && admin.id !== task.assigneeId) {
      await notify({
        userId: admin.id, type: "shipped", taskId: task.id, taskTitle: task.title,
        workspaceId: req.params.workspaceId, message: `"${task.title}" was marked done`,
      });
    }

    broadcastTaskChange(req.params.workspaceId, { reason: "updated", taskId: task.id, projectId: req.params.projectId });
    res.json({ task });
  } catch (err) { next(err); }
});

router.put("/:id/subtasks", async (req, res, next) => {
  try {
    const { subtasks } = req.body || {};
    if (!Array.isArray(subtasks)) return res.status(400).json({ error: "subtasks must be an array" });
    const existing = await assertBelongsToProject(req.params.id, req.params.projectId);
    if (!existing) return res.status(404).json({ error: "Task not found" });

    if (!isManager(req) && existing.assigneeId !== req.user.id) {
      return res.status(403).json({ error: "You can only update the checklist on tasks assigned to you" });
    }

    const task = await replaceSubtasks(req.params.id, subtasks);
    broadcastTaskChange(req.params.workspaceId, { reason: "subtasks", taskId: task.id, projectId: req.params.projectId });
    res.json({ task });
  } catch (err) { next(err); }
});

router.delete("/:id", async (req, res, next) => {
  try {
    if (!isManager(req)) return res.status(403).json({ error: "Only the workspace admin or team lead can delete tasks" });
    const existing = await assertBelongsToProject(req.params.id, req.params.projectId);
    if (!existing) return res.status(404).json({ error: "Task not found" });
    await deleteTask(req.params.id);
    broadcastTaskChange(req.params.workspaceId, { reason: "deleted", taskId: req.params.id, projectId: req.params.projectId });
    res.status(204).end();
  } catch (err) { next(err); }
});

// ---------------- attachments ----------------

router.get("/:id/attachments", async (req, res, next) => {
  try {
    const task = await assertBelongsToProject(req.params.id, req.params.projectId);
    if (!task) return res.status(404).json({ error: "Task not found" });
    if (!canTouchTask(req, task)) return res.status(403).json({ error: "You can only view attachments on tasks assigned to you" });
    res.json({ attachments: await getAttachmentsForTask(req.params.id) });
  } catch (err) { next(err); }
});

router.post("/:id/attachments", (req, res, next) => {
  taskUpload.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, async (req, res, next) => {
  try {
    const task = await assertBelongsToProject(req.params.id, req.params.projectId);
    if (!task) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(404).json({ error: "Task not found" });
    }
    if (!canTouchTask(req, task)) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(403).json({ error: "You can only add files to tasks assigned to you" });
    }
    if (!req.file) return res.status(400).json({ error: "No file was uploaded" });

    const attachment = await addAttachment({
      taskId: req.params.id,
      uploadedBy: req.user.id,
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
      storagePath: req.file.path,
    });

    if (task.assigneeId !== req.user.id) {
      await notify({
        userId: task.assigneeId, type: "attachment", taskId: task.id, taskTitle: task.title,
        workspaceId: req.params.workspaceId, message: `${req.user.name} added a file to "${task.title}"`,
      });
    }

    broadcastTaskChange(req.params.workspaceId, { reason: "attachment", taskId: task.id, projectId: req.params.projectId });
    res.status(201).json({ attachment });
  } catch (err) { next(err); }
});

router.get("/:id/attachments/:attachmentId/file", async (req, res, next) => {
  try {
    const task = await assertBelongsToProject(req.params.id, req.params.projectId);
    if (!task) return res.status(404).json({ error: "Task not found" });
    if (!canTouchTask(req, task)) return res.status(403).json({ error: "You can only view attachments on tasks assigned to you" });

    const attachment = await getAttachmentById(req.params.attachmentId);
    if (!attachment || attachment.taskId !== req.params.id) return res.status(404).json({ error: "Attachment not found" });
    if (!fs.existsSync(attachment.storagePath)) return res.status(404).json({ error: "File is missing from storage" });

    res.setHeader("Content-Type", attachment.mimeType);
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(attachment.fileName)}"`);
    fs.createReadStream(attachment.storagePath).pipe(res);
  } catch (err) { next(err); }
});

router.delete("/:id/attachments/:attachmentId", async (req, res, next) => {
  try {
    const task = await assertBelongsToProject(req.params.id, req.params.projectId);
    if (!task) return res.status(404).json({ error: "Task not found" });
    if (!canTouchTask(req, task)) return res.status(403).json({ error: "You can only remove attachments from tasks assigned to you" });

    const attachment = await deleteAttachment(req.params.attachmentId);
    if (attachment && attachment.taskId === req.params.id && fs.existsSync(attachment.storagePath)) {
      fs.unlink(attachment.storagePath, () => {});
    }
    broadcastTaskChange(req.params.workspaceId, { reason: "attachment", taskId: req.params.id, projectId: req.params.projectId });
    res.status(204).end();
  } catch (err) { next(err); }
});

// ---------------- comments (flat, chronological — open to every workspace member, not gated by role or assignment) ----------------

router.get("/:id/comments", async (req, res, next) => {
  try {
    const task = await assertBelongsToProject(req.params.id, req.params.projectId);
    if (!task) return res.status(404).json({ error: "Task not found" });
    res.json({ comments: await getCommentsForTask(req.params.id) });
  } catch (err) { next(err); }
});

router.post("/:id/comments", async (req, res, next) => {
  try {
    const { body } = req.body || {};
    if (!body || !body.trim()) return res.status(400).json({ error: "Comment can't be empty" });
    if (body.length > 4000) return res.status(400).json({ error: "Keep comments under 4000 characters" });

    const task = await assertBelongsToProject(req.params.id, req.params.projectId);
    if (!task) return res.status(404).json({ error: "Task not found" });

    const comment = await addComment({ taskId: req.params.id, userId: req.user.id, body: body.trim() });

    // Notify everyone with a stake in this task — the assignee and any
    // admin/lead — except whoever just wrote the comment.
    const members = await getWorkspaceMembers(req.params.workspaceId);
    const targets = new Set();
    if (task.assigneeId !== req.user.id) targets.add(task.assigneeId);
    members.filter((m) => (m.role === "admin" || m.role === "lead") && m.id !== req.user.id).forEach((m) => targets.add(m.id));

    for (const userId of targets) {
      await notify({
        userId, type: "comment", taskId: task.id, taskTitle: task.title,
        workspaceId: req.params.workspaceId, message: `${req.user.name} commented on "${task.title}"`,
      });
    }

    broadcastTaskChange(req.params.workspaceId, { reason: "comment", taskId: task.id, projectId: req.params.projectId });
    res.status(201).json({ comment });
  } catch (err) { next(err); }
});

// ---------------- links (external URLs, alongside file attachments) ----------------

router.get("/:id/links", async (req, res, next) => {
  try {
    const task = await assertBelongsToProject(req.params.id, req.params.projectId);
    if (!task) return res.status(404).json({ error: "Task not found" });
    if (!canTouchTask(req, task)) return res.status(403).json({ error: "You can only view links on tasks assigned to you" });
    res.json({ links: await getLinksForTask(req.params.id) });
  } catch (err) { next(err); }
});

router.post("/:id/links", async (req, res, next) => {
  try {
    const { label, url } = req.body || {};
    if (!url || !url.trim()) return res.status(400).json({ error: "URL is required" });
    let parsed;
    try { parsed = new URL(url.trim()); } catch { return res.status(400).json({ error: "That doesn't look like a valid URL (include https://)" }); }
    if (!["http:", "https:"].includes(parsed.protocol)) return res.status(400).json({ error: "Only http:// or https:// links are allowed" });

    const task = await assertBelongsToProject(req.params.id, req.params.projectId);
    if (!task) return res.status(404).json({ error: "Task not found" });
    if (!canTouchTask(req, task)) return res.status(403).json({ error: "You can only add links to tasks assigned to you" });

    const link = await addLink({
      taskId: req.params.id, addedBy: req.user.id,
      label: (label || "").trim() || parsed.hostname, url: parsed.toString(),
    });

    if (task.assigneeId !== req.user.id) {
      await notify({
        userId: task.assigneeId, type: "link", taskId: task.id, taskTitle: task.title,
        workspaceId: req.params.workspaceId, message: `${req.user.name} added a link to "${task.title}"`,
      });
    }

    broadcastTaskChange(req.params.workspaceId, { reason: "link", taskId: task.id, projectId: req.params.projectId });
    res.status(201).json({ link });
  } catch (err) { next(err); }
});

router.delete("/:id/links/:linkId", async (req, res, next) => {
  try {
    const task = await assertBelongsToProject(req.params.id, req.params.projectId);
    if (!task) return res.status(404).json({ error: "Task not found" });
    if (!canTouchTask(req, task)) return res.status(403).json({ error: "You can only remove links from tasks assigned to you" });

    const link = await getLinkById(req.params.linkId);
    if (!link || link.taskId !== req.params.id) return res.status(404).json({ error: "Link not found" });
    await deleteLink(req.params.linkId);
    broadcastTaskChange(req.params.workspaceId, { reason: "link", taskId: req.params.id, projectId: req.params.projectId });
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
