require("dotenv").config();
const express = require("express");
const cors = require("cors");
const http = require("http");

const { initSocket } = require("./socket");
const { startDueSoonScheduler } = require("./utils/reminders");

const authRoutes = require("./routes/auth.routes");
const usersRoutes = require("./routes/users.routes");
const workspacesRoutes = require("./routes/workspaces.routes");
const projectsRoutes = require("./routes/projects.routes");
const tasksRoutes = require("./routes/tasks.routes");
const notificationsRoutes = require("./routes/notifications.routes");
const analyticsRoutes = require("./routes/analytics.routes");

const PORT = process.env.PORT || 4000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:5173";

if (!process.env.JWT_SECRET) {
  console.warn("⚠️  JWT_SECRET is not set — copy .env.example to .env and set one before deploying.");
  process.env.JWT_SECRET = "dev-only-insecure-secret";
}

const app = express();
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(express.json());

app.get("/api/health", (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/workspaces", workspacesRoutes);
app.use("/api/workspaces/:workspaceId/projects", projectsRoutes);
app.use("/api/workspaces/:workspaceId/projects/:projectId/tasks", tasksRoutes);
app.use("/api/workspaces/:workspaceId/projects/:projectId/analytics", analyticsRoutes);
app.use("/api/notifications", notificationsRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

const server = http.createServer(app);
initSocket(server, CORS_ORIGIN);

server.listen(PORT, () => {
  console.log(`Team Flow Hub API + realtime server listening on http://localhost:${PORT}`);
  startDueSoonScheduler();
});
