// Records each shot of the Statly demo as its own video file (guest mode only).
// Usage: EXE=<chromium path> node record.mjs
// Pipeline, run from this folder: record.mjs → endcard.mjs → edit.mjs (needs ffmpeg).
// endcard.mjs and edit.mjs expect the Inter TTFs in font/extras/ttf/ (from the Inter release zip).
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = 'https://statly-pi.vercel.app';
const VIEW = { width: 1920, height: 1080 };
const OUT = 'raw';
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT);

const browser = await chromium.launch({ executablePath: process.env.EXE });

// Visible cursor + hide the demo banner (Playwright videos have no cursor).
const initScript = () => {
	window.addEventListener('DOMContentLoaded', () => {
		const style = document.createElement('style');
		style.textContent = `
			#demo-cursor{position:fixed;z-index:2147483647;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;
				background:rgba(255,255,255,.85);border:2px solid rgba(0,0,0,.6);pointer-events:none;transition:transform .12s}
			#demo-cursor.down{transform:scale(.7)}`;
		document.head.appendChild(style);
		const dot = document.createElement('div');
		dot.id = 'demo-cursor';
		dot.style.left = '-50px';
		document.body.appendChild(dot);
		document.addEventListener('mousemove', (e) => { dot.style.left = e.clientX + 'px'; dot.style.top = e.clientY + 'px'; }, true);
		document.addEventListener('mousedown', () => dot.classList.add('down'), true);
		document.addEventListener('mouseup', () => dot.classList.remove('down'), true);
		// The "You're in demo mode" banner is the first fixed bar containing that text.
		const hideBanner = () => {
			for (const el of document.querySelectorAll('body *')) {
				if (el.children.length < 3 && /You're in demo mode/.test(el.textContent || '') && el.offsetHeight < 60) {
					el.style.display = 'none';
					return true;
				}
			}
			return false;
		};
		const t = setInterval(() => hideBanner() && clearInterval(t), 200);
		setTimeout(() => clearInterval(t), 10000);
	});
};

// --- Setup (not recorded): enter guest mode and turn on emotion tags ---
const setupCtx = await browser.newContext({ viewport: VIEW });
const setup = await setupCtx.newPage();
await setup.goto(`${BASE}/demo`, { waitUntil: 'networkidle', timeout: 60000 });
await setup.goto(`${BASE}/focus-records`, { waitUntil: 'networkidle' });
await setup.locator('button:has-text("settings")').first().click();
for (const label of ['Show Focus Record Emotions', 'Show Emotion Count']) {
	const b = await setup.getByText(label, { exact: true }).boundingBox();
	await setup.mouse.click(b.x + 4, b.y + b.height / 2);
	await setup.waitForTimeout(800);
}
await setup.waitForTimeout(1500);
const state = await setupCtx.storageState();
await setupCtx.close();

// --- Recording ---
const ctx = await browser.newContext({ viewport: VIEW, storageState: state, recordVideo: { dir: OUT, size: VIEW } });
await ctx.addInitScript(initScript);

const shots = [];
const pause = (p, ms) => p.waitForTimeout(ms);
const glide = async (p, x, y, steps = 30) => p.mouse.move(x, y, { steps });
const slowScroll = async (p, total, ms = 3000) => {
	const n = Math.max(1, Math.round(ms / 40));
	for (let i = 0; i < n; i++) {
		await p.mouse.wheel(0, total / n);
		await p.waitForTimeout(40);
	}
};
const clickHuman = async (p, locator) => {
	const box = await locator.boundingBox();
	await glide(p, box.x + box.width / 2, box.y + box.height / 2, 25);
	await pause(p, 250);
	await p.mouse.down();
	await pause(p, 90);
	await p.mouse.up();
};

