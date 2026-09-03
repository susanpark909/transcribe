import { useCallback, useEffect, useRef, useState } from "react";
import { api, Source } from "./api";
import { Sidebar } from "./components/Sidebar";
import { UploadPanel } from "./components/UploadPanel";
import { SourceView } from "./components/SourceView";

export default function App() {
  const [sources, setSources] = useState<Source[]>([]);
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

  useEffect(() => {
    refreshList();
    api.health().then(setHealth).catch(() => {});
  }, [refreshList]);

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

  return (
    <div className="app">
      <Sidebar
        sources={sources}
        selectedId={selectedId}
        onSelect={handleSelect}
        onNew={() => {
          setShowUpload(true);
          setSelectedId(null);
        }}
        onRename={handleRename}
        onDelete={handleDelete}
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
