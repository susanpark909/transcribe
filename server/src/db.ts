import { createClient } from "@supabase/supabase-js";
import { registrableDomain } from "./services/cookiesShared.js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in server/.env — this app stores its data in Supabase."
  );
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

export interface SourceRow {
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

export interface ProjectRow {
  id: string;
  name: string;
  created_at: string;
}

// Supabase occasionally rejects a request with "JWT issued at future" — a
// transient clock-skew hiccup between Render's container and Supabase's
// validation server, not a real auth problem (a moment later, the identical
// request succeeds). Left unretried, one of these took down an entire
// feature client-side (a failed /api/projects request just left the folder
// list empty). Retrying the exact same request a couple of times clears it.
const TRANSIENT_ERROR_PATTERN = /JWT issued at future/i;

async function run<T>(fn: () => PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  let lastError: { message: string } | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
    const { data, error } = await fn();
    if (!error) return data as T;
    lastError = error;
    if (!TRANSIENT_ERROR_PATTERN.test(error.message)) break;
  }
  throw new Error(lastError!.message);
}

export async function createPendingSource(input: {
  kind: SourceRow["kind"];
  title: string;
  origin: string | null;
}): Promise<SourceRow> {
  const data = await run(() =>
    supabase
      .from("learnwith_sources")
      .insert({ kind: input.kind, title: input.title, origin: input.origin, transcript: "", status: "processing" })
      .select()
      .single()
  );
  return data as SourceRow;
}

export async function setSourceContent(id: string, title: string, transcript: string): Promise<void> {
  await run(() =>
    supabase
      .from("learnwith_sources")
      .update({ title, transcript, status: "ready", error: null, needs_login_domain: null })
      .eq("id", id)
  );
}

export async function renameSource(id: string, title: string): Promise<void> {
  await run(() => supabase.from("learnwith_sources").update({ title }).eq("id", id));
}

export async function getSource(id: string): Promise<SourceRow | undefined> {
  const data = await run(() => supabase.from("learnwith_sources").select("*").eq("id", id).maybeSingle());
  return (data as SourceRow) ?? undefined;
}

export async function listSources(): Promise<SourceRow[]> {
  const data = await run(() =>
    supabase.from("learnwith_sources").select("*").order("created_at", { ascending: false })
  );
  return (data as SourceRow[]) ?? [];
}

export async function markSourceError(id: string, errorMessage: string): Promise<void> {
  await run(() =>
    supabase
      .from("learnwith_sources")
      .update({ status: "error", error: errorMessage, needs_login_domain: null })
      .eq("id", id)
  );
}

export async function markNeedsLogin(id: string, domain: string): Promise<void> {
  await run(() =>
    supabase
      .from("learnwith_sources")
      .update({
        status: "error",
        error: `This video needs you to be logged into ${domain}.`,
        needs_login_domain: domain,
      })
      .eq("id", id)
  );
}

export async function resetForRetry(id: string): Promise<void> {
  await run(() =>
    supabase.from("learnwith_sources").update({ status: "processing", error: null, needs_login_domain: null }).eq("id", id)
  );
}

export async function deleteSource(id: string): Promise<void> {
  await run(() => supabase.from("learnwith_sources").delete().eq("id", id));
}

export async function moveSourceToProject(id: string, projectId: string | null): Promise<void> {
  await run(() => supabase.from("learnwith_sources").update({ project_id: projectId }).eq("id", id));
}

// ---------- Projects (folders for organizing sources) ----------

export async function listProjects(): Promise<ProjectRow[]> {
  const data = await run(() =>
    supabase.from("learnwith_projects").select("*").order("created_at", { ascending: false })
  );
  return (data as ProjectRow[]) ?? [];
}

export async function createProject(name: string): Promise<ProjectRow> {
  const data = await run(() => supabase.from("learnwith_projects").insert({ name }).select().single());
  return data as ProjectRow;
}

export async function renameProject(id: string, name: string): Promise<void> {
  await run(() => supabase.from("learnwith_projects").update({ name }).eq("id", id));
}

export async function deleteProject(id: string): Promise<void> {
  await run(() => supabase.from("learnwith_projects").delete().eq("id", id));
}

// ---------- Login cookies (per-domain, so multiple course platforms can each stay logged in) ----------

export async function getCookieContentForUrl(targetUrl: string): Promise<string | null> {
  const hostname = new URL(targetUrl).hostname.toLowerCase();
  const candidates = Array.from(new Set([hostname, registrableDomain(hostname)]));

  for (const domain of candidates) {
    const data = await run(() =>
      supabase.from("learnwith_cookies").select("content").eq("domain", domain).maybeSingle()
    );
    if ((data as { content: string } | null)?.content) return (data as { content: string }).content;
  }
  return null;
}

export async function upsertCookieContent(domain: string, content: string): Promise<void> {
  await run(() =>
    supabase.from("learnwith_cookies").upsert({ domain, content, updated_at: new Date().toISOString() })
  );
}
