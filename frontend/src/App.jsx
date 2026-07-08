import React, { useEffect, useMemo, useRef, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import {
  LayoutDashboard, Columns3, Users, CalendarDays, BarChart3, Search, Plus, X, Check,
  Flag, ChevronLeft, ChevronRight, Trash2, GripVertical, ArrowRight, Menu, Sparkles,
  Bell, Crown, Sun, Moon, LogOut, AlertTriangle, Loader2, RefreshCw,
  UserPlus, ChevronDown, Building2, Shield, FolderKanban, Lock,
  Paperclip, FileText, Image as ImageIcon, Download, Upload, Pencil, MessageSquare, FolderOpen, Link2, Clock, ClipboardList,
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  ResponsiveContainer, Cell,
} from "recharts";

import { useAuth } from "./context/AuthContext.jsx";
import { useTheme } from "./context/ThemeContext.jsx";
import { useWorkspace } from "./context/WorkspaceContext.jsx";
import { useProject } from "./context/ProjectContext.jsx";
import { api } from "./api.js";
import { connectSocket, getSocket } from "./socket.js";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import ForgotPassword from "./pages/ForgotPassword.jsx";
import ResetPassword from "./pages/ResetPassword.jsx";

/* ------------------------------------------------------------------ */
/* Constants                                                            */
/* ------------------------------------------------------------------ */
const STAGES = [
  { id: "todo", label: "Tasks", color: "var(--stage-progress)" },
  { id: "done", label: "Completed", color: "var(--stage-done)" },
];
const PRIORITIES = {
  low: { label: "Low", color: "var(--pri-low)" },
  medium: { label: "Medium", color: "var(--pri-medium)" },
  high: { label: "High", color: "var(--pri-high)" },
};
const NAV = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "board", label: "Board", icon: Columns3 },
  { id: "files", label: "Files", icon: FolderOpen },
  { id: "milestone", label: "Milestone", icon: Flag },
  { id: "team", label: "Team", icon: Users },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
];
const NOTIF_LABEL = {
  assigned: "assigned you a task",
  reassigned: "reassigned a task to you",
  moved: "task moved",
  shipped: "task shipped",
  role: "role updated",
  removed: "removed from workspace",
  comment: "new comment",
  link: "new link",
  invited: "added to workspace",
  due_soon: "due soon",
};

const POST_SUGGESTIONS = [
  "Founder", "Director", "Manager", "Team Lead",
  "Product Designer", "Product Manager", "Software Engineer", "QA Engineer",
  "Marketing Lead", "Sales Lead", "Operations Lead", "Analyst",
];

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */
const memberById = (users, id) => users.find((u) => u.id === id);

const formatTimeLabel = (hhmm) => {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
};

const dueMeta = (dateStr) => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr + "T00:00:00");
  const diff = Math.round((due - today) / 86400000);
  if (diff < 0) return { label: `${Math.abs(diff)}d overdue`, tone: "var(--pri-high)" };
  if (diff === 0) return { label: "Due today", tone: "var(--pri-medium)" };
  if (diff === 1) return { label: "Due tomorrow", tone: "var(--pri-medium)" };
  return { label: `Due in ${diff}d`, tone: "var(--text-dim)" };
};
const timeAgo = (iso) => {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
};

/* ------------------------------------------------------------------ */
/* Small shared pieces                                                  */
/* ------------------------------------------------------------------ */
const Logo = ({ size = 30 }) => (
  <img src="/logo.png" alt="Team Flow Hub" style={{ width: size, height: size, objectFit: "contain", flexShrink: 0 }} />
);

// Shared across all <Avatar> instances so the same person's photo is only
// fetched once per session, however many task cards/avatars show them.
const avatarUrlCache = new Map();

const useAvatarPhoto = (member) => {
  const [url, setUrl] = useState(() => (member?.avatarUrl && avatarUrlCache.get(member.id)) || null);
  useEffect(() => {
    if (!member?.avatarUrl) { setUrl(null); return; }
    if (avatarUrlCache.has(member.id)) { setUrl(avatarUrlCache.get(member.id)); return; }
    let cancelled = false;
    api.getAvatarBlobUrl(member.id)
      .then((blobUrl) => { avatarUrlCache.set(member.id, blobUrl); if (!cancelled) setUrl(blobUrl); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [member?.id, member?.avatarUrl]);
  return url;
};

// Call after a fresh avatar upload so every Avatar on screen picks up the new photo.
const invalidateAvatarCache = (userId) => { avatarUrlCache.delete(userId); };

const Avatar = ({ member, size = 28 }) => {
  const photoUrl = useAvatarPhoto(member);
  return (
    <span
      className="tfh-avatar"
      title={member ? `${member.name}${member.role === "admin" ? " · Admin" : member.role === "lead" ? " · Lead" : ""}` : undefined}
      style={{ width: size, height: size, background: member?.color || "var(--text-faint)", fontSize: size * 0.4, overflow: "hidden" }}
    >
      {photoUrl ? (
        <img src={photoUrl} alt={member.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        member?.initials || "?"
      )}
      {member?.role === "lead" && (
        <Crown size={size * 0.42} color="#12141c" fill="var(--accent)" style={{ position: "absolute", top: -size * 0.32, right: -size * 0.12 }} />
      )}
      {member?.role === "admin" && (
        <Shield size={size * 0.4} color="#12141c" fill="var(--stage-done)" style={{ position: "absolute", top: -size * 0.3, right: -size * 0.14 }} />
      )}
    </span>
  );
};

const PriorityChip = ({ level }) => {
  const p = PRIORITIES[level];
  return (
    <span className="tfh-chip" style={{ background: `${p.color}1E`, color: p.color, borderColor: `${p.color}40` }}>
      <Flag size={11} /> {p.label}
    </span>
  );
};

const MiniCheckbox = ({ checked, onClick }) => (
  <button type="button" onClick={onClick} className={`tfh-checkbox ${checked ? "checked" : ""}`} aria-label="Toggle subtask">
    {checked && <Check size={11} color="#12141c" strokeWidth={3} />}
  </button>
);

const Spinner = ({ size = 22 }) => <Loader2 className="tfh-pulse" size={size} color="var(--text-faint)" />;

/* ------------------------------------------------------------------ */
/* Task card + column                                                   */
/* ------------------------------------------------------------------ */
const TaskCard = ({ task, users, onOpen, onDragStart }) => {
  const assignee = memberById(users, task.assigneeId);
  const done = task.subtasks.filter((s) => s.done).length;
  const total = task.subtasks.length;
  const meta = dueMeta(task.due);

  return (
    <div
      className="tfh-card tfh-task-card tfh-fade-in"
      draggable
      onDragStart={(e) => onDragStart(e, task.id)}
      onClick={() => onOpen(task)}
      style={{ padding: "12px 13px", cursor: "grab", display: "flex", flexDirection: "column", gap: 10 }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.35 }}>{task.title}</span>
        <GripVertical size={14} color="var(--text-faint)" style={{ flexShrink: 0, marginTop: 2 }} />
      </div>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
        {task.dueTime && (
          <span className="tfh-chip tfh-mono" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
            <Clock size={10} /> {formatTimeLabel(task.dueTime)}
          </span>
        )}
        <PriorityChip level={task.priority} />
        {total > 0 && (
          <span className="tfh-chip tfh-mono" style={{ background: "var(--raised)", color: "var(--text-dim)" }}>
            {done}/{total}
          </span>
        )}
        {task.attachmentCount > 0 && (
          <span className="tfh-chip tfh-mono" style={{ background: "var(--raised)", color: "var(--text-dim)" }}>
            <Paperclip size={10} /> {task.attachmentCount}
          </span>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 11.5, color: meta.tone, fontWeight: 500 }}>{meta.label}</span>
        <Avatar member={assignee} size={24} />
      </div>
    </div>
  );
};

const Column = ({ stage, tasks, users, onOpen, onDragStart, onDropTask, onAdd, canManage }) => {
  const [over, setOver] = useState(false);
  return (
    <div
      className="tfh-card"
      style={{ padding: 12, display: "flex", flexDirection: "column", minHeight: 200 }}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); onDropTask(stage.id); }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "2px 4px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: stage.color }} />
          <span style={{ fontSize: 13, fontWeight: 700 }}>{stage.label}</span>
          <span className="tfh-mono" style={{ fontSize: 11, color: "var(--text-faint)" }}>{tasks.length}</span>
        </div>
        {canManage && (
          <button className="tfh-btn tfh-btn-ghost" style={{ padding: 5 }} onClick={() => onAdd(stage.id)} aria-label={`Add task to ${stage.label}`}>
            <Plus size={14} />
          </button>
        )}
      </div>
      <div
        className={`tfh-scrollbar-none ${over ? "tfh-col-drop" : ""}`}
        style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 60, borderRadius: 10, padding: 4, flex: 1, transition: "background 0.12s ease" }}
      >
        {tasks.length === 0 && (
          <div style={{ fontSize: 12, color: "var(--text-faint)", textAlign: "center", padding: "18px 8px", border: "1px dashed var(--line)", borderRadius: 10 }}>
            {canManage ? "Nothing here — drag a card over or add one." : "Nothing here."}
          </div>
        )}
        {tasks.map((t) => (
          <TaskCard key={t.id} task={t} users={users} onOpen={onOpen} onDragStart={onDragStart} />
        ))}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Task dialog                                                          */
/* ------------------------------------------------------------------ */
const emptyDraft = (status, users, currentUserId) => ({
  id: null, title: "", description: "", status: status || "todo", priority: "medium",
  assigneeId: currentUserId || users[0]?.id || "", due: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
  dueTime: "", subtasks: [],
});

const DeleteButton = ({ onConfirm }) => {
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 2500); return () => clearTimeout(t); }, [armed]);
  return armed ? (
    <button className="tfh-btn tfh-btn-danger" onClick={onConfirm}><Trash2 size={13} /> Click to confirm</button>
  ) : (
    <button className="tfh-btn tfh-btn-ghost" style={{ color: "var(--text-dim)" }} onClick={() => setArmed(true)}>
      <Trash2 size={13} /> Delete task
    </button>
  );
};

