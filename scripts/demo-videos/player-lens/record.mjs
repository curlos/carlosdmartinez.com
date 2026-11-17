// Records each shot of the Player Lens demo as its own OBS file, with the app's audio.
// Playwright drives a headed browser window; OBS (window capture + application audio capture) records it,
// started and stopped over obs-websocket, so picture and sound are in one file and can't drift apart.
//
// Pipeline, run from this folder: record.mjs → endcard.mjs → edit.mjs (needs ffmpeg).
// Usage:
//   node record.mjs --setup         opens the app window and waits, so you can point the OBS scene at it
//   node record.mjs                 records every shot
//   node record.mjs equaliser live  records only the named shots (others keep their entries in raw/shots.json)
// Needs: OBS running with the WebSocket server on, and OBS_PASSWORD (plus optional OBS_URL, WIN, EXE) in .env here.
import { chromium } from 'playwright';
import OBSWebSocket from 'obs-websocket-js';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE = 'https://player-lens.wittysea-a332ed57.eastus.azurecontainerapps.io';
const OUT = 'raw';
const USED = 'used-live-candidates.json';

// .env: KEY=VALUE lines (no dependency for four keys).
const env = Object.fromEntries(
	(fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8') : '')
		.split('\n')
		.map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/))
		.filter(Boolean)
		.map(([, k, v]) => [k, v]),
);
const OBS_URL = env.OBS_URL || 'ws://127.0.0.1:4455';
// The page size, 16:9. 1920x1080 is captured pixel for pixel on a non-Retina display; OBS scales anything else.
const [WIN_W, WIN_H] = (env.WIN || '1920x1080').split('x').map(Number);

// Match times (seconds) for each moment, read off the original OBS recording's match clock.
const T = {
	counterpress: 9 * 60 + 36, // 9:41 "Lima loses ball to Zimmermann…", 9:50 "Lima counters fiercely…"
	trace: 5 * 60 + 52, // 5:58 "Weber passes in midfield to Moreno..." line, where Fact Guard caught an invented run
	fullTime: 89 * 60 + 52,
};
// Live-generation shot: a player with a moment of their own 20-30 s after the click (the agents take ~15 s), and no
// goal nearby to take over their commentary (from events.json). Each take uses and records one, so a retake never
// pays to regenerate or shows an already-cached minute.
const LIVE_CANDIDATES = [
	// line: the commentary about their own moment, which the shot waits for.
	{ number: 1, name: 'T. Mulder', at: 77 * 60 + 4, line: /save/i }, // Redmond's keeper; save at 77:33
	{ number: 1, name: 'L. Bos', at: 81 * 60 + 3, line: /save|denies|stops/i }, // Azure's keeper; save from Moreno at 81:26
	{ number: 7, name: 'N. Schwarz', at: 77 * 60 + 4, line: /Schwarz/ }, // key pass at 77:31
	{ number: 8, name: 'D. Visser', at: 14 * 60 + 12, line: /Visser/ }, // key pass at 14:39
	{ number: 4, name: 'T. Lefebvre', at: 6 * 60 + 4, line: /Lefebvre/ }, // block at 6:31
	{ number: 8, name: 'G. Alves', at: 6 * 60 + 8, line: /Alves/ }, // shot blocked at 6:38
];

// --- Browser ---
const setupOnly = process.argv.includes('--setup');
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
fs.mkdirSync(OUT, { recursive: true });

const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'player-lens-demo-')), {
	headless: false,
	executablePath: env.EXE || process.env.EXE,
	viewport: null,
	// Playwright mutes the browser by default; OBS would record silence.
	ignoreDefaultArgs: ['--mute-audio', '--enable-automation'],
	args: [
		`--app=${BASE}`, // app mode: no tabs, address bar or bookmarks
		`--window-size=${WIN_W},${WIN_H}`,
		'--window-position=0,0',
		'--autoplay-policy=no-user-gesture-required',
		'--disable-infobars',
	],
});
const p = ctx.pages()[0] ?? (await ctx.waitForEvent('page'));

// Commentary lines as they appear (the app plays each line's voice clip as it shows it), plus each line's clip length
// from the app's own /commentary responses, so edit.mjs never cuts a line off mid-sentence.
const lineLog = [];
const clipLength = new Map();
let recap = null;
await ctx.exposeFunction('__demoLine', (text) => lineLog.push({ wall: Date.now(), text }));
p.on('response', async (r) => {
	try {
		if (r.status() !== 200) return;
		if (r.url().includes('/commentary?')) for (const l of (await r.json()).lines ?? []) clipLength.set(l.text, l.duration);
		if (r.url().includes('/recap?')) recap = await r.json();
	} catch {
		// a body that isn't JSON (or is already gone) just isn't logged
	}
});

