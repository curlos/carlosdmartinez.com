// Renders the end card (shoe icon + "Sneaker Palace" + one line of context + live demo URL) to a 1920x1080 PNG.
// The icon is the app's own (sneaker-palace/client/public/icon.png, black on transparent), inverted to white here.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { THEME } from './theme.mjs';

const ROOT = path.resolve('../../..');
const ICON = process.env.ICON || path.resolve(ROOT, '../sneaker-palace/client/public/icon.png');
const icon = fs.existsSync(ICON)
	? `<img src="data:image/png;base64,${fs.readFileSync(ICON).toString('base64')}">`
	: '';
const font = (f) => `data:font/ttf;base64,${fs.readFileSync(path.join(ROOT, 'src/assets/fonts', f)).toString('base64')}`;
const html = `<!doctype html><html><head><style>
@font-face{font-family:Inter;font-weight:700;src:url('${font('Inter-700.ttf')}')}
@font-face{font-family:Inter;font-weight:600;src:url('${font('Inter-600.ttf')}')}
html,body{margin:0;width:1920px;height:1080px;background:${THEME.endcard.background};font-family:Inter}
.wrap{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:30px}
.brand{display:flex;align-items:center;gap:36px}
.brand img{width:170px;height:170px;filter:invert(1)}
.name{color:${THEME.endcard.name};font-weight:700;font-size:140px;letter-spacing:-2px;line-height:1}
.sub{color:${THEME.endcard.sub};font-weight:600;font-size:40px}
.url{color:${THEME.endcard.url};font-weight:600;font-size:40px}
</style></head><body><div class="wrap">
<div class="brand">${icon}<div class="name">Sneaker Palace</div></div>
<div class="sub">An online sneaker store with search, filters and Stripe checkout</div>
<div class="url">sneaker-palace.vercel.app</div>
</div></body></html>`;

const browser = await chromium.launch({ executablePath: process.env.EXE });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.setContent(html);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: 'endcard.png' });
await browser.close();
console.log('endcard.png');
