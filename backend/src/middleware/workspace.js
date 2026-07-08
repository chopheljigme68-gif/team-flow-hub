const { getMembership, getProjectById } = require("../db");

/**
 * Requires req.user (set by `authenticate`) to be a member of the workspace
 * named in the route params. This is the actual segregation boundary — the
 * frontend filtering by workspace is just UX, this is what makes it real.
 */
async function requireWorkspaceMember(req, res, next) {
  try {
    const workspaceId = req.params.workspaceId;
    const membership = await getMembership(workspaceId, req.user.id);
    if (!membership) return res.status(403).json({ error: "You are not a member of this workspace" });
    req.membership = membership;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Requires req.membership.role (set by requireWorkspaceMember, which must
 * run first) to be one of the allowed roles. Use for admin/lead-only
 * actions like creating projects, assigning tasks, or managing members.
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.membership) return res.status(500).json({ error: "requireRole used without requireWorkspaceMember" });
    if (!allowedRoles.includes(req.membership.role)) {
      return res.status(403).json({ error: `This action requires one of: ${allowedRoles.join(", ")}` });
    }
    next();
  };
}

/**
 * Requires the :projectId in the route to actually belong to the :workspaceId
 * in the route. Prevents someone who's a member of workspace A from reaching
 * a project in workspace B just by guessing its id.
 */
async function requireProjectInWorkspace(req, res, next) {
  try {
    const project = await getProjectById(req.params.projectId);
    if (!project || project.workspaceId !== req.params.workspaceId) {
      return res.status(404).json({ error: "Project not found" });
    }
    req.project = project;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Requires req.user (set by `authenticate`) to be a platform admin — the
 * only people allowed to create new workspaces. This
 * is separate from per-workspace roles: someone can be a platform admin
 * without being a member of any workspace yet.
 */
function requirePlatformAdmin(req, res, next) {
  if (!req.user.isPlatformAdmin) {
    return res.status(403).json({ error: "Only a platform admin can do this. Ask whoever set up your system to grant you access." });
  }
  next();
}

module.exports = { requireWorkspaceMember, requireRole, requireProjectInWorkspace, requirePlatformAdmin };
