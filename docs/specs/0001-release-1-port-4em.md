# 0001 Release 1: a pixel-identical port of the 4EM explainer

Status: **plan** (frozen when its PR opens; revisions are dated entries at the end). Date: 2026-10-28.
Design: [`docs/design/keyframe-engine.md`](../design/keyframe-engine.md) (sections 3, 4, 8 steps b and c, 10 items 6 and 8, and its Revisions). Vocabulary: [`GLOSSARY.md`](../../GLOSSARY.md). Process: [spec 0000](0000-development-lifecycle.md).

## Goal

Render the existing 4EM explainer **through reebeat** and obtain a video whose every frame, caption, chapter mark and audio sample equals the pinned reference video. Nothing about the picture may change: this release proves that the new engine (Story, Beat, Keyframe, identity diff, Plan, Timeline, `frameState`) reproduces today's behaviour exactly, so that release 2 can change the motion scene by scene against a trusted baseline (design section 8, steps d to f).

## Journey

A developer with the private 4EM fixture on disk runs, from the repository:

```text
REEBEAT_FIXTURE_4EM=<fixture dir>             # outside the repository; see "Where things live"
bun run reebeat plan    4em                   # the Plan for review (terraform-plan style); no audio, no browser
bun run reebeat prepare 4em                   # Timeline (timeline.json), captions, chapters, narration track
bun run reebeat render  4em --out <dir>       # chunks -> concat -> CFR transcode -> mux -> 4em-port.mp4
bun run reebeat compare 4em <dir>/4em-port.mp4   # every falsifier below, one verdict per falsifier
```

and sees `compare` print `PASS` for F1 to F9 with the measured values. The same four commands run on the public synthetic fixture (`fixtures/synthetic`, invented content, no course material) in CI up to the parts that need a browser.

## Scope

In scope:

- The **core** (`packages/core`): Story, Scene, Beat, Keyframe, Element types; the **compat adapter** `compileActions` that turns today's actions (`reveal`, `hide`, `morph`, `focus`, `unfocus`, `camera`, `ripple`) into Beats (design 8, step b); the identity diff and the **Plan** (`plan`, `reebeat plan`); the **schedule** stage (word anchors to integer frames); the **Timeline** (`PreparedStory`); `frameState(story, frame)`; the contrast model and gate; the pure parts of geometry and easing.
- The **Remotion adapter** (`packages/adapter-remotion`): the current `Diagram`/`Shape`/`LinkShape`/`Root` drawing, reading `FrameState` instead of replaying actions (design 8, step c).
- The **pipeline** (`packages/pipeline`): prepare (captions, chapters, narration concatenation from pinned clips), chunked render, concat, CFR transcode, mux; the **reference pin** and the **comparators**.
- The **CLI** (`packages/cli`): `plan`, `prepare`, `render`, `compare`, `contrast`, `ref pin|verify`.
- A public **synthetic fixture** that exercises every action kind, with its own pinned goldens, so CI proves everything that does not need the private fixture or a browser.

Non-goals (each is a later spec):

- New motion: exits, tweened morphs, label swap, `draw` on elements, `order` (design 8, step d); ELK layout (step e); deleting the action path (step f). `hide` stays a hard cut, `morph` and `camera` stay snaps, `focus` stays instant.
- Regenerating narration or alignment. Kokoro TTS, whisper.cpp alignment and `emit` (script, storyboard, SRT, VTT documents) stay in the legacy pipeline; their **outputs** are pinned inputs. The port reads them.
- A Deck Rendering, the HyperFrames adapter, a second renderer, publishing to npm, a licence for this repository.
- Course content in this repository: the 4EM Story sources, narration text, audio, alignment and the reference video stay outside it.

## Where things live

| Thing | Location | Why |
|---|---|---|
| Engine, adapters, pipeline, CLI, comparators, synthetic fixture, specs | this repository | public, no course material |
| 4EM Story sources (scenes, narration text, citations), pinned audio and alignment, legacy oracle manifests | the private fixture directory (`REEBEAT_FIXTURE_4EM`), outside this repository | course-derived text and audio |
| Reference video and its sidecar files | outside this repository, pinned here by SHA-256 and counts only | course-derived, 13.75 MB |
| Legacy pipeline (the code release 1 must reproduce) | a private study repository, pinned by commit | origin of the behaviour; read only |

The fixture directory has one contract (`reebeat.fixture.json` + a Story module + pinned inputs); the CLI takes a fixture, never a hard-coded path. No CI job can read the private fixture, so F1 to F9 on it are run locally and reported in the PR as hashes, counts and frame indices, never as course text.

## The reference and how it is pinned

