// Cuts the Markback demo out of one OBS take that Carlos recorded by hand (raw/footage.mkv: Edge, 1920x1080, the
// toolbar plus the page), cleans each frame up, adds two-line captions and highlights, joins the cuts with crossfades
// and exports MP4, WebM and a poster. Silent: no audio track. Based on reelhouse/edit.mjs.
//
// Clean-up: each output frame is rebuilt on a flat dark background from three pieces of the source, so the address
// bar, other toolbar icons, the account avatar, YouTube's masthead (logo, search, notifications) and the Shorts
// sidebar never show:
//   - the page content (the player with the title and description, or the Short with its action bar), moved up
//     into the masthead's place;
//   - the Markback toolbar icon, on a plain toolbar-coloured strip;
//   - the popup under it, only while it's open.
// Everything is scaled by SCALE and centred, which leaves room for the captions under the page.
// Captions and highlights are rendered as transparent PNGs in the browser (Homebrew's ffmpeg has no drawtext).
// Usage: node edit.mjs [crf]
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ACCENT, ACCENT_LIGHT, ACCENT_GLOW, LABEL_TEXT } from './theme.mjs';

const SLUG = 'markback';
const SRC = 'raw/footage.mkv';
const FONTS = path.resolve('../../../src/assets/fonts');
const FADE = 0.5;
const QUICK = 0.25;
const CRF = process.argv[2] || '27';
const FPS = 60;
const SCALE = 0.84;
const BG = '0x0d0d0d'; // YouTube's dark page background as it comes out of the capture
const TOOLBAR = '#232323'; // Edge's toolbar
const POPUP_BORDER = '#5b5b5b'; // the popup's 1 px border, which the toolbar strip shares so the two read as one card

// Source geometry (px in the take). The masthead is y 40-104; the page content starts under it.
const MASTHEAD_BOTTOM = 104;
const STAGE_TOP = 2; // the toolbar strip's top
const CONTENT_TOP = 46; // where the content lands once the masthead is gone (just under the toolbar strip)
const LAYOUTS = {
	// Player, title, channel row and description (x 22-1352, down to the description's bottom).
	watch: { content: [22, MASTHEAD_BOTTOM, 1330, 961] },
	// The Short with its title and channel on the left and the action bar on the right; the sidebar (x < 240) is left out.
	shorts: { content: [250, MASTHEAD_BOTTOM, 1135, 976] },
};
// The Markback icon and its popup moved 36 px right about 37 s into the take (Edge's toolbar changed).
// The popup rect includes its own 1 px border.
const EARLY = { iconX: 1660, popupX: 1357 };
const LATE = { iconX: 1696, popupX: 1393 };
const POPUP = { y: 40, w: 320, h: 581 };
const ICON = { y: 8, size: 30 };
const STAGE_RIGHT = LATE.popupX + POPUP.w;

// Where a layout's stage (content + toolbar strip + popup, in take px) lands in the output: scaled and centred.
const placement = (layout) => {
	const [left, , , h] = LAYOUTS[layout].content;
	const x0 = Math.round((1920 - (STAGE_RIGHT - left) * SCALE) / 2);
	const y0 = 20;
	return { left, x0, y0, bottom: Math.round(y0 + (CONTENT_TOP + h - STAGE_TOP) * SCALE) };
};
// A point in the take → the output. Content moves up by the masthead's height; the toolbar and popup stay put.
const map = (layout, x, y, isContent) => {
	const { left, x0, y0 } = placement(layout);
	const sy = isContent ? y - MASTHEAD_BOTTOM + CONTENT_TOP : y;
	return [Math.round(x0 + (x - left) * SCALE), Math.round(y0 + (sy - STAGE_TOP) * SCALE)];
};
const mapRect = (layout, [x, y, w, h]) => [...map(layout, x, y, true), Math.round(w * SCALE), Math.round(h * SCALE)];