async function shot(name, url, run) {
	const t0 = Date.now();
	const p = await ctx.newPage();
	await p.goto(BASE + url, { waitUntil: 'networkidle', timeout: 60000 });
	await p.waitForTimeout(1200); // let charts and fonts settle
	await p.mouse.move(1500, 900);
	const start = (Date.now() - t0) / 1000;
	await run(p);
	const end = (Date.now() - t0) / 1000;
	const video = p.video();
	await p.close();
	const file = await video.path();
	shots.push({ name, file, start, end });
	console.log(`${name}: ${start.toFixed(1)}s → ${end.toFixed(1)}s`);
}

// 1. Stats (Focus): hero dashboard, then down to timeline + year grid
await shot('01-stats', '/stats/focus', async (p) => {
	await pause(p, 2500);
	await glide(p, 960, 700);
	await slowScroll(p, 760, 4500);
	await pause(p, 2500);
	await glide(p, 600, 880, 40);
	await pause(p, 1500);
});

// 2a. Medals
await shot('02a-medals', '/medals/focus/daily', async (p) => {
	await pause(p, 1200);
	await clickHuman(p, p.getByText('Focus 6h', { exact: true }).first());
	await pause(p, 1800);
	await clickHuman(p, p.getByText('Weekly', { exact: true }).first());
	await pause(p, 1800);
	await clickHuman(p, p.getByText('Tasks', { exact: true }).first());
	await pause(p, 2600);
});

// 2b. Challenges
await shot('02b-challenges', '/challenges/focus', async (p) => {
	await pause(p, 1000);
	await clickHuman(p, p.getByText('Focus 100 Hours', { exact: true }).first());
	await pause(p, 2500);
});

// 3. Emotion tagging: filter by Joy, sort by intensity
await shot('03-emotions', '/focus-records', async (p) => {
	await pause(p, 1200);
	await clickHuman(p, p.getByText('Filter & Sort').first());
	await pause(p, 900);
	await clickHuman(p, p.getByText('JOY', { exact: true }).first());
	await pause(p, 1200);
	await clickHuman(p, p.getByText('Emotional Intensity: High-Low', { exact: true }).first());
	await pause(p, 1500);
	await clickHuman(p, p.locator('button:has-text("close")').first());
	await pause(p, 1000);
	await glide(p, 960, 600);
	await slowScroll(p, 600, 3500);
	await pause(p, 1500);
});

// 4. Goal rings
await shot('04-rings', '/focus-time-goal', async (p) => {
	await pause(p, 1500);
	await glide(p, 1040, 570, 40);
	await pause(p, 3000);
	await glide(p, 800, 640, 30);
	await pause(p, 2500);
});

// 5. Search + filter
await shot('05-search', '/focus-records', async (p) => {
	await pause(p, 1000);
	await clickHuman(p, p.getByText('Filter & Sort').first());
	await pause(p, 800);
	const search = p.getByPlaceholder('Search');
	await clickHuman(p, search);
	await search.pressSequentially('sunrise', { delay: 140 });
	await pause(p, 1800);
	await clickHuman(p, p.getByText('Exercise', { exact: true }).last());
	await pause(p, 1500);
	await clickHuman(p, p.locator('button:has-text("close")').first());
	await pause(p, 800);
	await glide(p, 960, 600);
	await slowScroll(p, 500, 3000);
	await pause(p, 1200);
});

// 6. Completed tasks grouped by day
await shot('06-completed', '/completed-tasks', async (p) => {
	await pause(p, 1500);
	// Expand a day without the raw inbox label: project chevron, then the set's chevron
	const chevrons = p.getByText('chevron_right', { exact: true });
	await clickHuman(p, chevrons.nth(4));
	await pause(p, 1200);
	await clickHuman(p, chevrons.nth(4));
	await pause(p, 1500);
	await glide(p, 960, 600);
	await slowScroll(p, 400, 2500);
	await pause(p, 2000);
});

await ctx.close();
await browser.close();
fs.writeFileSync(`${OUT}/shots.json`, JSON.stringify(shots, null, 2));
console.log('done');
