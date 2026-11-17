// Records each shot of the ReelHouse demo as its own OBS file, silent: the app's trailers are embedded muted.
// Playwright drives a headed Chrome for Testing window; OBS (window capture + macOS audio capture) records it,
// started and stopped over obs-websocket, so picture and sound are in one file and can't drift apart.
// Based on player-lens/record.mjs.
//
// Pipeline, run from this folder: record.mjs → endcard.mjs → edit.mjs → check.mjs (needs ffmpeg).
// Usage:
//   node record.mjs --setup          opens the app window and waits, so you can point the OBS scene at it
//   node record.mjs                  warms the caches, then records every shot
//   node record.mjs hover seasons    records only the named shots (others keep their entries in raw/shots.json)
// Shots: home, hover, search, filters, detail (Blade Runner 2049 + Ryan Gosling), seasons (Breaking Bad).
// Needs: OBS running with the WebSocket server on, and OBS_PASSWORD (plus optional OBS_URL, OBS_SOURCE, EXE) in .env.
// The window's page area is 1920x1080 screen pixels, with Chrome's own page zoom at 150% (set as the profile's
// default zoom, not CSS zoom): the app lays out at 1280x720 CSS px and renders natively at 1.5x, so OBS captures it
// 1:1 and the UI is 1.5x larger than at 1920 CSS px (easier to read on phones). (--force-device-scale-factor doesn't
// work for this on a 1x display: the window stays 1280 px and OBS would upscale it.) All coordinates below are
// CSS px; highlight rects are stored in video pixels.
import { chromium } from 'playwright';
import OBSWebSocket from 'obs-websocket-js';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE = 'https://reelhouse-tmdb.vercel.app';
const OUT = 'raw';
const FILTERED = `${BASE}/movies?genres=Science+Fiction&year=2017&sort=revenue.desc`;
// Hover-trailer candidates in the Originals row (TMDB's Netflix network, whatever the row is titled), in order of preference. Each must be on the row's first
// slide and have a trailer as TMDB's first video (the app embeds videos.results[0]).
const ORIGINALS = ['You', 'The Last Kingdom', 'Lucifer', 'Orange Is the New Black', 'Raw'];

// .env: KEY=VALUE lines.
const env = Object.fromEntries(
	(fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8') : '')
		.split('\n')
		.map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/))
		.filter(Boolean)
		.map(([, k, v]) => [k, v]),
);
const OBS_URL = env.OBS_URL || 'ws://127.0.0.1:4455';
const [WIN_W, WIN_H] = [1280, 720]; // CSS px (WIN in .env is ignored)
const SCALE = 1.5; // device pixels per CSS px: 1280x720 → 1920x1080

// --- Browser ---
const setupOnly = process.argv.includes('--setup');
// --dry runs every shot without OBS (to check selectors and timing); nothing is written.
const dry = process.argv.includes('--dry');
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
fs.mkdirSync(OUT, { recursive: true });

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'reelhouse-demo-'));
// Default page zoom 150%: Chrome stores zoom levels as log base 1.2 of the factor.
fs.mkdirSync(path.join(profile, 'Default'));
fs.writeFileSync(
	path.join(profile, 'Default', 'Preferences'),
	JSON.stringify({ partition: { default_zoom_level: { x: Math.log(SCALE) / Math.log(1.2) } } }),
);
const ctx = await chromium.launchPersistentContext(profile, {
	headless: false,
	executablePath: env.EXE || process.env.EXE,
	viewport: null,
	// Playwright mutes the browser by default; OBS would record silence.
	ignoreDefaultArgs: ['--mute-audio', '--enable-automation'],
	args: [
		`--app=${BASE}`, // app mode: no tabs, address bar or bookmarks
		`--window-size=${WIN_W * SCALE},${WIN_H * SCALE}`,
		'--window-position=0,0',
		'--autoplay-policy=no-user-gesture-required', // the trailers are YouTube embeds with autoplay=1, sound on
		'--hide-scrollbars',
		'--disable-infobars',
	],
});
const p = ctx.pages()[0] ?? (await ctx.waitForEvent('page'));

