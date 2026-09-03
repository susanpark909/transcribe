# Transcribe

A pure transcription tool. Paste a video link (any site, including
login-gated course platforms like Skool or Circle) or upload an MP3, and get
a plain-text transcript back — ready to copy into NotebookLM, Gemini, or
wherever you actually want the AI analysis to happen. No summarization, no
chat — just accurate transcripts, including for videos NotebookLM can't
reach on its own.

## Setup

1. **Get an AssemblyAI API key** (used for all audio/video transcription):
   https://www.assemblyai.com/app/api-keys

2. **Create the Supabase tables** — this app stores its data (transcripts,
   saved course logins) in Supabase instead of a local file, so it works the
   same locally and deployed. If you're setting this up fresh, create a
   Supabase project and run the SQL in `supabase/schema.sql` against it via
   the SQL editor.

3. **Configure the server**
   ```bash
   cd server
   cp .env.example .env
   ```
   Open `server/.env` and fill in `ASSEMBLYAI_API_KEY`, `SUPABASE_URL`, and
   `SUPABASE_SERVICE_ROLE_KEY` (from your Supabase project's Settings > Data
   API and Settings > API Keys — use the **service_role** / secret key, not
   the publishable one).

4. **Install dependencies** (from the project root) — this also auto-downloads
   `yt-dlp` and `ffmpeg`, so it takes a bit longer the first time:
   ```bash
   cd server && npm install
   cd ../web && npm install
   ```

5. **Run it** — two terminals:
   ```bash
   cd server && npm run dev
   ```
   ```bash
   cd web && npm run dev
   ```
   Then open http://localhost:5173

## How it works

- **Video links (any site)** — tries the platform's existing captions first
  (free, instant). If none exist, downloads the audio and transcribes it with
  AssemblyAI (handles files up to 2.2GB / 10 hours, so length is never a
  practical limit).
- **Login-gated course videos** (Skool, Circle, Coursera, LinkedIn Learning,
  Udemy, etc.) — video links automatically:
  1. Try the platform's built-in extractor first (fast, covers most sites),
     reusing whatever login you've saved (below) for anything login-gated.
  2. If a page has no built-in extractor and loads its video player via
     JavaScript (the common case for Skool and Circle), a headless browser
     loads the page — using that same login — and watches network traffic to
     find the real video stream, since it isn't present in the raw page HTML.

  **Setting up a login, per platform** — all done in the app itself, no file
  editing:
  1. Paste the video link like normal. If the platform needs a login, the app
     will tell you and walk you through it right there.
  2. Install the ["Get cookies.txt LOCALLY"](https://chromewebstore.google.com/search/Get%20cookies.txt%20LOCALLY)
     browser extension (make sure it says **LOCALLY** — a similarly-named
     extension without it was malware and got pulled from the Chrome Web Store).
  3. Log into the course in your browser, open the same video's page, click
     the extension, export cookies for this site, then drop that file into
     the app. It retries automatically.
  4. That login is saved (in Supabase) and reused for every future video from
     that platform — repeat only when a platform's login expires, or to add
     another platform.

  There's also a quicker but less reliable option for **local development
  only** — set `YTDLP_COOKIES_BROWSER` in `server/.env` to a browser you're
  logged into (`chrome`, `edge`, `firefox`, or `brave`); used only as a
  fallback when no saved login exists yet. Does nothing when deployed (no
  browser on the server). On Windows this can also fail with **"Failed to
  decrypt with DPAPI"** — a known, unresolved Chrome compatibility issue —
  so prefer the in-app flow above if you hit it.

  - Nothing here is ever launched or shown on screen, and your password is
    never touched — only exported session cookies are used.
  - Doesn't work on DRM-protected video (some Coursera/LinkedIn Learning
    content) — that's a hard technical/legal wall.
  - `server/scripts/test-resolver.ts` is a standalone debug tool: run
    `npx tsx scripts/test-resolver.ts <url>` from `server/` to see exactly
    what stream URL gets found for a specific page, useful if a particular
    course video isn't working.
- **MP3 / audio upload** — transcribed via AssemblyAI.
- **Copy transcript** — one click on any finished source copies the full
  transcript to your clipboard.
- Data (transcripts and saved course logins) is stored in your Supabase
  project — nothing is kept on the server itself, so it works the same
  whether you're running this locally or deployed. The audio itself is sent
  to AssemblyAI for transcription, and, for course videos, the page itself is
  loaded to find the video stream.

## Cost

- Captions (when available): free.
- AssemblyAI transcription: ~$0.006–0.01/minute depending on plan — see
  https://www.assemblyai.com/pricing.
- Supabase and Render: free, on their respective free tiers (see Deployment).

## Deployment

This runs as a single Docker service — see `Dockerfile`. It builds and
serves both the API and the web frontend from one container, so it deploys
cleanly to any host that runs a Dockerfile, e.g. [Render](https://render.com)
(free tier).

**On Render:**
1. Push this repo to GitHub.
2. New > Web Service > connect the repo > runtime: **Docker**.
3. Under Environment, add: `ASSEMBLYAI_API_KEY`, `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, `APP_PASSWORD` (pick your own password — this
   is required, see below).
4. Deploy. Render builds the Docker image and gives you a public URL.

**Set `APP_PASSWORD` before deploying.** Without it, anyone with the URL
could use your AssemblyAI credits and see/delete your transcripts — the app
will prompt for basic-auth username (anything) + this password once it's
set.

Render's free tier spins the service down after 15 minutes of no traffic;
the next request just takes ~30–60s to wake it back up. Since all data lives
in Supabase (not on the container's disk), nothing is lost between spin-downs.
