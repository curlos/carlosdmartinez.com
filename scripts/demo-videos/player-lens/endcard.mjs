// Renders the end card (icon + "Player Lens" + hackathon line + live demo URL) to a 1920x1080 PNG.
// Uses the site's own icon and Inter fonts, so nothing needs downloading.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('../../..');
const svg = fs.readFileSync(path.join(ROOT, 'src/assets/icons/player-lens.svg'), 'utf8');
const font = (f) => 'file://' + path.join(ROOT, 'src/assets/fonts', f);
const html = `<!doctype html><html><head><style>
@font-face{font-family:Inter;font-weight:700;src:url('${font('Inter-700.ttf')}')}
@font-face{font-family:Inter;font-weight:600;src:url('${font('Inter-600.ttf')}')}
html,body{margin:0;width:1920px;height:1080px;background:#18181b;font-family:Inter}
.wrap{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:30px}
.brand{display:flex;align-items:center;gap:36px}
.brand svg{width:150px;height:150px}
.name{color:#fff;font-weight:700;font-size:140px;letter-spacing:-2px;line-height:1}
.sub{color:#d4d4d8;font-weight:600;font-size:40px}
.url{color:#a3e635;font-weight:600;font-size:40px}
</style></head><body><div class="wrap">
<div class="brand">${svg}<div class="name">Player Lens</div></div>
<div class="sub">Built for the Microsoft x Premier League hackathon</div>
<div class="url">player-lens.wittysea-a332ed57.eastus.azurecontainerapps.io</div>
</div></body></html>`;
fs.writeFileSync('build_endcard.html', html);

const browser = await chromium.launch({ executablePath: process.env.EXE });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto('file://' + path.resolve('build_endcard.html'));
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: 'endcard.png' });
await browser.close();
