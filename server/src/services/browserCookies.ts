import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getCookieContentForUrl } from "../db.js";

export interface PlaywrightCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
}

export function parseNetscapeCookies(content: string): PlaywrightCookie[] {
  const cookies: PlaywrightCookie[] = [];
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim() || (line.startsWith("#") && !line.startsWith("#HttpOnly_"))) continue;

    const httpOnly = line.startsWith("#HttpOnly_");
    const fields = (httpOnly ? line.slice("#HttpOnly_".length) : line).split("\t");
    if (fields.length < 7) continue;

    const [domain, , cookiePath, secure, expiry, name, value] = fields;
    cookies.push({
      name,
      value,
      domain,
      path: cookiePath || "/",
      expires: Number(expiry) > 0 ? Number(expiry) : undefined,
      httpOnly,
      secure: secure === "TRUE",
    });
  }
  return cookies;
}

function domainMatches(cookieDomain: string, hostname: string): boolean {
  const normalized = cookieDomain.replace(/^\./, "").toLowerCase();
  const host = hostname.toLowerCase();
  return host === normalized || host.endsWith(`.${normalized}`);
}

/**
 * Reads cookies saved for `targetUrl`'s domain (see db.ts's learnwith_cookies
 * table) as individual cookie objects — used to authenticate the headless
 * browser in resolveMediaUrl.ts.
 */
export async function getCookiesForUrl(targetUrl: string): Promise<PlaywrightCookie[]> {
  const hostname = new URL(targetUrl).hostname;
  const content = await getCookieContentForUrl(targetUrl);
  if (!content) return [];
  return parseNetscapeCookies(content).filter((c) => domainMatches(c.domain, hostname));
}

/**
 * yt-dlp needs an actual file for its --cookies flag. Writes the saved
 * cookies.txt content for `targetUrl`'s domain to a temp file, if any exists.
 * Caller is responsible for deleting the file when done (see
 * transcribeVideoLink.ts's withCookiesArgs).
 */
export async function writeCookiesFileForUrl(targetUrl: string): Promise<string | null> {
  const content = await getCookieContentForUrl(targetUrl);
  if (!content) return null;
  const tmpPath = path.join(os.tmpdir(), `learnwith-cookies-${randomUUID()}.txt`);
  await fs.writeFile(tmpPath, content, "utf-8");
  return tmpPath;
}
