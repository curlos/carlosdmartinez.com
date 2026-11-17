// Trims the Playwright takes, adds two-line captions and highlights, joins them with crossfades, and exports
// MP4, WebM and a poster. Silent: no audio track. Based on player-lens/edit.mjs (captions rendered as PNGs,
// because Homebrew's ffmpeg has no drawtext).
// Usage: node edit.mjs [crf]
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { overlayCss } from './theme.mjs';

const SLUG = 'sneaker-palace';
const FONTS = path.resolve('../../../src/assets/fonts');
const FADE = 0.5;
const QUICK = 0.25; // between two segments that share a take or a caption
const CRF = process.argv[2] || '27';
const FPS = 30; // Playwright records at ~25 fps; 30 keeps every frame

const run = (cmd) => execSync(cmd, { stdio: ['ignore', 'ignore', 'inherit'] });
const out = (cmd) => execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const fileLength = (file) => Number(out(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${file}"`));

// Marks in shots.json are seconds since just before the page opened; the video starts a moment later, and it
// ends when the page closes (right after `end`). Shift every mark by that difference so it is in file seconds.
const shots = JSON.parse(fs.readFileSync('raw/shots.json', 'utf8')).map((s) => {
	const len = fileLength(s.file);
	const shift = Math.max(0, s.end - len);
	const fix = (v) => (typeof v === 'number' ? Math.max(0, v - shift) : v);
	const r = { ...s, len };
	for (const [k, v] of Object.entries(s)) r[k] = fix(v);
	r.len = len;
	r.spots = (s.spots ?? []).map((sp) => ({ ...sp, from: fix(sp.from), to: fix(sp.to) }));
	return r;
});
const byName = Object.fromEntries(shots.map((s) => [s.name, s]));
const S = (name) => byName[name];
const endOf = (s) => Math.min(s.end, s.len) - 0.15;

// Segments in order. from/to are file seconds. `joins: true` means it continues the previous segment's footage
// (same take), so it starts QUICK before the previous one ends and the crossfade shows identical frames.
// `quick: true` is a short cut that keeps the previous caption (no fade-in, QUICK crossfade).
const segments = [
	S('home') && { shot: 'home', from: Math.max(S('home').start + 0.3, (S('home').slideAt ?? 0) - 1.8), to: endOf(S('home')), headline: 'Sneaker Palace', detail: 'An online sneaker store' },
	S('search') && { shot: 'search', from: S('search').start + 0.2, to: endOf(S('search')), headline: 'Search 20,000+ sneakers', detail: 'Atlas Search, live results' },
	S('filters') && { shot: 'filters', from: S('filters').start + 0.6, to: endOf(S('filters')), headline: 'Filter by brand, color, price…', detail: 'Saved in the URL' },
	S('spin') && { shot: 'spin', from: S('spin').spinAt - 1.2, to: S('spin').spots[0].to + 0.3, headline: 'Spin the shoe 360°', detail: null },
	S('spin') && { shot: 'spin', joins: true, to: endOf(S('spin')), headline: 'Add to bag', detail: 'Guest cart, no account needed' },
	S('reviews') && { shot: 'reviews', from: S('reviews').start + 0.5, to: endOf(S('reviews')), headline: 'Ratings and reviews', detail: null },
	// Checkout, then a cut over Stripe's processing wait to the success page.
	// Bag → Checkout, with a quick cut past the spinner while /payment creates the payment intent.
	...(() => {
		const c = S('checkout');
		if (!c) return [];
		const stripe = { shot: 'checkout', headline: 'Stripe checkout', detail: 'Test mode' };
		if (c.checkoutClickAt == null) return [{ ...stripe, from: c.start + 0.4, to: c.payAt + 1.6 }];
		return [
			{ ...stripe, from: c.start + 0.4, to: c.checkoutClickAt + 0.2 },
			{ ...stripe, from: c.checkoutAt - 0.6, to: c.payAt + 1.6, quick: true },
		];
	})(),
	// Success page, then a quick cut to the order shot (the top of Order Details, recorded on its own) at the moment
	// "View or manage order" is clicked. Without the order shot, fall back to the checkout take's own order page.
	...(() => {
		const c = S('checkout');
		if (!c) return [];
		const confirmed = { headline: 'Order confirmed', detail: null };
		const o = S('order');
		if (o) return [
			{ ...confirmed, shot: 'checkout', from: c.successAt - 0.3, to: c.detailsClickAt }, // the app shows a spinner right after the click
			{ ...confirmed, shot: 'order', from: o.start, to: endOf(o), quick: true },
		];
		if (c.recsAt == null || c.recsAt - c.detailsClickAt < 1.2) return [{ ...confirmed, shot: 'checkout', from: c.successAt - 0.3, to: endOf(c) }];
		return [
			{ ...confirmed, shot: 'checkout', from: c.successAt - 0.3, to: c.detailsClickAt + 0.3 },
			{ ...confirmed, shot: 'checkout', from: c.recsAt - 0.2, to: endOf(c), quick: true },
		];
	})(),
]
	.filter(Boolean)
	.map((seg, i, all) => {
		const from = seg.joins ? all[i - 1].to - QUICK : seg.from;
		const spots = (S(seg.shot).spots ?? [])
			.filter((sp) => sp.rect && sp.to > from && sp.from < seg.to)
			.map((sp) => ({ ...sp, from: Math.max(sp.from, from), to: Math.min(sp.to, seg.to) }));
		return { ...seg, from, spots };
	});

const LABELS = { 'Applied filters': 'Applied filters + live count', 'Drag to spin': 'Drag to spin', 'Stripe test mode': 'Test card 4242 4242 4242 4242' };

fs.rmSync('build', { recursive: true, force: true });
fs.mkdirSync('build');
fs.mkdirSync('out', { recursive: true });

// --- Overlays: captions and highlights (look in theme.mjs) ---
const escape = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const font = (f) => `data:font/ttf;base64,${fs.readFileSync(path.join(FONTS, f)).toString('base64')}`;
const INTER_700 = font('Inter-700.ttf');
const INTER_600 = font('Inter-600.ttf');
const overlayPage = (body) => `<!doctype html><html><head><style>${overlayCss({ inter700: INTER_700, inter600: INTER_600 })}</style></head><body>${body}</body></html>`;
{
	const browser = await chromium.launch({ executablePath: process.env.EXE });
	const tab = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
	const render = async (body, file) => {
		await tab.setContent(overlayPage(body));
		await tab.evaluate(() => document.fonts.ready);
		await tab.screenshot({ path: file, omitBackground: true });
	};
	for (const [i, seg] of segments.entries()) {
		await render(
			`<div class="cap" style="bottom:72px"><span class="h">${escape(seg.headline)}</span>${seg.detail ? `<span class="d">${escape(seg.detail)}</span>` : ''}</div>`,
			`build/cap${i}.png`,
		);
		for (const [k, { rect: [x, y, w, h], label, side }] of seg.spots.entries()) {
			const text = escape(LABELS[label] ?? label);
			// Label beside the ring (left by default, or right), or under it with the arrow pointing up.
			const kind = side === 'right' || side === 'below' ? side : 'left';
			const pos = {
				left: `right:${1920 - x + 36}px;top:${y + h / 2 - 34}px`,
				right: `left:${x + w + 36}px;top:${y + h / 2 - 34}px`,
				below: `left:${x + 24}px;top:${y + h + 34}px`,
			}[kind];
			await render(
				`<div class="ring" style="left:${x - 8}px;top:${y - 8}px;width:${w + 16}px;height:${h + 16}px"></div>` +
					`<div class="label ${kind}" style="${pos}">${text}</div>`,
				`build/spot${i}_${k}.png`,
			);
		}
	}
	await browser.close();
}

// --- Segments ---
const durations = [];
segments.forEach((seg, i) => {
	const s = S(seg.shot);
	const length = seg.to - seg.from;
	const loop = (png) => `-loop 1 -framerate ${FPS} -t ${length.toFixed(3)} -i ${png} `;
	let inputs = `-ss ${seg.from.toFixed(3)} -to ${seg.to.toFixed(3)} -i "${s.file}" ` + loop(`build/cap${i}.png`);
	let filter = `[0:v]fps=${FPS},scale=1920:1080,setsar=1[v0];`;
	let prev = '[v0]';
	seg.spots.forEach((sp, k) => {
		inputs += loop(`build/spot${i}_${k}.png`);
		const st = sp.from - seg.from;
		const en = sp.to - seg.from;
		const fades = [`fade=t=in:st=${st.toFixed(3)}:d=0.3:alpha=1`, `fade=t=out:st=${Math.max(st, en - 0.3).toFixed(3)}:d=0.3:alpha=1`];
		filter += `[${k + 2}:v]${['format=rgba', ...fades].join(',')}[s${k}];`;
		filter += `${prev}[s${k}]overlay=0:0:shortest=1:enable='between(t,${st.toFixed(3)},${en.toFixed(3)})'[v${k + 1}];`;
		prev = `[v${k + 1}]`;
	});
	filter += `[1:v]format=rgba${seg.quick ? '' : ',fade=t=in:st=0:d=0.4:alpha=1'}[cap];${prev}[cap]overlay=0:0:shortest=1,format=yuv420p[v]`;
	run(`ffmpeg -v error -y ${inputs}-filter_complex "${filter}" -map "[v]" -an -c:v libx264 -crf 14 -preset fast build/seg${i}.mkv`);
	const real = fileLength(`build/seg${i}.mkv`);
	durations.push(real);
	console.log(`${String(i).padStart(2)} ${seg.shot.padEnd(9)} ${seg.from.toFixed(2)}→${seg.to.toFixed(2)}  ${real.toFixed(2)}s  "${seg.headline}"${seg.spots.length ? `  + highlight ${seg.spots[0].from.toFixed(2)}→${seg.spots[0].to.toFixed(2)}` : ''}`);
});

// End card (endcard.png from endcard.mjs).
const n0 = segments.length;
run(`ffmpeg -v error -y -loop 1 -framerate ${FPS} -t 4 -i endcard.png -vf "format=yuv420p" -c:v libx264 -crf 14 -preset fast build/seg${n0}.mkv`);
durations.push(4);

// Join with xfade.
const n = durations.length;
const inputs = durations.map((_, i) => `-i build/seg${i}.mkv`).join(' ');
let chain = '';
let prevV = '[0:v]';
let offset = 0;
const cuts = [];
for (let i = 1; i < n; i++) {
	const fade = segments[i]?.joins || segments[i]?.quick ? QUICK : FADE;
	offset += durations[i - 1] - fade;
	cuts.push(offset);
	chain += `${prevV}[${i}:v]xfade=transition=fade:duration=${fade}:offset=${offset.toFixed(3)}[v${i}];`;
	prevV = `[v${i}]`;
}
const total = offset + durations[n - 1];
chain += `${prevV}fade=t=out:st=${(total - 0.6).toFixed(3)}:d=0.6[vout]`;

const MP4 = `out/${SLUG}-demo.mp4`;
const WEBM = `out/${SLUG}-demo.webm`;
const POSTER = `out/${SLUG}-demo-poster.png`;
run(`ffmpeg -v error -y ${inputs} -filter_complex "${chain}" -map "[vout]" -r ${FPS} -c:v libx264 -profile:v high -pix_fmt yuv420p -crf ${CRF} -preset slow -movflags +faststart ${MP4}`);
run(`ffmpeg -v error -y -i ${MP4} -c:v libvpx-vp9 -b:v 0 -crf 42 -row-mt 1 -deadline good -cpu-used 2 -an ${WEBM}`);

// Poster: the Kobe page mid-spin (shoe, size grid and Add to Bag), without a caption or highlight.
const spin = S('spin');
const posterAt = spin ? spin.spinAt + 3.5 : S('home').start + 1;
run(`ffmpeg -v error -y -ss ${posterAt.toFixed(2)} -i "${(spin ?? S('home')).file}" -frames:v 1 -vf "scale=1920:1080" ${POSTER}`);
run(`cwebp -quiet -q 80 ${POSTER} -o out/${SLUG}-demo.webp`);

fs.writeFileSync('build/timeline.json', JSON.stringify({ segments: segments.map((s, i) => ({ ...s, length: durations[i] })), cuts, total }, null, 2));
for (const f of [MP4, WEBM, POSTER, `out/${SLUG}-demo.webp`]) console.log(f, (fs.statSync(f).size / 1e6).toFixed(2) + ' MB');
console.log('duration ≈', total.toFixed(1), 's');
