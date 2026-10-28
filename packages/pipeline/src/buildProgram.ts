// The build program (spec 0001, "Journey"; design R3): one Effect from the story to a finished build directory,
// over the seven services only. No model, browser, binary or directory is named here; the composition root chooses
// the adapters.
//
//   story -> hash -> Plan -> speechStage -> schedule -> plan.json, Renderer.render -> deck, SoundLibrary -> sounds
//         -> FrameCapturer.capture -> Encoder.mux (narration at each Line's start, sounds at each sfx Cue's fire
//            frame, WebVTT, chapters, title and source hash) -> build.json
//
// Everything is written into `<out>.partial` and moved to `<out>` in one rename after `build.json`, the last file,
// is in. Any failure, or an interrupt, removes `<out>.partial`; an earlier build at `<out>` is removed before the
// new one starts, so a failed build leaves no directory `reebeat check` could accept (F12).
import {
  buildPlan,
  encodePlan,
  requireTimeline,
  schedule,
} from "@reebeat/core";
import type { TimedPlan } from "@reebeat/core";
import {
  AssetCache,
  Encoder,
  FrameCapturer,
  Renderer,
  SoundLibrary,
  SpeechSynthesizer,
  WordAligner,
  rejectSecretSettings,
} from "@reebeat/services";
import type { AdapterInfo } from "@reebeat/services";
import {
  Array as Arr,
  Duration,
  Effect,
  Exit,
  FileSystem,
  Option,
  Order,
  Path,
} from "effect";

import { AssetNotListed, OutputDirOccupied, outputFailed } from "./errors.ts";
import { manifestFile, writeManifest } from "./manifest.ts";
import type { AdapterRecord } from "./manifest.ts";
import { muxStage } from "./muxStage.ts";
import { readSource } from "./source.ts";
import { speechStage } from "./speechStage.ts";
import { narrationStarts, sfxStarts } from "./tracks.ts";
import type { NarrationStart } from "./tracks.ts";
import { writeRenderedDeck, writeSounds } from "./writeDeck.ts";

export interface BuildOptions {
  /** The base name of `<name>.mp4` and `<name>.vtt`. */
  readonly name: string;
  readonly out: string;
  /** Fill missing speech assets from the speech services; without it a miss is `SpeechCacheMiss`. */
  readonly refreshSpeech: boolean;
  /** The `.fountain` file. */
  readonly story: string;
}

export interface BuildSummary {
  /** Every adapter the build used, with its egress declaration. */
  readonly adapters: readonly AdapterRecord[];
  readonly files: number;
  readonly frames: number;
  readonly mp4Bytes: number;
  readonly out: string;
  /** Wall time of the whole build. */
  readonly seconds: number;
  readonly vttBytes: number;
}

/** Removes the stale `<out>.partial` and an earlier build (or an empty directory) at `<out>`; refuses anything else. */
const clearEarlier = Effect.fnUntraced(function* clearEarlier(
  out: string,
  partial: string
) {
  const fs = yield* FileSystem.FileSystem;

  yield* Effect.mapError(
    fs.remove(partial, { force: true, recursive: true }),
    outputFailed(partial, "remove")
  );

  const present = yield* Effect.mapError(
    fs.exists(out),
    outputFailed(out, "look for")
  );

  const entries = present
    ? yield* Effect.mapError(fs.readDirectory(out), outputFailed(out, "list"))
    : [];

  if (entries.length > 0 && !entries.includes(manifestFile)) {
    return yield* new OutputDirOccupied({
      message: `${out} is not empty and holds no ${manifestFile}, so it is not an earlier build: it is not replaced`,
      path: out,
    });
  }

  return yield* Effect.mapError(
    fs.remove(out, { force: true, recursive: true }),
    outputFailed(out, "remove")
  );
});

