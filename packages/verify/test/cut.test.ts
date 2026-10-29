// F7 on a `> CUT` (spec 0001, Revision "review round 2"): a cut shows no intermediate frame. The first changed frame of
// the scene change is already the settled frame (within the encoder's noise); the old slide must not fade out over the
// new one. The control captures the same deck with the rule that makes the old slide leave at once removed: reveal.js
// then fades it out over 15 frames and F7 fails naming the cut.
import { assert, layer } from "@effect/vitest";
import { Effect, Path } from "effect";

import {
  Fixture,
  checkDirectory,
  control,
  copyBuild,
  failedIds,
  muxFrames,
  recapture,
  replaceInFile,
  reportedScore,
  verdictOf,
} from "./support.ts";

const measuredCut = "sc2 cut intermediate frames";

layer(Fixture.cutLayer, { excludeTestServices: true, timeout: "300 seconds" })(
  "F7 on a small story with a cut",
  (it) => {
    it.effect(
      "a cut shows no intermediate frame: the first changed frame is the settled one",
      () =>
        Effect.gen(function* cutting() {
          const fixture = yield* Fixture;
          const verdicts = yield* checkDirectory(fixture.build);
          const f7 = verdictOf(verdicts, "F7");

          assert.strictEqual(f7.status, "pass", f7.detail);
          assert.strictEqual(reportedScore(f7, measuredCut), 0);
          assert.deepStrictEqual(failedIds(verdicts), []);
        })
    );

    it.effect(
      "control: a cut whose old slide fades out again fails F7, naming the cut and its intermediate frames",
      () =>
        Effect.gen(function* fading() {
          const fixture = yield* Fixture;
          const path = yield* Path.Path;
          const deck = yield* copyBuild("cut-deck-fading");

          yield* replaceInFile(
            path.join(deck, "assets", "theme.css"),
            `section.present[data-transition="none"]`,
            `section.present[data-transition="fade"]`
          );

          const verdicts = yield* control(
            "f7-cut-fades",
            (dir) => muxFrames(dir, recapture(fixture.plan, deck)),
            ["F7"]
          );

          const f7 = verdictOf(verdicts, "F7");

          assert.include(f7.detail, "the cut into sc2");
          assert.isAtLeast(reportedScore(f7, measuredCut), 5);
        })
    );
  }
);