Measured on 2026-10-28 with `ffprobe`/`ffmpeg` 9.0.1 (Lavf 63.1.101) on the reference file, and with the legacy code at the pinned commit:

| Fact | Value (measured) |
|---|---|
| `4em.mp4` SHA-256 | `fa56ca63e7e14ba9a09f40a705ebafabe2809610e564f45bc4b1d1c004c5cab6` (13,754,191 bytes) |
| Video | H.264 High, 1920x1080, `yuvj420p` (full range, `bt470bg`), 30/1 fps, **13,572 frames** (`-count_frames` = `nb_frames` = `nb_read_frames`), 452.400 s |
| Audio | AAC, 48 kHz, stereo; decoded PCM MD5 `046a9419d84faab296d8a2ceaac61355` |
| Captions | one `mov_text` stream, **97 captions**; SHA-256 of the 97 `pts,duration` lines (non-empty packets) `aad585baf549ab198ddcc9668d8f988facc7a4174db47b9668858d5e583ccebb` |
| Chapters | **15** (`mov` chapter atoms, `1/1000` timebase); start in ms = `round(startFrame * 1000 / 30)`; first 0, last end 452,400 |
| Per-frame hashes | `ffmpeg -i 4em.mp4 -map 0:v:0 -f framemd5`: 13,572 lines; SHA-256 of the lines `dts,pts,duration,size,hash` `96b19d22e535ec92ad63140cf6ffda0353fab330db448b364e6261e89bdc37f1`; frame 0 as `rgb24` MD5 `be62c685d7a67d722357a74d6112613e` |
| Encoder tags | `Lavc63.1.101 libx264` (video), `Lavf63.1.101` (container) |
| Legacy source | commit `6c1fec44fdeb4d4d534ed93514e0d792427a7b66` of the private study repository; `work/explainers/src` tree `0d0eb99919bb68ccde16a461a1dd028a5d9b2eb4`, `work/explainers/scripts` tree `fc12abac34b5b045f01502e92bc892d9166084ab` |
| Legacy inputs | `package.json` `25f43e0c0ae0ae1a585815f2657f6ce989364ef996ede68aa1940c86bd36beab`; `bun.lock` `5eab2020975dc70e43323104b892e00aaeb75ef60c2c0f0c64e6c64e3df29569`; `words.json` `ef46ec3060a33cfb5823c8330d594a9505a50f23667fac03aba26502638254f1`; `audio.json` `3709b01d30855bfab12d12eaf3712bfc1663eb605516f7b8f89db0c04909b93d`; prepared `timeline.json` `1c447834ef65a8fde0b7cca4dfa0945dae49bae9224a315029e4afee410c4845`; `narration.wav` `3b9a13569ea729c1fd43c053bf9faeddbf930fd77802413c70f24eb00cc96010`; alignment model `ggml-base.en.bin` `a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002` |
| Toolchain | Remotion 4.0.539 (`@remotion/renderer`, `transitions`, `layout-utils` the same), Chromium 155.0.8059.39, Bun 1.3.13, TypeScript 7.0.2, `@fontsource/inter` 5.3.0, ffmpeg 9.0.1 |
| Content counts | 15 scenes, 97 beats, **193 actions** (117 `reveal`, 37 `focus`, 12 `unfocus`, 11 `hide`, 15 `morph`, 1 `ripple`); `reveal` styles: 36 `draw`, 18 `pop`, 7 `slide`, 5 `fade`, 1 `type`, 50 plain; 138 elements, 56 links, 36 element kinds; scene start frames `0, 878, 1564, 2135, 2776, 3465, 4825, 5670, 6645, 7839, 8925, 9889, 11026, 12718, 13348`; crossfade 15 frames |

`reebeat ref pin` writes these into `reference.json` in the fixture directory and `reebeat ref verify` recomputes and compares them before every `compare`; a mismatch stops the run (a moved reference cannot pass silently).

### What the baseline experiments showed (shapes the metric)

| Experiment (2026-10-28) | Result | Consequence |
|---|---|---|
| Legacy `remotion still` for frames 2142, 4557, 7998, 13250, two separate processes each | PNG SHA-256 equal across the two runs for all 4 frames | Chromium rendering of the legacy composition is deterministic on this machine for these frames |
| The same stills against the decoded reference frames (`rgb24`) | differing pixels 95.6% to 99.1% of the frame; PSNR 35.9 to 41.9 dB | A render-domain image can never equal a decoded reference frame: the reference passed through JPEG capture, x264 (CRF 22) twice. Equality must be tested **at the same stage** (below) |
| `libx264 -preset veryfast -crf 22` over 900 decoded reference frames, `-threads 6` twice | decoded MD5 equal across the two runs | The encoder is deterministic at a fixed thread count |
| The same with `-threads 2` and `-threads 1` | three different MD5 values | Thread count changes the bytes: the pinned render recipe fixes `-threads` |
| Remotion `DEFAULT_VIDEO_IMAGE_FORMAT` in the installed renderer | `jpeg` for video, `png` for stills | Video frames reach the encoder as JPEG; stage-A comparison uses PNG on both sides, stage B uses the whole chain |

