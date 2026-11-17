// Renders the end card (logo + "Statly" + URL) to a 1920x1080 PNG.
import { chromium } from 'playwright';
import fs from 'node:fs';

const svg = fs.readFileSync('statly-logo.svg', 'utf8');
const fontUrl = (f) => 'file://' + process.cwd() + '/font/extras/ttf/' + f;
const html = `<!doctype html><html><head><style>
@font-face{font-family:Inter;font-weight:700;src:url('${fontUrl('Inter-Bold.ttf')}')}
@font-face{font-family:Inter;font-weight:500;src:url('${fontUrl('Inter-Medium.ttf')}')}
html,body{margin:0;width:1920px;height:1080px;background:#14181f;font-family:Inter}
.wrap{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:34px}
.brand{display:flex;align-items:center;gap:36px}
.brand svg{width:150px;height:150px}
.name{color:#fff;font-weight:700;font-size:150px;letter-spacing:-2px;line-height:1}
.url{color:#ffc72c;font-weight:500;font-size:52px}
</style></head><body><div class="wrap">
<div class="brand">${svg}<div class="name">Statly</div></div>
<div class="url">Try it at statly-pi.vercel.app</div>
</div></body></html>`;
fs.writeFileSync('build_endcard.html', html);

const browser = await chromium.launch({ executablePath: process.env.EXE });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto('file://' + process.cwd() + '/build_endcard.html');
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: 'endcard.png' });
await browser.close();
