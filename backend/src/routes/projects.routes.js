const express = require("express");
const fs = require("fs");
const {
  getProjectsForWorkspace, createProject, deleteProject, getProjectById, setProjectComplete,
  getMilestone, upsertMilestone,
  getDocumentsForProject, getDocumentById, addDocument, deleteDocument,
} = require("../db");
const { authenticate } = require("../auth");
const { requireWorkspaceMember, requireRole, requireProjectInWorkspace } = require("../middleware/workspace");
const { broadcastProjectsChanged } = require("../utils/notify");
const { projectUpload } = require("../utils/upload");

const router = express.Router({ mergeParams: true });
router.use(authenticate, requireWorkspaceMember);

router.get("/", async (req, res, next) => {
  try {
    res.json({ projects: await getProjectsForWorkspace(req.params.workspaceId) });
  } catch (err) { next(err); }
});

router.post("/", requireRole("admin", "lead"), async (req, res, next) => {
  try {
    const { name, description, deadline } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ error: "Project name is required" });
    const project = await createProject({
      workspaceId: req.params.workspaceId, name: name.trim(), description, deadline: deadline || null, createdBy: req.user.id,
    });
    broadcastProjectsChanged(req.params.workspaceId);
    res.status(201).json({ project });
  } catch (err) { next(err); }
});

router.delete("/:projectId", requireRole("admin", "lead"), async (req, res, next) => {
  try {
    const project = await getProjectById(req.params.projectId);
    if (!project || project.workspaceId !== req.params.workspaceId) return res.status(404).json({ error: "Project not found" });
    await deleteProject(req.params.projectId);
    broadcastProjectsChanged(req.params.workspaceId);
    res.status(204).end();
  } catch (err) { next(err); }
});

// Marking a project complete doesn't delete anything — its tasks, files,
// comments, and milestone all stay exactly where they are, just under a
// project that's now flagged "done" and moved to the workspace's history.
router.patch("/:projectId/complete", requireProjectInWorkspace, requireRole("admin", "lead"), async (req, res, next) => {
  try {
    const { complete } = req.body || {};
    const project = await setProjectComplete(req.params.projectId, req.user.id, complete !== false);
    broadcastProjectsChanged(req.params.workspaceId);
    res.json({ project });
  } catch (err) { next(err); }
});

// ---------------- milestone (exactly one per project, DB-enforced) ----------------

router.get("/:projectId/milestone", requireProjectInWorkspace, async (req, res, next) => {
  try {
    res.json({ milestone: await getMilestone(req.params.projectId) });
  } catch (err) { next(err); }
});

router.put("/:projectId/milestone", requireProjectInWorkspace, requireRole("admin", "lead"), async (req, res, next) => {
  try {
    const { title, description, targetDate } = req.body || {};
    if (!title || !title.trim()) return res.status(400).json({ error: "Milestone title is required" });
    const milestone = await upsertMilestone({
      projectId: req.params.projectId, title: title.trim(), description, targetDate, createdBy: req.user.id,
    });
    broadcastProjectsChanged(req.params.workspaceId);
    res.json({ milestone });
  } catch (err) { next(err); }
});

// ---------------- project-level reference documents ----------------
// Visible to every workspace member (unlike task attachments, these are
// shared reference material — circulars, guidelines — not tied to who a
// task is assigned to). Only admin/lead can upload or remove them.

router.get("/:projectId/documents", requireProjectInWorkspace, async (req, res, next) => {
  try {
    res.json({ documents: await getDocumentsForProject(req.params.projectId) });
  } catch (err) { next(err); }
});

router.post("/:projectId/documents", requireProjectInWorkspace, requireRole("admin", "lead"), (req, res, next) => {
  projectUpload.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file was uploaded" });
    const document = await addDocument({
      projectId: req.params.projectId,
      uploadedBy: req.user.id,
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
      storagePath: req.file.path,
    });
    broadcastProjectsChanged(req.params.workspaceId);
    res.status(201).json({ document });
  } catch (err) { next(err); }
});

router.get("/:projectId/documents/:documentId/file", requireProjectInWorkspace, async (req, res, next) => {
  try {
    const doc = await getDocumentById(req.params.documentId);
    if (!doc || doc.projectId !== req.params.projectId) return res.status(404).json({ error: "Document not found" });
    if (!fs.existsSync(doc.storagePath)) return res.status(404).json({ error: "File is missing from storage" });

    res.setHeader("Content-Type", doc.mimeType);
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(doc.fileName)}"`);
    fs.createReadStream(doc.storagePath).pipe(res);
  } catch (err) { next(err); }
});

router.delete("/:projectId/documents/:documentId", requireProjectInWorkspace, requireRole("admin", "lead"), async (req, res, next) => {
  try {
    const doc = await deleteDocument(req.params.documentId);
    if (doc && doc.projectId === req.params.projectId && fs.existsSync(doc.storagePath)) {
      fs.unlink(doc.storagePath, () => {});
    }
    broadcastProjectsChanged(req.params.workspaceId);
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
