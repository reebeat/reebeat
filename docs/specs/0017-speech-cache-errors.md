# 0017 The two speech-cache errors say what to do

Status: **plan** (frozen when its PR opens; revisions are dated entries at the end). Date: 2026-10-30. Decided by: the operator's authorisation of 2026-10-30 to fix problems found while using the CLI; the findings are the operator's issues on this repository (see the PR).
Process: [spec 0000](0000-development-lifecycle.md). Number 0017: 0016 is held by an open PR (#39).
Verify skill: check-output, failure-loud

## Problem

Two failures a user meets in the first hour read as a bug in the tool, not as a missing file.

1. **`check` F8 with the speech cache not beside the story.** `check` compares each Line's narration with the audio file the build read from its speech cache, and looks for the cache in `speech-cache` beside the source unless `--cache-dir` says otherwise. When that directory is not the cache, F8 prints `FAIL  the written files cannot be observed: ffmpeg exited with code 254`. It does not say that the cache is the problem, which directory it looked in, or that `--cache-dir` exists. The cause is that the missing file is handed to ffmpeg and ffmpeg's exit code is the message.

   Observed on `origin/main` at `56a2155` (the committed `stories/same-id`, built into a scratch directory, checked with a directory that holds no cache):

   ```text
   $ tsukuri build stories/same-id/story.fountain --out /tmp/ee-repro/build
   $ tsukuri check /tmp/ee-repro/build --source stories/same-id/story.fountain --cache-dir /tmp/ee-repro/nowhere
   F8  FAIL  the written files cannot be observed: ffmpeg exited with code 254
   ...
   ChecksFailed: 1 of 8 checks failed: F8
   ```

2. **`SpeechCacheMiss` points at a flag that the command does not have.** `plan --timing`, `lint`, `check` and `build` all fail a Line whose asset is not in the speech cache with `...; build with refresh and the speech models present`. Only `build` and `journey` have a refresh flag (`--refresh-speech`); `plan` is read-only by design and has none. The message names neither the command nor the flag.

   ```text
   $ tsukuri plan /tmp/ee-miss/story.fountain --timing
   SpeechCacheMiss: the speech cache has no asset d4aaa54c...582779f for Line sc1.l1 ("One two three four."); build with refresh and the speech models present
   ```

## Goal

- F8 on a speech cache that is missing, or that lacks the audio of a Line, fails **as that**: it says the speech cache has no audio for the Line, names the directory it looked in, and names `--cache-dir` (and the default it used). It never reports an ffmpeg exit code for a file that does not exist.
- `SpeechCacheMiss` itself (its `message`, so every reader of the typed error sees it, not only the CLI's printer) ends with the command and the flag that fill the cache: `tsukuri build <story> --refresh-speech`, with the same `--speech`, `--aligner` and `--cache-dir` as the command that failed. That is true of every command that reads the cache: `plan`, `lint`, `check`, `build` and `journey` all take the selection flags and `--cache-dir`.

## Non-goals

- No fallback: a missing cache is still a failure (F8 FAIL, `SpeechCacheMiss`), the typed error stays, nothing is synthesised on the way, and `plan` stays read-only.
- `plan --timing` under the stand-ins (`--speech silent --aligner even`) still needs the cache filled first, by `build` (a stand-in narrator fills a miss without any flag). Making `plan` fill a cache would give a read-only command a write, which spec 0001 (F12) rejects; it is a separate decision for the operator and is not taken here.
- F8 keeps one verdict for the whole set of Lines; a file that exists but cannot be decoded is still reported by ffmpeg's own message.

## Journey

```text
a user
  1. tsukuri build stories/same-id/story.fountain --out build/x         the cache is beside the story: it hits
  2. tsukuri check build/x --source stories/same-id/story.fountain --cache-dir /tmp/elsewhere
        F8  FAIL  the speech cache has no audio for 12 of 12 Lines (first: Line sc1.l1, file <key>.flac);
                  the check looked in /tmp/elsewhere: pass the directory the build used as --cache-dir ...
  3. tsukuri plan <a story with no cache> --timing
        SpeechCacheMiss: ...; fill the cache with `tsukuri build <story> --refresh-speech`, using the same
        --speech, --aligner and --cache-dir flags as this command (...)
  4. tsukuri build <story> --help                                       lists --refresh-speech
```

Real: the real `check` over a real build (`verify` tests build a story with the real adapters, Chromium and ffmpeg); the CLI test runs the real command parser and the real `SpeechCacheMiss`.

## Constraints and values

- Correctness by construction: the F8 failure is decided before ffmpeg is asked (the file is or is not there); the command and flag in the message are checked against the real command: a test reads them out of the message and checks that the command's `--help` lists the flag, so the message cannot name a flag `build` lacks.
- The fix is in the error's own message, at its one throw site (`speechStage.ts`), so the error carries it wherever it is read. The cost is that `@tsukuri/pipeline` names the CLI's command; the pipeline is the only place the miss is raised, and the alternative (a suffix added by the CLI printer) left the typed error without the fix for every other reader.
- Tests prove the rule (a missing cache is reported as a missing cache; the fix names a command and flag that exist), not exact wording.

## Falsifiers

| # | Falsifier (must hold) | Gate | Negative control (must fail) |
| --- | --- | --- | --- |
| F1 | F8 on a directory that is not the cache, and on a cache without one Line's file, fails naming that directory and `--cache-dir`, and not with an ffmpeg exit code; the intact cache passes | `packages/verify/test/speechCache.test.ts` | replace the `missingCache` call in `packages/verify/src/narration.ts` by `Option.none()`: the test fails, `expected 'the written files cannot be observed:…' to include '<the directory>'` |
| F2 | A `SpeechCacheMiss` names a command and a flag; the command's `--help` lists that flag | `packages/cli/test/plan.test.ts` ("--timing without a cache entry fails with SpeechCacheMiss naming the Line and the key, and the command and flag that fill the cache (both exist)") | rename the `build` flag to `Flag.Boolean("refresh")`: the test fails, `expected 'DESCRIPTION…' to include '--refresh-speech'` |
| F3 | The gates pass | `bun run ready` | any gate fails |

## Revisions

- **2026-10-30, the fix moved from the CLI printer into the error message.** The first build appended the fix in `packages/cli/src/report.ts` and shared a `refreshSpeechFlag` constant. A review note pointed out that every reader of the typed error other than the printer (tests, `lint`, a library user) would still see only "build with refresh". The text now lives in the message at the throw site, the constant and the printer branch are removed, and the test (unchanged in its rule) checks the message against the real `--help`.
