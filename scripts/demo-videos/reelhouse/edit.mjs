// Trims the OBS shots, adds two-line captions and highlights, joins them with video + audio crossfades, sets the
// loudness with one fixed gain, and exports MP4, WebM and a poster. Based on player-lens/edit.mjs.
// Sound here is the trailers' own: cuts and crossfades go where the trailer is quiet (silencedetect, else the
// quietest half second near the planned cut), and every click that leaves a page mid-trailer gets a short fade
// ending at the click, since the app stops the trailer abruptly.
// Captions and highlights are rendered as transparent PNGs in the browser (Homebrew's ffmpeg has no drawtext).
// Usage: node edit.mjs [crf]
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const SLUG = 'reelhouse';
// The site's own accent (ReelHouse's violet, --brand #8B5CF6 in the app) for the highlight ring, its glow and the label
// pill; ACCENT_LIGHT is the lighter shade for the caption detail line, which reads better on the dark caption.
// ACCENT_TEXT is the pill's text colour, chosen to read on ACCENT.
const ACCENT = '#8B5CF6';
const ACCENT_LIGHT = '#A78BFA';
const ACCENT_TEXT = '#ffffff';
const ACCENT_GLOW = 'rgba(139,92,246,.5)';
const shots = JSON.parse(fs.readFileSync('raw/shots.json', 'utf8'));
const byName = Object.fromEntries(shots.map((s) => [s.name, s]));
const FONTS = path.resolve('../../../src/assets/fonts');
const FADE = 0.5;
const QUICK = 0.25;
const CRF = process.argv[2] || '27';
const FPS = 60;
// record.mjs's frame clock (8x8 CSS px, 4 px from the left, 24 px from the bottom; ×1.5 in the video), painted over.
const CLOCK = 'delogo=x=3:y=1029:w=19:h=19';

const run = (cmd) => execSync(cmd, { stdio: ['ignore', 'ignore', 'inherit'] });
const S = (name) => byName[name];

// The Blade Runner trailer opens on a silent rating card.
const RATING_CARD = 5.3; // seconds the Blade Runner trailer spends on its rating card (the trailer is muted, so measured by eye)

// --- Segments (from/to are file seconds in that shot's take) ---
// fadeAt: file seconds of clicks that stop a trailer; the sound ramps down over 0.3 s to just after the click.
const home = S('home');
const hover = S('hover');
const search = S('search');
const filters = S('filters');
const detail = S('detail');
const seasons = S('seasons');
const brSound = detail && detail.playingAt + RATING_CARD;
const castHold = detail && detail.castAt + 1.8;
const segments = [
	home && { shot: 'home', from: home.bannerAt + 0.15, to: home.bannerAt + 6.4, headline: 'ReelHouse', detail: 'Movies and TV from TMDB' },
	hover && { shot: 'hover', from: hover.scrollAt - 0.4, to: hover.playingAt + 6, headline: 'Trailers on hover', detail: null },
	search && { shot: 'search', from: search.clickAt - 0.5, to: search.resultsAt + 2.6, headline: 'Search titles and people', detail: null },
	filters && { shot: 'filters', from: filters.genreAt - 0.4, to: filters.spots[0].to + 0.3, headline: 'Filter by genre, year and sort', detail: 'Saved in the URL' },
	detail && {
		shot: 'detail', from: detail.scrollAt - 0.3, to: detail.loadedAt + 0.5, fadeAt: [detail.navigateAt],
		headline: 'Detail pages', detail: 'Trailer, cast and recommendations',
	},
	// Quick cut past the trailer's silent rating card, then on through the page; the cast caption follows unbroken.
	detail && { shot: 'detail', from: brSound - 0.3, to: castHold, headline: 'Detail pages', detail: 'Trailer, cast and recommendations', quick: true },
	detail && { shot: 'detail', from: castHold, to: detail.goslingClickAt + 0.15, fadeAt: [detail.goslingClickAt], headline: 'Cast pages', detail: null, joined: true },
	// The person page first paints at the old scroll position, half-loaded, for ~0.4 s; a quick cut skips that.
	detail && { shot: 'detail', from: detail.goslingClickAt + 0.5, to: detail.personAt + 4.6, headline: 'Cast pages', detail: null, quick: true },
	seasons && {
		shot: 'seasons', from: seasons.loadedAt + 0.05, to: seasons.episodeAt + 2.8, fadeAt: [seasons.episodeClickAt],
		headline: 'Seasons and episodes', detail: null,
	},
]
	.filter(Boolean)
	.map((seg) => {
		const spots = (S(seg.shot).spots ?? [])
			.filter((sp) => sp.rect && sp.to > seg.from && sp.from < seg.to)
			.map((sp) => ({ ...sp, from: Math.max(sp.from, seg.from), to: Math.min(sp.to, seg.to) }));
		return { ...seg, spots };
	});
