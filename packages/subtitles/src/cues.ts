// One subtitle cue per Line of a scheduled Plan: the Line's id, its start and end in milliseconds, its narration
// text. Both writers read the same list, so WebVTT and SubRip cannot disagree about timing or text.
import { frameToMs, planLines, timedLines } from "@tsukuri/core";
import type { Line, TimedPlan } from "@tsukuri/core";
import { Array as Arr } from "effect";

export interface SubtitleCue {
  readonly endMs: number;
  readonly id: string;
  readonly startMs: number;
  /** The narration text of the Line, exactly as the Plan has it. */
  readonly text: string;
}

/** The cues of a scheduled Plan, in Timeline order. */
export const subtitleCues = (plan: TimedPlan): readonly SubtitleCue[] => {
  const { fps } = plan.settings;

  const lines = new Map(
    Arr.map(planLines(plan), ({ id, line }): [string, Line] => [id, line])
  );

  return Arr.map(timedLines(plan.timeline), ({ id, timed }) => ({
    endMs: frameToMs(timed.endFrame, fps),
    id,
    startMs: frameToMs(timed.startFrame, fps),
    text: lines.get(id)?.text ?? "",
  }));
};