// The app calls TMDB straight from the browser. The API key is read off its own requests (to double-check the
// trailers against TMDB), and every /videos response the app gets is kept: the app embeds results[0].
let apiKey = null;
const appVideos = new Map(); // "movie/335984" → results
ctx.on('request', (r) => {
	const m = r.url().match(/api\.themoviedb\.org\/3\/.*[?&]api_key=([^&]+)/);
	if (m) apiKey = m[1];
});
ctx.on('response', async (r) => {
	const m = r.url().match(/api\.themoviedb\.org\/3\/(movie|tv)\/(\d+)\/videos\?/);
	if (!m || r.status() !== 200) return;
	try {
		appVideos.set(`${m[1]}/${m[2]}`, (await r.json()).results ?? []);
	} catch {
		// body already gone
	}
});

// Visible cursor (OBS's cursor doesn't follow Playwright's mouse; "Show cursor" is off in the OBS source), and a
// tiny frame clock near the bottom-left corner (clear of the window's rounded corner): an 8x8 block whose grey level steps every 100 ms. If OBS's window
// capture stalls, the block stops changing inside a freeze; check.mjs reads it. edit.mjs paints it over.
await ctx.addInitScript(() => {
	window.addEventListener('DOMContentLoaded', () => {
		const style = document.createElement('style');
		style.textContent = `
			#demo-cursor{position:fixed;z-index:2147483647;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;
				background:rgba(255,255,255,.85);border:2px solid rgba(0,0,0,.6);pointer-events:none;transition:transform .12s}
			#demo-cursor.down{transform:scale(.7)}
			#demo-clock{position:fixed;z-index:2147483647;left:4px;bottom:24px;width:8px;height:8px;pointer-events:none}`;
		document.head.appendChild(style);
		const dot = document.createElement('div');
		dot.id = 'demo-cursor';
		dot.style.left = '-50px';
		document.body.appendChild(dot);
		document.addEventListener('mousemove', (e) => { dot.style.left = e.clientX + 'px'; dot.style.top = e.clientY + 'px'; }, true);
		document.addEventListener('mousedown', () => dot.classList.add('down'), true);
		document.addEventListener('mouseup', () => dot.classList.remove('down'), true);
		const clock = document.createElement('div');
		clock.id = 'demo-clock';
		document.body.appendChild(clock);
		const tick = () => {
			const level = (Math.floor(performance.now() / 100) % 10) * 25;
			clock.style.background = `rgb(${level},${level},${level})`;
			requestAnimationFrame(tick);
		};
		tick();
	});
});
await p.reload({ waitUntil: 'networkidle', timeout: 60000 });

// The app window has a title bar, so grow the window by its height until the page itself is exactly WIN CSS px
// (1920x1080 screen px at 150%); OBS crops the title bar off.
{
	const cdp = await ctx.newCDPSession(p);
	const { windowId } = await cdp.send('Browser.getWindowForTarget');
	let height = WIN_H * SCALE + 32;
	for (let i = 0; i < 4; i++) {
		await cdp.send('Browser.setWindowBounds', { windowId, bounds: { left: 0, top: 0, width: WIN_W * SCALE, height } });
		await p.waitForTimeout(500);
		const [w, h] = await p.evaluate(() => [innerWidth, innerHeight]);
		if (w === WIN_W && h === WIN_H) break;
		height += Math.round((WIN_H - h) * SCALE);
	}
	const page = await p.evaluate(() => `${innerWidth}x${innerHeight} CSS px @${devicePixelRatio}x`);
	console.log(`window: ${WIN_W * SCALE}x${height} screen px, page ${page}`);
	if (page !== `${WIN_W}x${WIN_H} CSS px @${SCALE}x`) throw new Error(`the page should be ${WIN_W}x${WIN_H} CSS px at ${SCALE}x`);
}

if (setupOnly) {
	console.log('Window open. Point the OBS scene\'s window capture at it, then close the window.');
	await p.waitForEvent('close', { timeout: 0 });
	await ctx.close();
	process.exit(0);
}