// --- Segments (from/to are seconds in the take; speed > 1 plays it faster) ---
// popup: the popup is open for the whole segment (it's drawn only then). Spots: a circle around a square rect in
// take px (page content), centred on the bookmark glyph rather than its button (the glyph's clock badge sits off-centre).
const segments = [
	{
		from: 3.3, to: 5.72, layout: 'watch', at: EARLY, popup: false,
		headline: 'Bookmark any moment', detail: 'One click on the button in the player',
		spots: [{ from: 3.4, to: 5.6, rect: [1045, 804, 52, 52], label: 'Bookmark' }],
	},
	// The popup opens by itself; its loading spinner (5.75-6.75 s) is cut.
	{ from: 6.8, to: 9.3, layout: 'watch', at: EARLY, popup: true, quick: true, headline: 'Bookmark any moment', detail: 'One click on the button in the player' },
	{ from: 22.1, to: 25.2, layout: 'watch', at: EARLY, popup: true, headline: 'A preview of every bookmark', detail: 'Frames and progress bars in the popup' },
	{ from: 25.2, to: 29.6, layout: 'watch', at: EARLY, popup: true, joined: true, headline: 'Jump straight back', detail: 'Press play on any bookmark' },
	{ from: 84.8, to: 86.4, layout: 'watch', at: LATE, popup: true, headline: 'Add a note', detail: 'Remember why the moment mattered' },
	// A typo and its fix (86.4-90.4 s) are cut, and the typing runs at double speed.
	{ from: 90.4, to: 95.3, speed: 2, layout: 'watch', at: LATE, popup: true, quick: true, headline: 'Add a note', detail: 'Remember why the moment mattered' },
	{ from: 95.3, to: 97.4, layout: 'watch', at: LATE, popup: true, quick: true, headline: 'Add a note', detail: 'Remember why the moment mattered' },
	{
		from: 122.8, to: 125.95, layout: 'shorts', at: LATE, popup: false,
		headline: 'Shorts too', detail: 'The button sits in the Shorts action bar',
		spots: [{ from: 123.2, to: 125.9, rect: [1320, 668, 48, 48], label: 'Bookmark' }],
	},
	// The spinner (126-127.3 s) is cut.
	{ from: 127.4, to: 131.0, layout: 'shorts', at: LATE, popup: true, quick: true, headline: 'Shorts too', detail: 'The button sits in the Shorts action bar' },
	{ from: 134.8, to: 141.2, layout: 'shorts', at: LATE, popup: true, headline: "Every video you've bookmarked", detail: 'Sorted the way you like' },
].map((seg) => ({ speed: 1, spots: [], ...seg }));
// A segment that continues the previous one without a gap overlaps it by the crossfade, so the picture runs on
// unbroken (crossfading identical frames) while only the caption changes.
segments.forEach((seg, i) => {
	if (seg.joined) seg.from = segments[i - 1].to - FADE;
});

const run = (cmd) => execSync(cmd, { stdio: ['ignore', 'ignore', 'inherit'] });
fs.rmSync('build', { recursive: true, force: true });
fs.mkdirSync('build');
fs.mkdirSync('out', { recursive: true });

// --- Overlays: captions, highlights and the toolbar strip ---
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
	.ring{position:absolute;border-radius:50%;box-shadow:0 0 0 9999px rgba(0,0,0,.5),0 0 0 3px ${ACCENT},0 0 28px 6px ${ACCENT_GLOW}}
	.label{position:absolute;background:${ACCENT};color:${LABEL_TEXT};font-weight:700;font-size:30px;padding:14px 22px;border-radius:10px;white-space:nowrap}
	.label.left:after{content:'';position:absolute;right:-16px;top:50%;margin-top:-14px;border:14px solid transparent;border-left:16px solid ${ACCENT};border-right:0}
	.label.right:after{content:'';position:absolute;left:-16px;top:50%;margin-top:-14px;border:14px solid transparent;border-right:16px solid ${ACCENT};border-left:0}
	.strip{position:absolute;box-sizing:border-box;background:${TOOLBAR};border:1px solid ${POPUP_BORDER};border-radius:8px}
	.strip.open{border-bottom:0;border-radius:8px 8px 0 0}
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
		for (const [k, spot] of seg.spots.entries()) {
			const [x, y, w, h] = mapRect(seg.layout, spot.rect);
			// The label points at the ring from the left, or from the right when there's no room on the left.
			const labelWidth = spot.label.length * 18 + 44;
			const side = x - 36 - labelWidth > 24 ? 'left' : 'right';
			const pos = side === 'left' ? `right:${1920 - x + 36}px` : `left:${x + w + 36}px`;
			await render(
				`<div class="ring" style="left:${x - 8}px;top:${y - 8}px;width:${w + 16}px;height:${h + 16}px"></div>` +
					`<div class="label ${side}" style="${pos};top:${y + h / 2 - 34}px">${escape(spot.label)}</div>`,
				`build/spot${i}_${k}.png`,
			);
		}
		// The toolbar strip the Markback icon sits on: the popup's width, above it, with the popup's border. While the
		// popup is open the strip has no bottom edge and runs into the popup's own top border.
		const [sx, sy] = map(seg.layout, seg.at.popupX, STAGE_TOP, false);
		const [, py] = map(seg.layout, seg.at.popupX, POPUP.y, false);
		await render(
			`<div class="strip${seg.popup ? ' open' : ''}" style="left:${sx}px;top:${sy}px;width:${Math.round(POPUP.w * SCALE)}px;height:${py - sy + (seg.popup ? 0 : 1)}px"></div>`,
			`build/strip${i}.png`,
		);
	}
	await browser.close();
}

