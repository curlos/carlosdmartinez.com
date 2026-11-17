// Records each shot of the Sneaker Palace demo as its own video file (guest, no account).
// Usage: node record.mjs [shot …]   (no names: record every shot; with names: re-record only those, keep the rest)
// Shots: home, search, filters, spin (360° + add to bag), reviews, checkout (Stripe + order confirmed).
// Pipeline, run from this folder: record.mjs → endcard.mjs → edit.mjs (needs ffmpeg on PATH).
// Every checkout take places a real Stripe test-mode guest order; don't loop it needlessly.
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE = 'https://sneaker-palace.vercel.app';
const API = 'https://sneaker-palace-backend.vercel.app';
// The page lays out at 1280x720 CSS px but renders natively at 1920x1080: Chrome's own page zoom at 150% (the
// profile's default zoom level, not CSS zoom) in new-headless Chromium (channel 'chromium'). Playwright's video
// screencast captures CSS-pixel frames, so deviceScaleFactor 1.5 gave 1280x720 frames padded or upscaled; page zoom
// keeps device pixels at 1:1, so the 1920x1080 frames are sharp. Mouse, boundingBox and scroll values are CSS px.
const SCALE = 1.5;
const VIDEO = { width: 1920, height: 1080 };
const CSS_VIEW = { width: VIDEO.width / SCALE, height: VIDEO.height / SCALE }; // 1280x720
const OUT = 'raw';
const KOBE = 'b62b550f-0f12-4717-9ce4-4efc7f938a0d';
const UNC = 'de6a8492-ed14-4105-8bac-0b2534444014';
const SIZE = 'M 9 / W 10.5';
// An existing guest test order (placed by a checkout take). /order-details/:id needs no login, so the order shot
// opens it directly and no new order is placed; the edit splices it in after the checkout take's "View or manage
// order" click. If a new checkout take is recorded, it's fine to keep this ID (the order card still shows the Kobe).
const ORDER = '6af7a0cbd48e9b0811bba780';

const wanted = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
const shotsFile = `${OUT}/shots.json`;
const previous = fs.existsSync(shotsFile) ? JSON.parse(fs.readFileSync(shotsFile, 'utf8')) : [];

const HEADLESS = !process.env.HEADED;
// Off-camera work (warm-up, building the guest cart) uses a plain browser.
const browser = await chromium.launch({ executablePath: process.env.EXE, headless: HEADLESS });
// Each take gets a fresh temp profile whose default page zoom is 150% (Chrome stores it as log base 1.2).
async function takeContext(recordDir) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sneaker-palace-take-'));
	fs.mkdirSync(path.join(dir, 'Default'));
	fs.writeFileSync(path.join(dir, 'Default', 'Preferences'), JSON.stringify({ partition: { default_zoom_level: { x: Math.log(SCALE) / Math.log(1.2) } } }));
	const ctx = await chromium.launchPersistentContext(dir, {
		executablePath: process.env.EXE,
		channel: process.env.EXE ? undefined : 'chromium',
		headless: HEADLESS,
		viewport: VIDEO,
		recordVideo: { dir: recordDir, size: VIDEO },
	});
	ctx.profileDir = dir;
	return ctx;
}