## Falsifiers

Metric. For two frame sequences $A$, $B$ of equal length $N$ and size $W\times H$ in the same pixel format, the **frame difference** of frame $i$ is $d_i = |\{p : A_i[p] \ne B_i[p]\}| / (W H)$, counting a pixel as different if **any** sample differs (tolerance $\tau = 0$). The **verdict** is $\max_i d_i = 0$ with $N = 13{,}572$ on both sides. The report lists $N$, $\max_i d_i$, the count of frames with $d_i > 0$ and the first five such indices. `compare` also prints PSNR per differing frame, for diagnosis only.

Pre-registered fallback, usable only if milestone M0 measures a legacy-versus-reference noise floor above zero: the threshold becomes $\max_i d_i \le \max(\text{measured noise floor}) \times 2$, capped at $0.001$ (the ratio in design 8 step c), recorded as a dated Revision with the measurement before it is used. Without that Revision the threshold is zero.

| # | Falsifier (must hold on the 4EM fixture) | Check | Negative control (must fail, and does so at the stated place) |
|---|---|---|---|
| F1 | **Frames, encoded domain.** All 13,572 decoded frames of `4em-port.mp4` equal the pinned reference (`framemd5` lines, and on a mismatch a pixel diff), metric above, same pixel format `yuvj420p` | `compare` stage B | (a) Shift one `reveal` anchor by +1 frame in a copy of the fixture: F1 fails and the first differing index is that action's frame. (b) Re-encode with `-threads 2`: F1 fails on the byte level, showing the check is sensitive to the encoder |
| F2 | **Frames, render domain.** All 13,572 PNG frames from the port equal the PNG frames from the legacy composition at the pinned commit (manifest of per-frame SHA-256 in the fixture), metric above | `compare` stage A (also runs on a frame sample in the synthetic fixture) | Change `pop` to `fade` for one element: fails at that element's first frame; flip one pixel in one PNG of a scratch copy: fails with $d_i = 1/(WH)$ at that index |
| F3 | **Model equivalence.** For every frame $0 \le f < 13{,}572$ and every Scene layer, `frameState` agrees with the legacy replay (visible set, per-element reveal age, opacity, scale, slide offset, type length, link draw offset, merged element state, focused set, dim set, camera, ripple link) | differential test with the legacy replay transcribed as the test oracle (pure, no browser, seconds) | Same mutations as F1(a) and F2: the test names the frame and the property |
| F4 | **Anchors.** All 193 action start frames, 15 scene start frames, 15 durations and the total 13,572 equal the pinned `timeline.json` | `compare` | Edit one `on:` phrase to a different word: fails naming the beat and action |
| F5 | **Captions.** 97 captions, and the SHA-256 of their `pts,duration` lines equals `aad585ba...`; text equals the pinned SRT | `compare` | Move one caption start by 1 ms or drop one: fails naming the caption number |
| F6 | **Chapters.** 15 chapters, titles and `start`/`end` in ms equal the reference | `compare` | Change one title character or one boundary by 1 ms: fails naming the chapter |
| F7 | **Audio.** Decoded PCM MD5 of the audio stream equals `046a9419...` and the narration track is the concatenation the pinned clips and gaps imply | `compare` | Offset the narration by one sample: fails |
| F8 | **Contrast and layout.** `reebeat contrast` reports 0 failures on 15 scenes, 32 palette tokens, 49 token pairs, 112 beat states (the numbers legacy reports), every link-label pill clear of shapes and other pills, and the 6 pixel-check crops stay between 11.26:1 and 15.23:1 | `reebeat contrast`, `pixelcheck` port | Darken one palette ink to a ratio below 4.5: exits non-zero naming the pair |
| F9 | **Purity and determinism.** `packages/core` imports no `react`, `react-dom`, `remotion`, `@remotion/*`, `playwright`, DOM global or Node built-in; `frameState` is idempotent, order-independent over shuffled frames and its output survives a JSON round trip unchanged; `compile` run twice gives equal JSON | package `dependencies` (a forbidden package is not installable in `core`), lint restriction, property tests (design P3, P10) | Add `import "remotion"` to a core file: lint and the import-scan test fail |
| F10 | **Plan.** `plan(story)` is pure, holds no frame numbers, lists every Element id exactly once or in the unchanged count, and matches the checked-in Plan golden of the synthetic fixture (and of 4EM in the fixture directory) | property test (P11), golden test | Add an Element to one Keyframe: the golden diff shows one `+` line |

