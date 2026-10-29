// A small scheduled Plan: three Scenes at 30 fps, about 7 s, built by the real core from a screenplay and an
// alignment worked out by hand (words of 300 ms, each spoken for 280 ms).
//
//   sc1  default, slide frame 0    "One two three four."  r1 show b at the end of "two", p1 pop at the end of "four"
//   sc2  auto-animate, frame 81    "Five six seven."      f1 focus a at the end of "five"
//   sc3  cut, frame 156            "Done."
//
// The frames follow the core's rules: a Line starts `sceneLead` (1 s) after its slide frame; a Line ends its audio
// duration later; a Scene ends `sceneTail` (0.5 s) after its last Line; an effect fires at `Line start + round(30 *
// word end)`; `commandFrame` is `fireFrame - 1` for show and focus, `fireFrame` for a sound. `test/fixtures/deck/deck.html` is
// the page that goes with it.
import { buildPlan, requireTimeline, schedule } from "@reebeat/core";
import type { AlignedLine, PlanJson, TimedPlan } from "@reebeat/core";
import { contractLifecycle } from "@reebeat/services/contract";
import { Array as Arr, Effect } from "effect";

const source = Arr.join(
  [
    "Title: Fixture",
    "",
    "# Part one",
    "",
    "INT. ONE #sc1#",
    "",
    "Box {id=a cell=tl class=box}",
    "Later {id=b cell=br class=label visible=false}",
    "",
    "[[effects",
    '  r1: show b at word("two").end',
    '  p1: sound pop at word("four").end',
    "]]",
    "",
    "NARRATOR",
    "One two three four.",
    "",
    "> AUTO-ANIMATE",
    "",
    "INT. TWO #sc2#",
    "",
    "Box {id=a cell=br class=accent}",
    "Entering {id=d cell=tl class=label}",
    "",
    "[[effects",
    '  f1: focus a at word("five").end',
    "]]",
    "",
    "NARRATOR",
    "Five six seven.",
    "",
    "# Part two",
    "",
    "> CUT",
    "",
    "INT. THREE #sc3#",
    "",
    "Done {id=c cell=mc class=title}",
    "",
    "NARRATOR",
    "Done.",
    "",
  ],
  "\n"
);

/** A cache file name of the Plan contract: 64 hex digits and `.flac`; `n` picks the digits. */
const audioFile = (n: number): string => `${n.toString(16).repeat(64)}.flac`;

/** How long each Line is spoken, in ms, by Line id. The last word of sc3.l1 ends at 580 ms, the others at `index * 300 + 280`. */
const durations = new Map([
  ["sc1.l1", 1200],
  ["sc2.l1", 1000],
  ["sc3.l1", 600],
]);

const alignedLines = (plan: PlanJson): readonly AlignedLine[] =>
  Arr.flatMap(plan.scenes, (scene, sceneIndex) =>
    Arr.map(scene.lines, (line) => ({
      audio: { file: audioFile(sceneIndex + 1), sha256: `0${sceneIndex}` },
      durationMs: durations.get(line.id) ?? 0,
      lineId: line.id,
      words: Arr.map(line.words, (w, index) => ({
        endMs: line.id === "sc3.l1" ? 580 : index * 300 + 280,
        startMs: index * 300,
        w,
      })),
    }))
  );

/** The fixture Plan with its Timeline checked against its Scenes. A module value: the tests read it as data. */
export const fixture: TimedPlan = await Effect.runPromise(
  Effect.gen(function* timedFixturePlan() {
    const plan = yield* buildPlan(source, "5ca1ab1e".repeat(8));

    return yield* Effect.fromResult(
      requireTimeline(
        yield* schedule(plan, alignedLines(plan), contractLifecycle)
      )
    );
  })
);
