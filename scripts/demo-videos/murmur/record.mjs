// Records each shot of the Murmur demo as its own video file, signed in as @nba (dark theme).
// Usage (from this folder): node record.mjs [shot …]
//   No names: records every shot. With names: re-records only those and keeps the others in raw/shots.json.
//   Shots: home compose edit activity profile news. `compose` and `edit` go together: compose deletes every earlier
//   copy of the Spurs post and posts it without its last line, edit appends that line and shows the history.
//   `node record.mjs probe` saves layout/sharpness stills to raw/check/ (no writes).
//   `node record.mjs cleanup` only resets state (Spurs post replies back to Everybody).
// Pipeline: record.mjs → endcard.mjs → edit.mjs (needs ffmpeg on PATH).
// The password is read from .env with process.loadEnvFile and never printed (the key the user set there is
// TWITTER_PASSWORD; MURMUR_PASSWORD works too). Firestore project/collection and Cloudinary paths below are the
// backend's real names and can't be renamed.
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { POST_SPURS, POST_MVP } from './texts.mjs';

const BASE = 'https://murmur-social-media.vercel.app';
// The page lays out at 1280x720 CSS px but renders natively at 1920x1080: Chrome's own default page zoom at 150%
// in a fresh profile (not CSS zoom), new headless (channel 'chromium'). Same method as sneaker-palace/record.mjs.
// Mouse, boundingBox and scroll values are CSS px; highlight rects are multiplied by SCALE for the video.
const SCALE = 1.5;
const VIDEO = { width: 1920, height: 1080 };
const CSS_VIEW = { width: VIDEO.width / SCALE, height: VIDEO.height / SCALE };
const OUT = 'raw';
const STATE = `${OUT}/state.json`;
const ASSETS = `${OUT}/assets`;
const IMG_SPURS = `${ASSETS}/spurs.jpg`;
const IMG_THUMB = `${ASSETS}/spurs-video-thumb.jpg`;
const BANNER = `${ASSETS}/nba-banner-original.webp`; // NBA's current banner, downloaded from its Cloudinary URL
const FS = 'https://firestore.googleapis.com/v1/projects/twitter-clone-ece43/databases/(default)/documents';
const NBA_UID = 'm6ZEdUYgOoJHq5CO4Kjv';
const BANDAI = 'oC46957D1okE1nQQnAjM';
// The Spurs post: typed without its last line, which the edit shot appends.
const LAST_LINE = '\n\nGSW/SAS • 9:30pm/et, Prime';
const SPURS_SHORT = POST_SPURS.endsWith(LAST_LINE) ? POST_SPURS.slice(0, -LAST_LINE.length) : null;
if (!SPURS_SHORT) throw new Error('texts.mjs: POST_SPURS does not end with the expected last line');

fs.mkdirSync(OUT, { recursive: true });
const wanted = process.argv.slice(2);
const shotsFile = `${OUT}/shots.json`;
const shots = fs.existsSync(shotsFile) && wanted.length ? JSON.parse(fs.readFileSync(shotsFile, 'utf8')) : [];

// ---------- Firestore REST (public reads) for checks ----------
const fsGet = async (p) => {
	const r = await fetch(`${FS}/${p}`);
	return r.status === 200 ? r.json() : null;
};
const nbaPosts = async () => {
	const r = await fetch(`${FS}:runQuery`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'tweets' }],
			where: { fieldFilter: { field: { fieldPath: 'userID' }, op: 'EQUAL', value: { stringValue: NBA_UID } } } } }),
	});
	return (await r.json()).filter((x) => x.document).map((x) => ({
		id: x.document.name.split('/').pop(),
		text: x.document.fields.text?.stringValue ?? '',
		images: x.document.fields.images?.arrayValue?.values?.map((v) => v.stringValue) ?? [],
		replies: x.document.fields.allowRepliesFrom?.arrayValue?.values?.map((v) => v.stringValue) ?? [],
		versions: x.document.fields.versionHistory?.arrayValue?.values?.length ?? 0,
	}));
};
const postsWithText = async (...texts) => (await nbaPosts()).filter((p) => texts.includes(p.text));

// ---------- Browser ----------
const browser = await chromium.launch({ executablePath: process.env.EXE });

