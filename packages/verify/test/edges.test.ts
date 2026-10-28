// The edges of the checks, each pinned from both sides so that moving a threshold turns a test red:
//   - the one-frame tolerance: 0.99 frame passes, 1.02 frames fails (end to end, a cue of the .vtt moved by 33 and 34 ms);
//   - the match floors: a clip that is there passes, a clip that is absent, another clip in its place, and a clip under
//     a louder one fail, with the scores in between that show where the floors sit;
//   - F6 sees the audio: two builds that differ only in their audio fail;
//   - a Line's audio file is read only from inside the speech cache.
import { assert, layer } from "@effect/vitest";
import { Array as Arr, Effect, Option, Path } from "effect";

import { BuildInvalid, compareBuilds } from "../src/index.ts";
import type { Verdict } from "../src/index.ts";
import {
  Fixture,
  audioFilter,
  checkDirectory,
  control,
  copyBuild,
  frameMs,
  measuredOf,
  mutate,
  narrationFile,
  remix,
  replaceInFile,
  soundFile,
  verdictOf,
} from "./support.ts";

/** The best-match score a verdict reports for `name` (`sc1.l1 match score`), from its measured values. */
const reportedScore = (verdict: Verdict, name: string): number =>
  Number(
    Option.getOrThrow(
      Arr.findFirst(verdict.measured, ([key]) => key === name)
    )[1]
  );

/** The best match that a failure sentence reports: `(best match 0.04, at least 0.8 needed)`. */
const reportedMatch = (detail: string): number =>
  Number(/best match (?<score>[\d.]+)/u.exec(detail)?.groups?.score);

