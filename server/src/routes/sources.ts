import { Router } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import fsp from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import {
  createPendingSource,
  setSourceContent,
  renameSource,
  getSource,
  listSources,
  markSourceError,
  markNeedsLogin,
  resetForRetry,
  deleteSource,
  moveSourceToProject,
  upsertCookieContent,
} from "../db.js";
import {
  extractYoutubeId,
  fetchYoutubeTranscript,
  getYoutubeTitle,
} from "../services/transcribeYoutube.js";
import { transcribeAudioFile, TranscribeOptions } from "../services/transcribeAudio.js";
import { downloadAndTranscribeVideo, LoginRequiredError } from "../services/transcribeVideoLink.js";
import { registrableDomain } from "../services/cookiesShared.js";
import { asyncHandler } from "../asyncHandler.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.join(__dirname, "..", "..", "uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    // AssemblyAI identifies audio format from the filename extension, so the
    // saved temp file must keep the original one (multer's default drops it).
    filename: (_req, file, cb) => cb(null, randomUUID() + path.extname(file.originalname)),
  }),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB
});

export const sourcesRouter = Router();

sourcesRouter.get("/", asyncHandler(async (_req, res) => {
  res.json(await listSources());
}));

sourcesRouter.get("/:id", asyncHandler(async (req, res) => {
  const source = await getSource(req.params.id);
  if (!source) return res.status(404).json({ error: "Not found" });
  res.json(source);
}));

sourcesRouter.delete("/:id", asyncHandler(async (req, res) => {
  await deleteSource(req.params.id);
  res.status(204).end();
}));

sourcesRouter.post("/:id/rename", asyncHandler(async (req, res) => {
  const source = await getSource(req.params.id);
  if (!source) return res.status(404).json({ error: "Not found" });

  const title = String(req.body?.title ?? "").trim();
  if (!title) return res.status(400).json({ error: "Title can't be empty." });

  await renameSource(source.id, title);
  res.json(await getSource(source.id));
}));

/** Swaps generic "Speaker A:" labels for real names, e.g. { A: "Employee", B: "Seller" }. */
sourcesRouter.post("/:id/speakers", asyncHandler(async (req, res) => {
  const source = await getSource(req.params.id);
  if (!source) return res.status(404).json({ error: "Not found" });

  const names = (req.body?.names ?? {}) as Record<string, unknown>;
  let transcript = source.transcript;
  for (const [letter, rawName] of Object.entries(names)) {
    const name = String(rawName ?? "").trim();
    if (!/^[A-Z]$/.test(letter) || !name) continue;
    transcript = transcript.replace(new RegExp(`^Speaker ${letter}:`, "gm"), () => `${name}:`);
  }

  await setSourceContent(source.id, source.title, transcript);
  res.json(await getSource(source.id));
}));

sourcesRouter.post("/:id/move", asyncHandler(async (req, res) => {
  const source = await getSource(req.params.id);
  if (!source) return res.status(404).json({ error: "Not found" });

  const projectId = req.body?.projectId;
  await moveSourceToProject(source.id, projectId ? String(projectId) : null);
  res.json(await getSource(source.id));
}));

sourcesRouter.post("/audio", upload.single("file"), asyncHandler(async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: "No file uploaded" });

  // Respond right away and transcribe in the background (same as video links):
  // a long recording can take minutes, which is too long to hold a web
  // request open — the browser or host would drop the connection mid-way.
  try {
    const source = await createPendingSource({
      kind: "audio",
      title: file.originalname,
      origin: file.originalname,
    });
    res.status(202).json(source);
    void processAudioSource(source.id, file.path, file.originalname, {
      speakerLabels: req.body?.speakerLabels === "true",
    });
  } catch (err) {
    fs.unlink(file.path, () => {});
    throw err;
  }
}));

async function processAudioSource(
  sourceId: string,
  filePath: string,
  title: string,
  options: TranscribeOptions
) {
  try {
    const transcript = await transcribeAudioFile(filePath, options);
    if (!transcript.trim()) throw new Error("Transcription returned no text.");
    await setSourceContent(sourceId, title, transcript);
  } catch (err: unknown) {
    await markSourceError(sourceId, err instanceof Error ? err.message : String(err));
  } finally {
    fs.unlink(filePath, () => {});
  }
}

async function resolveVideoContent(
  url: string,
  options: TranscribeOptions
): Promise<{ title: string; transcript: string }> {
  const videoId = extractYoutubeId(url);
  // YouTube captions carry no speaker info, so skip them when speakers are wanted.
  if (videoId && !options.speakerLabels) {
    try {
      const [transcript, title] = await Promise.all([
        fetchYoutubeTranscript(videoId),
        getYoutubeTitle(videoId),
      ]);
      return { title, transcript };
    } catch {
      // No captions available — fall through to download + transcribe.
    }
  }
  return downloadAndTranscribeVideo(url, options);
}

/** Runs the full video pipeline for an existing source row (used for both first attempts and retries). */
async function processVideoSource(sourceId: string, url: string, options: TranscribeOptions = {}) {
  try {
    const { title, transcript } = await resolveVideoContent(url, options);
    if (!transcript.trim()) {
      throw new Error("Couldn't get any transcript from this video.");
    }
    await setSourceContent(sourceId, title, transcript);
  } catch (err: unknown) {
    if (err instanceof LoginRequiredError) {
      await markNeedsLogin(sourceId, err.domain);
    } else {
      await markSourceError(sourceId, err instanceof Error ? err.message : String(err));
    }
  }
}

sourcesRouter.post("/video", asyncHandler(async (req, res) => {
  const url = String(req.body?.url ?? "").trim();
  if (!url) return res.status(400).json({ error: "No URL provided" });
  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: "That doesn't look like a valid URL." });
  }

  const source = await createPendingSource({ kind: "video", title: url, origin: url });
  res.status(202).json(source);
  void processVideoSource(source.id, url, { speakerLabels: req.body?.speakerLabels === true });
}));

/** Saves an uploaded cookies.txt for a video that needs a login, then retries it. */
sourcesRouter.post("/:id/cookies", upload.single("file"), asyncHandler(async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: "No file uploaded" });

  const source = await getSource(req.params.id);
  if (!source || !source.origin) {
    fs.unlink(file.path, () => {});
    return res.status(404).json({ error: "Not found" });
  }

  try {
    const domain = source.needs_login_domain ?? registrableDomain(new URL(source.origin).hostname);
    const content = await fsp.readFile(file.path, "utf-8");
    await upsertCookieContent(domain, content);

    await resetForRetry(source.id);
    res.status(202).json(await getSource(source.id));
    void processVideoSource(source.id, source.origin);
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  } finally {
    fs.unlink(file.path, () => {});
  }
}));
