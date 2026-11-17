// Checks the raw takes (and optionally the final video) for capture stalls and missing sound.
// - freezedetect on every take; inside each freeze, the frame clock (record.mjs's 8x8 block near the bottom-left
//   corner, grey level stepping every 100 ms) is sampled: if it stops changing, OBS's capture stalled → retake.
// - volumedetect per take.
// Usage: node check.mjs            (raw takes)
//        node check.mjs final      (out/reelhouse-demo.mp4: freezes, silences, loudness)
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const out = (cmd) => execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 26 }).toString();
const freezes = (file) =>
	[...out(`ffmpeg -hide_banner -nostats -i "${file}" -vf freezedetect=n=0.001:d=1 -an -f null - 2>&1`).matchAll(
		/freeze_start: ([\d.]+)[\s\S]*?freeze_end: ([\d.]+)/g,
	)].map((m) => [Number(m[1]), Number(m[2])]);
const clock = (file, t) =>
	execSync(`ffmpeg -v error -ss ${t.toFixed(3)} -i "${file}" -frames:v 1 -vf crop=4:4:10:1036,scale=1:1 -f rawvideo -pix_fmt gray -`)[0];

if (process.argv[2] === 'final') {
	const file = 'out/reelhouse-demo.mp4';
	console.log('freezes:', JSON.stringify(freezes(file)));
	const sil = [...out(`ffmpeg -hide_banner -nostats -i ${file} -af silencedetect=n=-50dB:d=1.5 -vn -f null - 2>&1`).matchAll(
		/silence_start: ([\d.]+)[\s\S]*?silence_end: ([\d.]+)/g,
	)].map((m) => [Number(m[1]), Number(m[2])]);
	console.log('silences (-50 dB, 1.5 s):', JSON.stringify(sil));
	const r = out(`ffmpeg -hide_banner -nostats -i ${file} -af ebur128=peak=true -vn -f null - 2>&1`).split('Summary:')[1];
	console.log('ebur128:', r.replace(/\s+/g, ' ').trim());
	process.exit(0);
}

const shots = JSON.parse(fs.readFileSync('raw/shots.json', 'utf8'));
let bad = 0;
for (const s of shots) {
	const vol = out(`ffmpeg -hide_banner -nostats -i "${s.file}" -vn -af volumedetect -f null - 2>&1`);
	const mean = vol.match(/mean_volume: (\S+) dB/)?.[1];
	const max = vol.match(/max_volume: (\S+) dB/)?.[1];
	const stalls = [];
	const fr = freezes(s.file);
	for (const [a, b] of fr) {
		const samples = [];
		for (let t = a + 0.05; t < b - 0.02; t += 0.13) samples.push(clock(s.file, t));
		const changing = new Set(samples).size > 1;
		if (!changing) stalls.push([a, b]);
	}
	if (stalls.length) bad++;
	console.log(
		`${s.name.padEnd(8)} mean ${mean} dB, max ${max} dB | freezes ${JSON.stringify(fr.map(([a, b]) => [+a.toFixed(2), +b.toFixed(2)]))}` +
			` | STALLS ${stalls.length ? JSON.stringify(stalls) : 'none'}`,
	);
}
console.log(bad ? `${bad} take(s) stalled: retake them` : 'no capture stalls');