layer(Fixture.layer, { excludeTestServices: true, timeout: "300 seconds" })(
  "the edges of the checks",
  (it) => {
    it.effect(
      "the one-frame tolerance: a subtitle 0.99 frame off passes, 1.02 frames off fails, naming the Line",
      () =>
        Effect.gen(function* edge() {
          const path = yield* Path.Path;
          const first = "00:00:01.000 -->";

          // The first Line starts at frame 30, 1000 ms: 33 ms is 0.99 frame, 34 ms is 1.02 frames.
          const inside = yield* control(
            "edge-inside",
            (dir) =>
              replaceInFile(
                path.join(dir, "story.vtt"),
                first,
                "00:00:01.033 -->"
              ),
            []
          );

          const outside = yield* control(
            "edge-outside",
            (dir) =>
              replaceInFile(
                path.join(dir, "story.vtt"),
                first,
                "00:00:01.034 -->"
              ),
            ["F2"]
          );

          assert.include(
            measuredOf(verdictOf(inside, "F2")),
            ".vtt file max start deviation (frames): 0.99"
          );
          assert.include(
            verdictOf(outside, "F2").detail,
            ".vtt file, Line sc1.l1: the subtitle starts +1.02 frames"
          );
        })
    );

    it.effect(
      "F6: two builds that differ only in their audio fail, naming the first differing sample; a copy passes",
      () =>
        Effect.gen(function* audioOnly() {
          const fixture = yield* Fixture;
          const quieter = yield* copyBuild("f6-quieter");
          const copy = yield* copyBuild("f6-copy-again");

          yield* audioFilter("volume=0.5")(quieter);

          const verdict = yield* compareBuilds(fixture.build, quieter);
          const same = yield* compareBuilds(fixture.build, copy);

          assert.strictEqual(same.status, "pass", same.detail);
          assert.strictEqual(verdict.status, "fail");
          assert.match(
            verdict.detail,
            /the first differing audio sample is \d+ \(\d+ and \d+ samples\)/u
          );
          assert.notInclude(verdict.detail, "video frame");
          assert.include(
            measuredOf(verdict),
            "frames with a different hash: 0"
          );
          assert.include(measuredOf(verdict), "audio PCM sha256: different");
        })
    );

    it.effect(
      "F8: another Line's narration where a Line should start is not found; one under a louder sound is not found either; a quieter one is",
      () =>
        Effect.gen(function* narrationFloor() {
          const fixture = yield* Fixture;
          const first = narrationFile(fixture, "sc1.l1");
          const second = narrationFile(fixture, "sc2.l1");
          const pop = soundFile(fixture, "pop");
          const at30 = frameMs(30);
          const at111 = frameMs(111);

          const parts = (own: number, other: number) => [
            { file: first, gain: own, startMs: at30 },
            { file: second, gain: other, startMs: at30 },
            { file: second, startMs: at111 },
            { file: pop, startMs: frameMs(65) },
          ];

          const absent = yield* mutate(
            "f8-absent",
            remix([
              { file: second, startMs: at30 },
              { file: second, startMs: at111 },
              { file: pop, startMs: frameMs(65) },
            ])
          );

          const drowned = yield* mutate("f8-drowned", remix(parts(0.5, 1)));
          const quieter = yield* mutate("f8-quieter", remix(parts(1, 0.5)));

          for (const verdicts of [absent, drowned]) {
            assert.strictEqual(verdictOf(verdicts, "F8").status, "fail");
            assert.include(
              verdictOf(verdicts, "F8").detail,
              "Line sc1.l1: its audio is not found within 150 ms"
            );
          }

          // The scores that put the floor of 0.8 between them.
          const scores = {
            absent: reportedScore(
              verdictOf(absent, "F8"),
              "sc1.l1 match score"
            ),
            drowned: reportedScore(
              verdictOf(drowned, "F8"),
              "sc1.l1 match score"
            ),
            quieter: reportedScore(
              verdictOf(quieter, "F8"),
              "sc1.l1 match score"
            ),
          };

          assert.isBelow(scores.absent, 0.3);
          assert.isAbove(scores.drowned, 0.3);
          assert.isBelow(scores.drowned, 0.8);
          assert.strictEqual(verdictOf(quieter, "F8").status, "pass");
          assert.isAbove(scores.quieter, 0.8);
          assert.isBelow(reportedMatch(verdictOf(drowned, "F8").detail), 0.8);
        })
    );

    it.effect(
      "F1: a wrong sound where the sound should be is not found; one under a louder sound is not found either; under a quieter one it is",
      () =>
        Effect.gen(function* soundFloor() {
          const fixture = yield* Fixture;
          const at = frameMs(65);

          const parts = (pop: number, whoosh: number) => [
            { file: narrationFile(fixture, "sc1.l1"), startMs: frameMs(30) },
            { file: narrationFile(fixture, "sc2.l1"), startMs: frameMs(111) },
            { file: soundFile(fixture, "pop"), gain: pop, startMs: at },
            { file: soundFile(fixture, "whoosh"), gain: whoosh, startMs: at },
          ];

          const wrong = yield* mutate("f1-wrong", remix(parts(0, 1)));
          const drowned = yield* mutate("f1-drowned", remix(parts(0.3, 1)));
          const quieter = yield* mutate("f1-quieter", remix(parts(1, 0.3)));

          for (const verdicts of [wrong, drowned]) {
            assert.strictEqual(verdictOf(verdicts, "F1").status, "fail");
            assert.include(
              verdictOf(verdicts, "F1").detail,
              "sc1.l1.c2 sfx: pop at frame 65: the sound is not found within 150 ms"
            );
          }

          const scores = {
            drowned: reportedMatch(verdictOf(drowned, "F1").detail),
            quieter: reportedScore(
              verdictOf(quieter, "F1"),
              "sc1.l1.c2 sfx match score"
            ),
            wrong: reportedMatch(verdictOf(wrong, "F1").detail),
          };

          assert.isBelow(scores.wrong, 0.2);
          assert.isAbove(scores.drowned, 0.2);
          assert.isBelow(scores.drowned, 0.5);
          assert.strictEqual(verdictOf(quieter, "F1").status, "pass");
          assert.isAbove(scores.quieter, 0.5);
        })
    );

    it.effect(
      "a Line's audio file that is absolute or leaves the speech cache is refused when plan.json is read, and not read",
      () =>
        Effect.gen(function* containment() {
          const path = yield* Path.Path;
          const fixture = yield* Fixture;

          const first =
            narrationFile(fixture, "sc1.l1").split("/").at(-1) ?? "";

          for (const [name, file] of [
            ["escape", "../x.flac"],
            ["absolute", "/etc/passwd"],
          ] as const) {
            const dir = yield* copyBuild(`contain-${name}`);

            yield* replaceInFile(path.join(dir, "plan.json"), first, file);

            const failure = yield* checkDirectory(dir).pipe(Effect.flip);

            assert.instanceOf(failure, BuildInvalid);
            assert.include(failure.message, "plan.json is not a Plan");
          }
        })
    );
  }
);
