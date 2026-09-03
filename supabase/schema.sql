-- LearnWith's tables. Run this in your Supabase project's SQL editor (or via
-- the Supabase MCP/CLI) to set up storage for a fresh deployment. Existing
-- tables in the same project (e.g. from other apps) are untouched.

create table if not exists learnwith_sources (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('video', 'audio')),
  title text not null,
  origin text,
  transcript text not null default '',
  status text not null default 'processing' check (status in ('processing', 'ready', 'error')),
  error text,
  needs_login_domain text,
  created_at timestamptz not null default now()
);

create table if not exists learnwith_cookies (
  domain text primary key,
  content text not null,
  updated_at timestamptz not null default now()
);

alter table learnwith_sources enable row level security;
alter table learnwith_cookies enable row level security;

-- No RLS policies are defined on purpose — this app only ever connects using
-- the service_role/secret key (server-side only, never exposed to the
-- browser), which bypasses RLS entirely. Enabling RLS with zero policies
-- just means the (unused) anon/publishable key can't read or write anything.
grant all on table learnwith_sources to service_role, postgres;
grant all on table learnwith_cookies to service_role, postgres;
