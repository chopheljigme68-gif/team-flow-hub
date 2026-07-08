import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "../api";
import { useWorkspace } from "./WorkspaceContext.jsx";

const ProjectContext = createContext(null);

export function ProjectProvider({ children }) {
  const { currentId: workspaceId, loading: workspaceLoading } = useWorkspace();
  const [projects, setProjects] = useState([]);
  const [currentId, setCurrentId] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!workspaceId) { setProjects([]); setCurrentId(null); return []; }
    const { projects } = await api.getProjects(workspaceId);
    setProjects(projects);
    setCurrentId((prev) => (prev && projects.some((p) => p.id === prev) ? prev : projects[0]?.id || null));
    return projects;
  }, [workspaceId]);

  useEffect(() => {
    // Workspace context hasn't finished resolving yet — wait, or we'll
    // flash "no projects" using a workspaceId that hasn't loaded yet.
    if (workspaceLoading) return;
    setLoading(true);
    refresh().finally(() => setLoading(false));
  }, [refresh, workspaceLoading]);

  const switchTo = (id) => setCurrentId(id);

  const create = async (name, description, deadline) => {
    const { project } = await api.createProject(workspaceId, { name, description, deadline });
    await refresh();
    setCurrentId(project.id);
    return project;
  };

  const remove = async (id) => {
    await api.deleteProject(workspaceId, id);
    await refresh();
  };

  const current = projects.find((p) => p.id === currentId) || null;

  return (
    <ProjectContext.Provider value={{ projects, current, currentId, loading, switchTo, create, remove, refresh }}>
      {children}
    </ProjectContext.Provider>
  );
}

export const useProject = () => useContext(ProjectContext);