// Visible cursor (OBS's own cursor doesn't follow Playwright's mouse; turn "Show cursor" off in the OBS source).
await ctx.addInitScript(() => {
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
		// Reports the commentary panel's current line whenever it changes.
		let last = '';
		setInterval(() => {
			const live = [...document.querySelectorAll('[aria-live="polite"]')].find((el) => el.closest('section')?.textContent.includes('Analyst'));
			const text = live?.querySelector('p')?.textContent?.trim() ?? '';
			if (text && text !== last) {
				last = text;
				window.__demoLine?.(text);
			}
		}, 50);
	});
});
await p.reload({ waitUntil: 'networkidle', timeout: 60000 });

// The app window has a title bar, so grow the window by its height: the page itself is then exactly WIN (16:9),
// and OBS crops the title bar off (see fitObsSource).
const titleBar = await p.evaluate(() => window.outerHeight - window.innerHeight);
{
	const cdp = await ctx.newCDPSession(p);
	const { windowId } = await cdp.send('Browser.getWindowForTarget');
	await cdp.send('Browser.setWindowBounds', { windowId, bounds: { left: 0, top: 0, width: WIN_W, height: WIN_H + titleBar } });
	await p.waitForTimeout(500);
	console.log(`window: page ${await p.evaluate(() => `${innerWidth}x${innerHeight}`)}, title bar ${titleBar}px`);
}

if (setupOnly) {
	console.log('Window open. In OBS, point the scene\'s window capture and application audio capture at it, then close the window.');
	await p.waitForEvent('close', { timeout: 0 });
	await ctx.close();
	process.exit(0);
}

// --- Helpers (from statly/record.mjs) ---
const pause = (ms) => p.waitForTimeout(ms);
const glide = (x, y, steps = 30) => p.mouse.move(x, y, { steps });
const clickHuman = async (locator) => {
	const box = await locator.boundingBox();
	await glide(box.x + box.width / 2, box.y + box.height / 2, 25);
	await pause(250);
	await p.mouse.down();
	await pause(90);
	await p.mouse.up();
};

const slider = p.getByRole('slider', { name: 'Match time' });
const duration = async () => Number(await slider.getAttribute('aria-valuemax'));
const now = async () => Number(await slider.getAttribute('aria-valuenow'));
// The play button's label says what it would do, so "Pause" means the match is playing.
const isPlaying = async () => (await p.getByRole('button', { name: 'Pause' }).count()) > 0;
// Space is the app's play/pause shortcut (the controls auto-hide while playing, so the button can be covered).
// Focus leaves any button first, or Space would press that button instead.
const setPlaying = async (on) => {
	if ((await isPlaying()) === on) return;
	await p.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
	await p.keyboard.press('Space');
};
// Clicks the timeline at the right fraction, then nudges with the arrow keys (5 s steps) to land within 3 s.
// Hovering it first brings the auto-hidden controls back.
const seekTo = async (t) => {
	const box = await slider.boundingBox();
	await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 5 });
	await pause(400);
	await p.mouse.click(box.x + (box.width * t) / (await duration()), box.y + box.height / 2);
	await p.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
	for (let i = 0; i < 20 && Math.abs((await now()) - t) > 3; i++) {
		await p.keyboard.press((await now()) < t ? 'ArrowRight' : 'ArrowLeft');
	}
};
// Waits out "Preparing commentary…" so no take starts on a loading state.
const waitForCommentary = () =>
	p.getByText('Preparing commentary…').waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {});
