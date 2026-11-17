import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

const cache = new Map<string, string>();

// Adds a content hash to a file in public/ (read at build time), so a re-recorded demo gets a new URL
// and the 30-day Cache-Control on /videos and /posters never serves the old one.
export function versioned(publicPath: string) {
  let url = cache.get(publicPath);
  if (!url) {
    const file = readFileSync(path.join(process.cwd(), "public", publicPath));
    url = `${publicPath}?v=${createHash("sha256").update(file).digest("hex").slice(0, 8)}`;
    cache.set(publicPath, url);
  }
  return url;
}
