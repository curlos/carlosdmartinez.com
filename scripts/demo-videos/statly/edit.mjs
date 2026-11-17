// Trims the raw shots, adds captions, joins with fades, and exports MP4, WebM and a poster.
// Usage: node edit.mjs [crf]
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const shots = JSON.parse(fs.readFileSync('raw/shots.json', 'utf8'));
const byName = Object.fromEntries(shots.map((s) => [s.name, s]));
const FONT_SEMI = 'font/extras/ttf/Inter-SemiBold.ttf';
const FADE = 0.5;
const CRF = process.argv[2] || '27';

// Segments in order: [shot name, trim start offset, trim end offset, captions]
// Each caption is [text, from, to] in seconds from the segment start (to = null means until the end).
const segments = [
	['01-stats', 0, 0, [['Statly: analytics for your TickTick focus records', 0, 6], ['Synced from TickTick, charted in one dashboard', 6, null]]],
	['04-rings', 0, 0, [['Daily goal rings with streaks', 0, null]]],
	['02a-medals', 0, 0, [['Medals and challenges for focus and task milestones', 0, null]]],
	['02b-challenges', 0, 0, [['Medals and challenges for focus and task milestones', 0, null, 'noFade']]],
	['03-emotions', 0.3, 0, [['Emotions are AI-tagged from each focus note', 0, 6], ['Filter by emotion, sort by emotional intensity', 6, null]]],
	['05-search', 0, 0, [['Search and filter every focus record', 0, null]]],
	['06-completed', 0, 0, [['Completed tasks, grouped by day and project', 0, null]]],
];
// Medals and challenges share a caption, so they're joined with a quick cut instead of a fade.
const QUICK_CUT_BEFORE = segments.findIndex(([name]) => name === '02b-challenges');

const run = (cmd) => execSync(cmd, { stdio: ['ignore', 'ignore', 'inherit'] });
fs.rmSync('build', { recursive: true, force: true });
fs.mkdirSync('build');
fs.mkdirSync('out', { recursive: true });

const captionFilters = (captions, i, length) =>
	captions
		.map(([text, from, to, mode], j) => {
			const file = `build/cap${i}_${j}.txt`;
			fs.writeFileSync(file, text);
			const end = to ?? length + 1;
			const alpha = mode === 'noFade' ? '1' : `'if(lt(t-${from},0.4),(t-${from})/0.4,1)'`;
			return (
				`drawtext=fontfile=${FONT_SEMI}:textfile=${file}:fontsize=40:fontcolor=white:` +
				`box=1:boxcolor=0x0b0f17@0.72:boxborderw=24:x=72:y=h-th-84:alpha=${alpha}:` +
				`enable='between(t,${from},${end})'`
			);
		})
		.join(',');

const durations = [];
segments.forEach(([name, a, b, captions], i) => {
	const s = byName[name];
	const start = s.start + a;
	const end = s.end - b;
	run(
		`ffmpeg -v error -y -ss ${start.toFixed(3)} -to ${end.toFixed(3)} -i ${s.file} ` +
			`-vf "fps=30,scale=1920:1080,${captionFilters(captions, i, end - start)},format=yuv420p" -an -c:v libx264 -crf 14 -preset fast build/seg${i}.mp4`
	);
	durations.push(end - start);
});

// End card: endcard.png is rendered by endcard.mjs (logo + name + URL)
run(
	`ffmpeg -v error -y -loop 1 -framerate 30 -t 4 -i endcard.png ` +
		`-vf "fade=t=in:st=0:d=0.4,format=yuv420p" -c:v libx264 -crf 14 -preset fast build/seg${segments.length}.mp4`
);
durations.push(4);

// Join with crossfades
const n = durations.length;
const inputs = durations.map((_, i) => `-i build/seg${i}.mp4`).join(' ');
let filter = '';
let prev = '[0:v]';
let offset = 0;
for (let i = 1; i < n; i++) {
	const fade = i === QUICK_CUT_BEFORE ? 0.2 : FADE;
	offset += durations[i - 1] - fade;
	const outLabel = i === n - 1 ? '[vout]' : `[x${i}]`;
	filter += `${prev}[${i}:v]xfade=transition=fade:duration=${fade}:offset=${offset.toFixed(3)}${outLabel};`;
	prev = `[x${i}]`;
}
filter += `[vout]fade=t=out:st=${(offset + durations[n - 1] - 0.6).toFixed(3)}:d=0.6[final]`;

run(
	`ffmpeg -v error -y ${inputs} -filter_complex "${filter}" -map "[final]" -an -r 30 ` +
		`-c:v libx264 -profile:v high -pix_fmt yuv420p -crf ${CRF} -preset slow -movflags +faststart out/statly-demo.mp4`
);
run(
	`ffmpeg -v error -y -i out/statly-demo.mp4 -an -c:v libvpx-vp9 -b:v 0 -crf 40 -row-mt 1 -deadline good -cpu-used 2 out/statly-demo.webm`
);

// Poster: clean frame from the opening shot (no caption)
const first = byName['01-stats'];
run(`ffmpeg -v error -y -ss ${(first.start + 1.5).toFixed(2)} -i ${first.file} -frames:v 1 out/statly-demo-poster.png`);

const total = offset + durations[n - 1];
for (const f of ['out/statly-demo.mp4', 'out/statly-demo.webm', 'out/statly-demo-poster.png']) {
	console.log(f, (fs.statSync(f).size / 1e6).toFixed(2) + ' MB');
}
console.log('duration ≈', total.toFixed(1), 's');