const commentary = p.locator('[aria-live="polite"]').filter({ has: p.getByRole('button', { name: 'How this was made' }) });
const segmented = (label) => p.getByRole('button', { name: label, exact: true });
const goalChip = (n) => p.getByRole('button', { name: /goal.*G\. Lima\. Jump to 8 seconds before/i }).nth(n);
const pitchPlayer = ({ number, name }) => p.locator(`[aria-label^="#${number} ${name},"]`).first();
const commentaryCard = p.locator('section').filter({ has: segmented('Analyst') });
// Page rectangle [x, y, w, h] around one or more elements; the page is the video frame, 1:1.
const rect = async (...locators) => {
	const boxes = (await Promise.all(locators.map((l) => l.boundingBox()))).filter(Boolean);
	const left = Math.min(...boxes.map((b) => b.x));
	const top = Math.min(...boxes.map((b) => b.y));
	const right = Math.max(...boxes.map((b) => b.x + b.width));
	const bottom = Math.max(...boxes.map((b) => b.y + b.height));
	return [left, top, right - left, bottom - top].map(Math.round);
};
// Waits for the first commentary line (one with a voice clip, optionally matching a pattern) shown after a moment.
const nextLine = async (afterWall, pattern = /./, timeout = 45000) => {
	for (const end = Date.now() + timeout; Date.now() < end; await pause(100)) {
		const line = lineLog.find((l) => l.wall > afterWall && clipLength.has(l.text) && pattern.test(l.text));
		if (line) return line;
	}
	return null;
};

// --- OBS ---
const obs = new OBSWebSocket();
await obs.connect(OBS_URL, env.OBS_PASSWORD);

// Each run opens a new window, and an OBS window capture is tied to one window, so point the capture source
// (OBS_SOURCE, default "Player Lens window") at this run's window, found by its title.
{
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

	// Crop the title bar off and scale the page to fill the canvas, so no OBS transform needs setting by hand.
	const { currentProgramSceneName: sceneName } = await obs.call('GetCurrentProgramScene');
	const { sceneItemId } = await obs.call('GetSceneItemId', { sceneName, sourceName: inputName });
	const { sceneItemTransform: tf } = await obs.call('GetSceneItemTransform', { sceneName, sceneItemId });
	const { baseWidth, baseHeight } = await obs.call('GetVideoSettings');
	const cropTop = Math.round((tf.sourceHeight * titleBar) / (WIN_H + titleBar));
	await obs.call('SetSceneItemTransform', {
		sceneName,
		sceneItemId,
		sceneItemTransform: {
			positionX: 0,
			positionY: 0,
			alignment: 5, // top left
			rotation: 0,
			cropTop,
			cropBottom: 0,
			cropLeft: 0,
			cropRight: 0,
			boundsType: 'OBS_BOUNDS_SCALE_INNER',
			boundsAlignment: 0,
			boundsWidth: baseWidth,
			boundsHeight: baseHeight,
		},
	});
	console.log(`OBS: captured ${tf.sourceWidth}x${tf.sourceHeight}, cropped ${cropTop}px title bar, scaled to ${baseWidth}x${baseHeight}`);
}
// macOS audio capture goes silent (with no error) when the output device changes, e.g. AirPods connecting.
// Changing a setting and back restarts its stream.
{
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
// Resolves when OBS reports the given record state (it confirms start and stop asynchronously).
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
	// The previous file can still be closing; StartRecord fails (500) until it has.
	for (let i = 0; i < 50 && (await obs.call('GetRecordStatus')).outputActive; i++) await pause(100);
	return (await recordState('OBS_WEBSOCKET_OUTPUT_STARTED', 'StartRecord')).at;
};
// Waits for OBS to finish writing the file, not just to accept the stop request.
const stopRecording = async () => (await recordState('OBS_WEBSOCKET_OUTPUT_STOPPED', 'StopRecord')).outputPath;

const shotsFile = `${OUT}/shots.json`;
const shots = fs.existsSync(shotsFile) ? JSON.parse(fs.readFileSync(shotsFile, 'utf8')) : [];
const save = () => fs.writeFileSync(shotsFile, JSON.stringify(shots, null, 2));