// The cleaned-up picture of one segment, from input 0 (the take) and input 1 (the toolbar strip PNG), as [label].
const compose = (seg, i, label) => {
	const [cx, cy, cw, ch] = LAYOUTS[seg.layout].content;
	const sc = (v) => Math.round(v * SCALE);
	const piece = (name, [x, y, w, h]) => `[${name}in]crop=${w}:${h}:${x}:${y},scale=${sc(w)}:${sc(h)}:flags=lanczos[${name}];`;
	const [contentX, contentY] = map(seg.layout, cx, cy, true);
	const [iconX, iconY] = map(seg.layout, seg.at.iconX - ICON.size / 2, ICON.y, false);
	const [popupX, popupY] = map(seg.layout, seg.at.popupX, POPUP.y, false);
	let f = `[0:v]fps=${FPS},setpts=(PTS-STARTPTS)/${seg.speed},split=3[cin][iin][pin];`;
	f += piece('c', [cx, cy, cw, ch]);
	f += piece('i', [seg.at.iconX - ICON.size / 2, ICON.y, ICON.size, ICON.size]);
	f += piece('p', [seg.at.popupX, POPUP.y, POPUP.w, POPUP.h]);
	f += `color=c=${BG}:s=1920x1080:r=${FPS}[bg${i}];`;
	f += `[bg${i}][c]overlay=${contentX}:${contentY}:shortest=1[b1];`;
	f += `[b1][1:v]overlay=0:0[b2];`;
	f += `[b2][i]overlay=${iconX}:${iconY}[b3];`;
	f += seg.popup ? `[b3][p]overlay=${popupX}:${popupY}[${label}];` : `[b3]null[${label}];[p]nullsink;`;
	return f;
};

