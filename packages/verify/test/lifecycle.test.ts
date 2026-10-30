// F1 on every lifecycle event the renderer declares (spec 0002, "plan contract for effects"): one `show` is anchored to
// each event of an Auto-Animate Scene (the end of the transition, the start and end of a box's move, an Element that
// enters, one that exits, a colour that changes), of a default fade and of a cut, each two seconds after the event, so that the
// show neither hides in the transition nor changes the picture in which the transition is observed. The shows are the probes: the anchor each is written against is
// observed in the written video, so a number of `revealLifecycle` that is wrong for any event fails here, naming it.
import { assert, layer } from "@effect/vitest";
import { revealRenderer } from "@tsukuri/render-reveal";
import { Array as Arr, Context, Effect, Layer } from "effect";

import { runChecks } from "../src/index.ts";
import {
  buildFixtureOf,
  measuredOf,
  rowOf,
  services,
  verdictOf,
  offsetsIn,
} from "./support.ts";
import type { FixtureData } from "./support.ts";

const story = `Title: Lifecycle coverage
Author: tsukuri tests

# One

INT. ONE - DAY #sc1#

Box {id=a cell=tl class=box}
Leaving {id=b cell=bc class=label}

NARRATOR
One two three four.

> AUTO-ANIMATE

INT. TWO - DAY #sc2#

Box {id=a cell=tr class=box}
Entering {id=d cell=bl class=label}
Probe one {id=h1 cell=tc class=muted visible=false}
Probe two {id=h2 cell=mc class=muted visible=false}
Probe three {id=h3 cell=ml class=muted visible=false}
Probe four {id=h4 cell=mr class=muted visible=false}
Probe five {id=h5 cell=br class=muted visible=false}
Probe six {id=h6 cell=tl class=muted visible=false}
Probe seven {id=h7 cell=bc class=muted visible=false}

[[effects
  q1: show h1 at transition.end +2s
  q2: show h2 at a.move.start +2s
  q3: show h3 at a.move.end +2s
  q4: show h4 at d.enter.start +2s
  q5: show h5 at b.exit.start +2s
  q6: show h6 at d.enter.end +2s
  q7: show h7 at q1.end +500ms
]]

NARRATOR
Five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen.

INT. THREE - DAY #sc3#

Title {id=t cell=mc class=title}
Probe {id=h8 cell=bl class=muted visible=false}
Probe {id=h9 cell=br class=muted visible=false}

[[effects
  q8: show h8 at transition.end +2s
  q9: show h9 at t.enter.start +2s
]]

NARRATOR
Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu.

> CUT

INT. FOUR - DAY #sc4#

Cut {id=c cell=ml class=title}
Probe {id=h10 cell=mr class=muted visible=false}

[[effects
  q10: show h10 at transition.end +2s
]]

NARRATOR
Red orange yellow green blue indigo violet white grey black.
`;

class Coverage extends Context.Service<Coverage, FixtureData>()(
  "@tsukuri/verify/test/Coverage"
) {
  static readonly layer = Layer.effect(
    Coverage,
    buildFixtureOf(story, revealRenderer)
  ).pipe(Layer.provideMerge(services));
}

layer(Coverage.layer, { excludeTestServices: true, timeout: "300 seconds" })(
  "the lifecycle reveal.js declares, against every event of a story that probes each",
  (it) => {
    it.effect(
      "every probe is observed where its anchor is observed, and both where the Timeline resolved them",
      () =>
        Effect.gen(function* covered() {
          const built = yield* Coverage;

          const verdicts = yield* runChecks({
            buildDir: built.build,
            cacheDir: built.cacheDir,
            sourcePath: built.sourcePath,
          });

          const verdict = verdictOf(verdicts, "F1");

          yield* Effect.log(Arr.join(measuredOf(verdict), "\n"));
          assert.strictEqual(verdict.status, "pass", verdict.detail);

          // Every probe has an observed anchor, within a frame of where the Timeline put it.
          for (const [scene, probes] of [
            ["sc2", ["q1", "q2", "q3", "q4", "q5", "q6", "q7"]],
            ["sc3", ["q8", "q9"]],
            ["sc4", ["q10"]],
          ] as const) {
            for (const probe of probes) {
              const found = offsetsIn(
                rowOf(verdict, `${scene}.${probe}#1 show`)
              );

              assert.isAtMost(
                Math.abs(found.anchor ?? Number.NaN),
                1,
                `${scene}.${probe}`
              );
            }
          }
        })
    );
  }
);