F3, F9 and F10 and the synthetic-fixture versions of F2 and F4 to F7 run in CI. F1, F2 and F4 to F8 on the 4EM fixture run locally with the private fixture and are reported in the PR as counts and hashes.

### Measurement protocol and budget

- Heavy jobs follow the machine rule: read live memory, PSI, load, disk and free space before each render and stop at the floors the legacy render script uses (MemAvailable below 12 GiB after the job's demand, or full memory PSI above 25% on two samples). The legacy script estimates 4.5 GiB per worker; `reebeat render` reuses that gate.
- Render recipe, fixed and recorded in `reference.json`: five chunks (`0-2999`, `3000-5999`, `6000-8999`, `9000-11999`, `12000-13571`), `--codec=h264 --crf=22`, concat with `-c copy`, CFR transcode as in the legacy handoff (`setpts=N/(30*TB)`, `-r 30`, `-frames:v 13572`, `libx264 -preset veryfast -crf 22 -threads 6 -pix_fmt yuv420p`, AAC 192k 48 kHz stereo), then the mux with `mov_text` captions and the chapters. Concurrency is not part of the recipe because it changes capture parallelism, not frame content; F1 is the check that this holds, and M0 measures it (concurrency 1 and 4 on a frame range that produces identical stills).

## Module layout

```text
packages/core/                 @reebeat/core: no react, remotion, DOM or Node built-ins
  src/story.ts                 Story, Scene, Beat, Keyframe, Element, When, Anchor types; Schema decoders for the plain-JSON boundary
  src/compat/actions.ts        legacy action types (structural) and compileActions(scene): Beat[] (design 8, step b)
  src/plan.ts                  identity join: classify enter | exit | update | replace; Plan; review text (plain, pure)
  src/schedule.ts              anchors -> integer frames against aligned words; windows; budget checks (errors: Effect)
  src/timeline.ts              PreparedStory (plain JSON): tracks of segments
  src/frame-state.ts           frameState(story, frame): FrameState (plain, pure; no Effect)
  src/easing.ts, interpolate.ts   plain; numerically identical to the legacy interpolate/Easing.out(cubic) (tested against Remotion's in the adapter package tests)
  src/contrast.ts, geometry.ts    pure parts only (pointOnBorder, outline, label pill sizes); measuring text stays in the adapter
packages/adapter-remotion/     @reebeat/adapter-remotion: React, Remotion, @remotion/layout-utils, transitions
  src/Diagram.tsx, Root.tsx    drawing from FrameState; TransitionSeries crossfade stays here
packages/pipeline/             @reebeat/pipeline: services over ffmpeg/ffprobe and the renderer
  src/captions.ts, chapters.ts, narration.ts, mux.ts, render.ts, reference.ts, compare/{frames,captions,chapters,audio}.ts
packages/cli/                  @reebeat/cli: the `reebeat` command; the only composition root
fixtures/synthetic/            invented Story exercising every action kind, pinned inputs, goldens
tools/quality/                 from spec 0000
```

Dependency direction: `cli` to `pipeline` and `adapter-remotion` to `core`. `core` depends on `effect` only. The adapter and pipeline never import each other except through types in `core`.

### Where Effect is used and where it is not

The operator allowed Effect v4 in the core (design Revisions 2026-10-28). The rule is `effect-first`: pure stays pure.

| Stays a plain function | Uses Effect |
|---|---|
| easing, interpolators, `classify`/`plan`, `frameState`, sampling, schedule arithmetic, geometry, contrast math, the comparators' metric | `Schema` decoding of every JSON boundary (alignment, style, `PreparedStory`, `reference.json`, fixture manifest); tagged errors for expected failures (`PhraseNotFound`, `BudgetExceeded`, `IdentityError`, `AlignmentBelowThreshold`, `ReferenceMismatch`); services for what has authority or a dependency: `FixtureSource` (reads the fixture), `Alignment` (word times), `MediaTools` (ffmpeg/ffprobe through `ChildProcess`), `FrameRenderer` (the Remotion adapter's render), `ReferenceStore` (pins); `Layer`s per platform in the CLI; `Scope` for temporary directories and child processes; the render pipeline as one Effect program with resource-safe cleanup |

