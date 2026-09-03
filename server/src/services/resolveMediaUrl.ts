import { chromium } from "playwright";
import { getCookiesForUrl } from "./browserCookies.js";
import { registrableDomain } from "./cookiesShared.js";

const MEDIA_URL_PATTERN = /\.(m3u8|mp4|webm|mpd)(\?|$)/i;
const MEDIA_CONTENT_TYPES = [
  "application/vnd.apple.mpegurl",
  "application/x-mpegurl",
  "video/mp4",
  "video/webm",
  "application/dash+xml",
];
const MIN_PROGRESSIVE_BYTES = 150_000; // filters out thumbnail-sized mp4/webm previews

const LOGIN_URL_PATTERN = /\/(sign[_-]?in|log[_-]?in|login|signin|authenticate)(\/|$|\?)/i;

interface Candidate {
  url: string;
  score: number;
}

export type ResolveResult =
  | { kind: "found"; mediaUrl: string; cookieHeader: string; referer: string }
  | { kind: "needs-login"; domain: string }
  | { kind: "not-found" };

/**
 * Loads a page in a real (headless) browser — reusing cookies from
 * server/cookies/ or the browser named in YTDLP_COOKIES_BROWSER if either is
 * set — and watches network traffic to find the actual video stream URL.
 * This is the fallback for sites with no dedicated yt-dlp extractor and a
 * JS-rendered player (common on course platforms like Skool or Circle). Runs
 * entirely headless, so it doesn't need a visible desktop session.
 */
export async function resolveMediaUrl(pageUrl: string): Promise<ResolveResult> {
  const injectedCookies = await getCookiesForUrl(pageUrl).catch(() => []);
  const browser = await chromium.launch({
    headless: true,
    // Needed in most container environments (e.g. Render) — the default
    // Chromium sandbox requires kernel privileges Docker containers usually
    // don't grant, and the default /dev/shm size is too small for Chromium's
    // shared memory needs.
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    const context = await browser.newContext();
    if (injectedCookies.length) await context.addCookies(injectedCookies);
    const page = await context.newPage();
    const candidates: Candidate[] = [];

    page.on("response", (response) => {
      const url = response.url();
      const headers = response.headers();
      const contentType = headers["content-type"] ?? "";
      const isPlaylist = MEDIA_URL_PATTERN.test(url.split("?")[0]) || url.includes(".m3u8");
      const isMediaType = MEDIA_CONTENT_TYPES.some((t) => contentType.includes(t));
      if (!isPlaylist && !isMediaType) return;

      let score = 0;
      if (/\.m3u8/i.test(url) || contentType.includes("mpegurl")) {
        score = 3;
      } else if (/\.mpd/i.test(url) || contentType.includes("dash")) {
        score = 2;
      } else {
        // Progressive mp4/webm — skip thumbnail-sized previews.
        const size = Number(headers["content-length"] ?? 0);
        if (size > 0 && size < MIN_PROGRESSIVE_BYTES) return;
        score = 1;
      }

      candidates.push({ url, score });
    });

    await page
      .goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 30_000 })
      .catch((err) => console.error(`resolveMediaUrl: page.goto failed for ${pageUrl}:`, err));

    // Many players only start loading the stream once "played" — best-effort nudge.
    const playSelectors = [
      "video",
      "button[aria-label*='play' i]",
      ".vjs-big-play-button",
      "[class*='play-button']",
      "[class*='PlayButton']",
    ];
    for (const selector of playSelectors) {
      try {
        await page.locator(selector).first().click({ timeout: 2000 });
      } catch {
        // ignore — selector may not exist or not be clickable, that's fine
      }
    }

    // Give the player time to start streaming.
    await page.waitForTimeout(8000);

    if (!candidates.length) {
      // No video stream showed up — if we also got bounced to a login page (and
      // had no cookies to offer), that's almost certainly why.
      const finalUrl = page.url();
      const title = await page.title().catch(() => "");
      const looksLikeLoginWall =
        LOGIN_URL_PATTERN.test(finalUrl) || /\b(sign in|log in)\b/i.test(title);
      console.error(
        `resolveMediaUrl found no candidates for ${pageUrl} — finalUrl=${finalUrl} title=${JSON.stringify(title)} cookiesInjected=${injectedCookies.length}`
      );
      if (looksLikeLoginWall && !injectedCookies.length) {
        return { kind: "needs-login", domain: registrableDomain(new URL(pageUrl).hostname) };
      }
      return { kind: "not-found" };
    }

    const best = candidates
      .filter((c) => c.score >= 2) // m3u8/mpd manifests are reliable regardless of size
      .concat(candidates.filter((c) => c.score === 1)) // progressive files as fallback
      .sort((a, b) => b.score - a.score)[0];

    if (!best) return { kind: "not-found" };

    const cookies = await context.cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

    return { kind: "found", mediaUrl: best.url, cookieHeader, referer: pageUrl };
  } finally {
    await browser.close();
  }
}
