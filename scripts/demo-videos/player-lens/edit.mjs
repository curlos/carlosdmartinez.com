// Trims the OBS shots, adds two-line captions and sidebar highlights, joins them with video + audio crossfades,
// normalises loudness, and exports MP4, WebM and a poster. Based on statly/edit.mjs, but keeps the sound.
// Cuts never land mid-line: record.mjs logs when each commentary line starts and how long its voice clip is.
// Captions and highlights are rendered as transparent PNGs in the browser (Homebrew's ffmpeg has no drawtext).
// Usage: node edit.mjs [crf]
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const shots = JSON.parse(fs.readFileSync('raw/shots.json', 'utf8'));
const byName = Object.fromEntries(shots.map((s) => [s.name, s]));
const FONTS = path.resolve('../../../src/assets/fonts');
const FADE = 0.5;
const QUICK = 0.25; // the cut inside the live shot that skips the wait while the agents write
const CRF = process.argv[2] || '27';
// Matches the OBS recording: the pitch is constant motion, which looks noticeably smoother at 60 than 30.
const FPS = 60;
const TAIL = 0.5; // a beat after a line ends, before a cut

const run = (cmd) => execSync(cmd, { stdio: ['ignore', 'ignore', 'inherit'] });
const out = (cmd) => execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const fileLength = (file) => Number(out(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${file}"`));
const hasAudio = (file) => out(`ffprobe -v error -select_streams a -show_entries stream=index -of csv=p=0 "${file}"`).trim() !== '';
const S = (name) => byName[name];
// The take's voiced line matching a pattern: { at, dur, text } in file seconds.
const clip = (shot, pattern) => S(shot)?.clips?.find((c) => pattern.test(c.text));
const after = (c, pad = TAIL) => c.at + c.dur + pad;

// The recap is one long clip: end after its first sentence, at the pause that follows it (found by silencedetect
// near where the sentence should end, given its share of the text).
function recapFirstSentenceEnd({ recapAt, recapText, recapDuration, file, end }) {
	if (recapAt == null || !recapText || !recapDuration) return end;
	const first = recapText.match(/^.*?[.!?](\s|$)/)?.[0] ?? recapText;
	const guess = recapAt + (recapDuration * first.length) / recapText.length;
	const log = out(`ffmpeg -v info -ss ${(guess - 2).toFixed(2)} -t 4 -i "${file}" -map 0:a -af silencedetect=noise=-32dB:d=0.18 -f null - 2>&1 || true`);
	const pauses = [...log.matchAll(/silence_start: ([\d.]+)[\s\S]*?silence_end: ([\d.]+)/g)].map((m) => ({
		start: guess - 2 + Number(m[1]),
		end: guess - 2 + Number(m[2]),
	}));
	const pause = pauses.sort((a, b) => Math.abs(a.start - guess) - Math.abs(b.start - guess))[0];
	if (!pause) return guess + 0.25;
	// The crossfade into the end card starts FADE before the cut, so the whole fade has to fit in the pause.
	return Math.min(pause.end - 0.05, pause.start + FADE + 0.1);
}

// Moves a cut that would land inside a voiced line: the start goes back to just before the line, the end waits for
// it to finish (or, at the end of a take, moves to just before it). Repeats until no cut is inside a line (a later line can start while waiting for an earlier one).
function letLinesFinish(shot, from, to) {
	const s = S(shot);
	const max = fileLength(s.file) - 0.1;
	for (let changed = true; changed; ) {
		changed = false;
		for (const c of s.clips ?? []) {
			if (c.at < from && from < c.at + c.dur) {
				from = Math.max(0, c.at - 0.3);
				changed = true;
			}
			if (c.at < to && to < c.at + c.dur + 0.1) {
				// Wait for the line if the take runs long enough; otherwise cut just before it starts.
				to = after(c) <= max ? after(c) : c.at - 0.2;
				changed = true;
			}
		}
	}
	return [from, to];
}

// Segments in order. from/to are file seconds in that shot's recording.
const live = S('live');
const liveLine = live?.clips?.find((c) => c.at >= live.lineAt - 0.3);
const segments = [
	S('intro') && {
		shot: 'intro', from: S('intro').start, to: S('intro').end,
		headline: 'Player Lens: follow one player, not the ball', detail: 'Built for the Microsoft x Premier League hackathon',
	},
	S('counterpress') && {
		shot: 'counterpress',
		from: (clip('counterpress', /loses ball/)?.at ?? S('counterpress').start + 3) - 2,
		to: after(clip('counterpress', /counters/) ?? { at: S('counterpress').end - 1, dur: 0 }),
		headline: 'Every rating change explains itself', detail: 'Lima loses the ball (-0.08), then counterpresses to win it back (+0.30)',
	},
	S('equaliser') && {
		shot: 'equaliser', from: S('equaliser').start + 0.4,
		to: after(clip('equaliser', /Goal!/i) ?? { at: S('equaliser').start + 11, dur: 0 }, 1.2),
		headline: 'A personal AI commentator, voiced live', detail: "Lima's 39th-minute equaliser",
	},
	S('trace') && {
		shot: 'trace', from: S('trace').lineAt - 1, to: (S('trace').spots?.[0]?.to ?? S('trace').lineAt + 11) + 0.5,
		headline: '5 AI agents + a code Fact Guard wrote this line', detail: 'Every line is checked against the match event log',
	},
	S('winner') && {
		shot: 'winner', from: S('winner').start + 0.4,
		to: after(clip('winner', /Goal!/i) ?? { at: S('winner').start + 10, dur: 0 }, 1),
		headline: 'The 89th-minute title winner', detail: 'Rating 8.9',
	},
	// Two pieces: switching to Analyst + ES (the current line replays in Spanish), then a quick cut to the goal.
	S('analyst-es') && {
		shot: 'analyst-es', from: S('analyst-es').start + 0.3, to: (S('analyst-es').spots?.at(-1)?.to ?? S('analyst-es').start + 7) + 0.3,
		headline: 'Same moment: Analyst, in Spanish', detail: null,
	},
	S('analyst-es') && clip('analyst-es', /Golazo/i) && {
		shot: 'analyst-es', from: clip('analyst-es', /Golazo/i).at - 3, to: after(clip('analyst-es', /Golazo/i), 0.8),
		headline: 'Same moment: Analyst, in Spanish', detail: null,
		quick: true,
	},
	live && {
		shot: 'live', from: live.clickAt - 0.4, to: (live.writingAt ?? live.clickAt + 1) + 3.5,
		headline: 'Click any of 22 players: AI agents write a new minute live', detail: 'then it is cached for every viewer',
	},
	live && {
		shot: 'live', from: live.lineAt - 0.4, to: after(liveLine ?? { at: live.lineAt, dur: 4 }, 1),
		headline: 'Click any of 22 players: AI agents write a new minute live', detail: 'A few seconds later: the new minute, voiced',
		quick: true,
	},
	S('all-ratings') && {
		shot: 'all-ratings', from: S('all-ratings').start + 0.3, to: S('all-ratings').start + 7,
		headline: "Every player's live rating", detail: null,
	},
	S('recap') && {
		shot: 'recap', from: S('recap').start + 0.8, to: recapFirstSentenceEnd(S('recap')),
		headline: 'A spoken full-time recap', detail: 'Microsoft Foundry  |  Agent Framework  |  Azure AI Speech  |  Azure Container Apps',
		keepCut: true, // ends mid-recap on purpose, after the first sentence
	},
]
	.filter(Boolean)
	.map((seg) => {
		const [from, to] = seg.keepCut ? [seg.from, seg.to] : letLinesFinish(seg.shot, seg.from, seg.to);
		// Highlights recorded in this shot that overlap the segment, clipped to it.
		const spots = (S(seg.shot).spots ?? [])
			.filter((sp) => sp.rect && sp.to > from && sp.from < to)
			.map((sp) => ({ ...sp, from: Math.max(sp.from, from), to: Math.min(sp.to, to) }));
		return { ...seg, from, to, spots };
	});

fs.rmSync('build', { recursive: true, force: true });
fs.mkdirSync('build');
fs.mkdirSync('out', { recursive: true });

// --- Overlays: captions (white headline, green detail, like the original video) and highlights ---
// Highlight: the rest of the frame dimmed, the box ringed in lime, a label pointing at it from the left.
const escape = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
// Embedded as data URLs: a page set with setContent can't load fonts from file:// paths.
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
	.d{color:#a3e635;font-weight:600;font-size:30px}
	.ring{position:absolute;border-radius:16px;box-shadow:0 0 0 9999px rgba(0,0,0,.5),0 0 0 3px #a3e635,0 0 28px 6px rgba(163,230,53,.45)}
	.label{position:absolute;background:#a3e635;color:#0b0f17;font-weight:700;font-size:30px;padding:14px 22px;border-radius:10px;white-space:nowrap}
	.label:after{content:'';position:absolute;right:-16px;top:50%;margin-top:-14px;border:14px solid transparent;border-left:16px solid #a3e635;border-right:0}
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
			await render(
				`<div class="ring" style="left:${x - 8}px;top:${y - 8}px;width:${w + 16}px;height:${h + 16}px"></div>` +
					`<div class="label" style="right:${1920 - x + 36}px;top:${y + h / 2 - 34}px">${escape(label)}</div>`,
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
	const audio = hasAudio(s.file);
	if (!audio) console.warn(`${seg.shot}: no audio track in ${s.file}; using silence`);
	const loop = (png) => `-loop 1 -framerate ${FPS} -t ${length.toFixed(3)} -i ${png} `;
	// Inputs: 0 the take, 1 the caption, then one per highlight, then silence if the take has no audio.
	let inputs = `-ss ${seg.from.toFixed(3)} -to ${seg.to.toFixed(3)} -i "${s.file}" ` + loop(`build/cap${i}.png`);
	let filter = `[0:v]fps=${FPS},scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x18181b[v0];`;
	let prev = '[v0]';
	seg.spots.forEach((sp, k) => {
		inputs += loop(`build/spot${i}_${k}.png`);
		const st = sp.from - seg.from;
		const en = sp.to - seg.from;
		// A highlight that continues another (the page moved under it) cuts straight over instead of fading.
		const fades = [
			!seg.spots[k - 1] || seg.spots[k - 1].to < sp.from ? `fade=t=in:st=${st.toFixed(3)}:d=0.3:alpha=1` : null,
			!seg.spots[k + 1] || seg.spots[k + 1].from > sp.to ? `fade=t=out:st=${Math.max(st, en - 0.3).toFixed(3)}:d=0.3:alpha=1` : null,
		].filter(Boolean);
		filter += `[${k + 2}:v]${['format=rgba', ...fades].join(',')}[s${k}];`;
		filter += `${prev}[s${k}]overlay=0:0:shortest=1:enable='between(t,${st.toFixed(3)},${en.toFixed(3)})'[v${k + 1}];`;
		prev = `[v${k + 1}]`;
	});
	// The caption fades in over 0.4 s, except across the quick cut inside the live shot, where it just continues.
	filter += `[1:v]format=rgba${seg.quick ? '' : ',fade=t=in:st=0:d=0.4:alpha=1'}[cap];${prev}[cap]overlay=0:0:shortest=1,format=yuv420p[v];`;
	if (!audio) inputs += `-f lavfi -t ${length.toFixed(3)} -i anullsrc=r=48000:cl=stereo `;
	filter += `[${audio ? '0' : seg.spots.length + 2}:a]aresample=48000,aformat=channel_layouts=stereo[a]`;
	run(`ffmpeg -v error -y ${inputs}-filter_complex "${filter}" -map "[v]" -map "[a]" -c:v libx264 -crf 14 -preset fast -c:a pcm_s16le build/seg${i}.mkv`);
	durations.push(length);
	console.log(`${String(i).padStart(2)} ${seg.shot.padEnd(12)} ${length.toFixed(1)}s${seg.spots.length ? `  + highlight "${seg.spots[0].label}"` : ''}`);
});

// End card: endcard.png is rendered by endcard.mjs; silent audio so the crossfade has something to fade into.
const n0 = segments.length;
run(
	`ffmpeg -v error -y -loop 1 -framerate ${FPS} -t 4 -i endcard.png -f lavfi -t 4 -i anullsrc=r=48000:cl=stereo ` +
		`-vf "fade=t=in:st=0:d=0.4,format=yuv420p" -c:v libx264 -crf 14 -preset fast -c:a pcm_s16le -shortest build/seg${n0}.mkv`,
);
durations.push(4);

// Join: xfade for picture, acrossfade with the same length for sound, so the two stay aligned.
const n = durations.length;
const inputs = durations.map((_, i) => `-i build/seg${i}.mkv`).join(' ');
let videoChain = '';
let audioChain = '';
let prevV = '[0:v]';
let prevA = '[0:a]';
let offset = 0;
for (let i = 1; i < n; i++) {
	const fade = segments[i]?.quick ? QUICK : FADE;
	offset += durations[i - 1] - fade;
	videoChain += `${prevV}[${i}:v]xfade=transition=fade:duration=${fade}:offset=${offset.toFixed(3)}[v${i}];`;
	audioChain += `${prevA}[${i}:a]acrossfade=d=${fade}[a${i}];`;
	prevV = `[v${i}]`;
	prevA = `[a${i}]`;
}
const total = offset + durations[n - 1];

// Loudness: measure the joined audio, then apply one fixed gain to reach -16 LUFS. One-pass loudnorm acts like
// an automatic volume control (it lifted the crowd between lines and flattened the voice), so it isn't used.
// The limiter only catches the odd peak above -1 dBFS.
const measured = out(
	`ffmpeg -hide_banner -nostats ${inputs} -filter_complex "${audioChain}${prevA}ebur128=framelog=quiet[m]" -map "[m]" -f null - 2>&1`,
);
const lufs = Number(measured.match(/I:\s+(-?[\d.]+) LUFS/g).at(-1).match(/-?[\d.]+/)[0]);
const gain = -16 - lufs;
console.log(`loudness ${lufs} LUFS → gain ${gain.toFixed(1)} dB`);

let filter = videoChain + audioChain;
filter += `${prevV}fade=t=out:st=${(total - 0.6).toFixed(3)}:d=0.6[vout];`;
filter += `${prevA}volume=${gain.toFixed(2)}dB,alimiter=limit=-1dB:level=false,afade=t=out:st=${(total - 0.6).toFixed(3)}:d=0.6[aout]`;

run(
	`ffmpeg -v error -y ${inputs} -filter_complex "${filter}" -map "[vout]" -map "[aout]" -r ${FPS} ` +
		`-c:v libx264 -profile:v high -pix_fmt yuv420p -crf ${CRF} -preset slow -c:a aac -b:a 160k -ar 48000 ` +
		`-movflags +faststart out/player-lens-demo.mp4`,
);
run(
	`ffmpeg -v error -y -i out/player-lens-demo.mp4 -c:v libvpx-vp9 -b:v 0 -crf 40 -row-mt 1 -deadline good -cpu-used 2 ` +
		`-c:a libopus -b:a 96k out/player-lens-demo.webm`,
);

// Poster: the 39th-minute goal banner, without a caption.
const eq = S('equaliser');
const goal = clip('equaliser', /Goal!/i);
run(`ffmpeg -v error -y -ss ${((goal?.at ?? eq.start + 9) + 1).toFixed(2)} -i "${eq.file}" -frames:v 1 -vf "scale=1920:1080" out/player-lens-demo-poster.png`);

for (const f of ['out/player-lens-demo.mp4', 'out/player-lens-demo.webm', 'out/player-lens-demo-poster.png']) {
	console.log(f, (fs.statSync(f).size / 1e6).toFixed(2) + ' MB');
}
console.log('duration ≈', total.toFixed(1), 's');
