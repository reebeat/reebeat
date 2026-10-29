# 4EM regression baseline (recorded for a later release)

Status: **record, not a plan to build now.** Date: 2026-10-28.

The first reebeat prototype was a motion-graphic explainer pipeline (Remotion, hand-written actions). Release 1 is
screenplay-first ([design R2](keyframe-engine.md#r2-2026-10-28-screenplay-first-fountain-to-deck-and-video),
[spec 0001](../specs/0001-release-1-screenplay-to-deck-and-video.md)). A later release will build reebeat's own motion
engine as a renderer plug-in and use a **pixel-identical port of the existing 4EM explainer** as its regression test.
This file keeps what was measured while that port was the plan, so the later spec starts from facts, not memory.

The 4EM story sources, narration, audio, alignment and the reference video are course-derived and stay **outside** this
public repository. Only hashes, counts and measurements are recorded here.

## The reference and how it was pinned

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


### What the baseline experiments showed

| Experiment (2026-10-28) | Result | Consequence |
|---|---|---|
| Legacy `remotion still` for frames 2142, 4557, 7998, 13250, two separate processes each | PNG SHA-256 equal across the two runs for all 4 frames | Chromium rendering of the legacy composition is deterministic on this machine for these frames |
| The same stills against the decoded reference frames (`rgb24`) | differing pixels 95.5% to 98.7% of the frame; PSNR 35.9 to 41.9 dB | A render-domain image can never equal a decoded reference frame: the reference passed through JPEG capture, x264 (CRF 22) twice. Equality must be tested **at the same stage** (below) |
| `libx264 -preset veryfast -crf 22` over 900 decoded reference frames, `-threads 6` twice | decoded MD5 equal across the two runs | The encoder is deterministic at a fixed thread count |
| The same with `-threads 2` and `-threads 1` | three different MD5 values | Thread count changes the bytes: the pinned render recipe fixes `-threads` |
| Remotion `DEFAULT_VIDEO_IMAGE_FORMAT` in the installed renderer | `jpeg` for video, `png` for stills | Video frames reach the encoder as JPEG; stage-A comparison uses PNG on both sides, stage B uses the whole chain |


## Comparison metric proposed then

For two frame sequences $A$, $B$ of equal length $N$ and size $W\times H$ in the same pixel format, the frame difference of frame $i$ is $d_i = |\{p : A_i[p] \ne B_i[p]\}| / (W H)$, counting a pixel as different if any sample differs ($\tau = 0$). The verdict is $\max_i d_i = 0$ with $N = 13{,}572$ on both sides. Fallback only if a legacy-versus-reference noise floor above zero is measured first: twice that floor, capped at $0.001$. Equality must be tested at the same pipeline stage (render domain with PNG on both sides, or the whole encoded chain), never a render-domain image against a decoded reference frame.

## Recipe of the legacy render (for the later spec to reproduce)

Five chunks (`0-2999`, `3000-5999`, `6000-8999`, `9000-11999`, `12000-13571`), Remotion `--codec=h264 --crf=22`, concat with `-c copy`, CFR transcode (`setpts=N/(30*TB)`, `-r 30`, `-frames:v 13572`, `libx264 -preset veryfast -crf 22 -threads 6 -pix_fmt yuv420p`, AAC 192k 48 kHz stereo), then mux with `mov_text` captions and chapters whose milliseconds are `round(startFrame * 1000 / 30)`.
