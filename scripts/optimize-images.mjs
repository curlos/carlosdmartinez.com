// Converts original PNG screenshots into web-ready WebP files in src/assets/projects/, which the site
// imports statically. Only adds files: existing WebPs are skipped (unless --force) and nothing is deleted.
// Usage:
//   npm run images                                   every PNG in portfolio-assets/ (gitignored) without a WebP yet
//   npm run images -- path/to/a.png path/to/b.png    just these
//   npm run images -- --force path/to/a.png          replace a.webp if it already exists
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const SRC = "portfolio-assets";
const OUT = "src/assets/projects";
const MAX_WIDTH = 1920;
const MIN_WIDTH = 1280;
const TARGET_BYTES = 300 * 1024;
// next/image re-encodes at q75, so the source stays well above that to keep screenshot text sharp.
const QUALITIES = [86, 82, 78];

const kb = (bytes) => `${Math.round(bytes / 1024)} KB`;
const exists = (file) =>
  fs.access(file).then(
    () => true,
    () => false,
  );

const args = process.argv.slice(2);
const force = args.includes("--force");
const named = args.filter((a) => a !== "--force");
const inputs = named.length
  ? named
  : (await fs.readdir(SRC)).filter((f) => f.endsWith(".png")).map((f) => path.join(SRC, f));

await fs.mkdir(OUT, { recursive: true });
const rows = [];
let skipped = 0;

for (const input of inputs) {
  const output = path.join(OUT, path.basename(input).replace(/\.png$/, ".webp"));
  if (!force && (await exists(output))) {
    skipped++;
    continue;
  }
  let width = Math.min(MAX_WIDTH, (await sharp(input).metadata()).width);
  let buffer;
  let quality;

  // At each width, try high qualities; only step the width down if none fit.
  search: while (true) {
    for (quality of QUALITIES) {
      buffer = await sharp(input)
        .resize({ width, withoutEnlargement: true })
        .webp({ quality, effort: 6, smartSubsample: true })
        .toBuffer();
      if (buffer.length <= TARGET_BYTES) break search;
    }
    if (width <= MIN_WIDTH) break;
    width = Math.max(MIN_WIDTH, width - 160);
  }

  await fs.writeFile(output, buffer);
  const meta = await sharp(buffer).metadata();
  rows.push({
    file: path.basename(output),
    bytes: buffer.length,
    size: kb(buffer.length),
    width: meta.width,
    height: meta.height,
    quality,
  });
}

// Demo video posters in public/posters/ come from the scripts in scripts/demo-videos/, not from here.

if (rows.length) console.table(rows, ["file", "size", "width", "height", "quality"]);
if (skipped) console.log(`Skipped ${skipped} that already have a WebP (use --force to replace).`);
const over = rows.filter((r) => r.bytes > TARGET_BYTES);
console.log(
  !rows.length
    ? "Nothing new to convert."
    : over.length
      ? `Over 300 KB: ${over.map((r) => r.file).join(", ")}`
      : `All ${rows.length} new images are under 300 KB`,
);
process.exitCode = over.length ? 1 : 0;
