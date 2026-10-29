// A scheduled Plan for the pure tests: no browser, no ffmpeg, no model.
import { buildPlan, requireTimeline, schedule, wordsOf } from "@reebeat/core";
import type { RendererLifecycle } from "@reebeat/core";
import { Array as Arr, Effect, String as Str } from "effect";

/** `text` spoken evenly, 300 ms a word, and scheduled against `lifecycle`. */
export const timedWith = (lifecycle: RendererLifecycle, text: string) =>
  Effect.gen(function* timed() {
    const plan = yield* buildPlan(text, Str.repeat(64)("0"));

    const aligned = Arr.flatMap(plan.scenes, (scene) =>
      Arr.map(scene.lines, (line) => ({
        audio: { file: `${Str.repeat(64)("a")}.flac`, sha256: "x" },
        durationMs: wordsOf(line.text).length * 300,
        lineId: line.id,
        words: Arr.map(wordsOf(line.text), (w, at) => ({
          endMs: (at + 1) * 300,
          startMs: at * 300,
          w,
        })),
      }))
    );

    return yield* Effect.flatMap(
      schedule(plan, aligned, lifecycle),
      (scheduled) => Effect.fromResult(requireTimeline(scheduled))
    );
  });