// A segment that continues the previous one's take without a gap overlaps it by the crossfade, so picture and sound
// run on unbroken (crossfading identical frames and samples) while only the caption changes.
segments.forEach((seg, i) => {
	if (seg.joined) seg.from = segments[i - 1].to - FADE;
});

fs.rmSync('build', { recursive: true, force: true });
fs.mkdirSync('build');
fs.mkdirSync('out', { recursive: true });

// --- Overlays: captions and highlights ---
const escape = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const font = (f) => `data:font/ttf;base64,${fs.readFileSync(path.join(FONTS, f)).toString('base64')}`;
const INTER_700 = font('Inter-700.ttf');
const INTER_600 = font('Inter-600.ttf');
const overlayPage = (body) => `<!doctype html><html><head><style>
	@font-face{font-family:Inter;font-weight:700;src:url('${INTER_700}')}
	@font-face{font-family:Inter;font-weight:600;src:url('${INTER_600}')}
	html,body{margin:0;width:1920px;height:1080px;background:transparent;font-family:Inter;overflow:hidden}
	.cap{position:absolute;left:64px;display:flex;flex-direction:column;align-items:flex-start;gap:10px}
	.cap span{background:rgba(11,15,23,.72);padding:10px 18px;border-radius:6px}
	.h{color:#fff;font-weight:700;font-size:40px}
	.d{color:${ACCENT_LIGHT};font-weight:600;font-size:30px}
	.ring{position:absolute;border-radius:16px;box-shadow:0 0 0 9999px rgba(0,0,0,.5),0 0 0 3px ${ACCENT},0 0 28px 6px ${ACCENT_GLOW}}
	.label{position:absolute;background:${ACCENT};color:${ACCENT_TEXT};font-weight:700;font-size:30px;padding:14px 22px;border-radius:10px;white-space:nowrap}
	.label.left:after{content:'';position:absolute;right:-16px;top:50%;margin-top:-14px;border:14px solid transparent;border-left:16px solid ${ACCENT};border-right:0}
	.label.right:after{content:'';position:absolute;left:-16px;top:50%;margin-top:-14px;border:14px solid transparent;border-right:16px solid ${ACCENT};border-left:0}
</style></head><body>${body}</body></html>`;
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
		for (const [k, { rect: [x, y, w, h], label }] of seg.spots.entries()) {
			// The label points at the ring from the left, or from the right when there's no room on the left.
			const labelWidth = label.length * 18 + 44;
			const side = x - 36 - labelWidth > 24 ? 'left' : 'right';
			const pos = side === 'left' ? `right:${1920 - x + 36}px` : `left:${x + w + 36}px`;
			await render(
				`<div class="ring" style="left:${x - 8}px;top:${y - 8}px;width:${w + 16}px;height:${h + 16}px"></div>` +
					`<div class="label ${side}" style="${pos};top:${y + h / 2 - 34}px">${escape(label)}</div>`,
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
	let filter = `[0:v]${CLOCK},fps=${FPS},scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x18181b[v0];`;
	let prev = '[v0]';
	seg.spots.forEach((sp, k) => {
		inputs += loop(`build/spot${i}_${k}.png`);
		const st = sp.from - seg.from;
		const en = sp.to - seg.from;
		const fades = [
			!seg.spots[k - 1] || seg.spots[k - 1].to < sp.from ? `fade=t=in:st=${st.toFixed(3)}:d=0.3:alpha=1` : null,
			!seg.spots[k + 1] || seg.spots[k + 1].from > sp.to ? `fade=t=out:st=${Math.max(st, en - 0.3).toFixed(3)}:d=0.3:alpha=1` : null,
		].filter(Boolean);
		filter += `[${k + 2}:v]${['format=rgba', ...fades].join(',')}[s${k}];`;
		filter += `${prev}[s${k}]overlay=0:0:shortest=1:enable='between(t,${st.toFixed(3)},${en.toFixed(3)})'[v${k + 1}];`;
		prev = `[v${k + 1}]`;
	});
	// The caption fades in, except across a quick or joined cut, where it continues.
	const capFade = seg.quick ? '' : ',fade=t=in:st=0:d=0.4:alpha=1';
	filter += `[1:v]format=rgba${capFade}[cap];${prev}[cap]overlay=0:0:shortest=1,format=yuv420p[v];`;
	// Fades that end just after each click that stops a trailer (the app cuts it off mid-note).
	const gain = (seg.fadeAt ?? [])
		.map((c) => c - seg.from + 0.12)
		.filter((e) => e > 0 && e < length + 0.5)
		.map((e) => `min(1,max(0,(${e.toFixed(3)}-t)/0.35))`);
	const vol = gain.length ? `,volume='${gain.join('*')}':eval=frame` : '';
	filter += `[0:a]aresample=48000,aformat=channel_layouts=stereo${vol}[a]`;
	run(`ffmpeg -v error -y ${inputs}-filter_complex "${filter}" -map "[v]" -map "[a]" -c:v libx264 -crf 14 -preset fast -c:a pcm_s16le build/seg${i}.mkv`);
	durations.push(length);
	console.log(`${String(i).padStart(2)} ${seg.shot.padEnd(8)} ${seg.from.toFixed(2)} → ${seg.to.toFixed(2)}  ${length.toFixed(1)}s  ${seg.headline}${seg.spots.length ? `  + highlight "${seg.spots[0].label}"` : ''}`);
});

