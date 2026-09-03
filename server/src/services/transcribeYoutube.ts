import { YoutubeTranscript } from "youtube-transcript";

export function extractYoutubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) {
      return u.pathname.slice(1) || null;
    }
    if (u.hostname.includes("youtube.com")) {
      if (u.pathname === "/watch") return u.searchParams.get("v");
      if (u.pathname.startsWith("/shorts/")) {
        return u.pathname.split("/")[2] ?? null;
      }
      if (u.pathname.startsWith("/live/")) {
        return u.pathname.split("/")[2] ?? null;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export async function getYoutubeTitle(videoId: string): Promise<string> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
    );
    if (!res.ok) throw new Error("oembed failed");
    const data = (await res.json()) as { title?: string };
    return data.title ?? `YouTube video (${videoId})`;
  } catch {
    return `YouTube video (${videoId})`;
  }
}

export async function fetchYoutubeTranscript(videoId: string): Promise<string> {
  const segments = await YoutubeTranscript.fetchTranscript(videoId);
  if (!segments.length) {
    throw new Error("No captions available for this video.");
  }
  return segments.map((s) => s.text).join(" ");
}