// --- Helpers ---
const pause = (ms) => p.waitForTimeout(ms);
const glide = (x, y, steps = 30) => p.mouse.move(x, y, { steps });
const center = async (locator) => {
	const box = await locator.boundingBox();
	return [box.x + box.width / 2, box.y + box.height / 2];
};
const clickHuman = async (locator) => {
	await glide(...(await center(locator)), 25);
	await pause(250);
	await p.mouse.down();
	await pause(90);
	await p.mouse.up();
};
// Rectangle [x, y, w, h] around one or more elements, in video pixels (CSS px × SCALE).
const rect = async (...locators) => {
	const boxes = (await Promise.all(locators.map((l) => l.boundingBox()))).filter(Boolean);
	const left = Math.min(...boxes.map((b) => b.x));
	const top = Math.min(...boxes.map((b) => b.y));
	const right = Math.max(...boxes.map((b) => b.x + b.width));
	const bottom = Math.max(...boxes.map((b) => b.y + b.height));
	return [left, top, right - left, bottom - top].map((v) => Math.round(v * SCALE));
};
// Eased page scroll to an absolute y, frame by frame (reads like a trackpad scroll and ends exactly on target).
const scrollTo = (y, ms = 900) =>
	p.evaluate(
		([y, ms]) =>
			new Promise((resolve) => {
				const from = window.scrollY;
				const start = performance.now();
				const step = (now) => {
					const k = Math.min(1, (now - start) / ms);
					const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
					window.scrollTo(0, from + (y - from) * e);
					if (k < 1) requestAnimationFrame(step);
					else resolve();
				};
				requestAnimationFrame(step);
			}),
		[y, ms],
	);
// Scrolls so the element's top lands at `top` px in the viewport.
const scrollToElement = async (locator, top, ms) => {
	const y = await locator.evaluate((el, top) => window.scrollY + el.getBoundingClientRect().top - top, top);
	await scrollTo(Math.max(0, y), ms);
};
// Waits until the page stops scrolling (the app smooth-scrolls to its titles after filter and season changes).
const settle = async () => {
	let last = -1;
	for (let i = 0; i < 40; i++) {
		const y = await p.evaluate(() => window.scrollY);
		if (y === last) return;
		last = y;
		await pause(150);
	}
};
const open = async (url) => {
	if (p.url() !== url) await p.goto(url, { waitUntil: 'domcontentloaded' });
	await p.locator('.spinnerContainer').waitFor({ state: 'detached', timeout: 30000 }).catch(() => {});
};
// The home page, with its banner up (a reload helps if it didn't render, which happened once after the warm-up).
const openHome = async () => {
	await open(BASE + '/');
	for (let i = 0; i < 3; i++) {
		if (await p.locator('.bannerContainer').waitFor({ timeout: 10000 }).then(() => true, () => false)) return;
		// Redux Persist can save a query while it's still pending (when the page is left mid-request); rehydrated,
		// it stays pending forever and the banner never renders. Drop the saved cache and load fresh.
		console.log('home: no banner; clearing the persisted cache and reloading');
		await p.evaluate(() => localStorage.removeItem('persist:root'));
		await p.reload({ waitUntil: 'networkidle' });
		await pause(1500);
	}
	throw new Error('the home banner never appeared');
};
const imagesLoaded = () =>
	p.waitForFunction(() => [...document.images].filter((i) => i.getBoundingClientRect().top < innerHeight).every((i) => i.complete), null, { timeout: 30000 }).catch(() => {});

// TMDB, as the app calls it, through the page.
const tmdb = (u) =>
	p.evaluate(async ([u, k]) => (await fetch(`https://api.themoviedb.org/3${u}${u.includes('?') ? '&' : '?'}api_key=${k}&language=en-US`)).json(), [u, apiKey]);
// The app embeds videos.results[0]; it must be a YouTube trailer, both in what the app got and on TMDB right now.
const checkTrailer = async (media, label) => {
	const fresh = (await tmdb(`/${media}/videos`)).results ?? [];
	const app = appVideos.get(media) ?? fresh;
	const [a, f] = [app[0], fresh[0]];
	const ok = a?.type === 'Trailer' && a?.site === 'YouTube' && f?.type === 'Trailer' && f?.key === a?.key;
	console.log(`trailer check ${label}: app ${a?.type} "${a?.name}" ${a?.key}, TMDB ${f?.type} ${f?.key} → ${ok ? 'ok' : 'NOT A TRAILER'}`);
	return ok ? { title: label, key: a.key, name: a.name } : null;
};
// The YouTube player inside a .videoWrapper iframe: waits until it actually plays, and rejects ads and errors.
const trailerPlaying = async (scope, key, timeout = 25000) => {
	const iframe = scope.locator('.videoWrapper iframe');
	await iframe.waitFor({ timeout });
	const src = await iframe.getAttribute('src');
	if (key && !src.includes(key)) throw new Error(`the embedded video (${src}) isn't the checked trailer ${key}`);
	await scope.frameLocator('.videoWrapper iframe').locator('.html5-video-player.playing-mode').waitFor({ timeout });
	await assertNoAd(scope);
};
const assertNoAd = async (scope) => {
	const frame = scope.frameLocator('.videoWrapper iframe');
	if (await frame.locator('.html5-video-player.ad-showing').count()) throw new Error('YouTube is showing an ad; retake this shot');
	if (await frame.locator('.ytp-error').count()) throw new Error('YouTube shows an error in the embed; retake this shot');
};

