// frameToMs and requireTimeline: a Plan without a Timeline, or with a Timeline that names what the Plan lacks, is
// refused; a scheduled Plan passes through with its Timeline.
import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Effect, Result, String as Str } from "effect";

import { buildPlan } from "../src/build.ts";
import { schedule } from "../src/schedule.ts";
import { frameToMs, requireTimeline } from "../src/timed.ts";
import { asText, fixtureSha256 } from "./support.ts";

const source = asText([
  "# Part",
  "",
  "INT. ONE",
  "",
  "NARRATOR",
  "One two.",
  "",
]);

const scheduled = Effect.gen(function* build() {
  const plan = yield* buildPlan(source, fixtureSha256);

  return yield* schedule(plan, [
    {
      audio: { file: `${Str.repeat(64)("1")}.flac`, sha256: "hash" },
      durationMs: 1000,
      lineId: "sc1.l1",
      words: [
        { endMs: 400, startMs: 0, w: "One" },
        { endMs: 1000, startMs: 400, w: "two." },
      ],
    },
  ]);
});

describe("frameToMs", () => {
  it("rounds 1000 * frame / fps", () => {
    assert.strictEqual(frameToMs(0, 30), 0);
    assert.strictEqual(frameToMs(1, 30), 33);
    assert.strictEqual(frameToMs(65, 30), 2167);
    assert.strictEqual(frameToMs(219, 30), 7300);
  });
});

describe("requireTimeline", () => {
  it.effect("fails PlanNotScheduled for a Plan without a Timeline", () =>
    Effect.gen(function* bare() {
      const { timeline: _timeline, ...plan } = yield* scheduled;

      const result = requireTimeline(plan);

      assert.isTrue(Result.isFailure(result));
      assert.strictEqual(
        Result.isFailure(result) ? result.failure._tag : "",
        "PlanNotScheduled"
      );
    })
  );

  it.effect("fails when the Timeline names a Line the Plan does not have", () =>
    Effect.gen(function* stale() {
      const plan = yield* scheduled;

      const emptied = {
        ...plan,
        scenes: Arr.map(plan.scenes, (scene) => ({ ...scene, lines: [] })),
      };

      assert.isTrue(Result.isFailure(requireTimeline(emptied)));
    })
  );

  it.effect("returns a scheduled Plan with its Timeline", () =>
    Effect.gen(function* ok() {
      const plan = yield* scheduled;

      const result = requireTimeline(plan);

      assert.isTrue(Result.isSuccess(result));
    })
  );
});
