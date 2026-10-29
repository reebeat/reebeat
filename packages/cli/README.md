# @reebeat/cli

The `reebeat` command and the only composition root (spec
[`docs/specs/0001-release-1-screenplay-to-deck-and-video.md`](../../docs/specs/0001-release-1-screenplay-to-deck-and-video.md),
design R3). It reads a Fountain file, chooses the adapters from the **selection**, and runs the build program
(`@reebeat/pipeline`) or the checks (`@reebeat/verify`) on them. `bin/reebeat.ts` provides only the platform (file system,
path, child processes, crypto); `src/adapters.ts` is the one place that imports an adapter.

```text
bun run reebeat plan    <story> [--json] [--timing] [--cache-dir <dir>] [selection flags]
bun run reebeat build   <story> --out <dir> [--cache-dir <dir>] [--refresh-speech] [--name <n>] [--capture-timeout <s>] [selection flags]
bun run reebeat check   <dir> --source <story> [--cache-dir <dir>] [selection flags]
bun run reebeat journey <story> [--out-root <dir>] [--cache-dir <dir>] [--refresh-speech] [selection flags]
bun run journey         # reebeat journey stories/same-id/story.fountain: build, check, build again, compare the two builds (F6)
```

Built with the installed `effect/cli` (`Command`, `Flag`, `Argument`; unstable, so `tsconfig.json` allows `effect/cli`).
Every expected failure prints one line on stderr, `Tag (line N): message` when the error has a source line, and the
process exits 1; a usage error prints the help and exits 1. No stack trace is printed.

| Command | What it does |
| --- | --- |
| `plan` | `readSource` then `buildPlan`; prints `reviewText` or, with `--json`, `encodePlan`. `--timing` also runs the speech stage **read-only** (it never refreshes) on the selected speech, aligner, encoder and cache, and schedules the Plan, so it shows frames |
| `build` | `buildProgram` on the selected adapters, then the summary: files, frames, sizes, and every adapter with its egress |
| `check` | refuses a directory without a valid `build.json` (`NotABuild`), then asks `@reebeat/verify` for one verdict per falsifier, prints them and exits 1 if any failed (a `N/A` verdict does not fail) |
| `journey` | build, `check`, build again, F6 compare; the first failure stops it |

## Selection

Which adapter fills each service is configuration, never a guess: `reebeat.config.json` beside the story (a JSON object,
optional), then the flags, which win. The keys and their choices are the registry in
`packages/services/src/selection.ts`; every key defaults to the local adapter.

| Key and flag | Choices | Default |
| --- | --- | --- |
| `speech` / `--speech` | `kokoro`, `silent` | `kokoro` |
| `aligner` / `--aligner` | `whisper`, `even` | `whisper` |
| `sounds` / `--sounds` | `synth` | `synth` |
| `renderer` / `--renderer` | `reveal` | `reveal` |
| `capturer` / `--capturer` | `chromium` | `chromium` |
| `encoder` / `--encoder` | `ffmpeg` | `ffmpeg` |
| `cache` / `--cache` | `fs` | `fs` |

`--cache-dir` is the directory of the `fs` cache (default: `speech-cache` beside the story; it is not a key of the
config file). `--name` defaults to the name of the story's directory. `--capture-timeout` is the capture's deadline in
seconds (default: 120 plus 0.2 per frame; it does not change a frame, so it is not part of any cache key).

- An unknown key or value (in the file or a flag) fails `UnknownSelection` naming the key, the value and the choices; a
  file that is not a JSON object fails `ConfigInvalid`. Nothing is built.
- A selected adapter whose model, binary or credential is missing fails `AdapterUnavailable` naming the requirement on its
  first use (a cache hit needs no model). There is no fallback: selecting `kokoro` without its model never produces a
  `silent` build.
- A stand-in narrator (`--speech silent`) fills a missing speech asset by itself; Kokoro does only with
  `--refresh-speech`. The assets carry the adapter's id in their key, so a stand-in's never stand in for a real voice's.
  Use `--cache-dir` for a stand-in build so the committed `speech-cache` is left alone.