// --- Warm-up: visit everything once in this profile, so the takes run from Redux Persist's cache and the browser's
// image cache (no spinners, skeletons or half-loaded posters on camera), and check the trailers. ---
const trailers = {};
async function warmUp() {
	console.log('warm-up…');
	// Let the first page's requests finish (and be persisted) before leaving it; see openHome.
	await openHome();
	await p.waitForLoadState('networkidle').catch(() => {});
	await pause(1500);
	await open(`${BASE}/movies`);
	await p.locator('.smallMoviesGrid .smallMovie').first().waitFor({ timeout: 30000 });
	for (let i = 0; i < 20 && !apiKey; i++) await pause(250);
	if (!apiKey) throw new Error('No TMDB request seen; the app may be served from cache already');
	await p.waitForLoadState('networkidle').catch(() => {});
	await open(FILTERED);
	await p.locator(`img[src*="gajva2L0rPYkEWjzgFlBXCAVBE5"]`).waitFor({ timeout: 30000 });
	await scrollTo(1200, 300);
	await imagesLoaded();
	await open(`${BASE}/?query=squid%20game`);
	await p.locator('.smallMoviesGrid .smallMovie').first().waitFor({ timeout: 30000 });
	await imagesLoaded();
	for (const url of [`${BASE}/title/movie/335984`, `${BASE}/person/30614`, `${BASE}/title/tv/1396`, `${BASE}/title/tv/1396?season=2`, `${BASE}/title/tv/1396/season/2/episode/1`]) {
		await open(url);
		await p.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
		await scrollTo(800, 200);
		await imagesLoaded();
		await scrollTo(1600, 200);
		await imagesLoaded();
	}
	trailers.bladeRunner = await checkTrailer('movie/335984', 'Blade Runner 2049');
	trailers.breakingBad = await checkTrailer('tv/1396', 'Breaking Bad');
	// The Originals row: the first preferred title on the first slide whose first video is a trailer.
	const originals = (await tmdb('/discover/tv?with_networks=213')).results.slice(0, 5);
	for (const name of ORIGINALS) {
		const show = originals.find((s) => s.name === name);
		if (!show) continue;
		const t = await checkTrailer(`tv/${show.id}`, name);
		if (t) {
			trailers.original = { ...t, id: show.id, poster: show.poster_path };
			break;
		}
	}
	if (!trailers.original) throw new Error(`None of ${ORIGINALS.join(', ')} is on the Originals row's first slide with a trailer first`);
	await openHome();
	await imagesLoaded();
	await scrollTo(1400, 300);
	await imagesLoaded();
	await scrollTo(0, 300);
	console.log('warm-up done');
}
await warmUp();

// --- OBS ---
const obs = new OBSWebSocket();
if (!dry) await obs.connect(OBS_URL, env.OBS_PASSWORD);