`frameState` returns plain data and imports no service: it is called once per frame inside Chromium by the adapter, so it must not pull the Effect runtime into every frame render path beyond what plain imports of `effect/Array`-style helpers need; the core keeps `frame-state.ts` free of `effect` imports (design P10).

## Milestones, in order, each green before the next

| M | Work | Green means (command) |
|---|---|---|
| M0 | **Pin and baseline.** `ref pin`; run the legacy pipeline at the pinned commit twice (same machine): compare each result to the reference and to each other; produce the legacy PNG oracle (per-frame SHA-256) and the legacy `framemd5`; check capture determinism at concurrency 1 and 4 on a range | pins verify; the measured noise floor is written into this spec as a Revision (zero, or the fallback of "Falsifiers") |
| M1 | **Comparators with their controls.** Frame, caption, chapter and audio comparators; synthetic reference video generated from the synthetic fixture | each comparator passes on identical input and fails on each negative control; CI green |
| M2 | **Core model.** story types, `compileActions`, `plan`, schedule, `PreparedStory`, `frameState`, the differential test (F3) against the transcribed legacy replay, F9, F10 | `bun run test` green; F3 over all 13,572 frames of 4EM locally |
| M3 | **Prepare.** captions, chapters, narration concatenation, anchor frames from pinned alignment | F4 to F7 (except frames) pass locally; synthetic versions in CI |
| M4 | **Adapter.** `Diagram` drawing from `FrameState`; stage A on a sample of frames in every scene and on every action's first frame, then on all frames | F2 on the sample, then on all 13,572 |
| M5 | **Full render and mux.** The recipe above; F1 | `reebeat compare 4em` prints PASS for F1 to F10 |
| M6 | **Close.** `STATE.md`, `README.md` and this spec's Revisions; PR | `bun run ready` green; PR body reports F1 to F10 with negative controls |

Every milestone is committed on the branch as Conventional Commits; the PR opens when M5 passes.

## Risks

| Risk | Likelihood and effect | Mitigation |
|---|---|---|
| The legacy chain does not reproduce its own reference (M0 shows a noise floor above zero: different machine state, thread count, Chromium update) | medium; F1 cannot be zero | M0 measures it before any port work; the pre-registered fallback; F2 and F3 still pin the engine exactly |
| Float differences between Remotion's `interpolate` and the core's own easing change an SVG attribute by one ulp and a pixel by one level | medium | the interpolators copy Remotion's formula and are tested bit-equal against it over a grid; F3 compares every derived number as the exact value; F2 localises any difference |
| JPEG capture and x264 make stage B sensitive to the smallest drawing difference | certain by design | that sensitivity is the point; stage A and F3 localise a failure before a 30-minute render |
| A full legacy or port render takes long and loads the machine | high | admission gate before each render; chunked and resumable; M4 samples before the full runs; renders are the only heavy job |
| The legacy drawing code reads state through React hooks and memoisation in ways `FrameState` must reproduce (draw order, `type` length rounding, ripple index) | medium | F3 transcribes the legacy replay as an executable oracle and compares every frame before any pixel is drawn |
| The private fixture cannot be used by CI | certain | synthetic fixture and goldens in CI; local run reported in the PR as hashes and counts; the operator may later host the fixture privately (open question 1) |
| Remotion licence eligibility for a public repository | authority fork | open question 2; pinned to 4.0.539 meanwhile; no Remotion code is published to npm |
| Course text leaking into the public repository through test names, goldens, error messages or the PR body | medium | fixture-derived goldens stay in the fixture directory; reports carry hashes, counts and indices; gitleaks plus the reviewer's conformance check |

## Open questions for the operator

1. **Fixture hosting.** The 4EM Story, pinned audio and alignment, and the legacy oracle manifests live in a local directory outside the repository. Should they move into a private GitHub repository (`reebeat/fixture-4em`, an external effect needing your authority) so a future CI runner or collaborator can use them, or stay local?
2. **Remotion licence.** Release 1 adds Remotion 4.0.539 (custom licence: free for an individual, a company of up to three people, or a non-profit) and `@remotion/transitions` (metadata says `UNLICENSED`, docs say Remotion License) to a public repository. Confirm eligibility for the whole life of the repository (design Open question 4) so it can be recorded.
3. **Fallback threshold.** If M0 shows a non-zero noise floor, is "twice the measured floor, at most 0.001 of the pixels" acceptable, or must the port wait until the legacy chain is made deterministic?
4. **Package scope.** Packages are named `@reebeat/*` (the npm org is reserved); nothing is published. Confirm the scope or give another.

## Revisions

- **2026-10-28, plan written.** First text of this spec. Effect v4 is allowed in the core by the operator's design revision of the same date; module layout and the Effect table above follow it.