// prepare() runs before recording starts (seeks, toggles); run() is what the camera sees.
// run() may return extra timestamps (seconds into the file) for edit.mjs, e.g. when the live line arrived.
async function shot(name, prepare, run) {
	if (only.length && !only.includes(name)) return;
	await prepare?.();
	await p.mouse.move(WIN_W - 120, WIN_H - 140);
	const t0 = await startRecording();
	const at = () => (Date.now() - t0) / 1000;
	await pause(400);
	const start = at();
	const marks = await run(at, t0);
	const end = at();
	await pause(300);
	const stopWall = Date.now();
	const outputPath = await stopRecording();
	const file = path.join(OUT, `${name}${path.extname(outputPath)}`);
	fs.renameSync(outputPath, file);
	// A silent take means the audio capture died mid-run; stop rather than keep it.
	const level = execSync(`ffmpeg -hide_banner -nostats -i "${file}" -vn -af volumedetect -f null - 2>&1`).toString();
	const maxDb = Number(level.match(/max_volume: (-?[\d.]+|-inf) dB/)?.[1] ?? -Infinity);
	if (!(maxDb > -60)) throw new Error(`${name}: the take is silent (max ${maxDb} dB). Check the OBS audio source, then retake: node record.mjs ${name}`);
	// Every voiced line in this take, in file seconds, so the edit can let each one finish.
	const clips = lineLog
		.filter((l) => l.wall >= t0 && l.wall <= stopWall && clipLength.has(l.text))
		.map((l) => ({ at: (l.wall - t0) / 1000, dur: clipLength.get(l.text), text: l.text }));
	const entry = { name, file, start, end, clips, ...marks };
	const i = shots.findIndex((s) => s.name === name);
	if (i === -1) shots.push(entry);
	else shots[i] = entry;
	save();
	console.log(`${name}: ${start.toFixed(1)}s → ${end.toFixed(1)}s, ${clips.length} voiced lines`);
}

// --- Shots (order matters: the intro needs a fresh page) ---

// Re-recording only some shots: start the match off camera, as the intro shot would have.
if (only.length && !only.includes('intro')) {
	await p.getByRole('button', { name: 'Start match' }).click();
	await pause(1500);
}

// 1. Intro overlay, then Start match.
await shot('intro', null, async () => {
	await pause(2500);
	await clickHuman(p.getByRole('button', { name: 'Start match' }));
	await pause(2500);
});