/** The adapters of the seven services this build runs on, in the order of the service list, with secrets refused. */
const selectedAdapters = Effect.fnUntraced(function* selectedAdapters() {
  const infos = [
    ["SpeechSynthesizer", (yield* SpeechSynthesizer).info],
    ["WordAligner", (yield* WordAligner).info],
    ["SoundLibrary", (yield* SoundLibrary).info],
    ["Renderer", (yield* Renderer).info],
    ["FrameCapturer", (yield* FrameCapturer).info],
    ["Encoder", (yield* Encoder).info],
    ["AssetCache", (yield* AssetCache).info],
  ] as const satisfies readonly (readonly [
    AdapterRecord["service"],
    AdapterInfo,
  ])[];

  yield* Effect.forEach(
    infos,
    ([, info]) => rejectSecretSettings(info.id, info.settings),
    { discard: true }
  );

  return Arr.map(infos, ([service, info]): AdapterRecord => ({
    egress: info.egress,
    id: info.id,
    service,
    settings: info.settings,
  }));
});

/** The provenance of every cache asset the Lines of the Plan use, one per distinct key, sorted by key. */
const usedAssets = Effect.fnUntraced(function* usedAssets(plan: TimedPlan) {
  const listed = yield* (yield* AssetCache).list;

  const lines: readonly NarrationStart[] = Arr.dedupeWith(
    narrationStarts(plan),
    (a, b) => a.key === b.key
  );

  return yield* Effect.forEach(
    Arr.sortWith(lines, (start) => start.key, Order.String),
    ({ key, lineId }) =>
      Effect.fromOption(
        Arr.findFirst(listed, (provenance) => provenance.keyParts.key === key),
        () =>
          new AssetNotListed({
            key,
            lineId,
            message: `the cache has the asset ${key} of Line ${lineId} but does not list it: build.json cannot record its provenance`,
          })
      )
  );
});

/** The Plan scheduled onto the narration of the speech stage. */
const scheduledPlan = Effect.fnUntraced(function* scheduledPlan(
  options: BuildOptions
) {
  const source = yield* readSource(options.story);
  const plan = yield* buildPlan(source.text, source.sha256);

  const aligned = yield* speechStage(plan, { refresh: options.refreshSpeech });
  const scheduled = yield* schedule(plan, aligned);

  return {
    scheduled,
    source,
    timed: yield* Effect.fromResult(requireTimeline(scheduled)),
  };
});

/** Fills `partial`: everything except the rename. */
const assemble = Effect.fnUntraced(function* assemble(
  options: BuildOptions,
  partial: string
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const { scheduled, source, timed } = yield* scheduledPlan(options);
  const planFile = path.join(partial, "plan.json");

  yield* Effect.mapError(
    Effect.flatMap(encodePlan(scheduled), (text) =>
      fs.writeFileString(planFile, text)
    ),
    outputFailed(planFile, "write")
  );

  yield* writeRenderedDeck(partial, yield* (yield* Renderer).render(scheduled));

  yield* writeSounds(
    partial,
    Arr.dedupe(Arr.map(sfxStarts(timed), (sound) => sound.name))
  );

  yield* muxStage(
    timed,
    (yield* FrameCapturer).capture({ deckDir: partial, plan: timed }),
    { name: options.name, outDir: partial }
  );

  const adapters = yield* selectedAdapters();

  const manifest = yield* writeManifest(partial, {
    adapters,
    assets: yield* usedAssets(timed),
    source: { path: options.story, sha256: source.sha256 },
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
    adapters,
    files: manifest.files.length,
    frames: timed.timeline.totalFrames,
    mp4Bytes: bytesOf(`${options.name}.mp4`),
    vttBytes: bytesOf(`${options.name}.vtt`),
  };
});

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
          outputFailed(partial, "create")
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
        outputFailed(out, "move into place")
      );

      return { ...summary, out };
    })
  );
});

/**
 * Builds the story into `options.out` over the seven services. The speech services are called only when
 * `refreshSpeech` is set and an asset is missing.
 */
export const buildProgram = Effect.fn("buildProgram")(function* buildProgram(
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
