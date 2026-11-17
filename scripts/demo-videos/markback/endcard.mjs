// Renders the end card (icon + "Markback" + one line of context + where to get it + the GitHub address) to a 1920x1080 PNG.
// Uses the extension's own icon (icon.png, copied from its assets/icon-128.png) and the site's Inter fonts.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { ACCENT_LIGHT } from './theme.mjs';

// The Chrome Web Store link is too long to read or type, so the card says where to get it and keeps the short GitHub address.
const GET_IT = 'Get it on the Chrome Web Store';
const URL = 'github.com/curlos/markback';
const ROOT = path.resolve('../../..');
const icon = `data:image/png;base64,${fs.readFileSync('icon.png').toString('base64')}`;
const font = (f) => `data:font/ttf;base64,${fs.readFileSync(path.join(ROOT, 'src/assets/fonts', f)).toString('base64')}`;
const html = `<!doctype html><html><head><style>
@font-face{font-family:Inter;font-weight:700;src:url('${font('Inter-700.ttf')}')}
@font-face{font-family:Inter;font-weight:600;src:url('${font('Inter-600.ttf')}')}
html,body{margin:0;width:1920px;height:1080px;background:#18181b;font-family:Inter}
.wrap{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:30px}
.brand{display:flex;align-items:center;gap:36px}
.brand img{width:150px;height:150px}
.name{color:#fff;font-weight:700;font-size:140px;letter-spacing:-2px;line-height:1}
.sub{color:#d4d4d8;font-weight:600;font-size:40px}
.get{color:${ACCENT_LIGHT};font-weight:700;font-size:48px;margin-top:14px}
.url{color:#a1a1aa;font-weight:600;font-size:30px}
</style></head><body><div class="wrap">
<div class="brand"><img src="${icon}" alt=""><div class="name">Markback</div></div>
<div class="sub">Timestamp bookmarks for YouTube videos and Shorts</div>
<div class="get">${GET_IT}</div>
<div class="url">${URL}</div>
</div></body></html>`;

const browser = await chromium.launch({ executablePath: process.env.EXE });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.setContent(html);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: 'endcard.png' });
await browser.close();
console.log('endcard.png');
