const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

function getToken() {
  return localStorage.getItem("tfh_token");
}

async function request(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${API_URL}/api${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return null;

  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }

  if (!res.ok) {
    const message = data?.error || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data;
}

export const api = {
  API_URL,
  getToken,
  setToken: (t) => (t ? localStorage.setItem("tfh_token", t) : localStorage.removeItem("tfh_token")),

  register: (payload) => request("/auth/register", { method: "POST", body: payload, auth: false }),
  login: (payload) => request("/auth/login", { method: "POST", body: payload, auth: false }),
  me: () => request("/auth/me"),
  forgotPassword: (email) => request("/auth/forgot-password", { method: "POST", body: { email }, auth: false }),
  resetPassword: (token, password) => request("/auth/reset-password", { method: "POST", body: { token, password }, auth: false }),

  getWorkspaces: () => request("/workspaces"),
  createWorkspace: (name) => request("/workspaces", { method: "POST", body: { name } }),
  getMembers: (workspaceId) => request(`/workspaces/${workspaceId}/members`),
  inviteToWorkspace: (workspaceId, email) => request(`/workspaces/${workspaceId}/invite`, { method: "POST", body: { email } }),
  setMemberRole: (workspaceId, userId, role) => request(`/workspaces/${workspaceId}/members/${userId}/role`, { method: "PATCH", body: { role } }),
  setMemberTitle: (workspaceId, userId, title) => request(`/workspaces/${workspaceId}/members/${userId}/title`, { method: "PATCH", body: { title } }),
  removeMember: (workspaceId, userId) => request(`/workspaces/${workspaceId}/members/${userId}`, { method: "DELETE" }),
  getWorkload: (workspaceId) => request(`/workspaces/${workspaceId}/workload`),

  getProjects: (workspaceId) => request(`/workspaces/${workspaceId}/projects`),
  createProject: (workspaceId, payload) => request(`/workspaces/${workspaceId}/projects`, { method: "POST", body: payload }),
  deleteProject: (workspaceId, projectId) => request(`/workspaces/${workspaceId}/projects/${projectId}`, { method: "DELETE" }),
  setProjectComplete: (workspaceId, projectId, complete) => request(`/workspaces/${workspaceId}/projects/${projectId}/complete`, { method: "PATCH", body: { complete } }),

  getMilestone: (workspaceId, projectId) => request(`/workspaces/${workspaceId}/projects/${projectId}/milestone`),
  setMilestone: (workspaceId, projectId, payload) => request(`/workspaces/${workspaceId}/projects/${projectId}/milestone`, { method: "PUT", body: payload }),

  getTasks: (workspaceId, projectId) => request(`/workspaces/${workspaceId}/projects/${projectId}/tasks`),
  createTask: (workspaceId, projectId, payload) => request(`/workspaces/${workspaceId}/projects/${projectId}/tasks`, { method: "POST", body: payload }),
  createTasksBulk: (workspaceId, projectId, payload) => request(`/workspaces/${workspaceId}/projects/${projectId}/tasks/bulk`, { method: "POST", body: payload }),
  updateTask: (workspaceId, projectId, id, patch) => request(`/workspaces/${workspaceId}/projects/${projectId}/tasks/${id}`, { method: "PATCH", body: patch }),
  setSubtasks: (workspaceId, projectId, id, subtasks) => request(`/workspaces/${workspaceId}/projects/${projectId}/tasks/${id}/subtasks`, { method: "PUT", body: { subtasks } }),
  deleteTask: (workspaceId, projectId, id) => request(`/workspaces/${workspaceId}/projects/${projectId}/tasks/${id}`, { method: "DELETE" }),

  getAnalytics: (workspaceId, projectId) => request(`/workspaces/${workspaceId}/projects/${projectId}/analytics`),

  getAttachments: (workspaceId, projectId, taskId) => request(`/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/attachments`),
  deleteAttachment: (workspaceId, projectId, taskId, attachmentId) =>
    request(`/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/attachments/${attachmentId}`, { method: "DELETE" }),

  getComments: (workspaceId, projectId, taskId) => request(`/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/comments`),
  addComment: (workspaceId, projectId, taskId, body) =>
    request(`/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/comments`, { method: "POST", body: { body } }),

  getLinks: (workspaceId, projectId, taskId) => request(`/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/links`),
  addLink: (workspaceId, projectId, taskId, label, url) =>
    request(`/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/links`, { method: "POST", body: { label, url } }),
  deleteLink: (workspaceId, projectId, taskId, linkId) =>
    request(`/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/links/${linkId}`, { method: "DELETE" }),

  getDocuments: (workspaceId, projectId) => request(`/workspaces/${workspaceId}/projects/${projectId}/documents`),
  deleteDocument: (workspaceId, projectId, documentId) =>
    request(`/workspaces/${workspaceId}/projects/${projectId}/documents/${documentId}`, { method: "DELETE" }),
  uploadDocument: async (workspaceId, projectId, file) => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${API_URL}/api/workspaces/${workspaceId}/projects/${projectId}/documents`, {
      method: "POST",
      headers: { Authorization: `Bearer ${getToken()}` },
      body: form,
    });
    let data = null;
    try { data = await res.json(); } catch { /* empty */ }
    if (!res.ok) throw new Error(data?.error || `Upload failed (${res.status})`);
    return data;
  },
  getDocumentBlobUrl: async (workspaceId, projectId, documentId) => {
    const res = await fetch(`${API_URL}/api/workspaces/${workspaceId}/projects/${projectId}/documents/${documentId}/file`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) throw new Error(`Failed to load file (${res.status})`);
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  },

  // Multipart upload — bypasses the JSON request() helper since the body isn't JSON.
  uploadAttachment: async (workspaceId, projectId, taskId, file) => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${API_URL}/api/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/attachments`, {
      method: "POST",
      headers: { Authorization: `Bearer ${getToken()}` },
      body: form,
    });
    let data = null;
    try { data = await res.json(); } catch { /* empty */ }
    if (!res.ok) throw new Error(data?.error || `Upload failed (${res.status})`);
    return data;
  },

  // Fetches the actual file bytes with the auth header attached (can't just use
  // <img src="..."> since that can't send an Authorization header) and returns
  // a blob: URL the browser can render or download.
  getAttachmentBlobUrl: async (workspaceId, projectId, taskId, attachmentId) => {
    const res = await fetch(`${API_URL}/api/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/attachments/${attachmentId}/file`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) throw new Error(`Failed to load file (${res.status})`);
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  },

  getNotifications: () => request("/notifications"),
  markNotificationRead: (id) => request(`/notifications/${id}/read`, { method: "PATCH" }),
  markAllRead: () => request("/notifications/read-all", { method: "PATCH" }),

  uploadAvatar: async (file) => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${API_URL}/api/users/me/avatar`, {
      method: "POST",
      headers: { Authorization: `Bearer ${getToken()}` },
      body: form,
    });
    let data = null;
    try { data = await res.json(); } catch { /* empty */ }
    if (!res.ok) throw new Error(data?.error || `Upload failed (${res.status})`);
    return data;
  },
  getAvatarBlobUrl: async (userId) => {
    const res = await fetch(`${API_URL}/api/users/${userId}/avatar`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) throw new Error(`No avatar (${res.status})`);
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  },
};