// Visible cursor (Playwright videos have no cursor). Sized in CSS px, so it scales with the page zoom.
const initScript = () => {
	window.addEventListener('DOMContentLoaded', () => {
		const style = document.createElement('style');
		style.textContent = `
			#demo-cursor{position:fixed;z-index:2147483647;width:20px;height:20px;margin:-10px 0 0 -10px;border-radius:50%;
				background:rgba(255,255,255,.85);border:2px solid rgba(0,0,0,.6);pointer-events:none;transition:transform .12s}
			#demo-cursor.down{transform:scale(.7)}`;
		document.head.appendChild(style);
		const dot = document.createElement('div');
		dot.id = 'demo-cursor';
		// Survives full reloads (Stripe's redirect to /payment-success), so the dot doesn't vanish.
		let last = null;
		try { last = JSON.parse(sessionStorage.getItem('demo-cursor')); } catch {}
		dot.style.left = (last?.x ?? -50) + 'px';
		dot.style.top = (last?.y ?? -50) + 'px';
		document.body.appendChild(dot);
		document.addEventListener('mousemove', (e) => { dot.style.left = e.clientX + 'px'; dot.style.top = e.clientY + 'px';
			try { sessionStorage.setItem('demo-cursor', JSON.stringify({ x: e.clientX, y: e.clientY })); } catch {} }, true);
		document.addEventListener('mousedown', () => dot.classList.add('down'), true);
		document.addEventListener('mouseup', () => dot.classList.remove('down'), true);
	});
};

const pause = (p, ms) => p.waitForTimeout(ms);
const glide = async (p, x, y, steps = 30) => p.mouse.move(x, y, { steps });
// Smooth wheel scroll by `total` CSS px (ease in-out).
const smoothScrollBy = async (p, total, ms = 900) => {
	const n = Math.max(1, Math.round(ms / 40));
	for (let i = 0; i < n; i++) {
		const a = 0.5 - Math.cos((Math.PI * i) / n) / 2;
		const b = 0.5 - Math.cos((Math.PI * (i + 1)) / n) / 2;
		await p.mouse.wheel(0, total * (b - a));
		await p.waitForTimeout(40);
	}
	await p.waitForTimeout(250);
};
// Click like a person. If the target is off screen, under the top bar or in the caption zone at the bottom of the
// frame (captions cover roughly the bottom 150 CSS px), scroll smoothly first so the click stays visible.
const clickHuman = async (p, locator, steps = 25) => {
	let box = await locator.boundingBox();
	if (!box) {
		await locator.scrollIntoViewIfNeeded();
		box = await locator.boundingBox();
	}
	if (box.y < 80 || box.y + box.height > CSS_VIEW.height - 160) {
		const delta = box.y + box.height / 2 - CSS_VIEW.height * 0.42;
		await smoothScrollBy(p, delta, Math.min(1400, 500 + Math.abs(delta)));
		box = await locator.boundingBox();
	}
	await glide(p, box.x + box.width / 2, box.y + box.height / 2, steps);
	await pause(p, 250);
	await p.mouse.down();
	await pause(p, 90);
	await p.mouse.up();
};
// Smooth scroll so the element's top lands at `top` px from the viewport top.
const scrollTo = async (p, locator, top = 120, ms = 1800) => {
	const box = await locator.boundingBox();
	const total = box.y - top;
	const n = Math.max(1, Math.round(ms / 40));
	for (let i = 0; i < n; i++) {
		// ease in-out
		const a = 0.5 - Math.cos((Math.PI * i) / n) / 2;
		const b = 0.5 - Math.cos((Math.PI * (i + 1)) / n) / 2;
		await p.mouse.wheel(0, total * (b - a));
		await p.waitForTimeout(40);
	}
	await pause(p, 300);
};
// Every visible <img> loaded (images come from external CDNs).
const imagesLoaded = (p) =>
	p.waitForFunction(
		() => [...document.images].filter((i) => i.getBoundingClientRect().bottom > 0 && i.getBoundingClientRect().top < innerHeight && i.offsetWidth > 0)
			.every((i) => i.complete && i.naturalWidth > 0),
		null,
		{ timeout: 30000, polling: 200 },
	).catch(() => console.warn('  (some images never loaded)'));
const rectOf = async (locators, pad = 0) => {
	const boxes = [];
	for (const l of locators) boxes.push(await l.boundingBox());
	const x = Math.min(...boxes.map((b) => b.x)) - pad;
	const y = Math.min(...boxes.map((b) => b.y)) - pad;
	const r = Math.max(...boxes.map((b) => b.x + b.width)) + pad;
	const bt = Math.max(...boxes.map((b) => b.y + b.height)) + pad;
	// Highlights are drawn on the 1920x1080 video: CSS px × SCALE.
	return [x, y, r - x, bt - y].map((v) => Math.round(v * SCALE));
};
const shoesResponse = (p) => p.waitForResponse((r) => r.url() === `${API}/shoes` && r.request().method() === 'POST', { timeout: 30000 });

