# XState v6 alpha as a build-time statechart interpreter (spike)

Throwaway code that measures five questions for the SCXML/XState spike (spec 0007). Nothing here is product code.
Versions: `xstate@6.0.0-alpha.70`, `@xstate/effect@1.0.0-alpha.9`, `effect@4.1.0`, `@statelyai/inspect@0.7.2` (only to show it fails).

## Rerun

```sh
cd spike/xstate
timeout 180 bun install        # the system Bun can hang on install; fall back to: nix shell nixpkgs#nodejs -c npm i
bun run run.ts                 # everything; writes results/results.json, out/*; --no-network skips `npm view` and the changelog
bun run run.ts > results/run.txt
```

Type-check (TypeScript 7 from the 0004 worktree; the repo's flags, then the strict superset):

```sh
TSC=/srv/share/projects/reebeat/.worktrees/0004/node_modules/.bun/typescript@7.0.2/node_modules/typescript/bin/tsc
$TSC -p tsconfig.json          # strict, nodenext, skipLibCheck false: no errors
$TSC -p tsconfig.exact.json    # + exactOptionalPropertyTypes: 9 errors in xstate@alpha.70 declarations
```

Optional, Stately's own converter (not on npm, pins xstate 6.0.0-alpha.25):

```sh
git clone --depth 1 https://github.com/statelyai/schema /tmp/stately-schema && (cd /tmp/stately-schema && bun install)
STATELY_SCHEMA=/tmp/stately-schema bun run src/stately-check.ts
```

## Files

| File | What |
| --- | --- |
| `src/ir.ts` | the IR of `stories/same-id` (`../scxml/fixtures/same-id.graph.json`) and the speech cache, read by Line text |
| `src/generate.ts` | the generator IR -> `MachineJSON` (data only) and the oracle (`Declared`: the times it wrote) |
| `src/interpret.ts` | three interpreters of the same machine: `createEffectActor` + `TestClock`, `createActor` + `SimulatedClock`, pure `advanceSystemTime` |
| `src/primitives.ts` | tiny tests: entry/exit order, parallel, history, done.state, eventless, delayed + cancel, same-deadline timers |
| `src/codec.ts` | `encode`/`decode` and the data-only checks (function scan, `@code` count, round trips) |
| `src/graphs.ts` | `xstate/graph` (`getAdjacencyMap`, `getShortestPaths`, `getSimplePaths`, `toDirectedGraph`), the v6 inspection stream, `@statelyai/inspect` |
| `src/frames.ts` | the pure interpreter sampled per frame number (24, 30, 60 fps) |
| `src/risk.ts` | release cadence, Major changelog entries, licence, size, bundle (`bun build --minify`), `tsc` |
| `src/bundle/*.ts` | the three bundle probes |
| `results/results.json`, `results/run.txt` | the last run |

## What the generated machine is

Root parallel state `story` with regions `scenes` (one compound state per Scene; its atomic states are the States, the
Beats are `s(k) -> b(k) -> s(k+1)`, a final `end` state completes the Scene), `elements` (per Element id: presence,
position, style) and `sound` (one voice per sound name). Only strings, numbers, plain objects, the built-in
`@xstate.raise` (with `delay`), `matches` filters, `after`, `always`, `xstate.done.state` and ONE named action `mark`
whose implementation the caller supplies. The IR facts a statechart has no field for (Elements, Lines, effects,
chapters) ride in `meta`.

## How the time is chosen

- Dwell of a Scene: `sceneLead` 1000 ms + each Line (`durationMs` of its `speech-cache/*.words.json`, found by the Line text in
  `*.provenance.json`) separated by `lineGap` 500 ms + `sceneTail` 500 ms (the defaults of `packages/core/src/build.ts` in 0004).
  The next Scene starts where the previous ends. Word anchors use the aligned word times of the same files.
- Transition windows and the `show` window: `referenceLifecycle` of 0004 (`auto-animate` 800, `default` 400, `cut` 0, show 133 ms).
- The anchor resolver is simplified (word anchors, shift, absolute, scene start and a point of the move window without
  the renderer's start lag). It is not validated against the Plan: the README of `stories/same-id` quotes frame 706 for
  `sc4.s2`, this resolver gives 23625 ms = 708.75 frames at 30 fps.
- A fire time inside the window of a running Beat joins it (`sc4`: `show note` at 28265 ms, `focus hint` 20 ms later).
  At exact time that is an overlap that frames used to hide by rounding.