// Each run opens a new window, and an OBS window capture is tied to one window, so point the capture source at this
// run's window, found by its title.
if (!dry) {
	const inputName = env.OBS_SOURCE || 'Player Lens window';
	const title = await p.title();
	const { propertyItems } = await obs.call('GetInputPropertiesListPropertyItems', { inputName, propertyName: 'window' });
	const item = propertyItems.find((i) => i.itemName.includes(title));
	if (!item) {
		throw new Error(`No window titled "${title}" in OBS source "${inputName}". Windows OBS sees: ${propertyItems.map((i) => i.itemName).join(' | ')}`);
	}
	await obs.call('SetInputSettings', { inputName, inputSettings: { window: item.itemValue } });
	console.log(`OBS source "${inputName}" → ${item.itemName}`);
	await pause(1000);

	// Crop the title bar off and scale the page to fill the canvas.
	const { currentProgramSceneName: sceneName } = await obs.call('GetCurrentProgramScene');
	const { sceneItemId } = await obs.call('GetSceneItemId', { sceneName, sourceName: inputName });
	const { sceneItemTransform: tf } = await obs.call('GetSceneItemTransform', { sceneName, sceneItemId });
	const { baseWidth, baseHeight } = await obs.call('GetVideoSettings');
	// The page is the bottom 16:9 of the window.
	const cropTop = tf.sourceHeight - Math.round((tf.sourceWidth * 9) / 16);
	await obs.call('SetSceneItemTransform', {
		sceneName,
		sceneItemId,
		sceneItemTransform: {
			positionX: 0, positionY: 0, alignment: 5, rotation: 0,
			cropTop, cropBottom: 0, cropLeft: 0, cropRight: 0,
			boundsType: 'OBS_BOUNDS_SCALE_INNER', boundsAlignment: 0, boundsWidth: baseWidth, boundsHeight: baseHeight,
		},
	});
	console.log(`OBS: captured ${tf.sourceWidth}x${tf.sourceHeight}, cropped ${cropTop}px title bar, scaled to ${baseWidth}x${baseHeight}`);
}
// macOS audio capture goes silent (with no error) when the output device changes, e.g. AirPods connecting.
// Changing a setting and back restarts its stream.
if (!dry) {
	const { inputs } = await obs.call('GetInputList', { inputKind: 'sck_audio_capture' });
	for (const { inputName } of inputs) {
		const { inputSettings } = await obs.call('GetInputSettings', { inputName });
		const type = inputSettings.type ?? 0;
		await obs.call('SetInputSettings', { inputName, inputSettings: { type: type ? 0 : 1 } });
		await pause(800);
		await obs.call('SetInputSettings', { inputName, inputSettings: { type } });
		console.log(`OBS audio "${inputName}" restarted`);
	}
	await pause(1500);
}
const recordState = (state, request) =>
	new Promise((resolve, reject) => {
		const onState = ({ outputState, outputPath }) => {
			if (outputState !== state) return;
			obs.off('RecordStateChanged', onState);
			resolve({ at: Date.now(), outputPath });
		};
		obs.on('RecordStateChanged', onState);
		obs.call(request).catch((err) => {
			obs.off('RecordStateChanged', onState);
			reject(err);
		});
	});
const startRecording = async () => {
	if (dry) return Date.now();
	for (let i = 0; i < 50 && (await obs.call('GetRecordStatus')).outputActive; i++) await pause(100);
	return (await recordState('OBS_WEBSOCKET_OUTPUT_STARTED', 'StartRecord')).at;
};
const stopRecording = async () => (await recordState('OBS_WEBSOCKET_OUTPUT_STOPPED', 'StopRecord')).outputPath;

const shotsFile = `${OUT}/shots.json`;
const shots = fs.existsSync(shotsFile) ? JSON.parse(fs.readFileSync(shotsFile, 'utf8')) : [];
const save = () => fs.writeFileSync(shotsFile, JSON.stringify(shots, null, 2));
const maxVolume = (file, from = 0) => {
	const level = execSync(`ffmpeg -hide_banner -nostats -ss ${from} -i "${file}" -vn -af volumedetect -f null - 2>&1`).toString();
	return Number(level.match(/max_volume: (-?[\d.]+|-inf) dB/)?.[1] ?? -Infinity);
};

// prepare() runs before recording starts; run() is what the camera sees and returns marks (seconds into the file).
// sound: the trailer must be audible from marks.playingAt on (the shot is rejected otherwise).
async function shot(name, { sound = false }, prepare, run) {
	if (only.length && !only.includes(name)) return;
	await prepare?.();
	await p.mouse.move(WIN_W - 120, WIN_H - 140);
	const t0 = await startRecording();
	const at = () => (Date.now() - t0) / 1000;
	await pause(400);
	const start = at();
	let marks;
	try {
		marks = await run(at);
	} catch (err) {
		fs.mkdirSync('build', { recursive: true });
		await p.screenshot({ path: `build/failed-${name}.png` }).catch(() => {});
		if (!dry) await stopRecording();
		throw new Error(`${name}: ${err.message}. Retake: node record.mjs ${name}`);
	}
	const end = at();
	if (dry) {
		console.log(`${name} (dry): ${start.toFixed(1)}s → ${end.toFixed(1)}s ${JSON.stringify(marks)}`);
		return;
	}
	await pause(300);
	const outputPath = await stopRecording();
	const file = path.join(OUT, `${name}${path.extname(outputPath)}`);
	fs.renameSync(outputPath, file);
	if (sound) {
		// A silent trailer means the audio capture died (or the embed was muted); stop rather than keep it.
		const maxDb = maxVolume(file, marks.playingAt ?? 0);
		if (!(maxDb > -40)) throw new Error(`${name}: no trailer sound (max ${maxDb} dB). Check the OBS audio source, then retake: node record.mjs ${name}`);
		console.log(`${name}: trailer sound max ${maxDb} dB`);
	}
	const entry = { name, file, start, end, ...marks };
	const i = shots.findIndex((s) => s.name === name);
	if (i === -1) shots.push(entry);
	else shots[i] = entry;
	save();
	console.log(`${name}: ${start.toFixed(1)}s → ${end.toFixed(1)}s ${JSON.stringify(marks)}`);
}

