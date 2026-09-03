import { resolveMediaUrl } from "../src/services/resolveMediaUrl.js";

const url = process.argv[2];
if (!url) {
  console.error("Usage: tsx scripts/test-resolver.ts <url>");
  process.exit(1);
}

const result = await resolveMediaUrl(url);
console.log(JSON.stringify(result, null, 2));
