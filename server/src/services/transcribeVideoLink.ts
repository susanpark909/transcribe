import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { transcribeAudioFile } from "./transcribeAudio.js";
import { parseSubtitleFile } from "./subtitles.js";
import { resolveMediaUrl } from "./resolveMediaUrl.js";
import { writeCookiesFileForUrl } from "./browserCookies.js";

export class LoginRequiredError extends Error {
  constructor(public readonly domain: string) {
    super(`This video needs you to be logged into ${domain}.`);
    this.name = "LoginRequiredError";
  }
}

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const binDir = path.join(__dirname, "..", "..", "bin");
const ytDlpPath = path.join(binDir, process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp");

function requireBinaries() {
  if (!fs.existsSync(ytDlpPath)) {
    throw new Error(
      "yt-dlp isn't installed on the server. Run `npm install` in server/ again, or see server/scripts/postinstall.mjs."
    );
  }
}

/**
 * Reuses cookies saved for login-gated videos (stored in Supabase, see
 * db.ts's learnwith_cookies table) — written to a temp file for yt-dlp's
 * --cookies flag, then cleaned up. Falls back to YTDLP_COOKIES_BROWSER
 * (reading live from a local browser) only for local dev convenience — this
 * does nothing in production, since there's no browser on the server.
 */
async function runYtDlp(
  args: string[],
  opts: { maxBuffer?: number; timeout?: number; extraHeaders?: string[]; cookiesUrl?: string } = {}
) {
  const headerArgs = (opts.extraHeaders ?? []).flatMap((h) => ["--add-header", h]);

  let cookiesFile: string | null = null;
  try {
    if (opts.cookiesUrl) cookiesFile = await writeCookiesFileForUrl(opts.cookiesUrl);
    const browser = process.env.YTDLP_COOKIES_BROWSER?.trim();
    const cArgs = cookiesFile
      ? ["--cookies", cookiesFile]
      : browser
        ? ["--cookies-from-browser", browser]
        : [];

    return await execFileAsync(ytDlpPath, [...cArgs, ...headerArgs, ...args], {
      maxBuffer: opts.maxBuffer ?? 20 * 1024 * 1024,
      timeout: opts.timeout ?? 10 * 60 * 1000,
    });
  } finally {
    if (cookiesFile) await fsp.rm(cookiesFile, { force: true }).catch(() => {});
  }
}

async function getTitle(url: string): Promise<string> {
  try {
    const { stdout } = await runYtDlp(
      ["--no-playlist", "--skip-download", "--print", "%(title)s", url],
      { cookiesUrl: url }
    );
    return stdout.trim() || url;
  } catch {
    return url; // e.g. a site yt-dlp has no extractor for — that's fine, we fall back later
  }
}

/** Fast, free path: pull existing captions/subtitles if the platform provides them. */
async function tryFetchSubtitles(url: string, workDir: string): Promise<string | null> {
  const outputTemplate = path.join(workDir, "sub");
  try {
    await runYtDlp(
      [
        "--no-playlist",
        "--skip-download",
        "--write-subs",
        "--write-auto-subs",
        "--sub-langs",
        "en.*,en",
        "--sub-format",
        "vtt/srt/best",
        "--convert-subs",
        "vtt",
        "-o",
        outputTemplate,
        url,
      ],
      { cookiesUrl: url }
    );
  } catch {
    return null;
  }

  const files = await fsp.readdir(workDir).catch(() => [] as string[]);
  const subFile = files.find((f) => f.endsWith(".vtt") || f.endsWith(".srt"));
  if (!subFile) return null;

  const content = await fsp.readFile(path.join(workDir, subFile), "utf-8");
  const text = parseSubtitleFile(content);
  return text.trim() ? text : null;
}

/** Downloads audio from `mediaUrl` (any length) and transcribes it. */
async function downloadAndTranscribeAudio(
  mediaUrl: string,
  workDir: string,
  extraHeaders: string[] = [],
  cookiesUrl: string = mediaUrl
): Promise<string> {
  const downloadTemplate = path.join(workDir, "download.%(ext)s");

  await runYtDlp(
    [
      "--no-playlist",
      "-f",
      "bestaudio/worst", // audio-only if the site has it; otherwise the smallest combined
      // stream rather than the largest — we only need the audio, and sites
      // without a dedicated audio track (e.g. Wistia, used by Circle) can
      // otherwise default to a multi-GB "original" master file.
      "-o",
      downloadTemplate,
      mediaUrl,
    ],
    { timeout: 20 * 60 * 1000, extraHeaders, maxBuffer: 40 * 1024 * 1024, cookiesUrl }
  );

  const downloadedFiles = await fsp.readdir(workDir);
  const downloadedFile = downloadedFiles.find((f) => f.startsWith("download."));
  if (!downloadedFile) {
    throw new Error("Couldn't download this video's audio.");
  }
  const downloadedPath = path.join(workDir, downloadedFile);

  // Convert to mp3 ourselves rather than via yt-dlp's own postprocessor —
  // more reliable, and gives us the real error if something goes wrong.
  const audioPath = path.join(workDir, "audio.mp3");
  const ffmpegPath = path.join(binDir, process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
  await execFileAsync(
    ffmpegPath,
    ["-i", downloadedPath, "-vn", "-acodec", "libmp3lame", "-q:a", "6", audioPath],
    { maxBuffer: 20 * 1024 * 1024, timeout: 10 * 60 * 1000 }
  );

  return transcribeAudioFile(audioPath);
}

export async function downloadAndTranscribeVideo(
  url: string
): Promise<{ title: string; transcript: string; usedCaptions: boolean; resolvedViaBrowser: boolean }> {
  requireBinaries();

  const workDir = path.join(os.tmpdir(), `learnwith-${randomUUID()}`);
  await fsp.mkdir(workDir, { recursive: true });

  try {
    const title = await getTitle(url);

    const captionText = await tryFetchSubtitles(url, workDir);
    if (captionText) {
      return { title, transcript: captionText, usedCaptions: true, resolvedViaBrowser: false };
    }

    try {
      const transcript = await downloadAndTranscribeAudio(url, workDir);
      return { title, transcript, usedCaptions: false, resolvedViaBrowser: false };
    } catch (directErr) {
      // No dedicated extractor for this site (common for custom course platforms like
      // Skool/Circle) — fall back to a real browser to find the actual video stream.
      const resolved = await resolveMediaUrl(url).catch(
        (browserErr): Awaited<ReturnType<typeof resolveMediaUrl>> => {
          console.error("resolveMediaUrl failed:", browserErr);
          return { kind: "not-found" };
        }
      );

      if (resolved.kind === "needs-login") {
        throw new LoginRequiredError(resolved.domain);
      }
      if (resolved.kind === "not-found") {
        throw directErr;
      }

      const transcript = await downloadAndTranscribeAudio(
        resolved.mediaUrl,
        workDir,
        [`Referer: ${resolved.referer}`, ...(resolved.cookieHeader ? [`Cookie: ${resolved.cookieHeader}`] : [])],
        url // look up cookies by the original page's domain, not the resolved CDN's
      );
      return { title, transcript, usedCaptions: false, resolvedViaBrowser: true };
    }
  } finally {
    await fsp.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
