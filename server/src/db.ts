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
  created_at: string;
}

function raise(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export async function createPendingSource(input: {
  kind: SourceRow["kind"];
  title: string;
  origin: string | null;
}): Promise<SourceRow> {
  const { data, error } = await supabase
    .from("learnwith_sources")
    .insert({ kind: input.kind, title: input.title, origin: input.origin, transcript: "", status: "processing" })
    .select()
    .single();
  raise(error);
  return data as SourceRow;
}

export async function setSourceContent(id: string, title: string, transcript: string): Promise<void> {
  const { error } = await supabase
    .from("learnwith_sources")
    .update({ title, transcript, status: "ready", error: null, needs_login_domain: null })
    .eq("id", id);
  raise(error);
}

export async function renameSource(id: string, title: string): Promise<void> {
  const { error } = await supabase.from("learnwith_sources").update({ title }).eq("id", id);
  raise(error);
}

export async function getSource(id: string): Promise<SourceRow | undefined> {
  const { data, error } = await supabase.from("learnwith_sources").select("*").eq("id", id).maybeSingle();
  raise(error);
  return (data as SourceRow) ?? undefined;
}

export async function listSources(): Promise<SourceRow[]> {
  const { data, error } = await supabase
    .from("learnwith_sources")
    .select("*")
    .order("created_at", { ascending: false });
  raise(error);
  return (data as SourceRow[]) ?? [];
}

export async function markSourceError(id: string, errorMessage: string): Promise<void> {
  const { error } = await supabase
    .from("learnwith_sources")
    .update({ status: "error", error: errorMessage, needs_login_domain: null })
    .eq("id", id);
  raise(error);
}

export async function markNeedsLogin(id: string, domain: string): Promise<void> {
  const { error } = await supabase
    .from("learnwith_sources")
    .update({
      status: "error",
      error: `This video needs you to be logged into ${domain}.`,
      needs_login_domain: domain,
    })
    .eq("id", id);
  raise(error);
}

export async function resetForRetry(id: string): Promise<void> {
  const { error } = await supabase
    .from("learnwith_sources")
    .update({ status: "processing", error: null, needs_login_domain: null })
    .eq("id", id);
  raise(error);
}

export async function deleteSource(id: string): Promise<void> {
  const { error } = await supabase.from("learnwith_sources").delete().eq("id", id);
  raise(error);
}

// ---------- Login cookies (per-domain, so multiple course platforms can each stay logged in) ----------

export async function getCookieContentForUrl(targetUrl: string): Promise<string | null> {
  const hostname = new URL(targetUrl).hostname.toLowerCase();
  const candidates = Array.from(new Set([hostname, registrableDomain(hostname)]));

  for (const domain of candidates) {
    const { data, error } = await supabase
      .from("learnwith_cookies")
      .select("content")
      .eq("domain", domain)
      .maybeSingle();
    raise(error);
    if (data?.content) return data.content as string;
  }
  return null;
}

export async function upsertCookieContent(domain: string, content: string): Promise<void> {
  const { error } = await supabase
    .from("learnwith_cookies")
    .upsert({ domain, content, updated_at: new Date().toISOString() });
  raise(error);
}
