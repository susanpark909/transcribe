import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const require = createRequire(import.meta.url);
const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const binDir = path.join(__dirname, "..", "bin");
fs.mkdirSync(binDir, { recursive: true });

// 1. Stage ffmpeg + ffprobe side by side in bin/ so yt-dlp's --ffmpeg-location
// (which expects a directory containing both) can find them.
function stageFfmpegTools() {
  const ffmpegSrc = require("ffmpeg-static");
  const ffprobeSrc = require("ffprobe-static").path;
  for (const src of [ffmpegSrc, ffprobeSrc]) {
    const dest = path.join(binDir, path.basename(src));
    if (!fs.existsSync(dest)) {
      fs.copyFileSync(src, dest);
      if (process.platform !== "win32") fs.chmodSync(dest, 0o755);
    }
  }
  console.log("Staged ffmpeg + ffprobe into", binDir);
}

try {
  stageFfmpegTools();
} catch (err) {
  console.warn(
    `Warning: could not stage ffmpeg/ffprobe (${err instanceof Error ? err.message : err}). Long/generic video transcription may not work.`
  );
}

// 2. Download the yt-dlp binary (standalone, no Python required).
async function downloadYtDlp() {
  const isWin = process.platform === "win32";
  const isMac = process.platform === "darwin";
  const assetName = isWin ? "yt-dlp.exe" : isMac ? "yt-dlp_macos" : "yt-dlp";
  const destPath = path.join(binDir, isWin ? "yt-dlp.exe" : "yt-dlp");

  if (fs.existsSync(destPath)) {
    console.log("yt-dlp binary already present, skipping download.");
    return;
  }

  const url = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${assetName}`;
  console.log(`Downloading yt-dlp binary from ${url} ...`);

  async function download(fetchUrl, redirects = 0) {
    if (redirects > 5) throw new Error("Too many redirects downloading yt-dlp");
    const res = await fetch(fetchUrl, { redirect: "manual" });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new Error("Redirect with no location header");
      return download(location, redirects + 1);
    }
    if (!res.ok) {
      throw new Error(`Failed to download yt-dlp: ${res.status} ${res.statusText}`);
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(destPath, buffer);
    if (!isWin) fs.chmodSync(destPath, 0o755);
    console.log(`Saved yt-dlp to ${destPath}`);
  }

  await download(url);
}

try {
  await downloadYtDlp();
} catch (err) {
  console.warn(
    `Warning: could not download yt-dlp automatically (${err instanceof Error ? err.message : err}). ` +
      `Video link support won't work until this is resolved. ` +
      `You can manually download it from https://github.com/yt-dlp/yt-dlp/releases/latest into server/bin/`
  );
}

// 3. Download Playwright's Chromium (used to log into course platforms and
// resolve video streams on sites with no dedicated extractor, e.g. Skool/Circle).
try {
  console.log("Downloading Playwright's Chromium browser (used for login-gated course sites)...");
  await execFileAsync(process.execPath, [
    path.join(__dirname, "..", "node_modules", "playwright", "cli.js"),
    "install",
    "chromium",
  ]);
  console.log("Playwright Chromium ready.");
} catch (err) {
  console.warn(
    `Warning: could not download Playwright's browser (${err instanceof Error ? err.message : err}). ` +
      `Course platforms without a dedicated extractor (e.g. Skool, Circle) won't be reachable until ` +
      `you run "npx playwright install chromium" manually in server/.`
  );
}