// --- Segments ---
const durations = [];
segments.forEach((seg, i) => {
	const length = (seg.to - seg.from) / seg.speed;
	const loop = (png) => `-loop 1 -framerate ${FPS} -t ${length.toFixed(3)} -i ${png} `;
	let inputs = `-ss ${seg.from.toFixed(3)} -to ${seg.to.toFixed(3)} -i ${SRC} ` + loop(`build/strip${i}.png`) + loop(`build/cap${i}.png`);
	let filter = compose(seg, i, 'v0');
	let prev = '[v0]';
	seg.spots.forEach((sp, k) => {
		inputs += loop(`build/spot${i}_${k}.png`);
		const st = (sp.from - seg.from) / seg.speed;
		const en = (sp.to - seg.from) / seg.speed;
		const fades = [
			!seg.spots[k - 1] || seg.spots[k - 1].to < sp.from ? `fade=t=in:st=${st.toFixed(3)}:d=0.3:alpha=1` : null,
			!seg.spots[k + 1] || seg.spots[k + 1].from > sp.to ? `fade=t=out:st=${Math.max(st, en - 0.3).toFixed(3)}:d=0.3:alpha=1` : null,
		].filter(Boolean);
		filter += `[${k + 3}:v]${['format=rgba', ...fades].join(',')}[s${k}];`;
		filter += `${prev}[s${k}]overlay=0:0:shortest=1:enable='between(t,${st.toFixed(3)},${en.toFixed(3)})'[v${k + 1}];`;
		prev = `[v${k + 1}]`;
	});
	// The caption fades in, except across a quick or joined cut, where it continues.
	const capFade = seg.quick || seg.joined ? '' : ',fade=t=in:st=0:d=0.4:alpha=1';
	filter += `[2:v]format=rgba${capFade}[cap];${prev}[cap]overlay=0:0:shortest=1,format=yuv420p[v]`;
	run(`ffmpeg -v error -y ${inputs}-filter_complex "${filter}" -map "[v]" -an -t ${length.toFixed(3)} -c:v libx264 -crf 14 -preset fast build/seg${i}.mkv`);
	durations.push(length);
	console.log(`${String(i).padStart(2)} ${seg.layout.padEnd(6)} ${seg.from.toFixed(2)} → ${seg.to.toFixed(2)}${seg.speed !== 1 ? ` ×${seg.speed}` : ''}  ${length.toFixed(1)}s  ${seg.headline}${seg.spots.length ? `  + highlight "${seg.spots[0].label}"` : ''}`);
});

// End card.
const n0 = segments.length;
run(`ffmpeg -v error -y -loop 1 -framerate ${FPS} -t 4 -i endcard.png -vf "fade=t=in:st=0:d=0.4,format=yuv420p" -c:v libx264 -crf 14 -preset fast build/seg${n0}.mkv`);
durations.push(4);

// Join with crossfades.
const n = durations.length;
const inputs = durations.map((_, i) => `-i build/seg${i}.mkv`).join(' ');
let filter = '';
let prevV = '[0:v]';
let offset = 0;
const starts = [0];
for (let i = 1; i < n; i++) {
	const fade = segments[i]?.quick ? QUICK : FADE;
	offset += durations[i - 1] - fade;
	starts.push(offset);
	filter += `${prevV}[${i}:v]xfade=transition=fade:duration=${fade}:offset=${offset.toFixed(3)}[v${i}];`;
	prevV = `[v${i}]`;
}
const total = offset + durations[n - 1];
filter += `${prevV}fade=t=out:st=${(total - 0.6).toFixed(3)}:d=0.6[vout]`;
run(
	`ffmpeg -v error -y ${inputs} -filter_complex "${filter}" -map "[vout]" -an -r ${FPS} ` +
		`-c:v libx264 -profile:v high -pix_fmt yuv420p -crf ${CRF} -preset slow -movflags +faststart out/${SLUG}-demo.mp4`,
);
run(`ffmpeg -v error -y -i out/${SLUG}-demo.mp4 -c:v libvpx-vp9 -b:v 0 -crf 42 -row-mt 1 -deadline good -cpu-used 2 -an out/${SLUG}-demo.webm`);

// Poster: the popup open over the Everest summit, its bookmarks with preview frames; cleaned up, no caption.
{
	const seg = segments[3];
	run(
		`ffmpeg -v error -y -ss 27.2 -i ${SRC} -loop 1 -i build/strip3.png -filter_complex "${compose(seg, 0, 'v').replace(/;$/, '')}" ` +
			`-map "[v]" -frames:v 1 out/${SLUG}-demo-poster.png`,
	);
	run(`cwebp -quiet -q 80 out/${SLUG}-demo-poster.png -o out/${SLUG}-demo-poster.webp`);
}

// Where each segment starts in the final video (for stills and checks).
fs.writeFileSync('build/timeline.json', JSON.stringify(segments.map((s, i) => ({ i, headline: s.headline, start: starts[i], length: durations[i], from: s.from, to: s.to, speed: s.speed })), null, 2));
for (const f of [`out/${SLUG}-demo.mp4`, `out/${SLUG}-demo.webm`, `out/${SLUG}-demo-poster.png`, `out/${SLUG}-demo-poster.webp`]) {
	console.log(f, (fs.statSync(f).size / 1e6).toFixed(2) + ' MB');
}
console.log('duration ≈', total.toFixed(1), 's');
