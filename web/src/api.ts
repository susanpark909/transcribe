export interface Source {
  id: string;
  kind: "video" | "audio";
  title: string;
  origin: string | null;
  transcript: string;
  status: "processing" | "ready" | "error";
  error: string | null;
  needs_login_domain: string | null;
  project_id: string | null;
  created_at: string;
}

export interface Project {
  id: string;
  name: string;
  created_at: string;
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: () => fetch("/api/health").then((r) => handle<{ ok: boolean; assemblyAiConfigured: boolean }>(r)),

  listSources: () => fetch("/api/sources").then((r) => handle<Source[]>(r)),

  getSource: (id: string) =>
    fetch(`/api/sources/${id}`).then((r) => handle<Source>(r)),

  deleteSource: (id: string) =>
    fetch(`/api/sources/${id}`, { method: "DELETE" }).then((r) => {
      if (!r.ok) throw new Error("Failed to delete");
    }),

  uploadAudio: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return fetch("/api/sources/audio", { method: "POST", body: form }).then(
      (r) => handle<Source>(r)
    );
  },

  submitVideo: (url: string) =>
    fetch("/api/sources/video", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    }).then((r) => handle<Source>(r)),

  renameSource: (id: string, title: string) =>
    fetch(`/api/sources/${id}/rename`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    }).then((r) => handle<Source>(r)),

  uploadCookiesForSource: (sourceId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return fetch(`/api/sources/${sourceId}/cookies`, { method: "POST", body: form }).then(
      (r) => handle<Source>(r)
    );
  },

  moveSource: (id: string, projectId: string | null) =>
    fetch(`/api/sources/${id}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    }).then((r) => handle<Source>(r)),

  listProjects: () => fetch("/api/projects").then((r) => handle<Project[]>(r)),

  createProject: (name: string) =>
    fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }).then((r) => handle<Project>(r)),

  renameProject: (id: string, name: string) =>
    fetch(`/api/projects/${id}/rename`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }).then((r) => {
      if (!r.ok) throw new Error("Failed to rename");
    }),

  deleteProject: (id: string) =>
    fetch(`/api/projects/${id}`, { method: "DELETE" }).then((r) => {
      if (!r.ok) throw new Error("Failed to delete");
    }),
};
