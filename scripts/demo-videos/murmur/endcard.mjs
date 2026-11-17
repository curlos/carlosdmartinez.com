// Renders the end card (Murmur logo + name + one line + live URL) to a 1920x1080 PNG.
// Uses the site's Murmur icon (src/assets/icons/murmur.svg, same artwork as the app's logo) and Inter.
// Usage: node endcard.mjs [background]   (default CARD_BG from theme.mjs)
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { ACCENT_LIGHT, CARD_BG } from './theme.mjs';

const ROOT = path.resolve('../../..');
const svg = fs.readFileSync(path.join(ROOT, 'src/assets/icons/murmur.svg'), 'utf8');
const bg = process.argv[2] || CARD_BG;
const font = (f) => 'file://' + path.join(ROOT, 'src/assets/fonts', f);
const html = `<!doctype html><html><head><style>
@font-face{font-family:Inter;font-weight:700;src:url('${font('Inter-700.ttf')}')}
@font-face{font-family:Inter;font-weight:600;src:url('${font('Inter-600.ttf')}')}
html,body{margin:0;width:1920px;height:1080px;background:${bg};font-family:Inter}
.wrap{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:30px}
.brand{display:flex;align-items:center;gap:32px}
.brand svg{width:170px;height:170px}
.name{color:#fff;font-weight:700;font-size:150px;letter-spacing:-3px;line-height:1}
.sub{color:#e4e4e7;font-weight:600;font-size:44px}
.url{color:${ACCENT_LIGHT};font-weight:600;font-size:40px}
</style></head><body><div class="wrap">
<div class="brand">${svg}<div class="name">Murmur</div></div>
<div class="sub">Short posts. Real conversations.</div>
<div class="url">murmur-social-media.vercel.app</div>
</div></body></html>`;
fs.writeFileSync('build_endcard.html', html);

const browser = await chromium.launch({ executablePath: process.env.EXE });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto('file://' + path.resolve('build_endcard.html'));
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: process.argv[3] || 'endcard.png' });
await browser.close();
