// A small Plan built by the real core from test/fixtures/lags.fountain, scheduled on synthetic narration (250 ms a
// word), and the real deck package's output for it: what the capture sees in a build, on a small story.
import { NodeServices } from "@effect/platform-node";
import { buildPlan, schedule } from "@reebeat/core";
import type { AlignedLine } from "@reebeat/core";
import { renderDeck, writeDeck } from "@reebeat/deck";
import { sfxWav } from "@reebeat/sfx";
import { Array as Arr, Effect, FileSystem, Layer, Path } from "effect";

import { Browser } from "../src/browser.ts";
import { MediaTools } from "../src/mediaTools.ts";
import { requireTimeline } from "../src/timedPlan.ts";
import { audioFile } from "./fixturePlan.ts";
import { locateWorkspace, readLocal, writeNarration } from "./support.ts";

export const realServices = Layer.mergeAll(
  MediaTools.layer,
  Browser.layer
).pipe(Layer.provideMerge(NodeServices.layer));

const wordMs = 250;

const alignedLines = (
  plan: Parameters<typeof schedule>[0]
): readonly AlignedLine[] =>
  Arr.map(
    Arr.flatMap(plan.scenes, (scene) => scene.lines),
    (line, lineIndex) => ({
      audio: { file: audioFile(lineIndex + 1), sha256: `hash-${line.id}` },
      durationMs: line.words.length * wordMs,
      lineId: line.id,
      words: Arr.map(line.words, (w, index) => ({
        endMs: (index + 1) * wordMs,
        startMs: index * wordMs,
        w,
      })),
    })
  );

/** The scheduled Plan of the fixture story, checked against its Scenes. */
const realPlan = Effect.gen(function* realPlan() {
  const source = yield* readLocal("./fixtures/lags.fountain");
  const plan = yield* buildPlan(source, "0".repeat(64));
  const scheduled = yield* schedule(plan, alignedLines(plan));

  return yield* Effect.fromResult(requireTimeline(scheduled));
});

/** A temporary directory with the real deck, its sounds and the narration FLACs; returns the page URL. */
export const makeRealWorkspace = Effect.gen(function* makeRealWorkspace() {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const plan = yield* realPlan;
  const root = yield* fs.makeTempDirectoryScoped({ prefix: "reebeat-lags-" });
  const cacheDir = path.join(root, "cache");

  yield* fs.makeDirectory(cacheDir, { recursive: true });
  yield* writeDeck(renderDeck(plan), path.join(root, "deck"), plan);
  yield* fs.makeDirectory(path.join(root, "deck", "assets", "sfx"), {
    recursive: true,
  });

  for (const name of ["whoosh", "ding"] as const) {
    yield* fs.writeFile(
      path.join(root, "deck", "assets", "sfx", `${name}.wav`),
      sfxWav(name)
    );
  }

  yield* writeNarration(plan, cacheDir);

  return { ...(yield* locateWorkspace(root, cacheDir)), plan };
});