// 2. Every rating change explains itself: Lima loses the ball, then counterpresses to win it back.
await shot(
	'counterpress',
	async () => {
		await setPlaying(false);
		await seekTo(T.counterpress);
		await waitForCommentary();
	},
	async (at) => {
		await setPlaying(true);
		// Highlight the rating log once the counterpress rows are in: -0.08, then +0.15 and +0.15 (off-ball).
		const log = p.getByRole('list', { name: 'Rating changes, newest first' });
		await log.getByText(/Won the ball from #5 J\. Zimmermann/).waitFor({ timeout: 30000 });
		const spotAt = at();
		const rows = log.locator('li');
		const spot = { from: spotAt, to: spotAt + 7, rect: await rect(rows.nth(0), rows.nth(1), rows.nth(2)), label: 'Every change, with its reason' };
		await pause(10000);
		return { spots: [spot] };
	},
);

// 3. Lima's 39th-minute equaliser, with voiced commentary.
await shot('equaliser', () => setPlaying(true), async () => {
	await clickHuman(goalChip(0));
	await pause(18000);
});

// 4. How this was made: the agent trace, with Fact Guard's catch. The match keeps playing (pausing silences the
// commentary and crowd); the next line is 24 s later, so the trace stays open for the whole shot.
await shot(
	'trace',
	async () => {
		await seekTo(T.trace);
		await setPlaying(true);
	},
	async (at) => {
		// The commentary panel (not the rating log, which also names Weber).
		await commentary.getByText(/Weber passes in midfield/).waitFor({ timeout: 30000 });
		const lineAt = at();
		await pause(1500);
		await clickHuman(p.getByRole('button', { name: 'How this was made' }).first());
		await pause(2500);
		// Scroll the trace down to the Fact Guard step.
		const trace = p.getByRole('list', { name: 'How this line was made, step by step' });
		const box = await trace.boundingBox();
		if (box) {
			await glide(box.x + box.width / 2, box.y + box.height / 2);
			for (let i = 0; i < 30; i++) {
				await p.mouse.wheel(0, 8);
				await pause(40);
			}
		}
		await pause(400);
		const spotAt = at();
		const factGuard = p.getByRole('list', { name: 'How this line was made, step by step' }).locator('li').filter({ hasText: 'Fact Guard' });
		const spot = { from: spotAt, to: spotAt + 7, rect: await rect(factGuard), label: 'Fact Guard caught an invented run' };
		await pause(7000);
		return { lineAt, spots: [spot] };
	},
);

// 5. The 89th-minute title winner.
await shot('winner', () => setPlaying(true), async () => {
	await clickHuman(goalChip(1));
	await pause(15000);
});

// 6. Same moment: Analyst, in Spanish. Seeks away first, so the take doesn't open on the last goal's banner.
await shot(
	'analyst-es',
	async () => {
		await seekTo(88 * 60);
		await setPlaying(true);
		await pause(1500);
	},
	async (at) => {
		const spotAt = at();
		const before = await rect(segmented('Casual'), segmented('ES'));
		await clickHuman(segmented('Analyst'));
		// Analyst mode adds an xG/distance line to the player card, which moves the toggles down; the ring follows.
		const movedAt = at();
		await pause(400);
		const after = await rect(segmented('Casual'), segmented('ES'));
		await clickHuman(segmented('ES'));
		// Switching language replays the current line in Spanish; let it finish before seeking (seeking stops it).
		await pause(600);
		const last = lineLog.at(-1);
		if (last && clipLength.has(last.text)) await pause(Math.max(0, last.wall + clipLength.get(last.text) * 1000 + 400 - Date.now()));
		const label = 'Analyst mode, in Spanish';
		const spots = [
			{ from: spotAt, to: movedAt, rect: before, label },
			{ from: movedAt, to: at(), rect: after, label },
		];
		await clickHuman(goalChip(1));
		await pause(15000);
		return { spots };
	},
);

// 7. Click any of 22 players: the agents write and voice a new minute live (then it's cached for every viewer).
let candidate;
await shot(
	'live',
	async () => {
		const used = fs.existsSync(USED) ? JSON.parse(fs.readFileSync(USED, 'utf8')) : [];
		candidate = LIVE_CANDIDATES.find((c) => !used.includes(c.name));
		if (!candidate) throw new Error(`Every live candidate in ${USED} is used; add more to LIVE_CANDIDATES.`);
		fs.writeFileSync(USED, JSON.stringify([...used, candidate.name], null, 2));
		await clickHuman(segmented('Casual'));
		await clickHuman(segmented('EN'));
		await seekTo(candidate.at);
		await setPlaying(false);
	},
	async (at, t0) => {
		await pause(800);
		const clickAt = at();
		await clickHuman(pitchPlayer(candidate));
		await setPlaying(true);
		const writing = p.getByText('The AI agents are writing this minute…');
		const writingSeen = await writing.waitFor({ timeout: 4000 }).then(() => true, () => false);
		if (!writingSeen) {
			console.warn(`${candidate.name}: no "writing this minute" state (already cached, or the spend cap is reached). Retake: node record.mjs live`);
		}
		const writingAt = writingSeen ? at() : null;
		const card = writingSeen ? await rect(commentaryCard) : null;
		await writing.waitFor({ state: 'hidden', timeout: 90000 }).catch(() => {});
		const doneAt = at();
		const surname = candidate.name.split(' ').pop();
		const spots = writingSeen ? [{ from: writingAt, to: doneAt, rect: card, label: `AI agents writing ${surname}'s minute, live` }] : [];
		// The new minute's line about the player's own moment; then let it finish.
		const line = await nextLine(t0 + doneAt * 1000 - 200, candidate.line);
		const lineAt = line ? (line.wall - t0) / 1000 : at();
		if (line) await pause(Math.max(0, (line.wall - Date.now()) + clipLength.get(line.text) * 1000 + 2500));
		else await pause(8000);
		console.log(`live: ${candidate.name}, writing ${writingAt?.toFixed(1)}s → ${doneAt.toFixed(1)}s, first line at ${lineAt.toFixed(1)}s: ${line?.text}`);
		return { player: candidate.name, clickAt, writingAt, doneAt, lineAt, live: writingSeen, spots };
	},
);

// 8. Every player's live rating, then back to Lima.
await shot('all-ratings', () => setPlaying(true), async () => {
	await clickHuman(p.getByRole('tab', { name: 'All ratings' }));
	await pause(3500);
	await clickHuman(p.getByRole('group', { name: /All ratings lineup/ }).locator('[aria-label^="#9 G. Lima,"]'));
	await pause(1500);
});

// 9. Full time and the spoken recap.
await shot(
	'recap',
	async () => {
		await clickHuman(p.getByRole('tab', { name: 'Player' }));
		await seekTo(T.fullTime);
		await setPlaying(true);
		await p.getByRole('button', { name: /^Listen to the recap/ }).waitFor({ timeout: 30000 });
	},
	async (at) => {
		await pause(1500);
		await clickHuman(p.getByRole('button', { name: /^Listen to the recap/ }));
		const recapAt = at();
		await pause(12000);
		return { recapAt, recapText: recap?.text, recapDuration: recap?.duration_s };
	},
);

await obs.disconnect();
await ctx.close();
console.log(`done: ${shotsFile}`);
