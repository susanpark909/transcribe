/** Collapses a hostname to its likely registrable domain (good enough for .com/.org/.io etc). */
export function registrableDomain(hostname: string): string {
  const parts = hostname.toLowerCase().split(".");
  return parts.length <= 2 ? hostname.toLowerCase() : parts.slice(-2).join(".");
}
