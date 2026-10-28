import { encodePlan } from "@reebeat/core";
// `reebeat build`: one Effect program from the story to a finished build directory (spec 0001, "Journey").
//
//   story -> hash -> Plan -> speech (cache) -> Timeline -> plan.json, deck, sounds -> capture + mux -> build.json
//
// Everything is written into `<out>.partial` and moved to `<out>` in one rename after `build.json`, the last file,
// is in. Any failure, or an interrupt, removes `<out>.partial`; an earlier build at `<out>` is removed before the
// new one starts, so a failed build leaves no directory `reebeat check` could accept (F12).
import { renderDeck, writeDeck } from "@reebeat/deck";
import { sfxWav } from "@reebeat/sfx";
import {
  audioMixPlan,
  captureFrames,
  captureSchedule,
  muxVideo,
  requireTimeline,
} from "@reebeat/video";
import type { TimedPlan } from "@reebeat/video";
import {
  Array as Arr,
  Duration,
  Effect,
  Exit,
  FileSystem,
  Option,
  Path,
} from "effect";

import { BuildOutputFailed, OutputDirOccupied } from "./errors.ts";
import { manifestFile, writeManifest } from "./manifest.ts";
import { readPlan, scheduledPlan } from "./plan.ts";

export interface BuildOptions {
  /** The capture's deadline in seconds; `undefined` is the video package's default. */
  readonly captureTimeoutSeconds?: number | undefined;
  /** The speech cache directory. */
  readonly cacheDir: string;
  /** The base name of `<name>.mp4` and `<name>.vtt`. */
  readonly name: string;
  readonly out: string;
  /** The `.fountain` file. */
  readonly story: string;
}

export interface BuildSummary {
  readonly files: number;
  readonly frames: number;
  readonly mp4Bytes: number;
  readonly out: string;
  /** Wall time of the whole build. */
  readonly seconds: number;
  readonly vttBytes: number;
}

const failure = (path: string, what: string) => (cause: unknown) =>
  new BuildOutputFailed({
    cause,
    message: `cannot ${what} ${path}: ${cause instanceof Error ? cause.message : String(cause)}`,
    path,
  });

/** Removes the stale `<out>.partial` and an earlier build (or an empty directory) at `<out>`; refuses anything else. */
const clearEarlier = Effect.fnUntraced(function* clearEarlier(
  out: string,
  partial: string
) {
  const fs = yield* FileSystem.FileSystem;

  yield* Effect.mapError(
    fs.remove(partial, { force: true, recursive: true }),
    failure(partial, "remove")
  );

  const present = yield* Effect.mapError(
    fs.exists(out),
    failure(out, "look for")
  );

  const entries = present
    ? yield* Effect.mapError(fs.readDirectory(out), failure(out, "list"))
    : [];

  if (entries.length > 0 && !entries.includes(manifestFile)) {
    return yield* new OutputDirOccupied({
      message: `${out} is not empty and holds no ${manifestFile}, so it is not an earlier build: it is not replaced`,
      path: out,
    });
  }

  return yield* Effect.mapError(
    fs.remove(out, { force: true, recursive: true }),
    failure(out, "remove")
  );
});

/** `assets/sfx/<name>.wav` for every sound the Plan's Cues play: the Deck's `sfx` step fetches them. */
const writeSounds = Effect.fnUntraced(function* writeSounds(
  dir: string,
  timed: TimedPlan
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const target = path.join(dir, "assets", "sfx");

  const names = new Set(
    Arr.flatMap(audioMixPlan(timed).inputs, (input) =>
      input.kind === "sfx" ? [input.name] : []
    )
  );

  yield* Effect.mapError(
    fs.makeDirectory(target, { recursive: true }),
    failure(target, "create")
  );

  yield* Effect.forEach(
    names,
    (name) =>
      Effect.mapError(
        fs.writeFile(path.join(target, `${name}.wav`), sfxWav(name)),
        failure(path.join(target, `${name}.wav`), "write")
      ),
    { discard: true }
  );
});

/** Fills `partial`: everything except the rename. */
const assemble = Effect.fnUntraced(function* assemble(
  options: BuildOptions,
  partial: string
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const { plan, source } = yield* readPlan(options.story);
  const scheduled = yield* scheduledPlan(plan);
  const timed = yield* Effect.fromResult(requireTimeline(scheduled));
  const planFile = path.join(partial, "plan.json");

  yield* Effect.mapError(
    Effect.flatMap(encodePlan(scheduled), (text) =>
      fs.writeFileString(planFile, text)
    ),
    failure(planFile, "write")
  );

  yield* writeDeck(renderDeck(scheduled), partial, scheduled);
  yield* writeSounds(partial, timed);

  const deckUrl = (yield* path.toFileUrl(path.resolve(partial, "deck.html")))
    .href;

  yield* muxVideo(
    timed,
    captureFrames(captureSchedule(timed), {
      deckUrl,
      settleNewAnimations: true,
      timeoutSeconds: options.captureTimeoutSeconds,
    }),
    { cacheDir: options.cacheDir, name: options.name, outDir: partial }
  );

  const manifest = yield* writeManifest(partial, {
    path: options.story,
    sha256: source.sha256,
  });

  const bytesOf = (file: string): number =>
    Option.getOrElse(
      Option.map(
        Arr.findFirst(manifest.files, (entry) => entry.path === file),
        (entry) => entry.bytes
      ),
      () => 0
    );

  return {
    files: manifest.files.length,
    frames: timed.timeline.totalFrames,
    mp4Bytes: bytesOf(`${options.name}.mp4`),
    vttBytes: bytesOf(`${options.name}.vtt`),
  };
});

/** The line `build` and `journey` print for a finished build. */
export const renderSummary = (summary: BuildSummary): string =>
  `built ${summary.out}: ${summary.files} files, ${summary.frames} frames, mp4 ${summary.mp4Bytes} bytes, vtt ${summary.vttBytes} bytes, ${summary.seconds.toFixed(1)} s`;

const buildInto = Effect.fnUntraced(function* buildInto(
  options: BuildOptions,
  out: string
) {
  const fs = yield* FileSystem.FileSystem;
  const partial = `${out}.partial`;

  yield* clearEarlier(out, partial);

  return yield* Effect.scoped(
    Effect.gen(function* publish() {
      yield* Effect.acquireRelease(
        Effect.mapError(
          fs.makeDirectory(partial, { recursive: true }),
          failure(partial, "create")
        ),
        (_, exit) =>
          Exit.isSuccess(exit)
            ? Effect.void
            : Effect.ignore(
                fs.remove(partial, { force: true, recursive: true }),
                {
                  log: "Warn",
                  message: `cannot remove ${partial}`,
                }
              )
      );

      const summary = yield* assemble(options, partial);

      yield* Effect.mapError(
        fs.rename(partial, out),
        failure(out, "move into place")
      );

      return { ...summary, out };
    })
  );
});

/** Builds the story into `options.out`. Needs the speech cache (the `Speech` service), Chromium and ffmpeg. */
export const buildStory = Effect.fn("buildStory")(function* buildStory(
  options: BuildOptions
) {
  const path = yield* Path.Path;
  const out = path.resolve(options.out);

  const [elapsed, summary] = yield* Effect.timed(buildInto(options, out));

  return {
    ...summary,
    seconds: Duration.toSeconds(elapsed),
  } satisfies BuildSummary;
});
