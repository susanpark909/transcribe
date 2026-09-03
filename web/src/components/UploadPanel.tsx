import { useRef, useState } from "react";
import { api } from "../api";
import { VideoIcon, AudioIcon, LinkIcon, AlertIcon } from "./Icons";

type Tab = "video" | "audio";

export function UploadPanel({ onCreated }: { onCreated: (id: string) => void }) {
  const [tab, setTab] = useState<Tab>("video");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function handleVideoSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const source = await api.submitVideo(url.trim());
      setUrl("");
      onCreated(source.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const source = await api.uploadAudio(file);
      onCreated(source.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <div className="upload-panel">
      <div className="upload-glow" aria-hidden />
      <span className="eyebrow">Transcribe</span>
      <h2>Add a video or audio file</h2>
      <p className="muted">
        Paste a course video link (works behind a login too) or upload an MP3 — I'll turn it into
        a plain transcript you can copy anywhere.
      </p>

      <div className="tabs">
        <button className={tab === "video" ? "tab active" : "tab"} onClick={() => setTab("video")}>
          <VideoIcon /> Video link
        </button>
        <button className={tab === "audio" ? "tab active" : "tab"} onClick={() => setTab("audio")}>
          <AudioIcon /> Audio
        </button>
      </div>

      {tab === "video" && (
        <form onSubmit={handleVideoSubmit} className="upload-form">
          <div className="input-with-icon">
            <LinkIcon />
            <input
              type="url"
              placeholder="Paste a YouTube, Vimeo, TikTok, course platform... any video link"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={busy}
            />
          </div>
          <button className="btn-primary" type="submit" disabled={busy || !url.trim()}>
            {busy ? "Fetching..." : "Add video"}
          </button>
          <p className="muted small">
            Uses captions when available for instant results; otherwise the audio is
            downloaded and transcribed automatically.
          </p>
        </form>
      )}

      {tab === "audio" && (
        <div className="upload-form">
          <label className="dropzone">
            <AudioIcon />
            <span>{busy ? "Uploading and transcribing..." : "Click to choose a file"}</span>
            <span className="muted small">MP3, M4A, or WAV</span>
            <input
              ref={fileInput}
              type="file"
              accept="audio/*,.mp3,.m4a,.wav"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
          </label>
        </div>
      )}

      {error && (
        <p className="error-text">
          <AlertIcon /> {error}
        </p>
      )}
    </div>
  );
}
