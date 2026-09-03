import { useState } from "react";
import { Source } from "../api";
import { VideoIcon, AudioIcon, PlusIcon, SparkleIcon, MoreIcon, PencilIcon, TrashIcon } from "./Icons";

const KIND_ICON: Record<Source["kind"], (props: { className?: string }) => JSX.Element> = {
  video: VideoIcon,
  audio: AudioIcon,
};

export function Sidebar({
  sources,
  selectedId,
  onSelect,
  onNew,
  onRename,
  onDelete,
}: {
  sources: Source[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}) {
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  function startRename(s: Source) {
    setMenuOpenId(null);
    setRenamingId(s.id);
    setRenameValue(s.title);
  }

  function commitRename() {
    if (renamingId && renameValue.trim()) {
      onRename(renamingId, renameValue.trim());
    }
    setRenamingId(null);
  }

  function handleDelete(s: Source) {
    setMenuOpenId(null);
    if (window.confirm(`Delete "${s.title}"? This can't be undone.`)) {
      onDelete(s.id);
    }
  }

  return (
    <aside className="sidebar" onClick={() => menuOpenId && setMenuOpenId(null)}>
      <div className="sidebar-header">
        <div className="brand">
          <SparkleIcon className="brand-mark" />
          <h1>Transcribe</h1>
        </div>
        <button className="btn-primary btn-sm" onClick={onNew}>
          <PlusIcon /> New
        </button>
      </div>

      <div className="sidebar-list">
        {sources.length === 0 && (
          <p className="sidebar-empty">Nothing here yet. Add your first video or audio file.</p>
        )}
        {sources.map((s) => {
          const Icon = KIND_ICON[s.kind];
          const isRenaming = renamingId === s.id;
          const menuOpen = menuOpenId === s.id;

          if (isRenaming) {
            return (
              <div key={s.id} className="sidebar-item sidebar-item-editing">
                <span className={`kind-chip kind-${s.kind}`}>
                  <Icon />
                </span>
                <input
                  autoFocus
                  className="rename-input"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename();
                    if (e.key === "Escape") setRenamingId(null);
                  }}
                />
              </div>
            );
          }

          return (
            <div key={s.id} className="sidebar-item-row">
              <button
                className={`sidebar-item ${s.id === selectedId ? "active" : ""}`}
                onClick={() => onSelect(s.id)}
              >
                <span className={`kind-chip kind-${s.kind}`}>
                  <Icon />
                </span>
                <span className="sidebar-item-title">{s.title}</span>
                {s.status === "processing" && (
                  <span className="pill pill-processing" title="Transcribing...">
                    <span className="spinner spinner-sm" />
                  </span>
                )}
                {s.status === "error" && <span className="pill pill-error">!</span>}
              </button>

              <div className="item-menu-wrap">
                <button
                  className="item-menu-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpenId(menuOpen ? null : s.id);
                  }}
                >
                  <MoreIcon />
                </button>
                {menuOpen && (
                  <div className="item-menu" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => startRename(s)}>
                      <PencilIcon /> Rename
                    </button>
                    <button className="item-menu-danger" onClick={() => handleDelete(s)}>
                      <TrashIcon /> Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
