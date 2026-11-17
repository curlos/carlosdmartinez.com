---
name: demo-video
description: Make or re-make a scripted demo video for a project page on this portfolio (record the live app with Playwright, or with OBS when the app has sound; caption, highlight, cut, export, wire into the site). Use whenever the user asks for a demo video, a re-recording, or changes to an existing one.
---

# Demo videos for project pages

Two finished examples live in `scripts/demo-videos/`:

- `statly/`: silent, Playwright's own recorder.
- `player-lens/`: with sound, OBS driven over obs-websocket.

Copy the closer one and adapt it. Each folder runs the same pipeline from inside that folder:
`record.mjs → endcard.mjs → edit.mjs`. Each writes `raw/` (takes + `shots.json`), `build/` (temp) and `out/` (final).
All three are gitignored.

**Use `player-lens/edit.mjs` as the edit template even for silent videos.** Statly's `edit.mjs` uses ffmpeg
`drawtext`, which Homebrew's ffmpeg doesn't have, and its font folder is gone. Player Lens renders captions as PNGs
instead, which works with any ffmpeg.

## Which recorder

| Project | Sound? | Recorder | Notes |
|---|---|---|---|
| Statly | none | Playwright `recordVideo` | done |
| Player Lens | AI commentary + crowd | OBS | done |
| Sneaker Palace | none | Playwright | done; monochrome accents |
| Murmur (formerly Twitter 2.0) | none | Playwright | done; Persimmon accents, NBA account, ≤60 s / <10 MB for the README |
| ReelHouse (formerly Netflix 2.0) | none: the app embeds every trailer with `mute=1` and has no unmute button | OBS (picture only; no audio track in the export) | done; violet accents `#8B5CF6` / `#A78BFA`. Needs the display at 1x so the 1.5x zoom doesn't stack |
| Markback | none (the user didn't want any) | OBS take recorded by hand by the user, cleaned up in the edit | done; indigo accents `#5b5bd6` / `#7b7bf0`. Chrome extension; see below |
| Panelyze | n/a | none planned | the user doesn't expect a video |

- **No sound:** use Playwright. It is far simpler: no OBS, nothing for the user to set up, headless-capable, and
  frames are exact.
- **Sound:** use OBS. Playwright can't record audio, so OBS records the window and its sound into one file, which
  can't drift out of sync.

## Workflow (agree each step with the user before the expensive ones)

1. **Study the app first:** open it, read its source for selectors, find the moments worth showing and how to reach
   each one reliably, for example app controls, chips, URLs or seeds.
2. **Propose a shot list** as a table, and wait for approval. Columns: shot, what happens, caption headline / detail,
   seconds, highlight (if any). Target about 60–90 s; the user accepted 106 s for Player Lens once every line could
   finish. If anything costs money (live AI generation), say roughly how much.
3. **Mock up the captions and highlights** (render a still or two) when the look is new, and get a yes.
4. **Record**, then **edit**, then run the **verification checklist** below, and only then hand it over.
5. **Wire it into the site** (see the end) and run build + tests.

The user found Player Lens took too many rounds. Most of the rounds were defects a check would have caught: a frozen
picture, a silent take, a misplaced highlight. **Run every check below before showing the user anything.**

## Recording (both recorders)

- **UI at 1.5×, sharp at 1920×1080:** viewers watch in a small player or on a phone, so lay the page out at 1280×720
  CSS px. Use Chrome's own default page zoom of 150% in a fresh profile (see `sneaker-palace/record.mjs`): new
  headless with `channel: 'chromium'` and a 1920×1080 viewport for Playwright, or the same zoom in the OBS profile
  (`netflix-2/record.mjs`). `deviceScaleFactor` + `recordVideo`, CDP screencast and `--force-device-scale-factor`
  all came out at 1280 px and soft. Coordinates stay in CSS px; multiply highlight rects by 1.5. Check a 100% crop.
- **Full-bleed app, nothing personal:**
  - Playwright: `newContext({ viewport: 1920x1080, recordVideo })`.
  - OBS: `launchPersistentContext` on a fresh temp profile with `--app=<url>`, so there are no tabs, address bar
    or bookmarks.
  - Use guest/demo accounts (Statly: `/demo`).
- **Visible cursor:** inject a dot via an init script (copy from either `record.mjs`). Move it with
  `glide`/`clickHuman`, which use stepped mouse moves, a press and a pause, so clicks read as human.
- **One file per shot.** Each shot has:
  - `prepare()`: off camera; seeks, toggles, waits for data.
  - `run(at)`: what the camera sees.

  `shots.json` stores `{name, file, start, end, ...marks}`, where marks are seconds into the file. Examples are when
  a line started or where a highlight goes. `edit.mjs` cuts on those marks, never on guessed offsets.
- **`node record.mjs <shot> …` re-records only the named shots** and keeps the others' entries. Keep that, so
  retakes are cheap.
- **Reach moments through the app's own controls,** not pixel guesses. Examples: goal chips, the slider at
  `t/duration` plus arrow-key nudges, rating-log rows. Dev-only hooks don't exist on the live site.
- **Locators:**
  - Use roles and accessible names.
  - Scope text searches to the right region. In Player Lens, "Weber" also matched the rating log.
  - Auto-hiding controls cover buttons, so use keyboard shortcuts (blur, then Space) or hover before clicking.
- **Wait for state, not time:** wait for the line, chip or panel to appear. Fixed `pause()`s are for pacing only.
- **Highlight boxes are measured during the take** with `boundingBox()`, never typed in. Re-measure after any click
  that can change layout. Analyst mode added a line above the toggles and moved them 33 px. Store each position as
  its own spot (`from`, `to`, `rect`); the edit cuts the ring over when the page moves.

## Recording with OBS (sound)

**One-time setup by the user** (the env template is `player-lens/env.example`):

- OBS → Tools → WebSocket Server Settings: enabled, with a password. The password goes in the folder's `.env`
  (gitignored) as `OBS_PASSWORD`. **Never read or print it.**
- A scene with:
  - **macOS Screen Capture → Window** (`OBS_SOURCE`);
  - **macOS Audio Capture** (`sck_audio_capture`, Desktop Audio);
  - Mic muted.
- Canvas and output 1920×1080, 60 fps, MKV.

**What `player-lens/record.mjs` already handles, which a new script should keep:**

- **Browser sound:**
  - `ignoreDefaultArgs: ['--mute-audio', '--enable-automation']`, because Playwright mutes by default.
  - `--autoplay-policy=no-user-gesture-required`, needed for Netflix trailers.
- **Window:** resized via CDP `Browser.setWindowBounds` so the page is exactly `WIN`. The OBS source is re-pointed at
  this run's window by its title, because every run opens a new window. The title bar is cropped and the page scaled
  to fill the canvas through `SetSceneItemTransform`.
- **Audio capture restart:** at the start of every run, change a setting on each `sck_audio_capture` input and set it
  back. **macOS audio capture goes silent with no error when the output device changes** (AirPods connecting). One
  take came out silent from exactly that.
- **Silent takes are rejected:** after each take, `ffmpeg volumedetect` runs on the file, and the script stops if the
  max is below −60 dB.
- **Start/stop:** wait for the `RecordStateChanged` STARTED/STOPPED events, and before starting, wait until
  `outputActive` is false. Back-to-back starts fail with 500.
- **Line timing:** log when each voiced line appears (an init script polls the line element; a response listener
  reads audio durations), so the edit can let every line finish.

**OBS window capture can stall for seconds while the page keeps running.** Player Lens lost six seconds of picture
during a goal animation while the audio carried on. Check every take for this (see verification), and retake the
shot; it can't be fixed in the edit.

**Notes for the next sound projects:**

- **Markback (Chrome extension on YouTube):** scripted recording didn't work, so the user recorded one OBS take by
  hand and `markback/edit.mjs` cut it on hand-picked times.
  - In an automated browser (Playwright Chromium with the unpacked extension, fresh profile) YouTube's player fails
    with "Something went wrong" 25-45 s into playback, even after a reload, and seeks freeze the picture.
  - The popup is a native window: Playwright's recorder misses it, page automation can't click in it, and at 150% zoom
    it's clipped (Chrome caps popups at 600 px tall). Use 100% zoom and OBS Display capture.
  - Claude in Chrome shows a debugger bar and an orange glow while its tools run; never have them on camera.
  - The edit rebuilds each frame from pieces (page content, toolbar icon, popup) on a flat background, so the address
    bar, avatar, masthead and Shorts sidebar never show.
- **ReelHouse:** check the app's own embed before promising sound. Its trailers are `mute=1` with no unmute button, so
  the video is silent. An OBS "sound" check passed once only because the user's white-noise app was playing; a take with
  the output device changed (or the headphone jack) is digitally silent (-91 dB), which is also the sign of a dead capture.
  Park the mouse above the grid before a take: over a poster (even the edge column) the hover card opens.

## Editing (`edit.mjs`)

- **Segments** are `{shot, from, to, headline, detail, quick?, keepCut?}`, built from the `shots.json` marks.
- **Captions:**
  - Two lines: a white headline plus a detail line in **the demoed site's own accent colour**, never another
    project's. Lime `#a3e635` is Player Lens only. Others: ReelHouse `#8B5CF6` / `#A78BFA`, Murmur `#F0532B` / `#FF7A52`,
    Sneaker Palace monochrome (black and white pills). Keep it in one theme constant (`theme.mjs`), which also drives
    the highlight ring, label and end-card URL.
  - Rendered to transparent 1920×1080 PNGs in Playwright, with Inter embedded as base64 data URLs (otherwise it falls
    back to a serif). The fonts are in `src/assets/fonts/`.
  - **Every caption in the same place: bottom, `bottom:72px`.** Never move one, not even for an intro overlay; the
    user called mixed positions out.
- **Highlights (spots), used sparingly:**
  - At most one per shot, three or four per video, only where the viewer would otherwise miss the point. Player Lens
    used one each for the rating-log reasons, the Fact Guard step, the Analyst/ES toggles and "agents writing this
    minute".
  - The look: dim the frame `rgba(0,0,0,.5)`, a rounded ring in the site's accent with a glow around the rect, and an
    accent label pointing at it from the side.
  - 0.3 s alpha fades. Consecutive spots for the same target cut straight over, and each overlay uses
    `enable='between(t,…)'`.
- **Transitions:**
  - `xfade` for picture with an `acrossfade` of the same length for sound, 0.5 s.
  - 0.25 s (`quick`) between two segments that share a caption.
  - The end card gets generated silence.
- **Never cut a voiced line.** `letLinesFinish()` moves cut points to line boundaries. If a take is too short for its
  last line, cut before that line starts.
- **Cut sound in pauses:** to stop after a sentence, `silencedetect` near the estimated end, and keep the crossfade
  inside the pause.
- **Loudness: measure, then apply one fixed gain** to −16 LUFS, plus `alimiter` at −1 dBFS.
  - **Never one-pass `loudnorm`:** it works like automatic gain control and made the commentator sound like a phone
    (loudness range 19.6 → 13.4 LU).
  - Target: the result's loudness range stays close to the raw takes'.
- **End card** (`endcard.mjs`):
  - Content: icon, name, one line of context, and the **live demo URL, not the GitHub URL**.
  - Background `#18181b`, Inter, 4 s, fades out with sound.
- **Exports:**
  - `out/<slug>-demo.mp4`: H.264 high, yuv420p, `+faststart`, AAC 160k for sound.
  - `out/<slug>-demo.webm`: VP9 crf ~40, Opus 96k.
  - A poster PNG of the most telling frame, without a caption.
  - Convert the poster with `cwebp -q 80` into `public/posters/<slug>-demo.webp`.
  - The WebM is listed first and Chrome picks it, so check it isn't much bigger than the MP4.

## Verification checklist (run all of it before handing over)

Claude can't hear or watch the video, so check with measurements and stills, then ask the user to listen.

1. **Frozen picture:** `ffmpeg -i X -vf freezedetect=n=0.001:d=1 -an -f null -` on every raw take and on the final.
   - For each freeze, decide whether it is meant to be still (intro screen, recap card, end card).
   - Otherwise, read an on-screen clock in frames before and after. If the clock jumps, the capture stalled; retake.
   - A dimmed highlight can trip the detector without being a freeze, so check the clock there too.
2. **Sound present** (OBS):
   - `volumedetect` per take: mean around −20 dB; −91 dB means silent.
   - `silencedetect=n=-50dB:d=1.5` on the final: silence only where intended.
3. **Loudness:** `ebur128` on the final. I ≈ −16 LUFS, true peak ≤ −1 dBFS, loudness range close to the raw takes'.
4. **Lines finish:** compare each segment's cut points with the logged line `at + dur`.
5. **Look:** contact sheets (frames every few seconds), plus stills of every caption and every highlight. For a
   highlight, take stills before and after each click inside it.
6. **Length and size:** report both. Player Lens was 106 s and about 10 MB; Statly is about 6–7 MB.
7. **Hand over** with what was checked, and what only the user can judge: voice quality, pacing.

## Wiring into the site

- Copy the MP4 and WebM to `public/videos/` and the poster WebP to `public/posters/`.
- In `src/data/projects.ts`, add `video: { mp4, webm, poster, width: 1920, height: 1080 }` to the project, like the
  Statly and Player Lens entries.
- `TopMedia` in `src/app/projects/[slug]/page.tsx` renders it: `controls`, `preload="none"`, not `muted`, so sound
  plays when pressed.
- Run `npm run build` and the Playwright suite. The first run after a fresh build can time out on cold image
  optimization; rerun before concluding anything.
- **Never commit or push.** The user does that, and only after watching the video.

## Gotchas collected so far

- **Headless:** Edge crashed on video playback. Use headed Chromium, or Chrome for Testing for OBS takes.
- **Network:** downloading binaries such as `ffmpeg-static` gets blocked. Use Homebrew's `/opt/homebrew/bin/ffmpeg`;
  it may not be on `PATH`. Node is under `~/.nvm`.
- **Changing modes or languages replays the current line**, and seeking stops it. Let the line finish before the
  next action.
- **Live AI generation:** each new player-minute caches for every visitor, so a retake needs a new candidate. Keep a
  used-candidates file, and check that the shot actually showed the generating state; warn if it didn't.
- **Auto-hiding controls and overlays move:** measure, don't assume.