// --- Shots ---

// 1. The home banner: the overview types itself out. Reloads on camera; the edit starts once the banner is up.
await shot('home', {}, null, async (at) => {
	await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
	await p.locator('.bannerContainer').waitFor({ timeout: 30000 });
	const bannerAt = at();
	await imagesLoaded();
	await pause(7000);
	return { bannerAt, banner: await p.locator('.bannerContainer .fs-1').textContent() };
});

// 2. Scroll to the Originals row and hover a card: after 700 ms its trailer plays, with sound.
await shot(
	'hover',
	{},
	async () => {
		await openHome();
		await scrollTo(0, 50);
		await pause(1500);
	},
	async (at) => {
		const t = trailers.original;
		const row = p.locator('.fs-4').filter({ hasText: /Originals/ }).first();
		await pause(600);
		const scrollAt = at();
		await scrollToElement(row, 170, 1400);
		await pause(400);
		const card = row.locator('xpath=..').locator(`.carousel-item.active .smallMovie:has(img[src*="${t.poster}"])`);
		const hoverAt = at();
		await glide(...(await center(card)), 30);
		const hovered = p.locator('.hoveredMovie');
		await hovered.waitFor({ timeout: 5000 });
		const cardAt = at();
		// Onto the card's info, off the player: YouTube shows its title and a pause button under the mouse.
		await glide(...(await center(hovered.locator('.cardBody'))), 15);
		await trailerPlaying(hovered, t.key);
		const playingAt = at();
		// The card closed by itself once mid-take (cause unknown); a take where it does is rejected.
		for (const end = Date.now() + 7500; Date.now() < end; await pause(100)) {
			if (!(await hovered.count())) throw new Error(`the hover card closed ${(at() - playingAt).toFixed(1)} s into the trailer`);
		}
		await assertNoAd(hovered);
		return { scrollAt, hoverAt, cardAt, playingAt, trailer: t };
	},
);

// 3. Search: the search icon, then "squid game" (the app waits 1 s after typing, then shows results).
await shot(
	'search',
	{},
	async () => {
		await openHome();
		await scrollTo(0, 50);
		await pause(2000);
	},
	async (at) => {
		await pause(500);
		const clickAt = at();
		await clickHuman(p.locator('i.bi-search'));
		await pause(400);
		const typeAt = at();
		await p.locator('input[placeholder="Titles, people, genres"]').pressSequentially('squid game', { delay: 110 });
		await p.waitForURL(/query=/, { timeout: 10000 });
		await p.locator('.smallMoviesGrid .smallMovie').first().waitFor({ timeout: 15000 });
		const resultsAt = at();
		await imagesLoaded();
		await pause(3500);
		return { clickAt, typeAt, resultsAt };
	},
);

