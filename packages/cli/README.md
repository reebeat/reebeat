# @reebeat/cli

The `reebeat` command and the only composition root of release 1 (spec
[`docs/specs/0001-release-1-screenplay-to-deck-and-video.md`](../../docs/specs/0001-release-1-screenplay-to-deck-and-video.md)).
It reads a Fountain file, calls the packages in order and writes a build directory. Nothing else decides which Layer
answers a service: `bin/services.ts` picks the Node platform, ffmpeg, Chromium and the verification; the `--refresh-speech`
flag picks the speech Layer.

```text
bun run reebeat plan  <story> [--json] [--timing] [--cache <dir>]
bun run reebeat build <story> --out <dir> [--cache <dir>] [--refresh-speech] [--name <n>] [--capture-timeout <s>]
bun run reebeat check <dir> --source <story>
bun run journey            # build stories/same-id, check it, build it again, compare the two builds (F6)
```

Built with the installed `effect/cli` (`Command`, `Flag`, `Argument`; unstable, so `tsconfig.json` allows `effect/cli`).
Every expected failure prints one line on stderr, `Tag (line N): message` when the error has a source line, and the
process exits 1; a usage error prints the help and exits 1. No stack trace is printed.

| Command | What it does |
| --- | --- |
| `plan` | `readSource` (bytes hashed with Effect's `Crypto`, text decoded without removing a byte-order mark) then `buildPlan`; prints `reviewText` or, with `--json`, `encodePlan`. `--timing` also reads the speech cache **read-only** (`speechCacheOnly`) and schedules the Plan, so it shows frames |
| `build` | story, hash, Plan, speech, Timeline, `plan.json`, deck, sounds, capture and mux, `build.json`, rename; see below |
| `check` | refuses a directory without a valid `build.json` (`NotABuild`), then asks `@reebeat/verify` for one verdict per falsifier, prints them and exits 1 if any failed |

`--cache` defaults to `speech-cache` beside the story and `--name` to the name of the story's directory.
`--capture-timeout` is the capture's deadline in seconds (default: 120 plus 0.2 per frame, from `@reebeat/video`).

## The build directory

```text
<out>/plan.json   <out>/deck.html   <out>/assets/**   <out>/<name>.mp4   <out>/<name>.vtt   <out>/build.json
```

`assets/sfx/<name>.wav` holds only the sounds the Plan's Cues play; the speech cache's FLACs are **not** part of a build.
`build.json` is `{ files: [{ bytes, path, sha256 }], schema: 1, sourcePath, sourceSha256 }`: every other file of the
directory, sorted, and the hash of the `.fountain` bytes. It is written last.

**F12, failure is loud.** The build writes into `<out>.partial` and renames it to `<out>` after `build.json` is in.
Any failure (a typed error of any stage, or an interrupt) removes `<out>.partial`, so no directory that `check` accepts
is left. An earlier build at `<out>` is removed before the new one starts; a non-empty directory with no `build.json`
is not touched (`OutputDirOccupied`). Typed errors of the stages (`SpeechCacheMiss`, `CaptureTimeout`, `BrowserFailed`,
`DeckMismatch`, ...) surface unchanged.

## Files

| File | Role |
| --- | --- |
| `bin/reebeat.ts`, `bin/journey.ts`, `bin/services.ts` | the composition roots and the layers they share; the only files that run an Effect |
| `src/cli.ts` | the commands and flags, `run(args)` |
| `src/plan.ts`, `src/build.ts`, `src/check.ts`, `src/journey.ts` | one program each |
| `src/source.ts`, `src/manifest.ts`, `src/report.ts`, `src/errors.ts` | reading the story, `build.json`, the one-line failure report, the CLI's own errors |
| `src/verifier.ts`, `src/verify.ts` | the `Verifier` service and its adapter to `@reebeat/verify` |

## Tests

`bun run test` in this directory. They run the real `run(args)` on the real file system and a real ffmpeg; only Chromium
(a browser that returns one small PNG, or never answers) and the verification (verdicts the test chooses) are fakes.

| File | Proves |
| --- | --- |
| `plan.test.ts` | the review text and JSON, determinism, the hash of a file with a byte-order mark, `--timing` read-only, one mutation per Plan error class stops with its tag and line (F10, F12) |
| `build.test.ts` | the files, the manifest and the frame count of a finished build; replacing an earlier build; the F12 controls: a cache entry deleted from a copy of the committed cache (`SpeechCacheMiss` naming the Line), a capture past its deadline (`CaptureTimeout`), a browser failure, an interrupt: no `<out>` and no `<out>.partial`; F5 build side: one changed narration word changes the notes, the subtitles, the narration audio file and the hash in every output together |
| `check.test.ts` | `check` refuses a directory without a valid `build.json`; verdict rows; exit code |
| `journey.test.ts` | build, check, build, compare in order; the first failure stops the journey |
| `cli.test.ts` | help, version, usage errors exit non-zero and run nothing |
