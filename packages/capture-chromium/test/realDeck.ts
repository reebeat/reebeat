// A small Plan built by the real core from test/fixtures/lags.fountain, scheduled on synthetic narration (250 ms a
// word), and the real reveal.js Renderer's output for it: what the capture sees in a build, on a small story.
// (This is the one test file that uses two other adapters, `render-reveal` and `sounds-synth`: the lags it measures
// are a property of the pair. Proposal for the integrator: move it to a package that may depend on adapters.)
import { NodeServices } from "@effect/platform-node";
import { buildPlan, requireTimeline, schedule } from "@reebeat/core";
import type { AlignedLine } from "@reebeat/core";
import { revealRenderer } from "@reebeat/render-reveal";
import { Renderer } from "@reebeat/services";
import { sfxWav } from "@reebeat/sounds-synth";
import {
  Array as Arr,
  Effect,
  FileSystem,
  Layer,
  Path,
  Predicate,
} from "effect";

import { Browser } from "../src/browser.ts";
import { audioFile } from "./fixturePlan.ts";

export const realServices = Layer.mergeAll(Browser.layer, revealRenderer).pipe(
  Layer.provideMerge(NodeServices.layer)
);

const wordMs = 250;

const encoder = new TextEncoder();

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
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const source = yield* fs.readFileString(
    yield* path.fromFileUrl(new URL("fixtures/lags.fountain", import.meta.url))
  );

  const plan = yield* buildPlan(source, "0".repeat(64));
  const scheduled = yield* schedule(plan, alignedLines(plan));

  return yield* Effect.fromResult(requireTimeline(scheduled));
});

/** A temporary directory with the real deck and its sounds; returns the page URL and the Plan. */
export const makeRealWorkspace = Effect.gen(function* makeRealWorkspace() {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const plan = yield* realPlan;
  const deck = yield* (yield* Renderer).render(plan);
  const root = yield* fs.makeTempDirectoryScoped({ prefix: "reebeat-lags-" });
  const deckDir = path.join(root, "deck");

  const write = (relative: string, content: string | Uint8Array) => {
    const target = path.join(deckDir, relative);

    const bytes = Predicate.isString(content)
      ? encoder.encode(content)
      : content;

    return Effect.andThen(
      fs.makeDirectory(path.dirname(target), { recursive: true }),
      fs.writeFile(target, bytes)
    );
  };

  yield* Effect.forEach(deck.files, ({ content, path: relative }) =>
    write(relative, content)
  );

  for (const name of ["whoosh", "ding"] as const) {
    yield* write(`assets/sfx/${name}.wav`, sfxWav(name));
  }

  return {
    deckUrl: (yield* path.toFileUrl(path.join(deckDir, deck.entry))).href,
    plan,
  };
});
