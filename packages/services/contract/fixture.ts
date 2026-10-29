// The Plan the Renderer and FrameCapturer contracts use unless an adapter supplies its own: one Scene, two Elements,
// one Line, with a Timeline so that a capturer knows its frame count. Built by the core's own `buildPlan` and
// `schedule`, so it is a valid Plan by construction.
import { buildPlan, schedule } from "@reebeat/core";
import type {
  AlignedLine,
  PlanError,
  PlanJson,
  ScheduleError,
} from "@reebeat/core";
import { Array as Arr, Effect, String as Str } from "effect";

const source = Arr.join(
  [
    "Title: Contract",
    "",
    "# Part",
    "",
    "INT. ONE",
    "",
    "Ruler {#ruler}",
    "",
    "Ticket {#ticket}",
    "",
    "NARRATOR",
    "Names are cheap, friend.",
    "",
  ],
  "\n"
);

/** A stand-in digest: the contract suites never hash, and the core only copies `sourceSha256` into the Plan. */
const digest = Str.repeat(32)("c0");

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

/** The contract Plan, with its Timeline. */
export const contractPlan = Effect.flatMap(buildPlan(source, digest), (plan) =>
  schedule(plan, alignedLines(plan))
);

export interface PlanOptions {
  /** A Plan with a Timeline and at least one Element; the default is the contract Plan. */
  readonly plan?: PlanJson;
}

/** What building the contract Plan can fail with. */
export type FixtureError = PlanError | ScheduleError;
