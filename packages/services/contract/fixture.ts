// The Plan the Renderer and FrameCapturer contracts use unless an adapter supplies its own: one Scene, two Elements,
// one Line, with a Timeline so that a capturer knows its frame count. Built by the core's own `buildPlan` and
// `schedule`, so it is a valid Plan by construction.
import { buildPlan, schedule } from "@reebeat/core";
import type {
  AlignedLine,
  PlanError,
  PlanJson,
  RendererLifecycle,
  ScheduleError,
} from "@reebeat/core";
import { Array as Arr, Effect } from "effect";

const source = Arr.join(
  [
    "Title: Contract",
    "",
    "# Part",
    "",
    "INT. ONE #sc1#",
    "",
    "Ruler {id=ruler cell=ml class=box}",
    "Ticket {id=ticket cell=mr class=box}",
    "",
    "NARRATOR",
    "Names are cheap, friend.",
    "",
  ],
  "\n"
);

/** A stand-in digest: the contract suites never hash, and the core only copies `sourceSha256` into the Plan. */
const digest = "c0".repeat(32);

const wordMs = 400;

/** The aligned Line of `plan`'s Line: every word `wordMs` long, so the Timeline has integer frames. */
const alignedLines = (plan: PlanJson): readonly AlignedLine[] =>
  Arr.flatMap(plan.scenes, (scene) =>
    Arr.map(scene.lines, (line) => ({
      audio: { file: `${digest}.flac`, sha256: digest },
      durationMs: wordMs * line.words.length,
      lineId: line.id,
      words: Arr.map(line.words, (w, index) => ({
        endMs: (index + 1) * wordMs - 50,
        startMs: index * wordMs,
        w,
      })),
    }))
  );

/**
 * A renderer's declaration of its slide change, for the Plan the contracts schedule: sane numbers (the Auto-Animate
 * duration is the Plan's own 0.8 s), not the measurements of any adapter.
 */
export const contractLifecycle: RendererLifecycle = {
  matched: { easing: [0.25, 0.1, 0.25, 1], startLagFrames: 2 },
  showMs: 133,
  transitionMs: { "auto-animate": 800, cut: 0, default: 400 },
  unmatched: { enter: { endLagFrames: 22, startLagFrames: 8 } },
};

/** The contract Plan, with its Timeline. */
export const contractPlan = Effect.flatMap(buildPlan(source, digest), (plan) =>
  schedule(plan, alignedLines(plan), contractLifecycle)
);

export interface PlanOptions {
  /** A Plan with a Timeline and at least one Element; the default is the contract Plan. */
  readonly plan?: PlanJson;
}

/** What building the contract Plan can fail with. */
export type FixtureError = PlanError | ScheduleError;
