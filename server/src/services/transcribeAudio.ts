import fs from "node:fs";

const ASSEMBLYAI_BASE = "https://api.assemblyai.com/v2";
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour ceiling for very long files

function requireApiKey(): string {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ASSEMBLYAI_API_KEY is not set. Audio/video transcription requires an AssemblyAI API key — add it to server/.env."
    );
  }
  return apiKey;
}

/**
 * Transcribes an audio file via AssemblyAI. Unlike the previous Whisper-based
 * approach, this doesn't need to split large files into chunks — AssemblyAI
 * accepts uploads up to 2.2GB / audio up to 10 hours per file, which comfortably
 * covers any real lecture or course video.
 */
export async function transcribeAudioFile(filePath: string): Promise<string> {
  const apiKey = requireApiKey();

  // 1. Upload the local file, getting back a URL AssemblyAI can read it from.
  const buffer = fs.readFileSync(filePath);
  const uploadRes = await fetch(`${ASSEMBLYAI_BASE}/upload`, {
    method: "POST",
    headers: { authorization: apiKey },
    body: buffer,
  });
  if (!uploadRes.ok) {
    throw new Error(`AssemblyAI upload failed: ${uploadRes.status} ${await uploadRes.text()}`);
  }
  const { upload_url: audioUrl } = (await uploadRes.json()) as { upload_url: string };

  // 2. Submit the transcription job.
  const submitRes = await fetch(`${ASSEMBLYAI_BASE}/transcript`, {
    method: "POST",
    headers: { authorization: apiKey, "content-type": "application/json" },
    body: JSON.stringify({ audio_url: audioUrl }),
  });
  if (!submitRes.ok) {
    throw new Error(`AssemblyAI transcript request failed: ${submitRes.status} ${await submitRes.text()}`);
  }
  const { id } = (await submitRes.json()) as { id: string };

  // 3. Poll until the job finishes.
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const pollRes = await fetch(`${ASSEMBLYAI_BASE}/transcript/${id}`, {
      headers: { authorization: apiKey },
    });
    if (!pollRes.ok) {
      throw new Error(`AssemblyAI status check failed: ${pollRes.status} ${await pollRes.text()}`);
    }
    const data = (await pollRes.json()) as { status: string; text: string | null; error?: string };

    if (data.status === "completed") return data.text ?? "";
    if (data.status === "error") throw new Error(`AssemblyAI transcription failed: ${data.error}`);

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error("Transcription timed out after an hour of waiting.");
}
