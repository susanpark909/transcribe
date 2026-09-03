import { useCallback, useEffect, useRef, useState } from "react";
import { api, Source, Project } from "./api";
import { Sidebar } from "./components/Sidebar";
import { UploadPanel } from "./components/UploadPanel";
import { SourceView } from "./components/SourceView";

export default function App() {
  const [sources, setSources] = useState<Source[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Source | null>(null);
  const [showUpload, setShowUpload] = useState(true);
  const [health, setHealth] = useState<{ assemblyAiConfigured: boolean } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshList = useCallback(async () => {
    const list = await api.listSources();
    setSources(list);
  }, []);

  const refreshProjects = useCallback(async () => {
    const list = await api.listProjects();
    setProjects(list);
  }, []);

  useEffect(() => {
    refreshList();
    refreshProjects();
    api.health().then(setHealth).catch(() => {});
  }, [refreshList, refreshProjects]);

  const loadDetail = useCallback(async (id: string) => {
    const d = await api.getSource(id);
    setDetail(d);
    return d;
  }, []);

  const startPolling = useCallback(
    (id: string) => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        const d = await loadDetail(id);
        if (d.status !== "processing" && pollRef.current) {
          clearInterval(pollRef.current);
          refreshList();
        }
      }, 2000);
    },
    [loadDetail, refreshList]
  );

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (!selectedId) return;

    loadDetail(selectedId);
    startPolling(selectedId);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, loadDetail]);

  function handleSelect(id: string) {
    setShowUpload(false);
    setSelectedId(id);
  }

  function handleCreated(id: string) {
    setShowUpload(false);
    setSelectedId(id);
    refreshList();
  }

  function handleUpdated(updated: Source) {
    setDetail((prev) => (prev ? { ...prev, ...updated } : prev));
    if (updated.status === "processing") startPolling(updated.id);
    refreshList();
  }

  async function handleRename(id: string, title: string) {
    try {
      const updated = await api.renameSource(id, title);
      setSources((prev) => prev.map((s) => (s.id === id ? { ...s, title: updated.title } : s)));
      setDetail((prev) => (prev && prev.id === id ? { ...prev, title: updated.title } : prev));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.deleteSource(id);
      if (selectedId === id) {
        setSelectedId(null);
        setDetail(null);
        setShowUpload(true);
      }
      refreshList();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleMove(id: string, projectId: string | null) {
    try {
      const updated = await api.moveSource(id, projectId);
      setSources((prev) => prev.map((s) => (s.id === id ? { ...s, project_id: updated.project_id } : s)));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleCreateProject(name: string) {
    try {
      await api.createProject(name);
      refreshProjects();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleRenameProject(id: string, name: string) {
    try {
      await api.renameProject(id, name);
      setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleDeleteProject(id: string) {
    try {
      await api.deleteProject(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
      refreshList();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="app">
      <Sidebar
        sources={sources}
        projects={projects}
        selectedId={selectedId}
        onSelect={handleSelect}
        onNew={() => {
          setShowUpload(true);
          setSelectedId(null);
        }}
        onRename={handleRename}
        onDelete={handleDelete}
        onMove={handleMove}
        onCreateProject={handleCreateProject}
        onRenameProject={handleRenameProject}
        onDeleteProject={handleDeleteProject}
      />
      <main className="main">
        {health && !health.assemblyAiConfigured && (
          <div className="notice notice-warning">
            <div>ASSEMBLYAI_API_KEY is not set on the server — transcription won't work yet.</div>
            <div className="muted small">Add it to server/.env and restart the server.</div>
          </div>
        )}
        {actionError && <div className="notice notice-error">{actionError}</div>}
        {showUpload || !detail ? (
          <UploadPanel onCreated={handleCreated} />
        ) : (
          <SourceView source={detail} onUpdated={handleUpdated} />
        )}
      </main>
    </div>
  );
}