async function signedInState() {
	if (fs.existsSync(STATE)) {
		const ctx = await browser.newContext({ viewport: CSS_VIEW, storageState: STATE });
		const session = await (await ctx.request.get(`${BASE}/api/auth/session`)).json().catch(() => ({}));
		await ctx.close();
		if (session?.user?.tag === 'nba') return STATE;
	}
	try { process.loadEnvFile('.env'); } catch { /* checked below */ }
	const password = process.env.MURMUR_PASSWORD || process.env.TWITTER_PASSWORD;
	if (!password) throw new Error('password missing from .env');
	const ctx = await browser.newContext({ viewport: CSS_VIEW });
	const p = await ctx.newPage();
	await p.goto(`${BASE}/auth`);
	await p.getByPlaceholder('Email').fill('nba@gmail.com');
	await p.getByPlaceholder('Password').fill(password);
	await p.getByRole('button', { name: 'Sign in', exact: true }).click();
	await p.waitForURL((u) => !u.pathname.startsWith('/auth'), { timeout: 30000 });
	const session = await (await p.request.get(`${BASE}/api/auth/session`)).json();
	if (session?.user?.tag !== 'nba') throw new Error('sign-in failed');
	await ctx.storageState({ path: STATE });
	await ctx.close();
	console.log('signed in as @nba, state saved');
	return STATE;
}
const state = await signedInState();
const cookies = JSON.parse(fs.readFileSync(state, 'utf8')).cookies;

// Each take: a fresh temp profile whose default page zoom is 150% (Chrome stores it as log base 1.2).
async function takeContext(recordDir) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'murmur-take-'));
	fs.mkdirSync(path.join(dir, 'Default'));
	fs.writeFileSync(path.join(dir, 'Default', 'Preferences'), JSON.stringify({ partition: { default_zoom_level: { x: Math.log(SCALE) / Math.log(1.2) } } }));
	const ctx = await chromium.launchPersistentContext(dir, {
		executablePath: process.env.EXE,
		channel: process.env.EXE ? undefined : 'chromium',
		headless: !process.env.HEADED,
		viewport: VIDEO,
		...(recordDir ? { recordVideo: { dir: recordDir, size: VIDEO } } : {}),
	});
	ctx.profileDir = dir;
	await ctx.addCookies(cookies);
	await ctx.addInitScript(() => { try { localStorage.setItem('theme', 'dark'); } catch {} });
	return ctx;
}

