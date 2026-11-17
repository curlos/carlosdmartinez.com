// Trims the Playwright shots, adds two-line captions and highlights, joins them with crossfades, and exports
// MP4, WebM and a poster. Silent. Based on player-lens/edit.mjs (captions rendered as PNGs: Homebrew's ffmpeg
// has no drawtext), without the audio handling. Colours come from theme.mjs.
// Usage: node edit.mjs [crf]
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ACCENT, ACCENT_LIGHT, ACCENT_GLOW, LABEL_TEXT } from './theme.mjs';

const shots = JSON.parse(fs.readFileSync('raw/shots.json', 'utf8'));
const byName = Object.fromEntries(shots.map((s) => [s.name, s]));
const S = (name) => byName[name];
const FONTS = path.resolve('../../../src/assets/fonts');
const FADE = 0.5;
const QUICK = 0.25; // between two pieces of the same shot
const CRF = process.argv[2] || '26';
const FPS = 30;
const SLUG = 'murmur';
const END = 3.5; // end card seconds

const run = (cmd) => execSync(cmd, { stdio: ['ignore', 'ignore', 'inherit'] });
const out = (cmd) => execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const fileLength = (file) => Number(out(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${file}"`));

const home = S('home');
const compose = S('compose');
const edit = S('edit');
const activity = S('activity');
const profile = S('profile');
const news = S('news');
// Where compose's first caption hands over to the reply-settings caption (just before the click on the control).
const replyCut = compose && compose.repliesAt - 0.8;

// Segments in order. from/to are file seconds in that shot's recording. `quick` joins it to the previous piece
// with a 0.25 s cut; `cont` means it continues the same footage (it starts QUICK before the previous piece ends,
// so only the caption changes).
const segments = [
	home && { shot: 'home', from: home.start + 1.4, to: home.end - 0.9, headline: 'Murmur', detail: 'Short posts, real-time feeds' },
	compose && { shot: 'compose', from: compose.modalAt - 0.9, to: replyCut, headline: 'Post with images', detail: 'Up to 10, drag to reorder' },
	compose && { shot: 'compose', from: replyCut - QUICK, to: compose.postAt + 0.4, headline: 'Choose who can reply', detail: null, quick: true },
	compose && { shot: 'compose', from: compose.sentAt - 0.2, to: Math.min(compose.end, compose.liveAt + 1.5), headline: 'The feed updates live', detail: null, quick: true },
	edit && { shot: 'edit', from: edit.start + 0.8, to: edit.updatedAt + 0.6, headline: 'Edit posts', detail: null },
	edit && { shot: 'edit', from: edit.historyAt - 0.5, to: edit.end, headline: 'Edit history', detail: 'Every version is kept', quick: true },
	activity && { shot: 'activity', from: activity.quotesAt - 0.7, to: activity.likesAt + 1.4, headline: 'Quotes, reposts and likes', detail: null },
	profile && { shot: 'profile', from: profile.editAt - 0.5, to: profile.closedAt + 0.4, headline: 'Edit your profile', detail: 'Crop the banner in place' },
	news && { shot: 'news', from: news.start + 0.6, to: news.end - 0.5, headline: 'Latest news', detail: null },
]
	.filter(Boolean)
	.map((seg) => {
		const to = Math.min(seg.to, fileLength(S(seg.shot).file) - 0.1);
		const spots = (S(seg.shot).spots ?? [])
			.filter((sp) => sp.rect && sp.to > seg.from && sp.from < to)
			.map((sp) => ({ ...sp, from: Math.max(sp.from, seg.from), to: Math.min(sp.to, to) }))
			.filter((sp) => sp.to - sp.from > 0.6); // no slivers where a highlight overlaps a cut
		return { ...seg, to, spots };
	});

fs.rmSync('build', { recursive: true, force: true });
fs.mkdirSync('build');
fs.mkdirSync('out', { recursive: true });

// --- Overlays: captions (white headline, accent detail) and highlights ---
const escape = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const font = (f) => `data:font/ttf;base64,${fs.readFileSync(path.join(FONTS, f)).toString('base64')}`;
const INTER_700 = font('Inter-700.ttf');
const INTER_600 = font('Inter-600.ttf');
const overlayPage = (body) => `<!doctype html><html><head><style>
	@font-face{font-family:Inter;font-weight:700;src:url('${INTER_700}')}
	@font-face{font-family:Inter;font-weight:600;src:url('${INTER_600}')}
	html,body{margin:0;width:1920px;height:1080px;background:transparent;font-family:Inter;overflow:hidden}
	.cap{position:absolute;left:64px;display:flex;flex-direction:column;align-items:flex-start;gap:10px}
	.cap span{background:rgba(11,11,11,.78);padding:10px 18px;border-radius:6px}
	.h{color:#fff;font-weight:700;font-size:40px}
	.d{color:${ACCENT_LIGHT};font-weight:600;font-size:30px}
	.ring{position:absolute;border-radius:16px;box-shadow:0 0 0 9999px rgba(0,0,0,.5),0 0 0 3px ${ACCENT},0 0 28px 6px ${ACCENT_GLOW}}
	.label{position:absolute;background:${ACCENT};color:${LABEL_TEXT};font-weight:700;font-size:30px;padding:14px 22px;border-radius:10px;white-space:nowrap}
	.label:after{content:'';position:absolute;right:-16px;top:50%;margin-top:-14px;border:14px solid transparent;border-left:16px solid ${ACCENT};border-right:0}
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
			// Left of the ring, centred on it, but kept above the caption box at the bottom left.
			const top = Math.max(24, Math.min(770, y + h / 2 - 34));
			await render(
				`<div class="ring" style="left:${x - 8}px;top:${y - 8}px;width:${w + 16}px;height:${h + 16}px"></div>` +
					`<div class="label" style="right:${1920 - x + 36}px;top:${top}px">${escape(label)}</div>`,
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
	let filter = `[0:v]fps=${FPS},scale=1920:1080,setpts=PTS-STARTPTS[v0];`;
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
	filter += `[1:v]format=rgba${seg.quick ? '' : ',fade=t=in:st=0:d=0.4:alpha=1'}[cap];${prev}[cap]overlay=0:0:shortest=1,format=yuv420p[v]`;
	run(`ffmpeg -v error -y ${inputs}-filter_complex "${filter}" -map "[v]" -an -c:v libx264 -crf 14 -preset fast build/seg${i}.mp4`);
	durations.push(fileLength(`build/seg${i}.mp4`));
	console.log(`${String(i).padStart(2)} ${seg.shot.padEnd(9)} ${seg.from.toFixed(2)}→${seg.to.toFixed(2)} ${length.toFixed(1)}s  ${seg.headline}${seg.spots.length ? `  + highlight "${seg.spots[0].label}"` : ''}`);
});

// End card (rendered by endcard.mjs).
const n0 = segments.length;
run(`ffmpeg -v error -y -loop 1 -framerate ${FPS} -t ${END} -i endcard.png -vf "fade=t=in:st=0:d=0.4,format=yuv420p" -c:v libx264 -crf 14 -preset fast build/seg${n0}.mp4`);
durations.push(END);

// Join with crossfades; print where each segment starts in the final video (for stills).
const n = durations.length;
const inputs = durations.map((_, i) => `-i build/seg${i}.mp4`).join(' ');
let chain = '';
let prevV = '[0:v]';
let offset = 0;
const starts = [0];
for (let i = 1; i < n; i++) {
	const fade = segments[i]?.quick ? QUICK : FADE;
	offset += durations[i - 1] - fade;
	starts.push(offset);
	chain += `${prevV}[${i}:v]xfade=transition=fade:duration=${fade}:offset=${offset.toFixed(3)}[v${i}];`;
	prevV = `[v${i}]`;
}
const total = offset + durations[n - 1];
chain += `${prevV}fade=t=out:st=${(total - 0.6).toFixed(3)}:d=0.6[vout]`;
const timeline = segments.map((seg, i) => ({ i, shot: seg.shot, headline: seg.headline, start: +starts[i].toFixed(2), from: seg.from,
	spots: seg.spots.map((sp) => ({ label: sp.label, start: +(starts[i] + sp.from - seg.from).toFixed(2), end: +(starts[i] + sp.to - seg.from).toFixed(2) })) }));
timeline.push({ i: n0, shot: 'endcard', start: +starts[n0].toFixed(2) });
fs.writeFileSync('out/timeline.json', JSON.stringify(timeline, null, 2));

run(
	`ffmpeg -v error -y ${inputs} -filter_complex "${chain}" -map "[vout]" -an -r ${FPS} ` +
		`-c:v libx264 -profile:v high -pix_fmt yuv420p -crf ${CRF} -preset slow -movflags +faststart out/${SLUG}-demo.mp4`,
);
run(`ffmpeg -v error -y -i out/${SLUG}-demo.mp4 -an -c:v libvpx-vp9 -b:v 0 -crf 40 -row-mt 1 -deadline good -cpu-used 2 out/${SLUG}-demo.webm`);

// Poster: the new post at the top of the home feed, no caption.
const posterAt = compose ? [compose.file, Math.min(compose.end - 0.2, compose.liveAt + 1.2)] : [home.file, home.start + 1];
run(`ffmpeg -v error -y -ss ${posterAt[1].toFixed(2)} -i "${posterAt[0]}" -frames:v 1 -vf "scale=1920:1080" out/${SLUG}-demo-poster.png`);
run(`cwebp -quiet -q 80 out/${SLUG}-demo-poster.png -o out/${SLUG}-demo-poster.webp`);

for (const f of [`out/${SLUG}-demo.mp4`, `out/${SLUG}-demo.webm`, `out/${SLUG}-demo-poster.png`, `out/${SLUG}-demo-poster.webp`]) {
	console.log(f, (fs.statSync(f).size / 1e6).toFixed(2) + ' MB');
}
console.log('duration ≈', total.toFixed(1), 's');