// 4. /movies: Genre → Science Fiction, Year → 2017, Sort → Highest Grossing; the applied-filter chips appear.
// Scrolled off camera to where the app itself scrolls after each change (#pageTitle - 100), so the page holds still.
const pageTitleTop = 100;
await shot(
	'filters',
	{},
	async () => {
		await open(`${BASE}/movies`);
		await p.locator('.smallMoviesGrid .smallMovie').first().waitFor({ timeout: 30000 });
		await scrollToElement(p.locator('#pageTitle'), pageTitleTop, 50);
		await imagesLoaded();
		await pause(1000);
	},
	async (at) => {
		const toggle = (name) => p.locator('.dropdownsContainer .dropdown-toggle').filter({ hasText: name });
		const menu = p.locator('.dropdownsContainer .dropdown-menu.show');
		// Opens a dropdown, scrolls its list to the option with the wheel, clicks it, and closes the menu if it stays open.
		const choose = async (name, option) => {
			await clickHuman(toggle(name));
			await menu.waitFor();
			await pause(300);
			const item = menu.locator('.cursor-pointer').filter({ has: p.locator(`span:text-is("${option}")`) });
			const list = menu.locator('.dropdown-scrollable');
			const lb = await list.boundingBox();
			await glide(lb.x + lb.width / 2, lb.y + lb.height / 2, 15);
			for (let i = 0; i < 60; i++) {
				const ib = await item.boundingBox();
				const visible = await list.boundingBox();
				if (ib.y + ib.height < visible.y + visible.height - 10) break;
				await p.mouse.wheel(0, 40);
				await pause(30);
			}
			await pause(150);
			await clickHuman(item.locator('span'));
			await pause(300);
			// The menu stays open after a pick; close it with its toggle.
			if (await menu.count()) await clickHuman(toggle(name));
			await menu.waitFor({ state: 'detached', timeout: 3000 }).catch(() => {});
			await p.locator('.smallMoviesGrid .smallMovie').first().waitFor({ timeout: 15000 });
			await settle();
			await imagesLoaded();
		};
		await pause(400);
		const genreAt = at();
		await choose('Genre', 'Science Fiction');
		await pause(300);
		const yearAt = at();
		await choose('Year', '2017');
		await pause(300);
		const sortAt = at();
		await choose('Sort', 'Highest Grossing');
		await p.getByText('Sort:', { exact: false }).first().waitFor();
		// Above the grid, right of the chips: over a poster (even the edge column) the hover card opens and plays its trailer.
		await glide(1000, 190, 20);
		await settle();
		// The heading plus the chips themselves (their row is the container's full width).
		const heading = p.locator('div:text-is("Applied Filters:")');
		const chips = heading.locator('xpath=..').locator('.flex-wrap > div');
		const spotAt = at();
		const [cx, cy, cw, ch] = await rect(...(await chips.all()));
		const [, hy] = await rect(heading);
		const spot = { from: spotAt, to: spotAt + 3.5, rect: [cx, hy, cw, cy + ch - hy], label: 'Applied filters' };
		await pause(4000);
		if (!p.url().includes('year=2017') || !p.url().includes('sort=revenue.desc')) throw new Error(`unexpected URL ${p.url()}`);
		return { genreAt, yearAt, sortAt, spots: [spot], url: p.url() };
	},
);

// 5 + 6. Blade Runner 2049: hover (trailer) → click → detail page with its trailer playing, scroll to the cast,
// click Ryan Gosling → his page. One take, so the trailer's sound runs on unbroken between the two captions.
await shot(
	'detail',
	{},
	async () => {
		if (!p.url().startsWith(FILTERED.split('?')[0]) || !p.url().includes('year=2017')) {
			await open(FILTERED);
			await settle();
		}
		await p.locator('img[src*="gajva2L0rPYkEWjzgFlBXCAVBE5"]').waitFor({ timeout: 30000 });
		if (await p.locator('.dropdown-menu.show').count()) await p.keyboard.press('Escape');
		await scrollToElement(p.locator('#pageTitle'), pageTitleTop, 50);
		await imagesLoaded();
		// Above the grid: over a poster (the edge column too) the hover card opens at the start of the take.
		await glide(1000, 190, 10);
		await pause(1000);
	},
	async (at) => {
		const t = trailers.bladeRunner;
		if (!t) throw new Error("Blade Runner 2049's first video isn't a trailer");
		const poster = p.locator('img[src*="gajva2L0rPYkEWjzgFlBXCAVBE5"]');
		await pause(500);
		const scrollAt = at();
		await scrollToElement(poster, 180, 900);
		await imagesLoaded();
		await pause(300);
		const hoverAt = at();
		await glide(...(await center(poster)), 30);
		const hovered = p.locator('.hoveredMovie');
		await hovered.waitFor({ timeout: 5000 });
		await glide(...(await center(hovered.locator('.cardBody'))), 15);
		await trailerPlaying(hovered, t.key);
		const hoverPlayingAt = at();
		await pause(3000);
		const clickAt = at();
		await glide(...(await center(hovered.locator('.cardBody'))), 10);
		await pause(250);
		const navigateAt = at(); // the click: the hover trailer stops here
		await p.mouse.down();
		await pause(90);
		await p.mouse.up();
		await p.waitForURL(/\/title\/movie\/335984/);
		const page = p.locator('.moviePageContainer');
		await page.waitFor({ timeout: 20000 });
		const loadedAt = at();
		// Off the player: YouTube shows its title bar and controls while the mouse is over it.
		await glide(1248, 690, 20);
		await trailerPlaying(page, t.key);
		const playingAt = at();
		await pause(11000);
		await assertNoAd(page);
		const scrollDownAt = at();
		await scrollToElement(page.locator('h1').first(), 90, 1600);
		await imagesLoaded();
		const castAt = at();
		await pause(3500);
		const gosling = page.getByRole("link", { name: "Ryan Gosling", exact: true }).first();
		const goslingAt = at();
		await glide(...(await center(gosling)), 30);
		await pause(400);
		const goslingClickAt = at();
		await p.mouse.down();
		await pause(90);
		await p.mouse.up();
		await p.waitForURL(/\/person\/30614/);
		// Into the empty margin, clear of the filmography's posters (hovering one plays its trailer).
		await glide(1248, 420, 20);
		await p.getByRole('heading', { name: 'Biography' }).waitFor({ timeout: 20000 });
		const personAt = at();
		await imagesLoaded();
		await pause(1800);
		await scrollToElement(p.getByRole('heading', { name: 'Movies & TV Shows' }), 120, 1200);
		await imagesLoaded();
		await pause(2500);
		return { scrollAt, hoverAt, hoverPlayingAt, clickAt, navigateAt, loadedAt, playingAt, scrollDownAt, castAt, goslingAt, goslingClickAt, personAt, trailer: t };
	},
);