// Guest cart with the Kobe in it (built off camera; its localStorage is copied into the take's profile).
async function cartState() {
	const ctx = await browser.newContext({ viewport: CSS_VIEW });
	const p = await ctx.newPage();
	await p.goto(`${BASE}/shoe/${KOBE}`, { waitUntil: 'networkidle', timeout: 60000 });
	await p.getByRole('radio', { name: SIZE }).click();
	await p.getByRole('button', { name: 'Add to Bag' }).click();
	await p.getByRole('link', { name: /Shopping cart, 1/ }).waitFor();
	await pause(p, 800);
	const state = await ctx.storageState();
	await ctx.close();
	return state;
}

const shots = {
	// 1. Home: carousel changes slide once, then down to Popular Brands.
	home: {
		url: '/',
		run: async (p, at, m) => {
			await imagesLoaded(p);
			// Wait for the 4 s carousel to change slide once (1 s transition), then scroll on.
			const hero = () => document.querySelector('.carousel-bg h1')?.textContent;
			const first = await p.evaluate(hero);
			await p.waitForFunction((t) => document.querySelector('.carousel-bg h1')?.textContent !== t, first, { timeout: 15000 });
			m.slideAt = at();
			await imagesLoaded(p);
			await pause(p, 1300);
			await glide(p, 640, 427, 25);
			m.scrollAt = at();
			await scrollTo(p, p.getByRole('heading', { name: 'Popular Brands' }), 140, 1800);
			await imagesLoaded(p);
			await pause(p, 1500);
		},
	},

	// 2. Search: live results while typing, then the full results page.
	search: {
		url: '/',
		run: async (p, at, m) => {
			await pause(p, 400);
			await clickHuman(p, p.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Search' }));
			const dialog = p.getByRole('dialog', { name: 'Search' });
			const input = dialog.getByRole('textbox', { name: 'Search' });
			await input.waitFor();
			await pause(p, 1100); // 1 s slide-in
			m.typeAt = at();
			await clickHuman(p, input, 15);
			const results = p.waitForResponse((r) => r.url().startsWith(`${API}/shoes`) && r.request().method() === 'POST', { timeout: 30000 });
			await input.pressSequentially('jordan 4', { delay: 80 });
			await results;
			await pause(p, 400);
			await imagesLoaded(p);
			m.resultsAt = at();
			await pause(p, 1300);
			await clickHuman(p, dialog.getByRole('button', { name: 'VIEW FULL RESULTS' }));
			await p.getByRole('heading', { level: 1, name: /jordan 4 \(\d+\)/ }).waitFor({ timeout: 30000 });
			await pause(p, 500);
			await imagesLoaded(p);
			m.fullAt = at();
			await glide(p, 867, 467, 25);
			await pause(p, 1500);
		},
	},

	// 3. Catalog: brand, color, price filters, then sort; the chips and count are highlighted.
	filters: {
		url: '/shoes',
		prepare: async (p) => {
			await p.getByRole('heading', { level: 1, name: /Sneakers \([\d,]+\)/ }).waitFor({ timeout: 30000 });
			const filtersBtn = p.getByRole('button', { name: 'Filters' });
			if ((await filtersBtn.getAttribute('aria-expanded')) !== 'true') await filtersBtn.click();
			await imagesLoaded(p);
		},
		run: async (p, at, m) => {
			await pause(p, 500);
			const group = async (name) => {
				const b = p.getByRole('button', { name, exact: true });
				if ((await b.getAttribute('aria-expanded')) !== 'true') {
					await clickHuman(p, b);
					await pause(p, 350);
				}
			};
			const apply = async (locator) => {
				const r = shoesResponse(p);
				await clickHuman(p, locator);
				await r;
				await pause(p, 200);
				await imagesLoaded(p);
				await pause(p, 250);
			};
			await group('Brand');
			await apply(p.locator('#filter-panel-brand label:has-text("Nike") input').first());
			// The brand list is long; fold it again so Color and Price stay on screen without scrolling.
			await clickHuman(p, p.getByRole('button', { name: 'Brand', exact: true }));
			await pause(p, 300);
			await group('Color');
			await apply(p.locator('#filter-panel-color button[aria-label="red"]'));
			// Fold Color too, so the Price options sit higher, clear of the caption.
			await clickHuman(p, p.getByRole('button', { name: 'Color', exact: true }));
			await pause(p, 300);
			await group('Price');
			await apply(p.locator('#filter-panel-price label', { hasText: '$100 - $150' }).locator('input'));
			await clickHuman(p, p.getByRole('button', { name: /^Sort by:/ }));
			await pause(p, 450);
			{
				const r = shoesResponse(p);
				await clickHuman(p, p.getByRole('menuitem', { name: 'Price: High to Low' }), 15);
				await r;
			}
			await pause(p, 300);
			await imagesLoaded(p);
			await glide(p, 1000, 600, 25);
			await pause(p, 400);
			const heading = p.getByRole('heading', { level: 1 });
			const chips = p.getByRole('button', { name: /^Clear .* filter$/ }).last().locator('xpath=ancestor::div[contains(@class,"flex-wrap")][1]');
			m.url = p.url();
			m.count = await heading.textContent();
			m.spots = [{ from: at(), label: 'Applied filters', side: 'below', rect: await rectOf([heading, chips], 12) }];
			await pause(p, 2800);
			m.spots[0].to = at();
			await pause(p, 300);
		},
	},

	// 4 + 5. Kobe page: spin the 360° slider, then pick a size and add to bag.
	spin: {
		url: `/shoe/${KOBE}`,
		prepare: async (p) => {
			const shoe = await (await p.request.get(`${API}/shoes/${KOBE}`)).json();
			const frames = shoe.image['360'];
			await p.evaluate((urls) => Promise.all(urls.map((u) => new Promise((ok) => { const i = new Image(); i.onload = i.onerror = ok; i.src = u; window.__keep = (window.__keep || []).concat(i); }))), frames);
			await p.getByRole('slider', { name: /^Rotate .* image$/ }).waitFor({ timeout: 30000 });
			await imagesLoaded(p);
		},
		run: async (p, at, m) => {
			await pause(p, 1000);
			const slider = p.getByRole('slider', { name: /^Rotate .* image$/ });
			const img = p.locator('#main-content img').first();
			const sb = await slider.boundingBox();
			const max = Number(await slider.getAttribute('max'));
			const xFor = (v) => sb.x + 8 + ((sb.width - 16) * v) / max;
			const y = sb.y + sb.height / 2;
			await glide(p, xFor(0), y, 30);
			await pause(p, 300);
			m.spinAt = at();
			m.spots = [{ from: at(), label: 'Drag to spin', side: 'right', rect: await rectOf([img, slider], 10) }];
			await p.mouse.down();
			for (let v = 0; v <= max; v++) {
				await p.mouse.move(xFor(v), y, { steps: 3 });
				await pause(p, 90);
			}
			await p.mouse.up();
			await pause(p, 500);
			m.spots[0].to = at();
			await pause(p, 200);
			// Add to bag
			m.sizeAt = at();
			await clickHuman(p, p.getByRole('radio', { name: SIZE }));
			await pause(p, 600);
			await clickHuman(p, p.getByRole('button', { name: 'Add to Bag' }));
			m.addAt = at();
			await p.getByRole('dialog', { name: 'Added to cart' }).waitFor();
			await p.getByRole('link', { name: /Shopping cart, 1/ }).waitFor();
			await pause(p, 1000);
			await imagesLoaded(p);
			await glide(p, 1133, 80, 25);
			await pause(p, 1300);
		},
	},

	// 6. Jordan 1 UNC Toe: ratings and reviews.
	reviews: {
		url: `/shoe/${UNC}`,
		prepare: async (p) => {
			await p.getByRole('heading', { name: 'Customer Reviews' }).waitFor({ timeout: 30000 });
			await imagesLoaded(p);
		},
		run: async (p, at, m) => {
			await pause(p, 800);
			await glide(p, 640, 400, 25);
			m.scrollAt = at();
			await scrollTo(p, p.getByRole('heading', { name: 'Customer Reviews' }), 110, 2200);
			await imagesLoaded(p);
			await pause(p, 2800);
		},
	},

	// 8b. Order Details, top of the page: Order#, date, shipping address, payment method, totals.
	order: {
		url: `/order-details/${ORDER}`,
		mouse: [382, 211], // where the checkout take's click on "View or manage order" left the cursor
		prepare: async (p) => {
			await p.getByRole('heading', { name: 'Order Details' }).waitFor({ timeout: 30000 });
			await p.getByText(/^Order# /).waitFor();
			await imagesLoaded(p);
		},
		run: async (p) => {
			await pause(p, 1200);
			await glide(p, 760, 330, 40);
			await pause(p, 2600);
		},
	},

	// 7 + 8. Bag → Stripe checkout with the test card → payment success → order details.
	checkout: {
		url: '/cart',
		state: cartState,
		prepare: async (p) => {
			await p.getByRole('heading', { name: 'Bag', level: 1 }).waitFor({ timeout: 30000 });
			await imagesLoaded(p);
		},
		run: async (p, at, m) => {
			await pause(p, 900);
			await clickHuman(p, p.locator('#main-content').getByRole('link', { name: 'Checkout' }));
			m.checkoutClickAt = at(); // /payment then shows a spinner while the payment intent is created; the edit cuts past it
			await p.getByRole('heading', { name: 'Checkout', level: 1 }).waitFor({ timeout: 30000 });
			const frame = p.frameLocator('iframe[title="Secure payment input frame"]');
			const card = frame.getByPlaceholder('1234 1234 1234 1234');
			await card.waitFor({ timeout: 30000 });
			await pause(p, 800);
			m.checkoutAt = at();
			const banner = p.getByText('For Testing Purposes Only').locator('xpath=ancestor::div[contains(@class,"bg-yellow-100")][1]');
			m.spots = [{ from: at() + 0.2, label: 'Stripe test mode', side: 'right', rect: await rectOf([banner], 4) }];
			{
				const b = await banner.boundingBox();
				await glide(p, b.x + b.width * 0.75, b.y + b.height + 30, 25);
			}
			await pause(p, 2300);
			m.spots[0].to = at();
			const type = async (loc, text, delay = 70) => {
				await clickHuman(p, loc, 15);
				await loc.pressSequentially(text, { delay });
				await pause(p, 250);
			};
			m.typeAt = at();
			await type(card, '4242424242424242', 45);
			await type(frame.getByPlaceholder('MM / YY'), '1234');
			await type(frame.getByPlaceholder('CVC'), '123');
			const zip = frame.getByLabel('ZIP code');
			if (await zip.count() && await zip.isVisible()) await type(zip, '10001');
			await pause(p, 700);
			m.payAt = at();
			await clickHuman(p, p.getByRole('button', { name: 'Pay Now' }));
			await p.waitForURL(/\/payment-success/, { timeout: 60000 });
			await p.getByRole('heading', { name: /Hello/ }).waitFor({ timeout: 30000 });
			await pause(p, 300);
			await imagesLoaded(p);
			m.successAt = at();
			await pause(p, 1500);
			await clickHuman(p, p.getByRole('link', { name: 'View or manage order' }));
			m.detailsClickAt = at();
			await p.getByRole('heading', { name: 'Order Details' }).waitFor({ timeout: 30000 });
			m.detailsAt = at();
			// "You Might Also Like" loads after the order with a spinner; the edit cuts past it to here.
			await p.getByRole('heading', { name: 'You Might Also Like' }).waitFor({ timeout: 30000 });
			await p.waitForFunction(() => !document.querySelector('.animate-spin'), null, { timeout: 30000 }).catch(() => {});
			// Frame the order card and the loaded row (inside the cut), so the row's heading doesn't peek at the bottom.
			await p.evaluate(() => {
				const card = document.querySelector('div.p-5.border.rounded-lg'); // the ordered item(s)
				if (card) window.scrollBy(0, card.getBoundingClientRect().top - 90);
			});
			await pause(p, 300);
			await imagesLoaded(p);
			m.recsAt = at();
			await glide(p, 867, 433, 25);
			await pause(p, 2600);
		},
	},
};

const names = wanted.length ? wanted : Object.keys(shots);
for (const n of names) if (!shots[n]) throw new Error(`unknown shot ${n}; known: ${Object.keys(shots).join(', ')}`);

// Warm the backend (cold start ~3 s) and the CDN with a throwaway page load.
{
	await fetch(`${API}/shoes/${KOBE}`).catch(() => {});
	const ctx = await browser.newContext({ viewport: CSS_VIEW });
	const p = await ctx.newPage();
	await p.goto(`${BASE}/shoes`, { waitUntil: 'networkidle', timeout: 60000 }).catch((e) => console.warn('warm-up:', e.message.split('\n')[0]));
	await ctx.close();
}

const results = Object.fromEntries(previous.map((s) => [s.name, s]));
for (const name of names) {
	const def = shots[name];
	const storageState = def.state ? await def.state() : undefined;
	// A fresh context per take: the guest cart lives in localStorage.
	const dir = `${OUT}/${name}`;
	fs.rmSync(dir, { recursive: true, force: true });
	const ctx = await takeContext(dir);
	await ctx.addInitScript(initScript);
	// A persistent context opens with one blank page; it (and a cart-seeding page) is recorded too, so close them
	// before the take's page opens and keep only that page's video.
	const extra = ctx.pages();
	if (storageState) {
		const seed = extra[0] ?? await ctx.newPage();
		await seed.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
		await seed.evaluate((origins) => {
			for (const o of origins) if (o.origin === location.origin) for (const { name, value } of o.localStorage) localStorage.setItem(name, value);
		}, storageState.origins);
	}
	const t0 = Date.now();
	const p = await ctx.newPage();
	for (const e of extra) await e.close();
	const at = () => (Date.now() - t0) / 1000;
	if ((await p.evaluate(() => innerWidth)) !== CSS_VIEW.width) throw new Error('page zoom 150% did not apply');
	await p.goto(BASE + def.url, { waitUntil: 'networkidle', timeout: 60000 });
	if (def.prepare) await def.prepare(p);
	await p.waitForTimeout(800);
	await p.mouse.move(...(def.mouse ?? [1000, 600]));
	const m = {};
	const start = at();
	await def.run(p, at, m);
	const end = at();
	const video = p.video();
	await p.close();
	const file = await video.path();
	await ctx.close();
	try { fs.rmSync(ctx.profileDir, { recursive: true, force: true }); } catch {}
	// Drop the videos of the blank/seed pages.
	for (const f of fs.readdirSync(dir)) if (path.resolve(dir, f) !== path.resolve(file)) fs.rmSync(path.join(dir, f));
	results[name] = { name, file, start, end, ...m };
	console.log(`${name}: ${start.toFixed(1)}s → ${end.toFixed(1)}s`, JSON.stringify(m));
	fs.writeFileSync(shotsFile, JSON.stringify(Object.keys(shots).filter((n) => results[n]).map((n) => results[n]), null, 2));
}

await browser.close();
console.log('done');