// Visible cursor (Playwright videos have no cursor). Sized in CSS px, so it scales with the page zoom.
const cursorScript = () => {
	window.addEventListener('DOMContentLoaded', () => {
		const style = document.createElement('style');
		style.textContent = `
			#demo-cursor{position:fixed;z-index:2147483647;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;
				background:rgba(255,255,255,.85);border:2px solid rgba(0,0,0,.6);pointer-events:none;transition:transform .12s}
			#demo-cursor.down{transform:scale(.7)}`;
		document.head.appendChild(style);
		const dot = document.createElement('div');
		dot.id = 'demo-cursor';
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

// ---------- Helpers (CSS px) ----------
const pause = (p, ms) => p.waitForTimeout(ms);
const glide = async (p, x, y, steps = 25) => p.mouse.move(x, y, { steps });
const smoothScrollBy = async (p, total, ms = 900) => {
	const n = Math.max(1, Math.round(ms / 40));
	for (let i = 0; i < n; i++) {
		const a = 0.5 - Math.cos((Math.PI * i) / n) / 2;
		const b = 0.5 - Math.cos((Math.PI * (i + 1)) / n) / 2;
		await p.mouse.wheel(0, total * (b - a));
		await p.waitForTimeout(40);
	}
	await p.waitForTimeout(200);
};
const clickHuman = async (p, locator, steps = 20) => {
	let box = await locator.boundingBox();
	if (!box) { await locator.scrollIntoViewIfNeeded(); box = await locator.boundingBox(); }
	// Off screen or in the caption zone at the bottom of the frame: scroll it into view smoothly first.
	const inDialog = await locator.evaluate((el) => !!el.closest('[role=dialog]'));
	if (inDialog ? box.y < 0 || box.y + box.height > CSS_VIEW.height : box.y < 60 || box.y + box.height > CSS_VIEW.height - 150) {
		const delta = box.y + box.height / 2 - CSS_VIEW.height * 0.45;
		await smoothScrollBy(p, delta, Math.min(1400, 500 + Math.abs(delta)));
		box = await locator.boundingBox();
	}
	await glide(p, box.x + box.width / 2, box.y + box.height / 2, steps);
	await pause(p, 200);
	await p.mouse.down();
	await pause(p, 80);
	await p.mouse.up();
};
// Every visible image has loaded (Cloudinary images come in late).
const imagesLoaded = (p, timeout = 20000) =>
	p.waitForFunction(() => [...document.images]
		.filter((i) => { const r = i.getBoundingClientRect(); return r.width > 0 && r.bottom > 0 && r.top < innerHeight; })
		.every((i) => i.complete && i.naturalWidth > 0), null, { timeout, polling: 200 }).catch(() => console.warn('  images still loading'));
// Video-pixel rect [x, y, w, h] around the given locators, clipped to the frame.
const rectOf = async (locators, pad = 0) => {
	const boxes = [];
	for (const l of locators) boxes.push(await l.boundingBox());
	const x = Math.max(4, Math.min(...boxes.map((b) => b.x)) - pad);
	const y = Math.max(4, Math.min(...boxes.map((b) => b.y)) - pad);
	const r = Math.min(CSS_VIEW.width - 4, Math.max(...boxes.map((b) => b.x + b.width)) + pad);
	const bt = Math.min(CSS_VIEW.height - 4, Math.max(...boxes.map((b) => b.y + b.height)) + pad);
	return [x, y, r - x, bt - y].map((v) => Math.round(v * SCALE));
};
// The big post card on /post/<id>.
const bigPost = (p) => p.locator('div.text-base.border-b').filter({ hasText: 'View quotes and activity' }).first();

// Off-camera page (plain context, normal zoom) for setup and cleanup.
async function withPage(fn) {
	const ctx = await browser.newContext({ viewport: CSS_VIEW, storageState: state });
	const p = await ctx.newPage();
	try { return await fn(p); } finally { await ctx.close(); }
}

async function deletePost(p, id) {
	await p.goto(`${BASE}/post/${id}`);
	const card = bigPost(p);
	await card.waitFor({ timeout: 30000 });
	await pause(p, 1000);
	await card.locator('button[id^="headlessui-menu-button"]').first().click();
	await p.getByText('Delete post', { exact: true }).click();
	await p.getByRole('button', { name: 'Delete', exact: true }).click();
	await pause(p, 2500);
}

async function ensurePostB() {
	let found = await postsWithText(POST_MVP);
	if (!found.length) throw new Error('the MVP Ladder post is missing; it should stay up (Tf6HzSqte3FIPJr47SfO)');
	return found;
}

async function deleteSpursCopies() {
	for (const { id } of await postsWithText(POST_SPURS, SPURS_SHORT)) {
		console.log('deleting earlier Spurs post', id);
		await withPage((p) => deletePost(p, id));
	}
	if ((await postsWithText(POST_SPURS, SPURS_SHORT)).length) throw new Error('a Spurs post copy is still there');
}

// The reply setting picked on camera is put back to Everybody afterwards (off camera), like NBA's other posts.
async function resetReplies() {
	for (const post of await postsWithText(POST_SPURS, SPURS_SHORT)) {
		if (post.replies.length === 1 && post.replies[0] === 'everybody') continue;
		await withPage(async (p) => {
			await p.goto(`${BASE}/post/${post.id}`);
			const card = bigPost(p);
			await card.waitFor({ timeout: 30000 });
			await pause(p, 1000);
			await card.getByText(/can reply|Replies disabled/).first().click();
			await p.getByRole('button', { name: /Everybody/ }).click();
			await p.getByRole('button', { name: 'Save', exact: true }).click();
			await pause(p, 2000);
		});
		console.log('replies reset to Everybody on', post.id);
	}
}

async function report() {
	const posts = await nbaPosts();
	const a = posts.filter((p) => p.text === POST_SPURS || p.text === SPURS_SHORT);
	const b = posts.filter((p) => p.text === POST_MVP);
	const user = (await fsGet(`users/${NBA_UID}`)).fields;
	console.log('Spurs post copies:', JSON.stringify(a.map((x) => ({ id: x.id, exact: Buffer.from(x.text).equals(Buffer.from(POST_SPURS)), images: x.images.length, versions: x.versions, replies: x.replies }))));
	console.log('MVP Ladder post copies:', JSON.stringify(b.map((x) => ({ id: x.id, images: x.images.length }))));
	console.log('NBA banner:', user.banner.stringValue);
}

// ---------- Recording ----------
async function shot(name, url, waitFor, prepare, run) {
	const dir = `${OUT}/tmp-${name}`;
	fs.rmSync(dir, { recursive: true, force: true });
	const ctx = await takeContext(dir);
	await ctx.addInitScript(cursorScript);
	// The persistent context opens with a blank page that is recorded too: close it, keep only the take's page.
	const extra = ctx.pages();
	const t0 = Date.now();
	const at = () => (Date.now() - t0) / 1000;
	const p = await ctx.newPage();
	for (const e of extra) await e.close();
	if ((await p.evaluate(() => innerWidth)) !== CSS_VIEW.width) throw new Error('page zoom 150% did not apply');
	await p.goto(BASE + url);
	await p.locator(waitFor).first().waitFor({ timeout: 45000 });
	await imagesLoaded(p);
	if (prepare) await prepare(p);
	await p.mouse.move(CSS_VIEW.width * 0.78, CSS_VIEW.height * 0.8);
	await pause(p, 500);
	const marks = {};
	const start = at();
	await run(p, (k, v) => (marks[k] = v ?? at()), at);
	const end = at();
	const video = p.video();
	await p.close();
	const tmpFile = await video.path();
	await ctx.close();
	fs.rmSync(ctx.profileDir, { recursive: true, force: true });
	const file = `${OUT}/${name}.webm`;
	fs.rmSync(file, { force: true });
	fs.renameSync(tmpFile, file);
	fs.rmSync(dir, { recursive: true, force: true });
	const entry = { name, file, start, end, ...marks };
	const i = shots.findIndex((s) => s.name === name);
	if (i >= 0) shots[i] = entry; else shots.push(entry);
	fs.writeFileSync(shotsFile, JSON.stringify(shots, null, 2));
	console.log(`${name}: ${start.toFixed(1)}s → ${end.toFixed(1)}s`, JSON.stringify(marks));
	return entry;
}

let spursId = null; // set by compose, used by edit

const SHOTS = {
	// 1. Home feed: the Murmur logo top-left, a short scroll.
	home: () => shot('home', '/', 'text=Newest', async (p) => {
		// Off camera: sort by Most Likes, so the feed opens on popular posts with images rather than the newest ones.
		await p.getByText('Newest', { exact: true }).first().click();
		await p.locator('[role=menu] >> text="Most Likes"').click();
		await pause(p, 1200);
		await imagesLoaded(p);
		await p.mouse.move(640, 300);
	}, async (p) => {
		await pause(p, 1200);
		await glide(p, 300, 18, 25); // toward the logo
		await pause(p, 900);
		await glide(p, 640, 420, 25);
		await smoothScrollBy(p, 520, 2600);
		await pause(p, 700);
	}),

	// 2. Compose: type, attach two images, drag to reorder, change who can reply, post.
	compose: () => shot('compose', '/', 'text=Newest', null, async (p, mark, at) => {
		await pause(p, 600);
		await clickHuman(p, p.locator('button.xl\\:flex', { hasText: 'Post' }));
		const dlg = p.getByRole('dialog');
		const box = dlg.locator('textarea:visible').first();
		await box.waitFor();
		mark('modalAt');
		await pause(p, 300);
		await clickHuman(p, box, 12);
		// The first three lines at a readable pace, the rest fast. A newline is a plain Enter in this textarea.
		const head = SPURS_SHORT.split('\n').slice(0, 3).join('\n');
		await box.pressSequentially(head, { delay: 28 });
		await box.pressSequentially(SPURS_SHORT.slice(head.length), { delay: 0 });
		mark('typedAt');
		await pause(p, 300);
		const chooser = p.waitForEvent('filechooser');
		await clickHuman(p, dlg.getByRole('button', { name: 'Add photos' }).first(), 15);
		await (await chooser).setFiles([IMG_SPURS, IMG_THUMB]);
		const thumbs = dlg.locator('img.cursor-grab');
		await thumbs.nth(1).waitFor({ timeout: 30000 });
		await imagesLoaded(p, 8000);
		mark('imagesAt');
		await pause(p, 400);
		// Drag the first image onto the second (dnd-kit needs stepped pointer moves).
		const before = await thumbs.evaluateAll((els) => els.map((e) => e.src.slice(-40)));
		const [b0, b1] = [await thumbs.nth(0).boundingBox(), await thumbs.nth(1).boundingBox()];
		const panel = dlg.locator('div.bg-white.rounded-2xl').first();
		const spotRect = await rectOf([panel]);
		const spotFrom = at();
		await glide(p, b0.x + b0.width * 0.4, b0.y + b0.height * 0.6, 15);
		await pause(p, 250);
		await p.mouse.down();
		await pause(p, 150);
		for (let i = 1; i <= 30; i++) {
			const t = 0.5 - Math.cos((Math.PI * i) / 30) / 2;
			await p.mouse.move(b0.x + b0.width * 0.4 + (b1.x - b0.x) * t, b0.y + b0.height * 0.6 + (b1.y - b0.y) * t - Math.sin(Math.PI * t) * 14);
			await pause(p, 22);
		}
		await pause(p, 250);
		await p.mouse.up();
		mark('dropAt');
		await pause(p, 700);
		const after = await thumbs.evaluateAll((els) => els.map((e) => e.src.slice(-40)));
		if (before[0] !== after[1] || before[1] !== after[0]) throw new Error('drag did not reorder the images');
		const spotTo = at();
		// Who can reply: open the control and pick "Users you follow".
		await clickHuman(p, dlg.getByText('Everyone can reply').first());
		const settings = p.getByRole('dialog').filter({ hasText: 'Users you follow' });
		await settings.getByRole('button', { name: /Users you follow/ }).waitFor();
		mark('repliesAt');
		await pause(p, 500);
		await clickHuman(p, settings.getByRole('button', { name: /Users you follow/ }));
		await pause(p, 500);
		await clickHuman(p, settings.getByRole('button', { name: 'Save', exact: true }));
		await dlg.getByText('Some people can reply').first().waitFor();
		await pause(p, 700);
		await clickHuman(p, dlg.locator('button.px-4.py-2:visible', { hasText: 'Post' }).first());
		mark('postAt');
		await p.getByText('Your post was sent').waitFor({ timeout: 60000 });
		mark('sentAt');
		await p.waitForFunction(() => [...document.images].filter((i) => i.src.includes('res.cloudinary.com') && i.src.includes('/tweets/')).some((i) => {
			const r = i.getBoundingClientRect(); return r.top > 100 && r.top < 700 && i.complete && i.naturalWidth > 0;
		}), null, { timeout: 30000 }).catch(() => console.warn('  new post image not shown'));
		mark('liveAt');
		await pause(p, 1600);
		mark('spots', [{ from: spotFrom, to: spotTo, rect: spotRect, label: 'Drag to reorder' }]);
		const found = await postsWithText(SPURS_SHORT);
		if (found.length !== 1) throw new Error(`expected one new Spurs post, found ${found.length}`);
		spursId = found[0].id;
		console.log('  posted', spursId, JSON.stringify(found[0].images.map((u) => u.slice(-30))), found[0].replies);
	}),

	// 3. Edit the post (append the last line), then its edit history.
	edit: async () => {
		spursId ??= (await postsWithText(SPURS_SHORT))[0]?.id;
		if (!spursId) throw new Error('no unedited Spurs post: record `compose edit` together');
		return shot('edit', `/post/${spursId}`, 'text=View quotes and activity', null, async (p, mark, at) => {
			const card = bigPost(p);
			await pause(p, 700);
			await clickHuman(p, card.locator('button[id^="headlessui-menu-button"]').first());
			await clickHuman(p, p.getByText('Edit post', { exact: true }));
			const dlg = p.getByRole('dialog');
			const box = dlg.locator('textarea:visible').first();
			await box.waitFor();
			await p.waitForFunction((el) => el.value.length > 50, await box.elementHandle());
			mark('editOpenAt');
			await pause(p, 400);
			await clickHuman(p, box, 12);
			// Caret to the very end of the text (the click lands mid-text).
			await box.evaluate((el) => { el.focus(); el.setSelectionRange(el.value.length, el.value.length); });
			await box.pressSequentially(LAST_LINE, { delay: 45 });
			if ((await box.inputValue()) !== POST_SPURS) throw new Error(`edited text does not match POST_SPURS: ${JSON.stringify((await box.inputValue()).slice(-60))}`);
			await pause(p, 400);
			await clickHuman(p, dlg.locator('button.px-4.py-2:visible', { hasText: 'Update' }).first());
			await p.getByText('Your post was updated').waitFor({ timeout: 60000 });
			mark('updatedAt');
			await pause(p, 900);
			// "Last edited …" under the post opens the history.
			await clickHuman(p, bigPost(p).getByText('Last edited').first());
			await p.getByText('Past Version History').waitFor({ timeout: 30000 });
			mark('historyAt');
			await imagesLoaded(p, 10000);
			await pause(p, 900);
			await glide(p, 640, 420, 15);
			const head = p.getByText('Past Version History', { exact: true });
			const hb = await head.boundingBox();
			await smoothScrollBy(p, hb.y - 70, 1800);
			await imagesLoaded(p, 6000);
			const past = p.locator('div.border-b').filter({ hasText: 'The second team ever' }).last();
			const rect = await rectOf([head, past], 6);
			const from = at();
			await pause(p, 2600);
			mark('spots', [{ from, to: at(), rect, label: 'The original post' }]);
			await pause(p, 300);
		});
	},

	// 4. Activity on the Bandai post: Quotes → Reposts → Likes.
	activity: () => shot('activity', `/post/${BANDAI}`, 'text=View quotes and activity', null, async (p, mark) => {
		await pause(p, 500);
		await clickHuman(p, p.getByText('View quotes and activity').first());
		await p.getByText('Saw it in person').first().waitFor({ timeout: 30000 });
		await imagesLoaded(p, 8000);
		mark('quotesAt');
		await pause(p, 400);
		// The post fills the first screen: scroll so the tabs sit near the top and the quote shows under them.
		// The Reposts and Likes lists are short, so the page can't scroll far enough to bring the tabs up: add empty
		// space below the page (presentation only, nothing in the app changes).
		await p.addStyleTag({ content: 'main{min-height:calc(100vh + 720px) !important}' });
		const tabs = p.getByText('Reposts', { exact: true }).last();
		// Switching tabs changes the URL and the page jumps back to the top, so scroll the tabs up again each time.
		const tabsUp = async (ms) => {
			await glide(p, 640, 400, 10);
			const dy = (await tabs.boundingBox()).y - 95;
			if (Math.abs(dy) > 20) await smoothScrollBy(p, dy, ms);
		};
		await tabsUp(1300);
		await imagesLoaded(p, 6000);
		await pause(p, 1200);
		await clickHuman(p, tabs);
		await p.waitForURL(/reposts=true/);
		await pause(p, 150);
		await tabsUp(700);
		mark('repostsAt');
		await pause(p, 1300);
		await clickHuman(p, p.getByText('Likes', { exact: true }).last());
		await p.waitForURL(/likes=true/);
		await pause(p, 150);
		await tabsUp(700);
		mark('likesAt');
		await pause(p, 1400);
	}),

	// 5. Edit profile → banner crop: the current banner, dragged in the 3:1 cropper, applied as a preview, then the
	// profile editor is closed without saving, so the account is unchanged.
	profile: () => shot('profile', '/profile/nba', 'text=Edit Profile', null, async (p, mark, at) => {
		await pause(p, 700);
		await clickHuman(p, p.getByText('Edit Profile', { exact: true }).first());
		const dlg = p.getByRole('dialog');
		await dlg.getByText('Edit Profile', { exact: true }).waitFor();
		await imagesLoaded(p, 6000);
		mark('editAt');
		await pause(p, 700);
		const bannerBox = dlg.locator('[style*="background-image"]').first();
		const chooser = p.waitForEvent('filechooser');
		await clickHuman(p, bannerBox, 15);
		await (await chooser).setFiles(BANNER);
		const crop = p.locator('.ReactCrop__crop-selection');
		await crop.waitFor({ timeout: 30000 });
		await imagesLoaded(p, 6000);
		await pause(p, 500);
		mark('cropAt');
		const cropper = p.locator('.ReactCrop').first();
		const spotRect = await rectOf([cropper], 4);
		const from = at();
		// The selection starts at 90% of the image: shrink it from its bottom-right handle (it keeps 3:1), then drag
		// it around, as a person would.
		const handle = p.locator('.ReactCrop__drag-handle.ord-se');
		const hb = await handle.boundingBox();
		const [hx, hy] = [hb.x + hb.width / 2, hb.y + hb.height / 2];
		await glide(p, hx, hy, 15);
		await pause(p, 200);
		await p.mouse.down();
		for (let i = 1; i <= 20; i++) {
			const t = 0.5 - Math.cos((Math.PI * i) / 20) / 2;
			await p.mouse.move(hx - 210 * t, hy - 70 * t);
			await pause(p, 25);
		}
		await p.mouse.up();
		await pause(p, 300);
		const cb = await crop.boundingBox();
		const cx = cb.x + cb.width / 2, cy = cb.y + cb.height / 2;
		await glide(p, cx, cy, 12);
		await pause(p, 200);
		await p.mouse.down();
		let [x, y] = [cx, cy];
		for (const [tx, ty, n] of [[cx + 150, cy + 30, 22], [cx + 60, cy - 15, 16]]) {
			const [x0, y0] = [x, y];
			for (let i = 1; i <= n; i++) {
				const t = 0.5 - Math.cos((Math.PI * i) / n) / 2;
				[x, y] = [x0 + (tx - x0) * t, y0 + (ty - y0) * t];
				await p.mouse.move(x, y);
				await pause(p, 25);
			}
		}
		await p.mouse.up();
		mark('dragAt');
		await pause(p, 600);
		mark('spots', [{ from, to: at(), rect: spotRect, label: 'Crop to 3:1' }]);
		await clickHuman(p, p.getByText('Apply', { exact: true }));
		await crop.waitFor({ state: 'detached', timeout: 15000 });
		mark('appliedAt');
		await pause(p, 1300);
		// Close the editor without saving: the banner on the account stays exactly as it was.
		await p.getByText('Crop Banner').waitFor({ state: 'hidden', timeout: 10000 });
		await pause(p, 300);
		const editor = p.getByRole('dialog').filter({ has: p.getByText('Edit Profile', { exact: true }) });
		await clickHuman(p, editor.getByRole('button', { name: 'Close', exact: true }).first());
		const heading = p.getByRole('dialog').getByText('Edit Profile', { exact: true });
		await heading.waitFor({ state: 'hidden', timeout: 5000 }).catch(async () => {
			console.warn('  editor did not close on X; pressing Escape');
			await p.keyboard.press('Escape');
			await heading.waitFor({ state: 'hidden', timeout: 5000 });
		});
		mark('closedAt');
		await pause(p, 900);
	}),

	// 6. Latest news page. Wait for the article cards: the heading shows at once, the articles load slowly.
	news: () => shot('news', '/news', 'main article', null, async (p) => {
		await imagesLoaded(p, 10000);
		await pause(p, 900);
		await glide(p, 640, 420, 20);
		await smoothScrollBy(p, 600, 2400);
		await pause(p, 600);
	}),
};

async function probe() {
	fs.mkdirSync(`${OUT}/check`, { recursive: true });
	const ctx = await takeContext(null);
	const p = ctx.pages()[0] ?? (await ctx.newPage());
	await p.goto(`${BASE}/`);
	await p.locator('text=Newest').first().waitFor({ timeout: 45000 });
	await imagesLoaded(p);
	console.log('css viewport', await p.evaluate(() => [innerWidth, innerHeight, devicePixelRatio]));
	console.log('sidebar Post', await p.locator('button.xl\\:flex', { hasText: 'Post' }).isVisible(),
		'labels', await p.getByText('Bookmarks', { exact: true }).first().isVisible(),
		'latest news', await p.getByText('Latest news').first().isVisible());
	await p.screenshot({ path: `${OUT}/check/probe-home.png` });
	await ctx.close();
	fs.rmSync(ctx.profileDir, { recursive: true, force: true });
	// A short recorded clip to check the video frames are sharp.
	await shot('probe', '/', 'text=Newest', null, async (p) => { await pause(p, 1500); });
}

const order = Object.keys(SHOTS);
if (wanted.includes('probe')) {
	await probe();
} else if (wanted.includes('cleanup')) {
	await resetReplies();
	await report();
} else {
	const runList = wanted.length ? wanted : order;
	for (const n of runList) if (!SHOTS[n]) throw new Error(`unknown shot ${n}; one of ${order.join(', ')}`);
	if (runList.includes('edit') && !runList.includes('compose') && !(await postsWithText(SPURS_SHORT)).length)
		throw new Error('the Spurs post was already edited: record `compose edit` together');
	await ensurePostB();
	if (runList.includes('compose')) await deleteSpursCopies(); // exactly one copy may exist at the end
	for (const n of order.filter((n) => runList.includes(n))) await SHOTS[n]();
	await resetReplies();
	await report();
}
await browser.close();
console.log('done');