// 7. Breaking Bad: the trailer, then down to the season picker → Season 2 → an episode's page.
await shot(
	'seasons',
	{},
	async () => {
		await open(BASE + '/');
		await pause(500);
	},
	async (at) => {
		const t = trailers.breakingBad;
		if (!t) throw new Error("Breaking Bad's first video isn't a trailer");
		await p.goto(`${BASE}/title/tv/1396`, { waitUntil: 'domcontentloaded' });
		const page = p.locator('.moviePageContainer');
		await page.waitFor({ timeout: 20000 });
		const loadedAt = at();
		await trailerPlaying(page, t.key);
		const playingAt = at();
		await pause(4000);
		await assertNoAd(page);
		const toggle = page.locator('.dropdown-toggle').filter({ hasText: /^Season \d/ });
		const scrollAt = at();
		// Exactly where the app scrolls after a season change (the toggle 70 px from the top), so nothing moves then.
		await scrollToElement(toggle, 70, 1500);
		await imagesLoaded();
		await pause(800);
		const openAt = at();
		await clickHuman(toggle);
		const menu = page.locator('.dropdown-menu.show');
		await menu.waitFor();
		await pause(150);
		const menuRect = await rect(toggle, menu);
		await pause(900);
		const item = menu.locator('.dropdown-item:text-is("Season 2")');
		await glide(...(await center(item)), 20);
		await pause(300);
		const selectAt = at();
		await p.mouse.down();
		await pause(90);
		await p.mouse.up();
		await toggle.filter({ hasText: 'Season 2' }).waitFor();
		await page.locator('.tvSmallEpisode').first().waitFor();
		await pause(400);
		await settle();
		await imagesLoaded();
		const pickedRect = await rect(toggle);
		const pickedAt = at();
		const label = 'Pick a season';
		const spots = [
			{ from: openAt, to: selectAt + 0.2, rect: menuRect, label },
			{ from: selectAt + 0.2, to: pickedAt + 1.6, rect: pickedRect, label },
		];
		await pause(1600);
		const episode = page.locator('.tvSmallEpisode').first();
		await scrollToElement(episode, 330, 900);
		await pause(500);
		const episodeHoverAt = at();
		await glide(...(await center(episode.locator('h4'))), 25);
		await pause(400);
		const episodeClickAt = at();
		await p.mouse.down();
		await pause(90);
		await p.mouse.up();
		await p.waitForURL(/season\/2\/episode\/1/);
		await p.locator('.bannerContainer').waitFor({ timeout: 20000 });
		const episodeAt = at();
		await imagesLoaded();
		await pause(3500);
		return { loadedAt, playingAt, scrollAt, openAt, selectAt, pickedAt, episodeHoverAt, episodeClickAt, episodeAt, spots, trailer: t };
	},
);

if (!dry) await obs.disconnect();
await ctx.close();
console.log(`done: ${shotsFile}`);
