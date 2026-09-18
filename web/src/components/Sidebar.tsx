import { useEffect, useState } from "react";
import { Source, Project } from "../api";
import {
  VideoIcon,
  AudioIcon,
  PlusIcon,
  SparkleIcon,
  MoreIcon,
  PencilIcon,
  TrashIcon,
  FolderIcon,
  FolderPlusIcon,
  ChevronIcon,
  CloseIcon,
  CheckIcon,
} from "./Icons";

const KIND_ICON: Record<Source["kind"], (props: { className?: string }) => JSX.Element> = {
  video: VideoIcon,
  audio: AudioIcon,
};

const SIDEBAR_WIDTH_KEY = "transcribe-sidebar-width";
const MIN_SIDEBAR_WIDTH = 220;
const MAX_SIDEBAR_WIDTH = 480;
const DEFAULT_SIDEBAR_WIDTH = 288;

function readStoredSidebarWidth(): number {
  try {
    const raw = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
    if (raw >= MIN_SIDEBAR_WIDTH && raw <= MAX_SIDEBAR_WIDTH) return raw;
  } catch {
    // localStorage unavailable (private browsing, etc.) — fall back to the default.
  }
  return DEFAULT_SIDEBAR_WIDTH;
}

export function Sidebar({
  sources,
  projects,
  selectedId,
  onSelect,
  onNew,
  onRename,
  onDelete,
  onMove,
  onBulkMove,
  onCreateProject,
  onRenameProject,
  onDeleteProject,
  mobileOpen,
  onMobileClose,
}: {
  sources: Source[];
  projects: Project[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, projectId: string | null) => void;
  onBulkMove: (ids: string[], projectId: string | null) => void;
  onCreateProject: (name: string) => void;
  onRenameProject: (id: string, name: string) => void;
  onDeleteProject: (id: string) => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}) {
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [moveMenuId, setMoveMenuId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [projectMenuOpenId, setProjectMenuOpenId] = useState<string | null>(null);
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null);
  const [projectRenameValue, setProjectRenameValue] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderValue, setNewFolderValue] = useState("");

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverProjectId, setDragOverProjectId] = useState<string | null>(null);

  const [width, setWidth] = useState(readStoredSidebarWidth);
  const [resizing, setResizing] = useState(false);

  // Dragging updates width live via pointer coordinates (the sidebar's left
  // edge is always at x=0, so clientX doubles as the desired width) — that
  // has to live at the window level since the pointer moves past the handle
  // itself as soon as dragging starts.
  useEffect(() => {
    if (!resizing) return;
    function handleMove(e: PointerEvent) {
      setWidth(Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, e.clientX)));
    }
    function handleUp() {
      setResizing(false);
    }
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [resizing]);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(width));
    } catch {
      // ignore — nothing to persist to in private browsing
    }
  }, [width]);

  function closeAllMenus() {
    setMenuOpenId(null);
    setMoveMenuId(null);
    setProjectMenuOpenId(null);
    setBulkMoveOpen(false);
  }

  function toggleSelectionMode() {
    setSelectionMode((prev) => !prev);
    setSelectedIds(new Set());
    setBulkMoveOpen(false);
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleBulkMoveTo(projectId: string | null) {
    onBulkMove(Array.from(selectedIds), projectId);
    setSelectedIds(new Set());
    setBulkMoveOpen(false);
  }

  // Capture-phase (not bubble-phase) so this reliably fires before any
  // individual button's onClick can stopPropagation() and block it — with
  // nested folders, several buttons (folder header, "New folder") do exactly
  // that, which made the old bubble-up-to-the-sidebar approach unreliable
  // whenever a menu happened to overlap one of them. Clicks inside a menu's
  // own wrapper are left alone — this fires on mousedown, which happens
  // *before* the click that would trigger e.g. Rename, so closing here too
  // would unmount the button out from under the click before it registers.
  useEffect(() => {
    function handlePointerDown(e: MouseEvent) {
      if ((e.target as Element).closest(".item-menu-wrap, .bulk-action-bar")) return;
      closeAllMenus();
    }
    document.addEventListener("mousedown", handlePointerDown, true);
    return () => document.removeEventListener("mousedown", handlePointerDown, true);
  }, []);

  function startRename(s: Source) {
    closeAllMenus();
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
    closeAllMenus();
    if (window.confirm(`Delete "${s.title}"? This can't be undone.`)) {
      onDelete(s.id);
    }
  }

  function toggleCollapse(projectId: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  }

  function startRenameProject(p: Project) {
    closeAllMenus();
    setRenamingProjectId(p.id);
    setProjectRenameValue(p.name);
  }

  function commitRenameProject() {
    if (renamingProjectId && projectRenameValue.trim()) {
      onRenameProject(renamingProjectId, projectRenameValue.trim());
    }
    setRenamingProjectId(null);
  }

  function handleDeleteProject(p: Project) {
    closeAllMenus();
    if (window.confirm(`Delete folder "${p.name}"? Its transcripts won't be deleted — they'll just be ungrouped.`)) {
      onDeleteProject(p.id);
    }
  }

  function commitNewFolder() {
    if (newFolderValue.trim()) onCreateProject(newFolderValue.trim());
    setCreatingFolder(false);
    setNewFolderValue("");
  }

  function renderSource(s: Source) {
    const Icon = KIND_ICON[s.kind];
    const isRenaming = renamingId === s.id;
    const menuOpen = menuOpenId === s.id;
    const moveOpen = moveMenuId === s.id;

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

    const isChecked = selectedIds.has(s.id);

    return (
      <div key={s.id} className="sidebar-item-row">
        <button
          className={`sidebar-item ${s.id === selectedId ? "active" : ""} ${draggingId === s.id ? "dragging" : ""}`}
          draggable={!selectionMode}
          onDragStart={(e) => {
            setDraggingId(s.id);
            e.dataTransfer.setData("text/plain", s.id);
            e.dataTransfer.effectAllowed = "move";
          }}
          onDragEnd={() => setDraggingId(null)}
          onClick={() => (selectionMode ? toggleSelected(s.id) : onSelect(s.id))}
        >
          {selectionMode && (
            <span className={`select-checkbox ${isChecked ? "checked" : ""}`}>
              {isChecked && <CheckIcon />}
            </span>
          )}
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

        {!selectionMode && (
          <div className="item-menu-wrap">
            <button
              className="item-menu-btn"
              onClick={(e) => {
                e.stopPropagation();
                if (menuOpen || moveOpen) {
                  closeAllMenus();
                } else {
                  setMenuOpenId(s.id);
                  setMoveMenuId(null);
                }
              }}
            >
              <MoreIcon />
            </button>
            {menuOpen && (
              <div className="item-menu" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => startRename(s)}>
                  <PencilIcon /> Rename
                </button>
                <button
                  onClick={() => {
                    setMenuOpenId(null);
                    setMoveMenuId(s.id);
                  }}
                >
                  <FolderIcon /> Move to folder
                </button>
                <button className="item-menu-danger" onClick={() => handleDelete(s)}>
                  <TrashIcon /> Delete
                </button>
              </div>
            )}
            {moveOpen && (
              <div className="item-menu" onClick={(e) => e.stopPropagation()}>
                {projects.length === 0 && <div className="item-menu-hint">No folders yet</div>}
                {projects.map((p) => (
                  <button
                    key={p.id}
                    disabled={p.id === s.project_id}
                    onClick={() => {
                      onMove(s.id, p.id);
                      closeAllMenus();
                    }}
                  >
                    <FolderIcon /> {p.name}
                  </button>
                ))}
                {s.project_id && (
                  <button
                    onClick={() => {
                      onMove(s.id, null);
                      closeAllMenus();
                    }}
                  >
                    Remove from folder
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  const ungrouped = sources.filter((s) => !s.project_id);

  return (
    <>
      <div
        className={`sidebar-backdrop ${mobileOpen ? "visible" : ""}`}
        onClick={onMobileClose}
      />
      <aside
        className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}
        style={{ ["--sidebar-width" as string]: `${width}px` }}
      >
      <div className="sidebar-header">
        <div className="brand">
          <SparkleIcon className="brand-mark" />
          <h1>Transcribe</h1>
        </div>
        <div className="sidebar-header-actions">
          {sources.length > 0 && (
            <button
              className={`btn-select-toggle ${selectionMode ? "active" : ""}`}
              onClick={toggleSelectionMode}
            >
              {selectionMode ? "Cancel" : "Select"}
            </button>
          )}
          <button className="btn-primary btn-sm" onClick={onNew}>
            <PlusIcon /> New
          </button>
          <button className="sidebar-close-btn" onClick={onMobileClose} aria-label="Close menu">
            <CloseIcon />
          </button>
        </div>
      </div>

      <div className="sidebar-list">
        {sources.length === 0 && projects.length === 0 && (
          <p className="sidebar-empty">Nothing here yet. Add your first video or audio file.</p>
        )}

        {creatingFolder ? (
          <div className="sidebar-item sidebar-item-editing" onClick={(e) => e.stopPropagation()}>
            <span className="kind-chip">
              <FolderIcon />
            </span>
            <input
              autoFocus
              className="rename-input"
              placeholder="Folder name"
              value={newFolderValue}
              onChange={(e) => setNewFolderValue(e.target.value)}
              onBlur={commitNewFolder}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitNewFolder();
                if (e.key === "Escape") setCreatingFolder(false);
              }}
            />
          </div>
        ) : (
          <button
            className="new-folder-btn"
            onClick={(e) => {
              e.stopPropagation();
              setCreatingFolder(true);
            }}
          >
            <FolderPlusIcon /> New folder
          </button>
        )}

        {projects.map((p) => {
          const isCollapsed = collapsed.has(p.id);
          const items = sources.filter((s) => s.project_id === p.id);
          const isRenaming = renamingProjectId === p.id;
          const menuOpen = projectMenuOpenId === p.id;

          return (
            <div key={p.id} className="project-group">
              <div
                className={`project-header ${dragOverProjectId === p.id ? "drag-over" : ""}`}
                onClick={(e) => e.stopPropagation()}
                onDragOver={(e) => {
                  // Checked on the native event, not React state — dragover
                  // can fire before a setDraggingId() from onDragStart has
                  // actually re-rendered, and skipping preventDefault() here
                  // even once makes the browser refuse the drop outright.
                  if (!e.dataTransfer.types.includes("text/plain")) return;
                  e.preventDefault();
                  setDragOverProjectId(p.id);
                }}
                onDragLeave={() => setDragOverProjectId((prev) => (prev === p.id ? null : prev))}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData("text/plain");
                  if (id) onMove(id, p.id);
                  setDragOverProjectId(null);
                  setDraggingId(null);
                }}
              >
                <button className="project-header-main" onClick={() => toggleCollapse(p.id)}>
                  <ChevronIcon className={`chevron ${isCollapsed ? "" : "chevron-open"}`} />
                  <FolderIcon />
                  {isRenaming ? (
                    <input
                      autoFocus
                      className="rename-input"
                      value={projectRenameValue}
                      onChange={(e) => setProjectRenameValue(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={commitRenameProject}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRenameProject();
                        if (e.key === "Escape") setRenamingProjectId(null);
                      }}
                    />
                  ) : (
                    <span className="project-name">{p.name}</span>
                  )}
                </button>
                <div className="item-menu-wrap">
                  <button
                    className="item-menu-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setProjectMenuOpenId(menuOpen ? null : p.id);
                      setMenuOpenId(null);
                      setMoveMenuId(null);
                    }}
                  >
                    <MoreIcon />
                  </button>
                  {menuOpen && (
                    <div className="item-menu" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => startRenameProject(p)}>
                        <PencilIcon /> Rename
                      </button>
                      <button className="item-menu-danger" onClick={() => handleDeleteProject(p)}>
                        <TrashIcon /> Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
              {!isCollapsed && (
                <div className="project-items">
                  {items.length === 0 && <p className="project-empty">Empty</p>}
                  {items.map(renderSource)}
                </div>
              )}
            </div>
          );
        })}

        {ungrouped.map(renderSource)}
      </div>

      {selectionMode && (
        <div className="bulk-action-bar">
          <span className="bulk-action-count">
            {selectedIds.size} selected
          </span>
          <div className="bulk-move-wrap">
            <button
              className="btn-primary btn-sm"
              disabled={selectedIds.size === 0}
              onClick={() => setBulkMoveOpen((prev) => !prev)}
            >
              <FolderIcon /> Move to folder
            </button>
            {bulkMoveOpen && (
              <div className="item-menu bulk-move-menu" onClick={(e) => e.stopPropagation()}>
                {projects.length === 0 && <div className="item-menu-hint">No folders yet</div>}
                {projects.map((p) => (
                  <button key={p.id} onClick={() => handleBulkMoveTo(p.id)}>
                    <FolderIcon /> {p.name}
                  </button>
                ))}
                <button onClick={() => handleBulkMoveTo(null)}>Remove from folder</button>
              </div>
            )}
          </div>
        </div>
      )}

      <div
        className={`sidebar-resize-handle ${resizing ? "resizing" : ""}`}
        onPointerDown={(e) => {
          e.preventDefault();
          setResizing(true);
        }}
      />
      </aside>
    </>
  );
}