const AttachmentRow = ({ attachment, workspaceId, projectId, taskId, onRemove }) => {
  const isImage = attachment.mimeType.startsWith("image/");
  const [blobUrl, setBlobUrl] = useState(null);

  useEffect(() => {
    let objectUrl;
    if (isImage) {
      api.getAttachmentBlobUrl(workspaceId, projectId, taskId, attachment.id)
        .then((url) => { objectUrl = url; setBlobUrl(url); })
        .catch(() => {});
    }
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachment.id]);

  const openOrDownload = async () => {
    try {
      const url = await api.getAttachmentBlobUrl(workspaceId, projectId, taskId, attachment.id);
      const a = document.createElement("a");
      a.href = url;
      if (isImage) a.target = "_blank"; else a.download = attachment.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch {
      // silently ignore — the row will still be there to retry
    }
  };

  const sizeLabel = attachment.sizeBytes > 1024 * 1024
    ? `${(attachment.sizeBytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(attachment.sizeBytes / 1024))} KB`;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "6px 8px", borderRadius: 8, background: "var(--raised)" }}>
      {isImage ? (
        blobUrl ? (
          <img src={blobUrl} alt={attachment.fileName} onClick={openOrDownload} style={{ width: 32, height: 32, borderRadius: 6, objectFit: "cover", flexShrink: 0, cursor: "pointer" }} />
        ) : (
          <div style={{ width: 32, height: 32, borderRadius: 6, background: "var(--panel)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <ImageIcon size={14} color="var(--text-faint)" />
          </div>
        )
      ) : (
        <div style={{ width: 32, height: 32, borderRadius: 6, background: "var(--panel)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <FileText size={14} color="var(--text-faint)" />
        </div>
      )}
      <button type="button" onClick={openOrDownload} style={{ flex: 1, minWidth: 0, textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
        <div style={{ fontSize: 12.5, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{attachment.fileName}</div>
        <div style={{ fontSize: 10.5, color: "var(--text-faint)" }}>{sizeLabel}{attachment.uploaderName ? ` · ${attachment.uploaderName}` : ""}</div>
      </button>
      <button type="button" onClick={openOrDownload} className="tfh-btn tfh-btn-ghost" style={{ padding: 5 }} aria-label="Download"><Download size={13} color="var(--text-faint)" /></button>
      {onRemove && <button type="button" onClick={onRemove} className="tfh-btn tfh-btn-ghost" style={{ padding: 5 }} aria-label="Remove attachment"><X size={13} color="var(--text-faint)" /></button>}
    </div>
  );
};

const Attachments = ({ workspaceId, projectId, taskId, canAttach }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const { attachments } = await api.getAttachments(workspaceId, projectId, taskId);
      setItems(attachments);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [taskId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setUploading(true);
    setError("");
    try {
      for (const file of files) {
        await api.uploadAttachment(workspaceId, projectId, taskId, file);
      }
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeAttachment = async (id) => {
    try {
      await api.deleteAttachment(workspaceId, projectId, taskId, id);
      setItems((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div style={{ marginBottom: 20 }}>
      <label className="tfh-label">Attachments</label>
      {loading ? (
        <div style={{ fontSize: 12, color: "var(--text-faint)", padding: "6px 0" }}>Loading…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: canAttach ? 10 : 0 }}>
          {items.map((a) => (
            <AttachmentRow key={a.id} attachment={a} workspaceId={workspaceId} projectId={projectId} taskId={taskId} onRemove={canAttach ? () => removeAttachment(a.id) : null} />
          ))}
          {items.length === 0 && <div style={{ fontSize: 12, color: "var(--text-faint)" }}>No files yet.</div>}
        </div>
      )}
      {canAttach && (
        <>
          <input ref={fileInputRef} type="file" multiple style={{ display: "none" }} onChange={(e) => handleFiles(e.target.files)} />
          <button type="button" className="tfh-btn" style={{ fontSize: 12.5 }} onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            <Upload size={13} /> {uploading ? "Uploading…" : "Add photo or file"}
          </button>
        </>
      )}
      {error && <div style={{ fontSize: 12, color: "var(--pri-high)", marginTop: 8 }}>{error}</div>}
    </div>
  );
};

const Links = ({ workspaceId, projectId, taskId, canAttach }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkText, setBulkText] = useState("");

  const load = async () => {
    try {
      const { links } = await api.getLinks(workspaceId, projectId, taskId);
      setItems(links);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [taskId]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e) => {
    e.preventDefault();
    if (!url.trim()) return;
    setAdding(true);
    setError("");
    try {
      const { link } = await api.addLink(workspaceId, projectId, taskId, label.trim(), url.trim());
      setItems((prev) => [...prev, link]);
      setLabel("");
      setUrl("");
    } catch (err) {
      setError(err.message);
    } finally {
      setAdding(false);
    }
  };

  const submitBulk = async (e) => {
    e.preventDefault();
    const lines = bulkText.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return;
    setAdding(true);
    setError("");
    try {
      const created = [];
      for (const line of lines) {
        // "Label | https://..." or just a bare URL, label optional either way
        const [maybeLabel, maybeUrl] = line.includes("|") ? line.split("|").map((s) => s.trim()) : [null, line];
        const finalUrl = maybeUrl || line;
        const finalLabel = maybeLabel || (() => { try { return new URL(finalUrl).hostname.replace(/^www\./, ""); } catch { return finalUrl; } })();
        const { link } = await api.addLink(workspaceId, projectId, taskId, finalLabel, finalUrl);
        created.push(link);
      }
      setItems((prev) => [...prev, ...created]);
      setBulkText("");
      setBulkMode(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setAdding(false);
    }
  };

  const remove = async (id) => {
    try {
      await api.deleteLink(workspaceId, projectId, taskId, id);
      setItems((prev) => prev.filter((l) => l.id !== id));
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <label className="tfh-label">Links</label>
        {canAttach && (
          <button type="button" onClick={() => setBulkMode((v) => !v)} style={{ background: "none", border: "none", color: "var(--accent)", fontSize: 11, padding: 0, marginBottom: 6 }}>
            {bulkMode ? "Add one at a time" : "Paste multiple"}
          </button>
        )}
      </div>
      {loading ? (
        <div style={{ fontSize: 12, color: "var(--text-faint)", padding: "6px 0" }}>Loading…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: canAttach ? 10 : 0 }}>
          {items.map((l) => (
            <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "6px 8px", borderRadius: 8, background: "var(--raised)" }}>
              <Link2 size={14} color="var(--text-faint)" style={{ flexShrink: 0 }} />
              <a href={l.url} target="_blank" rel="noopener noreferrer" style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: "var(--accent)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textDecoration: "none" }}>
                {l.label}
              </a>
              {canAttach && <button type="button" onClick={() => remove(l.id)} className="tfh-btn tfh-btn-ghost" style={{ padding: 5 }} aria-label="Remove link"><X size={13} color="var(--text-faint)" /></button>}
            </div>
          ))}
          {items.length === 0 && <div style={{ fontSize: 12, color: "var(--text-faint)" }}>No links yet.</div>}
        </div>
      )}
      {canAttach && (
        bulkMode ? (
          <form onSubmit={submitBulk}>
            <textarea
              className="tfh-input" rows={4} style={{ resize: "vertical", fontFamily: "IBM Plex Mono, monospace", fontSize: 12, marginBottom: 8 }}
              placeholder={"Design doc | https://docs.google.com/...\nhttps://drive.google.com/... (label optional)"}
              value={bulkText} onChange={(e) => setBulkText(e.target.value)}
            />
            <button className="tfh-btn tfh-btn-accent" disabled={adding || !bulkText.trim()} style={{ width: "100%" }}>
              {adding ? "Adding…" : "Add all links"}
            </button>
          </form>
        ) : (
          <form onSubmit={submit} style={{ display: "flex", gap: 6 }}>
            <input className="tfh-input" placeholder="Label (optional)" value={label} onChange={(e) => setLabel(e.target.value)} style={{ flex: "0 0 40%" }} />
            <input className="tfh-input" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
            <button className="tfh-btn" disabled={adding || !url.trim()} style={{ flexShrink: 0 }}><Plus size={14} /></button>
          </form>
        )
      )}
      {error && <div style={{ fontSize: 12, color: "var(--pri-high)", marginTop: 8 }}>{error}</div>}
    </div>
  );
};

const formatCommentTime = (iso) => {
  const d = new Date(iso);
  const diffMin = Math.round((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffMin < 24 * 60) return `${Math.round(diffMin / 60)}h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

const Comments = ({ workspaceId, projectId, taskId, canComment, currentUserId }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const listRef = useRef(null);

  const load = async () => {
    try {
      const { comments } = await api.getComments(workspaceId, projectId, taskId);
      setItems(comments);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [taskId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; }, [items.length]);

  const submit = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    setError("");
    try {
      const { comment } = await api.addComment(workspaceId, projectId, taskId, text.trim());
      setItems((prev) => [...prev, comment]);
      setText("");
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ marginBottom: 20 }}>
      <label className="tfh-label">Comments</label>
      {loading ? (
        <div style={{ fontSize: 12, color: "var(--text-faint)", padding: "6px 0" }}>Loading…</div>
      ) : (
        <div ref={listRef} style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 220, overflowY: "auto", marginBottom: 10, padding: items.length ? "2px 2px" : 0 }}>
          {items.map((c) => {
            const mine = c.userId === currentUserId;
            const author = { id: c.userId, name: c.userName || "Someone", color: c.userColor, initials: c.userInitials, avatarUrl: c.userAvatarUrl };
            return (
              <div key={c.id} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <Avatar member={author} size={24} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{mine ? "You" : c.userName}</span>
                    <span style={{ fontSize: 10.5, color: "var(--text-faint)" }}>{formatCommentTime(c.createdAt)}</span>
                  </div>
                  <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.4, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{c.body}</div>
                </div>
              </div>
            );
          })}
          {items.length === 0 && <div style={{ fontSize: 12, color: "var(--text-faint)" }}>No comments yet.</div>}
        </div>
      )}
      {canComment ? (
        <form onSubmit={submit} style={{ display: "flex", gap: 8 }}>
          <input className="tfh-input" placeholder="Write a comment…" value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} />
          <button className="tfh-btn tfh-btn-accent" disabled={sending || !text.trim()} style={{ flexShrink: 0 }}>{sending ? "…" : "Send"}</button>
        </form>
      ) : (
        <div style={{ fontSize: 11.5, color: "var(--text-faint)" }}>Only the admin, lead, or the assignee can comment here.</div>
      )}
      {error && <div style={{ fontSize: 12, color: "var(--pri-high)", marginTop: 8 }}>{error}</div>}
    </div>
  );
};

const TaskDialog = ({ draft, setDraft, users, onClose, onSave, onDelete, saving, canManage, workspaceId, projectId, currentUserId }) => {
  const [subtaskText, setSubtaskText] = useState("");
  const titleRef = useRef(null);
  useEffect(() => { titleRef.current?.focus(); }, []);

  const canAttach = canManage || draft.assigneeId === currentUserId;

  const addSubtask = () => {
    if (!subtaskText.trim()) return;
    setDraft({ ...draft, subtasks: [...draft.subtasks, { id: `local-${Date.now()}`, text: subtaskText.trim(), done: false }] });
    setSubtaskText("");
  };
  const toggleSubtask = (id) => setDraft({ ...draft, subtasks: draft.subtasks.map((s) => (s.id === id ? { ...s, done: !s.done } : s)) });
  const removeSubtask = (id) => setDraft({ ...draft, subtasks: draft.subtasks.filter((s) => s.id !== id) });

  return (
    <div className="tfh-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="tfh-card tfh-fade-in" style={{ width: "100%", maxWidth: 560, maxHeight: "88vh", overflowY: "auto", padding: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span className="tfh-display" style={{ fontSize: 19, fontWeight: 600 }}>{draft.id ? "Edit task" : "New task"}</span>
          <button className="tfh-btn tfh-btn-ghost" style={{ padding: 6 }} onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>

        {!canManage && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-dim)", background: "var(--raised)", padding: "9px 12px", borderRadius: 10, marginBottom: 14 }}>
            <Lock size={13} /> You can move this task and check off items — only your admin or lead can edit the details.
          </div>
        )}

        <label className="tfh-label" htmlFor="tfh-title">Title</label>
        <input id="tfh-title" ref={titleRef} disabled={!canManage} className="tfh-input" placeholder="What needs doing?" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} style={{ marginBottom: 14, opacity: canManage ? 1 : 0.7 }} />

        <label className="tfh-label" htmlFor="tfh-desc">Description</label>
        <textarea id="tfh-desc" disabled={!canManage} className="tfh-input" rows={3} placeholder="Add context so anyone on the team can pick this up" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} style={{ marginBottom: 14, resize: "vertical", opacity: canManage ? 1 : 0.7 }} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
          <div>
            <label className="tfh-label">Stage</label>
            <select className="tfh-input" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
              {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className="tfh-label">Priority</label>
            <select disabled={!canManage} className="tfh-input" value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value })} style={{ opacity: canManage ? 1 : 0.7 }}>
              {Object.entries(PRIORITIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div>
            <label className="tfh-label">Assignee</label>
            <select disabled={!canManage} className="tfh-input" value={draft.assigneeId} onChange={(e) => setDraft({ ...draft, assigneeId: e.target.value })} style={{ opacity: canManage ? 1 : 0.7 }}>
              {users.map((m) => <option key={m.id} value={m.id}>{m.name}{m.role === "admin" ? " (Admin)" : m.role === "lead" ? " (Lead)" : ""}</option>)}
            </select>
          </div>
          <div>
            <label className="tfh-label">Due date</label>
            <input type="date" disabled={!canManage} className="tfh-input" value={draft.due} onChange={(e) => setDraft({ ...draft, due: e.target.value })} style={{ opacity: canManage ? 1 : 0.7 }} />
          </div>
          <div>
            <label className="tfh-label">Time <span style={{ textTransform: "none", fontWeight: 400, color: "var(--text-faint)" }}>(optional — for meetings/appointments)</span></label>
            <input type="time" disabled={!canManage} className="tfh-input" value={draft.dueTime || ""} onChange={(e) => setDraft({ ...draft, dueTime: e.target.value })} style={{ opacity: canManage ? 1 : 0.7 }} />
          </div>
        </div>

        <label className="tfh-label">Checklist</label>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
          {draft.subtasks.map((s) => (
            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "6px 8px", borderRadius: 8, background: "var(--raised)" }}>
              <MiniCheckbox checked={s.done} onClick={() => toggleSubtask(s.id)} />
              <span style={{ fontSize: 13, flex: 1, textDecoration: s.done ? "line-through" : "none", color: s.done ? "var(--text-faint)" : "var(--text)" }}>{s.text}</span>
              {canManage && (
                <button className="tfh-btn tfh-btn-ghost" style={{ padding: 3 }} onClick={() => removeSubtask(s.id)} aria-label="Remove subtask"><X size={13} color="var(--text-faint)" /></button>
              )}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          <input className="tfh-input" placeholder="Add a checklist item and press Enter" value={subtaskText} onChange={(e) => setSubtaskText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSubtask(); } }} />
          <button className="tfh-btn" onClick={addSubtask}><Plus size={14} /></button>
        </div>

        {draft.id && (
          <Attachments workspaceId={workspaceId} projectId={projectId} taskId={draft.id} canAttach={canAttach} />
        )}

        {draft.id && (
          <Links workspaceId={workspaceId} projectId={projectId} taskId={draft.id} canAttach={canAttach} />
        )}

        {draft.id && (
          <Comments workspaceId={workspaceId} projectId={projectId} taskId={draft.id} canComment={true} currentUserId={currentUserId} />
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--line)", paddingTop: 16 }}>
          {draft.id && canManage ? <DeleteButton onConfirm={() => onDelete(draft.id)} /> : <span />}
          <div style={{ display: "flex", gap: 8 }}>
            <button className="tfh-btn" onClick={onClose}>Cancel</button>
            <button className="tfh-btn tfh-btn-accent" disabled={!draft.title.trim() || saving} onClick={onSave}>
              {saving ? "Saving…" : draft.id ? "Save changes" : "Create task"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Bulk add — paste a day's list of activities at once                   */
/* ------------------------------------------------------------------ */
// Matches a leading "Name:" or "Name -" on a line against a workspace member,
// by full name, first name, or initials — so pasting straight from a log
// grouped by person (like "Leo: fix the bug") assigns it to the right person
// without needing a dropdown per line.
function matchMemberPrefix(line, members) {
  const m = line.match(/^([A-Za-z][A-Za-z.\s]{0,30}?)\s*[:\-–—]\s+(.+)$/);
  if (!m) return null;
  const rawName = m[1].trim().toLowerCase();
  const rest = m[2].trim();
  if (!rest) return null;

  const found = members.find((mem) => {
    const full = mem.name.toLowerCase();
    const first = mem.name.split(" ")[0].toLowerCase();
    const initials = mem.initials.toLowerCase();
    return full === rawName || first === rawName || initials === rawName;
  });
  return found ? { member: found, rest } : null;
}

// Parses the pasted block into one task per non-indented line. A line
// indented under it (spaces, a tab, or a leading "-"/"*") becomes a subtask
// of the task directly above it — matching how the source activity logs
// nest detail bullets under a main line.
function parseBulkText(text, members, defaultAssigneeId) {
  const rawLines = text.split("\n");
  const tasks = [];

  for (const raw of rawLines) {
    if (!raw.trim()) continue;
    const isIndented = /^\s/.test(raw) || /^\s*[-*]\s+/.test(raw.trimStart()) && /^\s/.test(raw);
    const trimmed = raw.trim().replace(/^[-*]\s+/, "");

    if (isIndented && tasks.length > 0) {
      tasks[tasks.length - 1].subtasks.push(trimmed);
      continue;
    }

    const prefixMatch = matchMemberPrefix(trimmed, members);
    if (prefixMatch) {
      tasks.push({ title: prefixMatch.rest, assigneeId: prefixMatch.member.id, assigneeName: prefixMatch.member.name, subtasks: [] });
    } else {
      const fallback = members.find((m) => m.id === defaultAssigneeId);
      tasks.push({ title: trimmed, assigneeId: defaultAssigneeId, assigneeName: fallback?.name || "—", subtasks: [] });
    }
  }
  return tasks;
}

const BulkAddModal = ({ users, currentUserId, onClose, onSubmit }) => {
  const [assigneeId, setAssigneeId] = useState(currentUserId || users[0]?.id || "");
  const [due, setDue] = useState(new Date().toISOString().slice(0, 10));
  const [priority, setPriority] = useState("medium");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const parsed = parseBulkText(text, users, assigneeId);

  const submit = async (e) => {
    e.preventDefault();
    if (parsed.length === 0) return;
    setBusy(true);
    setError("");
    try {
      await onSubmit({ tasks: parsed.map((t) => ({ title: t.title, assigneeId: t.assigneeId, subtasks: t.subtasks })), due, priority });
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tfh-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="tfh-card tfh-fade-in" style={{ width: "100%", maxWidth: 620, maxHeight: "88vh", overflowY: "auto", padding: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span className="tfh-display" style={{ fontSize: 19, fontWeight: 600 }}>Add a day's tasks at once</span>
          <button className="tfh-btn tfh-btn-ghost" style={{ padding: 6 }} onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div style={{ fontSize: 12.5, color: "var(--text-dim)", marginBottom: 18, lineHeight: 1.5 }}>
          Paste one line per task. Start a line with a name to assign it to that
          person — e.g. <span className="tfh-mono">Leo: fix the Safari bug</span> — otherwise it
          goes to whoever's picked below. Indent a line underneath a task to make
          it a checklist item instead of a new task. A leading time like{" "}
          <span className="tfh-mono">9:00 AM</span> is pulled into its own field automatically.
        </div>

        <form onSubmit={submit}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
            <div>
              <label className="tfh-label">Default assignee <span style={{ textTransform: "none", fontWeight: 400 }}>(for lines with no name)</span></label>
              <select className="tfh-input" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
                {users.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <label className="tfh-label">Due date</label>
              <input type="date" className="tfh-input" value={due} onChange={(e) => setDue(e.target.value)} />
            </div>
            <div>
              <label className="tfh-label">Priority</label>
              <select className="tfh-input" value={priority} onChange={(e) => setPriority(e.target.value)}>
                {Object.entries(PRIORITIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>

          <label className="tfh-label">Tasks</label>
          <textarea
            className="tfh-input" rows={7} style={{ resize: "vertical", fontFamily: "IBM Plex Mono, monospace", fontSize: 12.5 }}
            placeholder={"Leo: 9:00 AM - Meeting with Director\n  Prepare slides\n  Confirm attendees\nSena: Migrate auth to new provider\nDraft the press release"}
            value={text} onChange={(e) => setText(e.target.value)}
          />

          {parsed.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "10px 0 6px", maxHeight: 180, overflowY: "auto" }}>
              {parsed.map((t, i) => {
                const member = users.find((m) => m.id === t.assigneeId);
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 9px", borderRadius: 8, background: "var(--raised)" }}>
                    <Avatar member={member} size={20} />
                    <span style={{ fontSize: 12.5, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.title}</span>
                    {t.subtasks.length > 0 && (
                      <span className="tfh-chip tfh-mono" style={{ background: "var(--panel)", color: "var(--text-faint)", flexShrink: 0 }}>{t.subtasks.length} sub</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <div style={{ fontSize: 11.5, color: "var(--text-faint)", margin: "6px 0 18px" }}>
            {parsed.length} task{parsed.length === 1 ? "" : "s"} will be created, all due on the date above.
          </div>

          {error && <div style={{ fontSize: 12.5, color: "var(--pri-high)", marginBottom: 14 }}>{error}</div>}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, borderTop: "1px solid var(--line)", paddingTop: 16 }}>
            <button type="button" className="tfh-btn" onClick={onClose}>Cancel</button>
            <button className="tfh-btn tfh-btn-accent" disabled={busy || parsed.length === 0}>
              {busy ? "Creating…" : `Create ${parsed.length || ""} task${parsed.length === 1 ? "" : "s"}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Flow meter                                                           */
/* ------------------------------------------------------------------ */
const FlowMeter = ({ tasks }) => {
  const total = tasks.length || 1;
  return (
    <div>
      <div className="tfh-flow-bar">
        {STAGES.map((s) => {
          const count = tasks.filter((t) => t.status === s.id).length;
          return <div key={s.id} className="tfh-flow-seg" style={{ width: `${(count / total) * 100}%`, background: s.color }} title={`${s.label}: ${count}`} />;
        })}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 10 }}>
        {STAGES.map((s) => (
          <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-dim)" }}>
            <span style={{ width: 7, height: 7, borderRadius: 999, background: s.color }} />
            {s.label} <span className="tfh-mono" style={{ color: "var(--text)" }}>{tasks.filter((t) => t.status === s.id).length}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Notification bell                                                    */
/* ------------------------------------------------------------------ */
const NotificationBell = ({ notifications, onOpenTask, onMarkRead, onMarkAll, permission, onRequestPermission }) => {
  const [open, setOpen] = useState(false);
  const unread = notifications.filter((n) => !n.read).length;
  const ref = useRef(null);

  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div style={{ position: "relative" }} ref={ref}>
      <button className="tfh-btn tfh-btn-ghost" style={{ padding: 8, position: "relative" }} onClick={() => setOpen((o) => !o)} aria-label="Notifications">
        <Bell size={17} />
        {unread > 0 && <span className="tfh-badge-dot" />}
      </button>
      {open && (
        <div className="tfh-card tfh-fade-in" style={{ position: "absolute", right: 0, top: 42, width: 340, maxHeight: 420, overflowY: "auto", zIndex: 30, padding: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 6px 10px" }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>Notifications</span>
            <button className="tfh-btn tfh-btn-ghost" style={{ fontSize: 11.5, padding: "4px 8px" }} onClick={onMarkAll}>Mark all read</button>
          </div>
          {permission !== "granted" && (
            <button className="tfh-btn" style={{ width: "100%", marginBottom: 8, fontSize: 12 }} onClick={onRequestPermission}>
              Enable desktop alerts
            </button>
          )}
          {notifications.length === 0 && (
            <div style={{ fontSize: 12.5, color: "var(--text-faint)", padding: "16px 8px", textAlign: "center" }}>Nothing yet — you'll see it here the moment it happens.</div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => { onMarkRead(n.id); if (n.taskId) onOpenTask(n.taskId); setOpen(false); }}
                style={{ textAlign: "left", background: n.read ? "transparent" : "var(--accent-soft)", border: "1px solid var(--line)", borderRadius: 10, padding: 10, display: "flex", flexDirection: "column", gap: 3 }}
              >
                <span style={{ fontSize: 11, color: "var(--accent)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.03 }}>{NOTIF_LABEL[n.type] || n.type}</span>
                <span style={{ fontSize: 12.5, color: "var(--text)" }}>{n.message}</span>
                <span style={{ fontSize: 11, color: "var(--text-faint)" }}>{timeAgo(n.createdAt)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Dashboard view                                                        */
/* ------------------------------------------------------------------ */
const StatCard = ({ label, value, sub, accent }) => (
  <div className="tfh-card tfh-fade-in" style={{ padding: 18, flex: 1, minWidth: 140 }}>
    <div className="tfh-label" style={{ marginBottom: 10 }}>{label}</div>
    <div className="tfh-display" style={{ fontSize: 30, fontWeight: 600, color: accent || "var(--text)" }}>{value}</div>
    {sub && <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 4 }}>{sub}</div>}
  </div>
);

const DashboardView = ({ tasks, users, currentUser, onOpen, goBoard, hasProject, onCreateProject }) => {
  const [newProjectName, setNewProjectName] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);

  const submitNewProject = async (e) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    setCreatingProject(true);
    try {
      await onCreateProject(newProjectName.trim());
      setNewProjectName("");
    } finally {
      setCreatingProject(false);
    }
  };

  const doneCount = tasks.filter((t) => t.status === "done").length;
  const activeCount = tasks.filter((t) => t.status === "todo").length;
  const overdue = tasks.filter((t) => t.status !== "done" && dueMeta(t.due).label.includes("overdue"));
  const dueSoon = [...tasks].filter((t) => t.status !== "done").sort((a, b) => new Date(a.due) - new Date(b.due)).slice(0, 5);

  const isManager = currentUser?.role === "admin" || currentUser?.role === "lead";

  return (
    <div className="tfh-fade-in" style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div>
        <div className="tfh-display" style={{ fontSize: 26, fontWeight: 600, marginBottom: 4 }}>{isManager ? "Studio pulse" : "Your tasks"}</div>
        <div style={{ fontSize: 13.5, color: "var(--text-dim)" }}>{isManager ? "Where the team's work stands right now, at a glance." : "Everything currently assigned to you in this project."}</div>
      </div>

      {!hasProject && (
        <div className="tfh-card" style={{ padding: 20, borderColor: "var(--accent)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <FolderKanban size={16} color="var(--accent)" />
            <span style={{ fontSize: 13.5, fontWeight: 700 }}>No project yet</span>
          </div>
          <div style={{ fontSize: 12.5, color: "var(--text-dim)", marginBottom: isManager ? 14 : 0, lineHeight: 1.5 }}>
            {isManager
              ? "This workspace doesn't have a project yet — create one to start adding tasks. Everything below will fill in once you do."
              : "This workspace doesn't have a project yet. Check back once your admin or lead sets one up."}
          </div>
          {isManager && (
            <form onSubmit={submitNewProject} style={{ display: "flex", gap: 8, maxWidth: 380 }}>
              <input className="tfh-input" placeholder="Name your first project" value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} />
              <button className="tfh-btn tfh-btn-accent" disabled={creatingProject || !newProjectName.trim()} style={{ flexShrink: 0 }}>
                <Plus size={14} /> {creatingProject ? "Creating…" : "Create"}
              </button>
            </form>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <StatCard label="Total tasks" value={tasks.length} sub="across all stages" />
        <StatCard label="Active" value={activeCount} sub="not yet completed" accent="var(--stage-progress)" />
        <StatCard label="Shipped" value={doneCount} sub="marked done" accent="var(--stage-done)" />
        <StatCard label="Overdue" value={overdue.length} sub={overdue.length ? "needs attention" : "all clear"} accent={overdue.length ? "var(--pri-high)" : "var(--stage-done)"} />
      </div>

      <div className="tfh-card" style={{ padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>Flow across stages</span>
          {hasProject && <button className="tfh-btn tfh-btn-ghost" onClick={goBoard} style={{ fontSize: 12 }}>Open board <ArrowRight size={13} /></button>}
        </div>
        <FlowMeter tasks={tasks} />
      </div>

      <div className="tfh-card" style={{ padding: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>Coming due</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {dueSoon.map((t) => {
            const meta = dueMeta(t.due);
            const a = memberById(users, t.assigneeId);
            return (
              <button key={t.id} onClick={() => onOpen(t)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 8px", borderRadius: 10, background: "transparent", border: "none", color: "var(--text)", textAlign: "left" }}>
                <span style={{ width: 7, height: 7, borderRadius: 999, background: STAGES.find((s) => s.id === t.status).color, flexShrink: 0 }} />
                {t.dueTime && <span className="tfh-mono" style={{ fontSize: 11.5, color: "var(--accent)", flexShrink: 0 }}>{formatTimeLabel(t.dueTime)}</span>}
                <span style={{ fontSize: 13.5, flex: 1 }}>{t.title}</span>
                <PriorityChip level={t.priority} />
                <span style={{ fontSize: 12, color: meta.tone, minWidth: 92, textAlign: "right" }}>{meta.label}</span>
                <Avatar member={a} size={22} />
              </button>
            );
          })}
          {dueSoon.length === 0 && <div style={{ fontSize: 12.5, color: "var(--text-faint)" }}>Nothing outstanding.</div>}
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Board view                                                            */
/* ------------------------------------------------------------------ */
const BoardView = ({ tasks, users, onOpen, onMove, onAdd, onBulkAdd, search, setSearch, priorityFilter, setPriorityFilter, assigneeFilter, setAssigneeFilter, canManage }) => {
  const draggingId = useRef(null);
  const filtered = tasks
    .filter((t) => {
      if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
      if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;
      if (assigneeFilter !== "all" && t.assigneeId !== assigneeFilter) return false;
      return true;
    })
    .sort((a, b) => `${a.due || "9999"} ${a.dueTime || "99:99"}`.localeCompare(`${b.due || "9999"} ${b.dueTime || "99:99"}`));

  return (
    <div className="tfh-fade-in" style={{ display: "flex", flexDirection: "column", gap: 16, height: "100%" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <div style={{ position: "relative", flex: "1 1 220px", maxWidth: 320 }}>
          <Search size={14} color="var(--text-faint)" style={{ position: "absolute", left: 11, top: 10 }} />
          <input className="tfh-input" style={{ paddingLeft: 32 }} placeholder="Search tasks" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="tfh-input" style={{ width: "auto" }} value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
          <option value="all">All priorities</option>
          {Object.entries(PRIORITIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        {canManage && (
          <select className="tfh-input" style={{ width: "auto" }} value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)}>
            <option value="all">Everyone</option>
            {users.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        )}
        {canManage && (
          <button className="tfh-btn tfh-btn-ghost" style={{ marginLeft: "auto" }} onClick={onBulkAdd}><ClipboardList size={14} /> Bulk add</button>
        )}
        {canManage && (
          <button className="tfh-btn tfh-btn-accent" onClick={() => onAdd("todo")}><Plus size={14} /> New task</button>
        )}
      </div>

      <div className="tfh-board-grid" style={{ display: "grid", gridTemplateColumns: `repeat(${STAGES.length}, minmax(0,1fr))`, gap: 14, flex: 1, overflowX: "auto", paddingBottom: 4, maxWidth: STAGES.length <= 2 ? 720 : "none" }}>
        {STAGES.map((stage) => (
          <Column
            key={stage.id} stage={stage} users={users} canManage={canManage}
            tasks={filtered.filter((t) => t.status === stage.id)}
            onOpen={onOpen} onAdd={onAdd}
            onDragStart={(e, id) => { draggingId.current = id; e.dataTransfer.effectAllowed = "move"; }}
            onDropTask={(stageId) => { if (draggingId.current) onMove(draggingId.current, stageId); draggingId.current = null; }}
          />
        ))}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Team view                                                             */
/* ------------------------------------------------------------------ */
const ROLE_LABEL = { admin: "Admin", lead: "Lead", member: "Member" };
const ROLE_BADGE_STYLE = {
  admin: { background: "var(--stage-done)22", color: "var(--stage-done)", borderColor: "var(--stage-done)40" },
  lead: { background: "var(--accent-soft)", color: "var(--accent)", borderColor: "var(--accent)40" },
  member: { background: "var(--raised)", color: "var(--text-dim)", borderColor: "var(--line)" },
};
const RoleBadge = ({ role }) => (
  <span className="tfh-chip" style={ROLE_BADGE_STYLE[role] || ROLE_BADGE_STYLE.member}>
    {role === "admin" && <Shield size={11} />}
    {role === "lead" && <Crown size={11} />}
    {ROLE_LABEL[role] || role}
  </span>
);

const RemoveMemberButton = ({ onConfirm }) => {
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 2500); return () => clearTimeout(t); }, [armed]);
  return armed ? (
    <button className="tfh-btn tfh-btn-danger" style={{ width: "100%", fontSize: 12, marginTop: 8 }} onClick={onConfirm}>
      <UserPlus size={12} style={{ transform: "rotate(45deg)" }} /> Click to confirm removal
    </button>
  ) : (
    <button className="tfh-btn tfh-btn-ghost" style={{ width: "100%", fontSize: 12, marginTop: 8, color: "var(--pri-high)" }} onClick={() => setArmed(true)}>
      Remove from team
    </button>
  );
};

const PostEditor = ({ member, canEdit, onSave }) => {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(member.title);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setValue(member.title); }, [member.title]);

  if (!editing) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{member.title}</span>
        {canEdit && (
          <button type="button" onClick={() => setEditing(true)} className="tfh-btn tfh-btn-ghost" style={{ padding: 2 }} aria-label="Edit post/designation">
            <Pencil size={11} color="var(--text-faint)" />
          </button>
        )}
      </div>
    );
  }

  const save = async () => {
    if (!value.trim()) return;
    setBusy(true);
    try {
      await onSave(value.trim());
      setEditing(false);
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
      <input
        autoFocus list="post-suggestions" className="tfh-input" style={{ fontSize: 12, padding: "4px 8px" }}
        value={value} onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
      />
      <button type="button" onClick={save} disabled={busy} className="tfh-btn tfh-btn-ghost" style={{ padding: 4, flexShrink: 0 }} aria-label="Save"><Check size={12} color="var(--stage-done)" /></button>
      <button type="button" onClick={() => setEditing(false)} className="tfh-btn tfh-btn-ghost" style={{ padding: 4, flexShrink: 0 }} aria-label="Cancel"><X size={12} color="var(--text-faint)" /></button>
    </div>
  );
};

const TeamView = ({ tasks, users, currentUser, onOpen, onSetRole, onSetTitle, onInvite, onRemoveMember, canManage, workspaceId }) => {
  const isAdmin = currentUser.role === "admin";
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteStatus, setInviteStatus] = useState(null);
  const [inviting, setInviting] = useState(false);
  const [roleBusy, setRoleBusy] = useState(null);
  const [removeBusy, setRemoveBusy] = useState(null);
  const [workload, setWorkload] = useState(null);
  const [workloadLoading, setWorkloadLoading] = useState(true);

  useEffect(() => {
    if (!canManage || !workspaceId) { setWorkloadLoading(false); return; }
    let cancelled = false;
    setWorkloadLoading(true);
    api.getWorkload(workspaceId)
      .then((res) => { if (!cancelled) setWorkload(res.workload); })
      .catch(() => { if (!cancelled) setWorkload(null); })
      .finally(() => { if (!cancelled) setWorkloadLoading(false); });
    return () => { cancelled = true; };
  }, [canManage, workspaceId]);

  const chartData = (workload || []).map((w) => ({ name: w.name.split(" ")[0], active: w.active, color: users.find((u) => u.id === w.id)?.color || "var(--accent)" }));

  const submitInvite = async (e) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setInviteStatus(null);
    try {
      const result = await onInvite(inviteEmail.trim());
      setInviteStatus({ ok: true, text: result.status === "added" ? `${inviteEmail} is on the team now.` : `Invite sent — they'll join automatically when they sign up.` });
      setInviteEmail("");
    } catch (err) {
      setInviteStatus({ ok: false, text: err.message });
    } finally {
      setInviting(false);
    }
  };

  const changeRole = async (userId, role) => {
    setRoleBusy(userId);
    try {
      await onSetRole(userId, role);
    } catch (err) {
      alert(err.message);
    } finally {
      setRoleBusy(null);
    }
  };

  const removeMember = async (userId) => {
    setRemoveBusy(userId);
    try {
      await onRemoveMember(userId);
    } catch (err) {
      alert(err.message);
    } finally {
      setRemoveBusy(null);
    }
  };

  return (
    <div className="tfh-fade-in" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <datalist id="post-suggestions">
        {POST_SUGGESTIONS.map((p) => <option key={p} value={p} />)}
      </datalist>
      <div>
        <div className="tfh-display" style={{ fontSize: 26, fontWeight: 600, marginBottom: 4 }}>The team</div>
        <div style={{ fontSize: 13.5, color: "var(--text-dim)" }}>
          Signed in as <strong>{currentUser.name}</strong> · <RoleBadge role={currentUser.role} />
          {isAdmin ? " — you can assign the team lead, manage roles, and remove members." : " — only the admin can change roles."}
        </div>
      </div>

      {(() => {
        const lead = users.find((m) => m.role === "lead");
        const admin = users.find((m) => m.role === "admin");
        return (
          <div className="tfh-card" style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Crown size={16} color="var(--accent)" />
              <div>
                <div className="tfh-label" style={{ marginBottom: 2 }}>Team Lead</div>
                {lead ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Avatar member={lead} size={20} />
                    <span style={{ fontSize: 13.5, fontWeight: 600 }}>{lead.name}</span>
                  </div>
                ) : (
                  <span style={{ fontSize: 13, color: "var(--text-faint)" }}>Not assigned yet{isAdmin ? " — pick one below" : ""}</span>
                )}
              </div>
            </div>
            <div style={{ width: 1, alignSelf: "stretch", background: "var(--line)" }} />
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Shield size={16} color="var(--stage-done)" />
              <div>
                <div className="tfh-label" style={{ marginBottom: 2 }}>Admin</div>
                {admin && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Avatar member={admin} size={20} />
                    <span style={{ fontSize: 13.5, fontWeight: 600 }}>{admin.name}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {canManage && (
        <div className="tfh-card" style={{ padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Invite a teammate</div>
          <form onSubmit={submitInvite} style={{ display: "flex", gap: 8 }}>
            <input type="email" className="tfh-input" placeholder="teammate@company.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} required />
            <button className="tfh-btn tfh-btn-accent" disabled={inviting} style={{ flexShrink: 0 }}>
              <UserPlus size={14} /> {inviting ? "Sending…" : "Invite"}
            </button>
          </form>
          {inviteStatus && (
            <div style={{ fontSize: 12, marginTop: 10, color: inviteStatus.ok ? "var(--stage-done)" : "var(--pri-high)" }}>{inviteStatus.text}</div>
          )}
          <div style={{ fontSize: 11.5, color: "var(--text-faint)", marginTop: 8 }}>
            New teammates join as <strong>Member</strong> by default — they'll only see tasks assigned to them until you promote them.
          </div>
        </div>
      )}

      {canManage && (
        <div className="tfh-card" style={{ padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 16 }}>Active workload <span style={{ fontWeight: 400, color: "var(--text-faint)" }}>— across every project</span></div>
          {workloadLoading ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "20px 0", justifyContent: "center" }}><Spinner size={16} /> <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Loading…</span></div>
          ) : chartData.length === 0 ? (
            <div style={{ fontSize: 12.5, color: "var(--text-faint)", textAlign: "center", padding: "20px 0" }}>No workload data yet.</div>
          ) : (
            <div style={{ width: "100%", height: 180 }}>
              <ResponsiveContainer>
                <BarChart data={chartData} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{ fill: "var(--chart-tick)", fontSize: 11 }} axisLine={{ stroke: "var(--chart-grid)" }} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fill: "var(--chart-tick)", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: "var(--chart-tooltip-bg)", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12 }} cursor={{ fill: "var(--raised)" }} />
                  <Bar dataKey="active" radius={[6, 6, 0, 0]}>
                    {chartData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
        {users.map((m) => {
          const isMe = currentUser.id === m.id;
          const showTaskInfo = canManage || isMe;
          const mine = tasks.filter((t) => t.assigneeId === m.id);
          const active = mine.filter((t) => t.status !== "done");
          return (
            <div key={m.id} className="tfh-card" style={{ padding: 16, borderColor: isMe ? "var(--accent)" : "var(--line)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <Avatar member={m} size={36} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {m.name}{isMe && <span style={{ color: "var(--text-faint)", fontWeight: 500 }}> · you</span>}
                  </div>
                  <PostEditor member={m} canEdit={isMe || isAdmin} onSave={(title) => onSetTitle(m.id, title)} />
                </div>
              </div>

              <div style={{ marginBottom: 10 }}><RoleBadge role={m.role} /></div>

              {showTaskInfo ? (
                <>
                  <div style={{ display: "flex", gap: 14, fontSize: 12, color: "var(--text-dim)", marginBottom: 10 }}>
                    <span><strong className="tfh-mono" style={{ color: "var(--text)" }}>{active.length}</strong> active</span>
                    <span><strong className="tfh-mono" style={{ color: "var(--text)" }}>{mine.length - active.length}</strong> shipped</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
                    {active.slice(0, 3).map((t) => (
                      <button key={t.id} onClick={() => onOpen(t)} style={{ textAlign: "left", background: "var(--raised)", border: "none", color: "var(--text-dim)", fontSize: 12, padding: "6px 8px", borderRadius: 7 }}>{t.title}</button>
                    ))}
                    {active.length === 0 && <div style={{ fontSize: 12, color: "var(--text-faint)" }}>Nothing active — fully clear.</div>}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 11.5, color: "var(--text-faint)", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
                  <Lock size={11} /> Only visible to {m.name.split(" ")[0]} and the team lead
                </div>
              )}

              {isAdmin && (
                <select
                  className="tfh-input" style={{ fontSize: 12 }} value={m.role} disabled={roleBusy === m.id || removeBusy === m.id}
                  onChange={(e) => changeRole(m.id, e.target.value)}
                >
                  <option value="admin">Admin</option>
                  <option value="lead">Lead</option>
                  <option value="member">Member</option>
                </select>
              )}

              {isAdmin && !isMe && (
                removeBusy === m.id ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 12, color: "var(--text-dim)" }}><Spinner size={13} /> Removing…</div>
                ) : (
                  <RemoveMemberButton onConfirm={() => removeMember(m.id)} />
                )
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Calendar view                                                         */
/* ------------------------------------------------------------------ */
const CalendarView = ({ tasks, users, onOpen }) => {
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [selected, setSelected] = useState(null);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = new Date().toISOString().slice(0, 10);

  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const dateStr = (d) => `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const tasksOn = (d) => tasks.filter((t) => t.due === dateStr(d)).sort((a, b) => (a.dueTime || "99:99").localeCompare(b.dueTime || "99:99"));
  const selectedTasks = selected ? tasksOn(selected) : [];

  return (
    <div className="tfh-fade-in" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <div className="tfh-display" style={{ fontSize: 26, fontWeight: 600, marginBottom: 4 }}>Calendar</div>
        <div style={{ fontSize: 13.5, color: "var(--text-dim)" }}>Every dot is something due that day.</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 16 }}>
        <div className="tfh-card" style={{ padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <button className="tfh-btn tfh-btn-ghost" onClick={() => setCursor(new Date(year, month - 1, 1))}><ChevronLeft size={16} /></button>
            <span style={{ fontSize: 14, fontWeight: 700 }}>{cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</span>
            <button className="tfh-btn tfh-btn-ghost" onClick={() => setCursor(new Date(year, month + 1, 1))}><ChevronRight size={16} /></button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, marginBottom: 6 }}>
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <div key={i} style={{ fontSize: 11, color: "var(--text-faint)", textAlign: "center", fontWeight: 600 }}>{d}</div>)}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
            {cells.map((d, i) => {
              if (!d) return <div key={i} />;
              const ds = dateStr(d);
              const dayTasks = tasksOn(d);
              const isToday = ds === todayStr;
              const isSelected = selected === d;
              return (
                <button key={i} onClick={() => setSelected(isSelected ? null : d)} style={{ aspectRatio: "1", borderRadius: 10, border: isSelected ? "1.5px solid var(--accent)" : "1px solid var(--line)", background: isToday ? "var(--accent-soft)" : "var(--raised)", color: "var(--text)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, padding: 2 }}>
                  <span style={{ fontSize: 12, fontWeight: isToday ? 700 : 500 }}>{d}</span>
                  <div style={{ display: "flex", gap: 2 }}>
                    {dayTasks.slice(0, 3).map((t) => <span key={t.id} style={{ width: 4, height: 4, borderRadius: 999, background: PRIORITIES[t.priority].color }} />)}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="tfh-card" style={{ padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
            {selected ? `Due ${new Date(dateStr(selected) + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : "Pick a day"}
          </div>
          {selected && selectedTasks.length === 0 && <div style={{ fontSize: 12.5, color: "var(--text-faint)" }}>Nothing due this day.</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {selectedTasks.map((t) => {
              const a = memberById(users, t.assigneeId);
              return (
                <button key={t.id} onClick={() => onOpen(t)} style={{ textAlign: "left", background: "var(--raised)", border: "1px solid var(--line)", borderRadius: 10, padding: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {t.dueTime && <span className="tfh-mono" style={{ fontSize: 11, color: "var(--accent)" }}>{formatTimeLabel(t.dueTime)}</span>}
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{t.title}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <PriorityChip level={t.priority} />
                    <Avatar member={a} size={20} />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Files view — project-level reference documents, not tied to a task    */
/* ------------------------------------------------------------------ */
const DocumentRow = ({ doc, workspaceId, projectId, canManage, onRemove }) => {
  const isImage = doc.mimeType.startsWith("image/");
  const sizeLabel = doc.sizeBytes > 1024 * 1024 ? `${(doc.sizeBytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(doc.sizeBytes / 1024))} KB`;

  const openOrDownload = async () => {
    try {
      const url = await api.getDocumentBlobUrl(workspaceId, projectId, doc.id);
      const a = document.createElement("a");
      a.href = url;
      if (isImage || doc.mimeType === "application/pdf") a.target = "_blank"; else a.download = doc.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch {
      // ignore — row stays put so they can retry
    }
  };

  return (
    <div className="tfh-card" style={{ padding: 14, display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ width: 38, height: 38, borderRadius: 9, background: "var(--raised)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {isImage ? <ImageIcon size={16} color="var(--text-faint)" /> : <FileText size={16} color="var(--text-faint)" />}
      </div>
      <button type="button" onClick={openOrDownload} style={{ flex: 1, minWidth: 0, textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{doc.fileName}</div>
        <div style={{ fontSize: 11.5, color: "var(--text-faint)" }}>{sizeLabel} · {doc.uploaderName || "Unknown"} · {new Date(doc.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</div>
      </button>
      <button type="button" onClick={openOrDownload} className="tfh-btn tfh-btn-ghost" style={{ padding: 6 }} aria-label="Download"><Download size={14} color="var(--text-faint)" /></button>
      {canManage && <button type="button" onClick={onRemove} className="tfh-btn tfh-btn-ghost" style={{ padding: 6 }} aria-label="Delete"><Trash2 size={14} color="var(--text-faint)" /></button>}
    </div>
  );
};

const DocumentsView = ({ workspaceId, projectId, projectName, canManage }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const { documents } = await api.getDocuments(workspaceId, projectId);
      setItems(documents);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [workspaceId, projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setUploading(true);
    setError("");
    try {
      for (const file of files) await api.uploadDocument(workspaceId, projectId, file);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const remove = async (id) => {
    try {
      await api.deleteDocument(workspaceId, projectId, id);
      setItems((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="tfh-fade-in" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div className="tfh-display" style={{ fontSize: 26, fontWeight: 600, marginBottom: 4 }}>Files</div>
          <div style={{ fontSize: 13.5, color: "var(--text-dim)" }}>Reference documents for {projectName || "this project"} — visible to everyone here, not tied to a single task.</div>
        </div>
        {canManage && (
          <>
            <input ref={fileInputRef} type="file" multiple style={{ display: "none" }} onChange={(e) => handleFiles(e.target.files)} />
            <button className="tfh-btn tfh-btn-accent" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              <Upload size={14} /> {uploading ? "Uploading…" : "Upload file"}
            </button>
          </>
        )}
      </div>

      {error && <div style={{ fontSize: 12.5, color: "var(--pri-high)" }}>{error}</div>}

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 30, justifyContent: "center" }}><Spinner /> <span style={{ fontSize: 13, color: "var(--text-dim)" }}>Loading files…</span></div>
      ) : items.length === 0 ? (
        <div className="tfh-card" style={{ padding: 30, textAlign: "center" }}>
          <FolderOpen size={22} color="var(--text-faint)" style={{ marginBottom: 8 }} />
          <div style={{ fontSize: 13, color: "var(--text-dim)" }}>
            {canManage ? "No files yet — upload circulars, guidelines, or reference material for the whole team." : "No files here yet."}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((doc) => (
            <DocumentRow key={doc.id} doc={doc} workspaceId={workspaceId} projectId={projectId} canManage={canManage} onRemove={() => remove(doc.id)} />
          ))}
        </div>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Milestone view — exactly one per project, editable by admin/lead      */
/* ------------------------------------------------------------------ */
const MilestoneView = ({ workspaceId, projectId, project, canManage, onProjectUpdated, onCreateProject }) => {
  const [milestone, setMilestone] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const { milestone } = await api.getMilestone(workspaceId, projectId);
      setMilestone(milestone);
      if (milestone) { setTitle(milestone.title); setDescription(milestone.description); setTargetDate(milestone.targetDate || ""); }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); setEditing(false); }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setError("");
    try {
      const { milestone: saved } = await api.setMilestone(workspaceId, projectId, { title: title.trim(), description, targetDate: targetDate || null });
      setMilestone(saved);
      setEditing(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleComplete = async (complete) => {
    setCompleting(true);
    try {
      const { project: updated } = await api.setProjectComplete(workspaceId, projectId, complete);
      onProjectUpdated(updated);
      setConfirmComplete(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setCompleting(false);
    }
  };

  const isComplete = !!project?.completedAt;

  return (
    <div className="tfh-fade-in" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <div className="tfh-display" style={{ fontSize: 26, fontWeight: 600, marginBottom: 4 }}>Milestone</div>
        <div style={{ fontSize: 13.5, color: "var(--text-dim)" }}>One key milestone for this project — set and updated by the admin or team lead.</div>
      </div>

      {isComplete && (
        <div className="tfh-card" style={{ padding: 18, borderColor: "var(--stage-done)", display: "flex", alignItems: "center", gap: 12 }}>
          <Check size={18} color="var(--stage-done)" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>Project complete</div>
            <div style={{ fontSize: 12, color: "var(--text-dim)" }}>Marked done on {new Date(project.completedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}. Its tasks and files stay available in Project History.</div>
          </div>
          {canManage && (
            <button className="tfh-btn" onClick={() => toggleComplete(false)} disabled={completing}>{completing ? "…" : "Reopen"}</button>
          )}
        </div>
      )}

      <div className="tfh-card" style={{ padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>Project deadline</span>
        </div>
        <div style={{ fontSize: 13, color: project?.deadline ? "var(--text)" : "var(--text-faint)" }}>
          {project?.deadline ? new Date(project.deadline + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : "No deadline set for this project."}
        </div>
      </div>

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 30, justifyContent: "center" }}><Spinner /> <span style={{ fontSize: 13, color: "var(--text-dim)" }}>Loading…</span></div>
      ) : editing ? (
        <form onSubmit={save} className="tfh-card" style={{ padding: 20 }}>
          <label className="tfh-label" htmlFor="ms-title">Milestone title</label>
          <input id="ms-title" autoFocus className="tfh-input" placeholder="e.g. Launch to citizens" value={title} onChange={(e) => setTitle(e.target.value)} style={{ marginBottom: 14 }} />
          <label className="tfh-label" htmlFor="ms-desc">Description</label>
          <textarea id="ms-desc" className="tfh-input" rows={3} placeholder="What does hitting this milestone look like?" value={description} onChange={(e) => setDescription(e.target.value)} style={{ marginBottom: 14, resize: "vertical" }} />
          <label className="tfh-label" htmlFor="ms-date">Target date</label>
          <input id="ms-date" type="date" className="tfh-input" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} style={{ marginBottom: 16 }} />
          {error && <div style={{ fontSize: 12.5, color: "var(--pri-high)", marginBottom: 14 }}>{error}</div>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" className="tfh-btn" onClick={() => setEditing(false)}>Cancel</button>
            <button className="tfh-btn tfh-btn-accent" disabled={saving || !title.trim()}>{saving ? "Saving…" : "Save milestone"}</button>
          </div>
        </form>
      ) : milestone ? (
        <div className="tfh-card" style={{ padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Flag size={16} color="var(--accent)" />
              <span style={{ fontSize: 16, fontWeight: 600 }}>{milestone.title}</span>
            </div>
            {canManage && <button className="tfh-btn tfh-btn-ghost" style={{ padding: 6 }} onClick={() => setEditing(true)} aria-label="Edit milestone"><Pencil size={13} /></button>}
          </div>
          {milestone.description && <div style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.5, marginBottom: 10 }}>{milestone.description}</div>}
          {milestone.targetDate && (
            <div className="tfh-chip" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
              <CalendarDays size={11} /> Target: {new Date(milestone.targetDate + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
            </div>
          )}
        </div>
      ) : (
        <div className="tfh-card" style={{ padding: 30, textAlign: "center" }}>
          <Flag size={22} color="var(--text-faint)" style={{ marginBottom: 8 }} />
          <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: canManage ? 14 : 0 }}>
            {canManage ? "No milestone set yet for this project." : "No milestone has been set for this project yet."}
          </div>
          {canManage && <button className="tfh-btn tfh-btn-accent" onClick={() => setEditing(true)}><Plus size={14} /> Set a milestone</button>}
        </div>
      )}

      {canManage && !isComplete && (
        <div className="tfh-card" style={{ padding: 20, borderColor: "var(--pri-high)" }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Mark this project complete</div>
          <div style={{ fontSize: 12.5, color: "var(--text-dim)", marginBottom: 14, lineHeight: 1.5 }}>
            Moves this project to the workspace's history. Nothing is deleted — every task and file stays exactly where it is, just marked done.
          </div>
          {confirmComplete ? (
            <div style={{ display: "flex", gap: 8 }}>
              <button className="tfh-btn" onClick={() => setConfirmComplete(false)}>Cancel</button>
              <button className="tfh-btn" style={{ borderColor: "var(--pri-high)", color: "var(--pri-high)" }} onClick={() => toggleComplete(true)} disabled={completing}>
                {completing ? "Completing…" : "Yes, mark complete"}
              </button>
            </div>
          ) : (
            <button className="tfh-btn" onClick={() => setConfirmComplete(true)}><Check size={14} /> Mark project complete</button>
          )}
        </div>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Analytics view — driven entirely by server-computed data              */
/* ------------------------------------------------------------------ */
const AnalyticsView = ({ analytics, users, loading, currentUser, onReassign, onOpenTaskById }) => {
  if (loading || !analytics) {
    return <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 40, justifyContent: "center" }}><Spinner /> <span style={{ fontSize: 13, color: "var(--text-dim)" }}>Crunching real numbers…</span></div>;
  }
  const { totals, completedByDay, velocityByMember, workload, overdue } = analytics;

  return (
    <div className="tfh-fade-in" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <div className="tfh-display" style={{ fontSize: 26, fontWeight: 600, marginBottom: 4 }}>Analytics</div>
        <div style={{ fontSize: 13.5, color: "var(--text-dim)" }}>Computed live from real task timestamps on the server.</div>
      </div>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <StatCard label="Cleared this week" value={totals.shippedThisWeek} sub="tasks marked done" accent="var(--stage-done)" />
        <StatCard label="Avg cycle time" value={`${totals.avgCycleTimeDays}d`} sub="create → done" />
        <StatCard label="Active now" value={totals.active} sub="not yet completed" accent="var(--stage-progress)" />
        <StatCard label="Overdue" value={totals.overdue} sub={totals.overdue ? "needs attention" : "all clear"} accent={totals.overdue ? "var(--pri-high)" : "var(--stage-done)"} />
      </div>

      <div className="tfh-card" style={{ padding: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>Completions — last 14 days</div>
        <div style={{ width: "100%", height: 200 }}>
          <ResponsiveContainer>
            <LineChart data={completedByDay} margin={{ top: 6, right: 12, left: -20, bottom: 0 }}>
              <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "var(--chart-tick)", fontSize: 10 }} axisLine={{ stroke: "var(--chart-grid)" }} tickLine={false} interval={1} />
              <YAxis allowDecimals={false} tick={{ fill: "var(--chart-tick)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "var(--chart-tooltip-bg)", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12 }} />
              <Line type="monotone" dataKey="count" stroke="var(--accent)" strokeWidth={2.5} dot={{ r: 3, fill: "var(--accent)" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="tfh-card" style={{ padding: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>Velocity by person — last 7 days</div>
        <div style={{ width: "100%", height: 180 }}>
          <ResponsiveContainer>
            <BarChart data={velocityByMember} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fill: "var(--chart-tick)", fontSize: 11 }} axisLine={{ stroke: "var(--chart-grid)" }} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fill: "var(--chart-tick)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "var(--chart-tooltip-bg)", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12 }} cursor={{ fill: "var(--raised)" }} />
              <Bar dataKey="completed" radius={[6, 6, 0, 0]}>
                {velocityByMember.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="tfh-card" style={{ padding: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>Workload balance</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {workload.map((w) => (
            <div key={w.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 9, background: w.overloaded ? "var(--accent-soft)" : "var(--raised)" }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: w.color }} />
              <span style={{ fontSize: 12.5, flex: 1 }}>{w.name}</span>
              {w.overloaded && <AlertTriangle size={13} color="var(--pri-high)" />}
              <span className="tfh-mono" style={{ fontSize: 12, color: "var(--text-dim)" }}>{w.active} active · {w.shipped} shipped</span>
            </div>
          ))}
        </div>
      </div>

      {overdue.length > 0 && (
        <div className="tfh-card" style={{ padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <AlertTriangle size={15} color="var(--pri-high)" />
            <span style={{ fontSize: 13, fontWeight: 700 }}>Overdue tasks</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {overdue.map((t) => {
              const a = memberById(users, t.assigneeId);
              return (
                <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--raised)", borderRadius: 9, padding: "8px 10px" }}>
                  <button onClick={() => onOpenTaskById(t.id)} style={{ background: "none", border: "none", color: "var(--text)", fontSize: 12.5, flex: 1, textAlign: "left" }}>{t.title}</button>
                  <PriorityChip level={t.priority} />
                  <select className="tfh-input" style={{ width: "auto", fontSize: 11.5, padding: "4px 8px" }} value={t.assigneeId} onChange={(e) => onReassign(t.id, e.target.value)}>
                    {users.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Workspace switcher (sidebar dropdown) + first-run creation screen     */
/* ------------------------------------------------------------------ */
const WorkspaceSwitcher = () => {
  const { workspaces, current, switchTo } = useWorkspace();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Only one workspace ever exists in normal use, so there's nothing to
  // switch between — just show the name, no dropdown chrome at all.
  if (workspaces.length <= 1) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "6px" }}>
        <Logo size={32} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="tfh-display" style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{current?.name || "Flow Hub"}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }} ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ display: "flex", alignItems: "center", gap: 9, padding: "6px", borderRadius: 10, border: "none", background: "transparent", width: "100%", textAlign: "left" }}
      >
        <Logo size={32} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="tfh-display" style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{current?.name || "Flow Hub"}</div>
        </div>
        <ChevronDown size={14} color="var(--text-faint)" />
      </button>

      {open && (
        <div className="tfh-card tfh-fade-in" style={{ position: "absolute", left: 0, top: 46, width: 260, zIndex: 30, padding: 8 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 220, overflowY: "auto" }}>
            {workspaces.map((w) => (
              <button
                key={w.id}
                onClick={() => { switchTo(w.id); setOpen(false); }}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 9px", borderRadius: 8, border: "none", background: w.id === current?.id ? "var(--accent-soft)" : "transparent", color: "var(--text)", textAlign: "left" }}
              >
                <Building2 size={13} color={w.id === current?.id ? "var(--accent)" : "var(--text-faint)"} />
                <span style={{ flex: 1, fontSize: 12.5, fontWeight: w.id === current?.id ? 600 : 500 }}>{w.name}</span>
                {w.role === "admin" && <Shield size={11} color="var(--stage-done)" />}
                {w.role === "lead" && <Crown size={11} color="var(--accent)" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const CreateWorkspaceScreen = () => {
  const { create, refresh } = useWorkspace();
  const { user, logout } = useAuth();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError("");
    try {
      await create(name.trim());
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const checkAgain = async () => {
    setRefreshing(true);
    try { await refresh(); } finally { setRefreshing(false); }
  };

  if (!user.isPlatformAdmin) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div className="tfh-card tfh-fade-in" style={{ width: "100%", maxWidth: 420, padding: 30, textAlign: "center" }}>
          <Logo size={44} />
          <div className="tfh-display" style={{ fontSize: 20, fontWeight: 600, margin: "16px 0 6px" }}>You're not on a workspace yet</div>
          <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 22, lineHeight: 1.5 }}>
            Your account is ready, but you haven't been added to a workspace yet. Ask your administrator to invite <strong>{user.email}</strong>, then check again.
          </div>
          <button onClick={checkAgain} className="tfh-btn tfh-btn-accent" style={{ width: "100%", justifyContent: "center", marginBottom: 10 }} disabled={refreshing}>
            {refreshing ? "Checking…" : "Check again"}
          </button>
          <button onClick={logout} className="tfh-btn tfh-btn-ghost" style={{ width: "100%", justifyContent: "center", fontSize: 12.5 }}>
            <LogOut size={13} /> Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div className="tfh-card tfh-fade-in" style={{ width: "100%", maxWidth: 420, padding: 30 }}>
        <Logo size={44} />
        <div style={{ height: 14 }} />
        <div className="tfh-display" style={{ fontSize: 22, fontWeight: 600, marginBottom: 6 }}>Create your first workspace</div>
        <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 22, lineHeight: 1.5 }}>
          A workspace is its own board, team, and task history. Staff won't see this screen — you invite them in afterwards from the Team page.
        </div>
        <form onSubmit={submit}>
          <label className="tfh-label" htmlFor="ws-name">Workspace name</label>
          <input id="ws-name" autoFocus className="tfh-input" placeholder="e.g. Product Team" value={name} onChange={(e) => setName(e.target.value)} style={{ marginBottom: 16 }} />
          {error && <div style={{ fontSize: 12.5, color: "var(--pri-high)", marginBottom: 14 }}>{error}</div>}
          <button className="tfh-btn tfh-btn-accent" style={{ width: "100%", padding: "10px 14px" }} disabled={busy || !name.trim()}>
            {busy ? "Creating…" : "Create workspace"}
          </button>
        </form>
        <button onClick={logout} className="tfh-btn tfh-btn-ghost" style={{ width: "100%", justifyContent: "center", marginTop: 10, fontSize: 12.5 }}>
          <LogOut size={13} /> Sign out
        </button>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Project switcher + first-run project creation screen                  */
/* ------------------------------------------------------------------ */
const ProjectSwitcher = ({ canManage }) => {
  const { projects, current, switchTo, create } = useProject();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setCreating(false); } };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const submitCreate = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await create(name.trim());
      setName("");
      setCreating(false);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  if (!projects.length) {
    if (!canManage) return null;
    return (
      <form onSubmit={submitCreate} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <input autoFocus className="tfh-input" style={{ fontSize: 12.5 }} placeholder="Name your first project" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="tfh-btn tfh-btn-accent" style={{ fontSize: 12.5 }} disabled={busy || !name.trim()}>
          <Plus size={13} /> {busy ? "Creating…" : "Create project"}
        </button>
      </form>
    );
  }

  const activeProjects = projects.filter((p) => !p.completedAt);
  const completedProjects = projects.filter((p) => p.completedAt);

  return (
    <div style={{ position: "relative" }} ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="tfh-nav-item"
        style={{ background: "var(--raised)", border: "1px solid var(--line)" }}
      >
        <FolderKanban size={14} />
        <span style={{ flex: 1, textAlign: "left", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{current?.name || "Select project"}</span>
        {current?.completedAt && <Check size={12} color="var(--stage-done)" />}
        <ChevronDown size={13} color="var(--text-faint)" />
      </button>

      {open && (
        <div className="tfh-card tfh-fade-in" style={{ position: "absolute", left: 0, top: 42, width: 250, zIndex: 30, padding: 8 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 220, overflowY: "auto" }}>
            {activeProjects.map((p) => (
              <button
                key={p.id}
                onClick={() => { switchTo(p.id); setOpen(false); }}
                style={{ display: "flex", flexDirection: "column", gap: 2, padding: "8px 9px", borderRadius: 8, border: "none", background: p.id === current?.id ? "var(--accent-soft)" : "transparent", color: "var(--text)", textAlign: "left" }}
              >
                <span style={{ fontSize: 12.5, fontWeight: p.id === current?.id ? 600 : 500 }}>{p.name}</span>
                <span className="tfh-mono" style={{ fontSize: 10.5, color: "var(--text-faint)" }}>{p.taskCount} tasks · {p.doneCount} done</span>
              </button>
            ))}
            {activeProjects.length === 0 && (
              <div style={{ fontSize: 11.5, color: "var(--text-faint)", padding: "8px 9px" }}>No active projects.</div>
            )}
          </div>

          {completedProjects.length > 0 && (
            <div style={{ borderTop: "1px solid var(--line)", marginTop: 6, paddingTop: 6 }}>
              <button onClick={() => setShowHistory((v) => !v)} className="tfh-nav-item" style={{ fontSize: 11.5, color: "var(--text-faint)" }}>
                <Check size={12} /> Project History ({completedProjects.length}) {showHistory ? "▾" : "▸"}
              </button>
              {showHistory && (
                <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 160, overflowY: "auto", marginTop: 2 }}>
                  {completedProjects.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => { switchTo(p.id); setOpen(false); }}
                      style={{ display: "flex", flexDirection: "column", gap: 2, padding: "8px 9px", borderRadius: 8, border: "none", background: p.id === current?.id ? "var(--accent-soft)" : "transparent", color: "var(--text-dim)", textAlign: "left" }}
                    >
                      <span style={{ fontSize: 12.5 }}>{p.name}</span>
                      <span className="tfh-mono" style={{ fontSize: 10.5, color: "var(--text-faint)" }}>Completed {new Date(p.completedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {canManage && (
            <div style={{ borderTop: "1px solid var(--line)", marginTop: 6, paddingTop: 6 }}>
              {creating ? (
                <form onSubmit={submitCreate} style={{ display: "flex", gap: 6, padding: "4px" }}>
                  <input autoFocus className="tfh-input" style={{ fontSize: 12.5 }} placeholder="Project name" value={name} onChange={(e) => setName(e.target.value)} />
                  <button className="tfh-btn tfh-btn-accent" style={{ padding: "6px 10px", flexShrink: 0 }} disabled={busy}>{busy ? "…" : "Add"}</button>
                </form>
              ) : (
                <button onClick={() => setCreating(true)} className="tfh-nav-item" style={{ fontSize: 12.5 }}>
                  <Plus size={14} /> New project
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const CreateProjectScreen = ({ canManage, onCreate, workspaceName, logout }) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError("");
    try {
      await onCreate(name.trim(), description.trim(), deadline || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!canManage) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div className="tfh-card tfh-fade-in" style={{ width: "100%", maxWidth: 420, padding: 30, textAlign: "center" }}>
          <Logo size={44} />
          <div className="tfh-display" style={{ fontSize: 20, fontWeight: 600, margin: "16px 0 6px" }}>No projects yet</div>
          <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 20, lineHeight: 1.5 }}>
            <strong>{workspaceName}</strong> doesn't have any projects set up. Ask your admin or team lead to create one — you'll see it here as soon as they do.
          </div>
          <button onClick={logout} className="tfh-btn tfh-btn-ghost" style={{ width: "100%", justifyContent: "center", fontSize: 12.5 }}>
            <LogOut size={13} /> Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div className="tfh-card tfh-fade-in" style={{ width: "100%", maxWidth: 440, padding: 30 }}>
        <Logo size={44} />
        <div style={{ height: 14 }} />
        <div className="tfh-display" style={{ fontSize: 22, fontWeight: 600, marginBottom: 6 }}>Create your first project</div>
        <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 22, lineHeight: 1.5 }}>
          Projects keep tasks segregated inside <strong>{workspaceName}</strong> — each one gets its own board, checklist, and history.
        </div>
        <form onSubmit={submit}>
          <label className="tfh-label" htmlFor="proj-name">Project name</label>
          <input id="proj-name" autoFocus className="tfh-input" placeholder="e.g. Website Relaunch" value={name} onChange={(e) => setName(e.target.value)} style={{ marginBottom: 14 }} />
          <label className="tfh-label" htmlFor="proj-desc">Description (optional)</label>
          <textarea id="proj-desc" className="tfh-input" rows={2} placeholder="What is this project about?" value={description} onChange={(e) => setDescription(e.target.value)} style={{ marginBottom: 14, resize: "vertical" }} />
          <label className="tfh-label" htmlFor="proj-deadline">Deadline <span style={{ textTransform: "none", fontWeight: 400 }}>(optional)</span></label>
          <input id="proj-deadline" type="date" className="tfh-input" value={deadline} onChange={(e) => setDeadline(e.target.value)} style={{ marginBottom: 16 }} />
          {error && <div style={{ fontSize: 12.5, color: "var(--pri-high)", marginBottom: 14 }}>{error}</div>}
          <button className="tfh-btn tfh-btn-accent" style={{ width: "100%", padding: "10px 14px" }} disabled={busy || !name.trim()}>
            {busy ? "Creating…" : "Create project"}
          </button>
        </form>
      </div>
    </div>
  );
};

const ProfileAvatarUploader = ({ member, onUploaded }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  const handleFile = async (files) => {
    const file = files?.[0];
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const { user } = await api.uploadAvatar(file);
      invalidateAvatarCache(user.id);
      onUploaded(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <button
        type="button" onClick={() => inputRef.current?.click()} disabled={busy}
        style={{ position: "relative", border: "none", background: "none", padding: 0, cursor: "pointer", flexShrink: 0 }}
        title={error || "Change photo"}
      >
        <Avatar member={member} size={30} />
        <div style={{ position: "absolute", bottom: -2, right: -2, width: 15, height: 15, borderRadius: 999, background: "var(--accent)", border: "2px solid var(--panel)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {busy ? <Loader2 size={8} color="#12141c" className="tfh-pulse" /> : <Pencil size={8} color="#12141c" />}
        </div>
        <input ref={inputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => handleFile(e.target.files)} />
      </button>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Workspace shell                                                       */
/* ------------------------------------------------------------------ */
function Workspace() {
  const { user, logout, setUser } = useAuth();
  const { theme, toggle } = useTheme();
  const { current, currentId, loading: workspaceLoading } = useWorkspace();
  const { projects, current: currentProject, currentId: projectId, loading: projectsLoading, create: createProject, refresh: refreshProjects } = useProject();

  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [view, setView] = useState("dashboard");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [permission, setPermission] = useState(typeof Notification !== "undefined" ? Notification.permission : "denied");

  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [draft, setDraft] = useState(null);
  const [bulkAddOpen, setBulkAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const currentUser = useMemo(() => users.find((u) => u.id === user.id) || { ...user, role: "member" }, [users, user]);
  const canManage = currentUser.role === "admin" || currentUser.role === "lead";

  const loadAll = async (workspaceId, pid) => {
    setLoading(true);
    const [membersRes, notifRes] = await Promise.all([api.getMembers(workspaceId), api.getNotifications()]);
    setUsers(membersRes.members);
    setNotifications(notifRes.notifications);
    if (pid) {
      const tasksRes = await api.getTasks(workspaceId, pid);
      setTasks(tasksRes.tasks);
    } else {
      setTasks([]);
    }
    setLoading(false);
  };

  const loadAnalytics = async (workspaceId, pid) => {
    setAnalyticsLoading(true);
    const res = await api.getAnalytics(workspaceId, pid);
    setAnalytics(res);
    setAnalyticsLoading(false);
  };

  useEffect(() => {
    if (currentId && !projectsLoading) loadAll(currentId, projectId);
  }, [currentId, projectId, projectsLoading]);
  useEffect(() => { if (currentId && projectId && view === "analytics" && canManage) loadAnalytics(currentId, projectId); }, [view, currentId, projectId, canManage]);
  useEffect(() => { if (view === "analytics" && !canManage) setView("dashboard"); }, [view, canManage]);
  // If there's no project (or the current one disappears), only the
  // Dashboard and Team views make sense — everything else needs a project.
  useEffect(() => { if (!projectId && view !== "dashboard" && view !== "team") setView("dashboard"); }, [projectId, view]);

  // Realtime: socket listeners, scoped to the workspace + project currently being viewed
  useEffect(() => {
    const socket = connectSocket() || getSocket();
    if (!socket || !currentId) return;

    const onNotification = (notif) => {
      setNotifications((prev) => [notif, ...prev]);
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification("Team Flow Hub", { body: notif.message });
      }
    };
    const onTaskChanged = (payload) => {
      if (payload?.workspaceId && payload.workspaceId !== currentId) return;
      if (payload?.projectId && projectId && payload.projectId !== projectId) return;
      if (projectId) api.getTasks(currentId, projectId).then((r) => setTasks(r.tasks));
      if (view === "analytics" && canManage && projectId) loadAnalytics(currentId, projectId);
    };
    const onLeadChanged = (payload) => {
      if (payload?.workspaceId && payload.workspaceId !== currentId) return;
      api.getMembers(currentId).then((r) => setUsers(r.members));
    };
    const onMembersChanged = (payload) => {
      if (payload?.workspaceId && payload.workspaceId !== currentId) return;
      api.getMembers(currentId).then((r) => setUsers(r.members));
    };

    socket.on("notification:new", onNotification);
    socket.on("task:changed", onTaskChanged);
    socket.on("lead:changed", onLeadChanged);
    socket.on("members:changed", onMembersChanged);

    return () => {
      socket.off("notification:new", onNotification);
      socket.off("task:changed", onTaskChanged);
      socket.off("lead:changed", onLeadChanged);
      socket.off("members:changed", onMembersChanged);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, currentId, projectId, canManage]);

  const requestPermission = async () => {
    if (typeof Notification === "undefined") return;
    const result = await Notification.requestPermission();
    setPermission(result);
  };

  const openCreate = (status = "todo") => setDraft(emptyDraft(status, users, user.id));
  const openEdit = (task) => setDraft({ ...task, subtasks: task.subtasks.map((s) => ({ ...s })) });
  const openEditById = (id) => { const t = tasks.find((x) => x.id === id); if (t) openEdit(t); };
  const closeDialog = () => setDraft(null);

  const saveDraft = async () => {
    if (!draft.title.trim()) return;
    setSaving(true);
    try {
      if (draft.id) {
        const patch = canManage
          ? { title: draft.title, description: draft.description, status: draft.status, priority: draft.priority, assigneeId: draft.assigneeId, due: draft.due, dueTime: draft.dueTime || null }
          : { status: draft.status }; // members can only ever change status — enforced server-side too
        const { task } = await api.updateTask(currentId, projectId, draft.id, patch);
        await api.setSubtasks(currentId, projectId, draft.id, draft.subtasks);
        setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...task, subtasks: draft.subtasks } : t)));
      } else {
        const { task } = await api.createTask(currentId, projectId, draft);
        setTasks((prev) => [...prev, task]);
      }
      setDraft(null);
    } finally {
      setSaving(false);
    }
  };

  const deleteTask = async (id) => {
    await api.deleteTask(currentId, projectId, id);
    setTasks((prev) => prev.filter((t) => t.id !== id));
    setDraft(null);
  };

  const bulkAddTasks = async ({ tasks, due, priority }) => {
    const { tasks: created } = await api.createTasksBulk(currentId, projectId, { tasks, due, priority });
    setTasks((prev) => [...prev, ...created]);
  };

  const moveTask = async (id, status) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t))); // optimistic
    const { task } = await api.updateTask(currentId, projectId, id, { status });
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...task } : t)));
  };

  const reassignTask = async (id, assigneeId) => {
    const { task } = await api.updateTask(currentId, projectId, id, { assigneeId });
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...task } : t)));
    if (view === "analytics") loadAnalytics(currentId, projectId);
  };

  const setRole = async (userId, role) => {
    const { members } = await api.setMemberRole(currentId, userId, role);
    setUsers(members);
  };

  const setTitle = async (userId, title) => {
    const { members } = await api.setMemberTitle(currentId, userId, title);
    setUsers(members);
  };

  const removeMember = async (userId) => {
    const { members } = await api.removeMember(currentId, userId);
    setUsers(members);
  };

  const invite = async (email) => api.inviteToWorkspace(currentId, email);

  const markRead = async (id) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    await api.markNotificationRead(id);
  };
  const markAllRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    await api.markAllRead();
  };

  if (workspaceLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
        <Spinner /> <span style={{ fontSize: 13, color: "var(--text-dim)" }}>Loading your account…</span>
      </div>
    );
  }

  if (!currentId) {
    return <CreateWorkspaceScreen />;
  }

  if (loading || projectsLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
        <Spinner /> <span style={{ fontSize: 13, color: "var(--text-dim)" }}>Loading {current?.name || "workspace"}…</span>
      </div>
    );
  }

  if (!projectId && !canManage) {
    return <CreateProjectScreen canManage={canManage} onCreate={createProject} workspaceName={current?.name} logout={logout} />;
  }

  const visibleNav = (canManage ? NAV : NAV.filter((n) => n.id !== "analytics"))
    .filter((n) => projectId || n.id === "dashboard" || n.id === "team");

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {/* Sidebar */}
      <div className={`tfh-sidebar ${mobileNavOpen ? "open" : ""}`} style={{ width: 216, borderRight: "1px solid var(--line)", padding: "20px 14px", display: "flex", flexDirection: "column", gap: 22, background: "var(--ink)" }}>
        <WorkspaceSwitcher />
        <ProjectSwitcher canManage={canManage} />

        <nav style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {visibleNav.map((n) => (
            <button key={n.id} className={`tfh-nav-item ${view === n.id ? "active" : ""}`} onClick={() => { setView(n.id); setMobileNavOpen(false); }}>
              <n.icon size={16} /> {n.label}
            </button>
          ))}
        </nav>

        <div style={{ marginTop: "auto", padding: 12, borderRadius: 12, background: "var(--panel)", border: "1px solid var(--line)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <ProfileAvatarUploader
              member={currentUser}
              onUploaded={async (updatedUser) => {
                setUser(updatedUser);
                if (currentId) {
                  const { members } = await api.getMembers(currentId);
                  setUsers(members);
                }
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{currentUser.name}</div>
              <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{currentUser.title}</div>
            </div>
            <button className="tfh-btn tfh-btn-ghost" style={{ padding: 6 }} onClick={logout} aria-label="Sign out"><LogOut size={14} /></button>
          </div>
        </div>
      </div>

      {/* Main */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 24px", borderBottom: "1px solid var(--line)" }}>
          <button className="tfh-btn tfh-btn-ghost tfh-hide-mobile" style={{ display: "none" }} onClick={() => setMobileNavOpen(true)}><Menu size={16} /></button>
          <span className="tfh-mono" style={{ fontSize: 11, color: "var(--text-faint)" }}>
            {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
          </span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            {canManage && <button className="tfh-btn" onClick={() => openCreate("todo")}><Plus size={14} /> Quick add</button>}
            <NotificationBell
              notifications={notifications} onOpenTask={openEditById}
              onMarkRead={markRead} onMarkAll={markAllRead}
              permission={permission} onRequestPermission={requestPermission}
            />
            <button className="tfh-btn tfh-btn-ghost" style={{ padding: 8 }} onClick={toggle} aria-label="Toggle theme">
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </div>

        <div style={{ padding: 24, flex: 1, overflowY: "auto" }}>
          {view === "dashboard" && <DashboardView tasks={tasks} users={users} currentUser={currentUser} onOpen={openEdit} goBoard={() => setView("board")} hasProject={!!projectId} onCreateProject={createProject} />}
          {view === "board" && (
            <BoardView
              tasks={tasks} users={users} onOpen={openEdit} onMove={moveTask} onAdd={openCreate} onBulkAdd={() => setBulkAddOpen(true)} canManage={canManage}
              search={search} setSearch={setSearch}
              priorityFilter={priorityFilter} setPriorityFilter={setPriorityFilter}
              assigneeFilter={assigneeFilter} setAssigneeFilter={setAssigneeFilter}
            />
          )}
          {view === "team" && <TeamView tasks={tasks} users={users} currentUser={currentUser} onOpen={openEdit} onSetRole={setRole} onSetTitle={setTitle} onRemoveMember={removeMember} onInvite={invite} canManage={canManage} workspaceId={currentId} />}
          {view === "calendar" && <CalendarView tasks={tasks} users={users} onOpen={openEdit} />}
          {view === "files" && <DocumentsView workspaceId={currentId} projectId={projectId} projectName={currentProject?.name} canManage={canManage} />}
          {view === "milestone" && (
            <MilestoneView workspaceId={currentId} projectId={projectId} project={currentProject} canManage={canManage} onProjectUpdated={() => refreshProjects()} />
          )}
          {view === "analytics" && canManage && (
            <AnalyticsView analytics={analytics} users={users} loading={analyticsLoading} currentUser={currentUser} onReassign={reassignTask} onOpenTaskById={openEditById} />
          )}
        </div>
      </div>

      {draft && <TaskDialog draft={draft} setDraft={setDraft} users={users} onClose={closeDialog} onSave={saveDraft} onDelete={deleteTask} saving={saving} canManage={canManage} workspaceId={currentId} projectId={projectId} currentUserId={user.id} />}
      {bulkAddOpen && <BulkAddModal users={users} currentUserId={user.id} onClose={() => setBulkAddOpen(false)} onSubmit={bulkAddTasks} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Root app: auth gate + routes                                          */
/* ------------------------------------------------------------------ */
export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Spinner />
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/*" element={<Workspace />} />
    </Routes>
  );
}
