/** Turns a .vtt or .srt subtitle file's contents into plain, deduplicated text. */
export function parseSubtitleFile(content: string): string {
  const lines = content.split(/\r?\n/);
  const out: string[] = [];
  let lastLine = "";

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("WEBVTT")) continue;
    if (/^(Kind|Language|STYLE|NOTE):/i.test(line)) continue;
    if (line.includes("-->")) continue; // timestamp cue line
    if (/^\d+$/.test(line)) continue; // SRT cue index

    const cleaned = line.replace(/<[^>]+>/g, "").trim();
    if (!cleaned || cleaned === lastLine) continue;
    out.push(cleaned);
    lastLine = cleaned;
  }

  return out.join(" ");
}