- The summary of `build` and `journey` lists each adapter as `Service: id, egress: none` for a local one, or
  `egress: integration, sends script text` for one that sends something out. The credential of such an adapter is read
  from the environment by the adapter and appears nowhere (`test/provider.test.ts`).

## The build directory

```text
<out>/plan.json   <out>/deck.html   <out>/assets/**   <out>/<name>.mp4   <out>/<name>.vtt   <out>/build.json
```

`assets/sfx/<name>.wav` holds only the sounds the Plan's Cues play; the speech cache's FLACs are **not** part of a build.
`build.json` (schema 2, `@reebeat/pipeline`) lists every other file, the hash of the `.fountain` bytes, the adapters with
egress and settings, and the provenance of each cache asset used. It is written last. Failure is loud (F12): the build
writes into `<out>.partial`, and any failure leaves no directory that `check` accepts (see the pipeline README).

## Files

| File | Role |
| --- | --- |
| `bin/reebeat.ts` | the composition root: the platform services and the arguments; the only file that runs an Effect |
| `src/cli.ts` | the commands and flags, `run(args)` |
| `src/adapters.ts` | the registry: one table per key of the selection (typed over its choices), `Composition` (how a selection becomes Layers; a `Context.Reference` tests replace) |
| `src/selection.ts` | `reebeat.config.json` and the flags, decoded with the services' `decodeSelection` |
| `src/plan.ts`, `src/build.ts`, `src/check.ts`, `src/journey.ts` | one program each |
| `src/source.ts`, `src/manifest.ts`, `src/report.ts`, `src/errors.ts` | story name and cache defaults, reading `build.json` for `check`, the one-line failure report, the CLI's own errors |
| `src/verifier.ts`, `src/verify.ts` | the `Verifier` service and its adapter to `@reebeat/verify` |

## Tests

`bun run test` in this directory. They run the real `run(args)` on the real file system, the real reveal.js Renderer
and a real ffmpeg, with the offline stand-ins for narration; Chromium and the verification are fakes the test chooses
(`Composition`), except in `offline.test.ts`.

| File | Proves |
| --- | --- |
| `plan.test.ts` | the review text and JSON, determinism, the hash of a file with a byte-order mark, `--timing` read-only, one mutation per Plan error class stops with its tag and line (F10, F12) |
| `build.test.ts` | the files, the manifest (adapters, egress, provenance) and the frame count of a finished build; the cache directory; the config file and a flag over it; the F12 controls (a miss, a failing capture, a refused output directory): no `<out>` and no `<out>.partial` |
| `selection.test.ts` | F14: an unknown value or key is `UnknownSelection` naming the choices, from a flag or the file, in every command; a missing model or credential is `AdapterUnavailable` or `SpeechCacheMiss` and no stand-in output replaces it |
| `provider.test.ts` | F16: a test-only hosted adapter that needs `FAKE_PROVIDER_KEY`: without it nothing is written; with a canary as the key the build succeeds, lists the egress, and the canary is in no file, key, manifest, plan or output; controls that the search finds a leak and that a secret-named setting is refused |
| `offline.test.ts` | F15: the whole build with `--speech silent --aligner even` on the real deck, Chromium and ffmpeg, then `check`: F1 (next, focus and the audible sfx), F2, F3, F4, F5, F7, F9 pass and only F8 says `N/A (silent stand-in)`; also the capture lags on a small deck (`lags.fountain`), moved here from the capture adapter |
| `check.test.ts` | `check` refuses a directory without a valid `build.json`; verdict rows; `N/A`; exit code |
| `journey.test.ts` | build, check, build, compare in order; the first failure stops the journey |
| `cli.test.ts` | help, version, usage errors exit non-zero and run nothing |
| `speechCache.test.ts` | the committed speech cache against the committed story (no stale or unused asset) |