// End card: silent audio so the crossfade has something to fade into.
const n0 = segments.length;
run(
	`ffmpeg -v error -y -loop 1 -framerate ${FPS} -t 4 -i endcard.png -f lavfi -t 4 -i anullsrc=r=48000:cl=stereo ` +
		`-vf "fade=t=in:st=0:d=0.4,format=yuv420p" -c:v libx264 -crf 14 -preset fast -c:a pcm_s16le -shortest build/seg${n0}.mkv`,
);
durations.push(4);

// Join: xfade for picture, acrossfade of the same length for sound.
const n = durations.length;
const inputs = durations.map((_, i) => `-i build/seg${i}.mkv`).join(' ');
let videoChain = '';
let prevV = '[0:v]';
let offset = 0;
const starts = [0];
for (let i = 1; i < n; i++) {
	const fade = segments[i]?.quick ? QUICK : FADE;
	offset += durations[i - 1] - fade;
	starts.push(offset);
	videoChain += `${prevV}[${i}:v]xfade=transition=fade:duration=${fade}:offset=${offset.toFixed(3)}[v${i}];`;
	prevV = `[v${i}]`;
}
const total = offset + durations[n - 1];

// Loudness: measure the joined audio, then one fixed gain to -16 LUFS (never one-pass loudnorm, which rides the
// level like an automatic volume control). The limiter only catches peaks above -1 dBFS.

let filter = videoChain;
filter += `${prevV}fade=t=out:st=${(total - 0.6).toFixed(3)}:d=0.6[vout]`;

run(
	`ffmpeg -v error -y ${inputs} -filter_complex "${filter}" -map "[vout]" -an -r ${FPS} ` +
		`-c:v libx264 -profile:v high -pix_fmt yuv420p -crf ${CRF} -preset slow ` +
		`-movflags +faststart out/${SLUG}-demo.mp4`,
);
run(
	`ffmpeg -v error -y -i out/${SLUG}-demo.mp4 -c:v libvpx-vp9 -b:v 0 -crf 42 -row-mt 1 -deadline good -cpu-used 2 ` +
		`-an out/${SLUG}-demo.webm`,
);

// Poster: Blade Runner 2049's detail page, its trailer on the opening close-up of an eye; no caption.
run(`ffmpeg -v error -y -ss ${(brSound + 1.0).toFixed(2)} -i "${detail.file}" -frames:v 1 -vf "${CLOCK},scale=1920:1080" out/${SLUG}-demo-poster.png`);
run(`cwebp -quiet -q 80 out/${SLUG}-demo-poster.png -o out/${SLUG}-demo-poster.webp`);

// Where each segment starts in the final video (for stills and checks).
fs.writeFileSync('build/timeline.json', JSON.stringify(segments.map((s, i) => ({ i, shot: s.shot, headline: s.headline, start: starts[i], from: s.from, to: s.to, spots: s.spots })), null, 2));
for (const f of [`out/${SLUG}-demo.mp4`, `out/${SLUG}-demo.webm`, `out/${SLUG}-demo-poster.png`, `out/${SLUG}-demo-poster.webp`]) {
	console.log(f, (fs.statSync(f).size / 1e6).toFixed(2) + ' MB');
}
console.log('duration ≈', total.toFixed(1), 's');
