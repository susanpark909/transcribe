import { useRef, useState } from "react";
import { api, Source } from "../api";
import { LinkIcon, AlertIcon } from "./Icons";

export function LoginNeededPanel({
  sourceId,
  domain,
  onRetried,
}: {
  sourceId: string;
  domain: string;
  onRetried: (updated: Source) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const updated = await api.uploadCookiesForSource(sourceId, file);
      onRetried(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <div className="login-needed">
      <div className="login-needed-title">
        <LinkIcon /> This video needs you to be logged into <strong>{domain}</strong>
      </div>

      <ol className="login-steps">
        <li>
          Install{" "}
          <a
            href="https://chromewebstore.google.com/search/Get%20cookies.txt%20LOCALLY"
            target="_blank"
            rel="noreferrer"
          >
            "Get cookies.txt LOCALLY"
          </a>{" "}
          (make sure it says <strong>LOCALLY</strong> — a similarly-named one without it was malware).
        </li>
        <li>
          <a href={`https://${domain}`} target="_blank" rel="noreferrer">
            Open {domain}
          </a>{" "}
          and log in like normal, then go to this same video.
        </li>
        <li>Click the extension, export cookies for this site, then drop that file below.</li>
      </ol>

      <label className="dropzone dropzone-compact">
        <span>{busy ? "Uploading and retrying..." : "Click to choose the exported cookies file"}</span>
        <input
          ref={fileInput}
          type="file"
          accept=".txt"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
      </label>

      {error && (
        <p className="error-text">
          <AlertIcon /> {error}
        </p>
      )}

      <p className="muted small">
        Once uploaded, this — and every future video from {domain} — will use this login
        automatically. You'll only need to redo this if the login expires.
      </p>
    </div>
  );
}
