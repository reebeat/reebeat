// What the mux is asked to mix (`sfxStarts`): effect ids are unique per Scene, not in the story, so two Scenes that each
// have an `s1` must not play each other's sound. Found on the real story, where the whoosh of one Scene sounded as the
// ding of the next.
import { assert, it } from "@effect/vitest";
import { buildPlan, frameToMs, requireTimeline, schedule } from "@reebeat/core";
import type { AlignedLine, PlanJson } from "@reebeat/core";
import { contractLifecycle } from "@reebeat/services/contract";
import { Array as Arr, Effect } from "effect";

import { sfxStarts } from "../src/tracks.ts";

const source = Arr.join(
  [
    "Title: Tracks",
    "",
    "# Part",
    "",
    "INT. ONE #sc1#",
    "",
    "Box {id=a cell=mc class=box}",
    "",
    "[[effects",
    "  s1: sound whoosh at scene.start",
    "]]",
    "",
    "NARRATOR",
    "One two three.",
    "",
    "INT. TWO #sc2#",
    "",
    "Box {id=a cell=mc class=box}",
    "",
    "[[effects",
    "  s1: sound ding at scene.start",
    "  p1: sound pop at scene.end",
    "]]",
    "",
    "NARRATOR",
    "Four five six.",
    "",
  ],
  "\n"
);

const digest = "c0".repeat(32);

const alignedLines = (plan: PlanJson): readonly AlignedLine[] =>
  Arr.flatMap(plan.scenes, (scene) =>
    Arr.map(scene.lines, (line) => ({
      audio: { file: `${digest}.flac`, sha256: digest },
      durationMs: 300 * line.words.length,
      lineId: line.id,
      words: Arr.map(line.words, (w, index) => ({
        endMs: index * 300 + 280,
        startMs: index * 300,
        w,
      })),
    }))
  );

it.effect(
  "gives each sound the name of its own effect, though two Scenes both have an `s1`",
  () =>
    Effect.gen(function* distinct() {
      const plan = yield* buildPlan(source, digest);

      const timed = yield* Effect.fromResult(
        requireTimeline(
          yield* schedule(plan, alignedLines(plan), contractLifecycle)
        )
      );

      const [second] = Arr.drop(timed.timeline.scenes, 1);
      const starts = sfxStarts(timed);

      assert.deepStrictEqual(
        Arr.map(starts, ({ effectId, name }) => [effectId, name]),
        [
          ["s1", "whoosh"],
          ["s1", "ding"],
          ["p1", "pop"],
        ]
      );
      assert.strictEqual(
        starts[1]?.startMs,
        frameToMs(second?.slideFrame ?? -1, timed.settings.fps)
      );
    })
);
