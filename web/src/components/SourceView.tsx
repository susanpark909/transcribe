import { useState } from "react";
import { Source } from "../api";
import { LoginNeededPanel } from "./LoginNeededPanel";
import { AlertIcon, VideoIcon, AudioIcon, CopyIcon, CheckIcon } from "./Icons";

const KIND_ICON = {
  video: VideoIcon,
  audio: AudioIcon,
};

export function SourceView({
  source,
  onUpdated,
}: {
  source: Source;
  onUpdated: (updated: Source) => void;
}) {
  const [copied, setCopied] = useState(false);
  const Icon = KIND_ICON[source.kind];

  async function handleCopy() {
    await navigator.clipboard.writeText(source.transcript);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="source-view">
      <header className="source-header">
        <span className={`kind-chip kind-${source.kind} kind-chip-lg`}>
          <Icon />
        </span>
        <div>
          <h2>{source.title}</h2>
          {source.origin && source.kind === "video" && (
            <a href={source.origin} target="_blank" rel="noreferrer" className="muted small">
              {source.origin}
            </a>
          )}
        </div>
      </header>

      {source.status === "processing" && (
        <div className="notice">
          <span className="spinner" />
          Transcribing...
        </div>
      )}

      {source.status === "error" && source.needs_login_domain && (
        <LoginNeededPanel
          sourceId={source.id}
          domain={source.needs_login_domain}
          onRetried={onUpdated}
        />
      )}

      {source.status === "error" && !source.needs_login_domain && (
        <div className="notice notice-error">
          <AlertIcon /> Something went wrong: {source.error}
        </div>
      )}

      {source.status === "ready" && (
        <div className="transcript-block">
          <div className="transcript-header">
            <h3>Transcript</h3>
            <button className="btn-primary btn-sm" onClick={handleCopy}>
              {copied ? <CheckIcon /> : <CopyIcon />} {copied ? "Copied" : "Copy transcript"}
            </button>
          </div>
          <p className="transcript-text">{source.transcript}</p>
        </div>
      )}
    </div>
  );
}
