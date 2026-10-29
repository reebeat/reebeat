// F15 and F1 on an offline build (spec 0001, Revision "review round 2"): a build made with the silent stand-in narrator
// has silent narration but audible sounds, so only F8 (narration onsets) is N/A; F1 still observes every `sfx` Cue and
// the anchored whoosh against the motion. Without this, the sound anchoring would be unchecked on every offline build.
import { assert, layer } from "@effect/vitest";
import { Array as Arr, Effect } from "effect";

import { exitCode } from "../src/index.ts";
import {
  Fixture,
  assertWhooshThreeFramesLate,
  checkDirectory,
  failedIds,
  measuredOf,
  verdictOf,
  whooshMotion,
} from "./support.ts";

layer(Fixture.offlineLayer, {
  excludeTestServices: true,
  timeout: "300 seconds",
})("the checks on a small offline build (silent stand-in narrator)", (it) => {
  it.effect(
    "F8 is N/A, every sfx Cue is observed in the audible sounds and passes, and the exit code holds",
    () =>
      Effect.gen(function* offline() {
        const fixture = yield* Fixture;
        const verdicts = yield* checkDirectory(fixture.build);
        const f1 = verdictOf(verdicts, "F1");
        const measured = measuredOf(f1);

        assert.strictEqual(verdictOf(verdicts, "F8").status, "na");
        assert.include(
          verdictOf(verdicts, "F8").detail,
          "N/A (silent stand-in)"
        );
        assert.strictEqual(f1.status, "pass", f1.detail);
        assert.strictEqual(f1.measured[0]?.[1], 4);
        assert.isTrue(
          Arr.some(measured, (row) =>
            row.startsWith("sc1.l1.c2 sfx match score")
          ),
          "the pop is found in the track"
        );
        assert.isTrue(
          Arr.some(measured, (row) => row.startsWith(whooshMotion)),
          "the whoosh is compared with the motion"
        );
        assert.deepStrictEqual(failedIds(verdicts), []);
        assert.strictEqual(exitCode(verdicts), 0);
      })
  );

  it.effect(
    "control: the whoosh delayed by three frames in an offline build fails F1, three frames from its planned frame and from the motion",
    () =>
      Effect.gen(function* delayed() {
        const verdicts = yield* assertWhooshThreeFramesLate(
          "offline-whoosh-late"
        );

        assert.strictEqual(verdictOf(verdicts, "F8").status, "na");
      })
  );
});
