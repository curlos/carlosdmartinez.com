// Renders the end card (icon + "ReelHouse" + one line of context + live demo URL) to a 1920x1080 PNG.
// Uses the site's own icon and Inter fonts, so nothing needs downloading.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

// The site's own accent (ReelHouse's violet, --brand #8B5CF6 in the app; the lighter shade reads better on this dark card).
const ACCENT = '#A78BFA';
const ROOT = path.resolve('../../..');
const icon = `data:image/svg+xml;base64,${fs.readFileSync(path.join(ROOT, 'src/assets/icons/reelhouse.svg')).toString('base64')}`;
const font = (f) => `data:font/ttf;base64,${fs.readFileSync(path.join(ROOT, 'src/assets/fonts', f)).toString('base64')}`;
const html = `<!doctype html><html><head><style>
@font-face{font-family:Inter;font-weight:700;src:url('${font('Inter-700.ttf')}')}
@font-face{font-family:Inter;font-weight:600;src:url('${font('Inter-600.ttf')}')}
html,body{margin:0;width:1920px;height:1080px;background:#18181b;font-family:Inter}
.wrap{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:30px}
.brand{display:flex;align-items:center;gap:36px}
.brand img{width:150px;height:150px;border-radius:28px}
.name{color:#fff;font-weight:700;font-size:140px;letter-spacing:-2px;line-height:1}
.sub{color:#d4d4d8;font-weight:600;font-size:40px}
.url{color:${ACCENT};font-weight:600;font-size:40px}
</style></head><body><div class="wrap">
<div class="brand"><img src="${icon}" alt=""><div class="name">ReelHouse</div></div>
<div class="sub">Discover movies and TV shows, with trailers from TMDB</div>
<div class="url">reelhouse-tmdb.vercel.app</div>
</div></body></html>`;

const browser = await chromium.launch({ executablePath: process.env.EXE });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.setContent(html);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: 'endcard.png' });
await browser.close();
console.log('endcard.png');
