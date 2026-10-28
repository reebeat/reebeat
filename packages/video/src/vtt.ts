// WebVTT of the narration: one cue per Line, its start and end the Line's frames, its text the narration text
// exactly (no styling). The file starts with `WEBVTT`, a blank line and a `NOTE` that carries the source hash
// (spec 0001, F2 and F5). The cue identifier is the Line id, so a check can name the Line.
import { Array as Arr } from "effect";

import { frameToMs, vttTimestamp } from "./time.ts";
import { linesById } from "./timedPlan.ts";
import type { TimedPlan } from "./timedPlan.ts";

/** The WebVTT text of a scheduled Plan. */
export const vtt = (plan: TimedPlan): string => {
  const { fps } = plan.settings;
  const lines = linesById(plan);

  const cues = Arr.map(
    Arr.flatMap(plan.timeline.scenes, (scene) => scene.lines),
    (timed) =>
      Arr.join(
        [
          timed.lineId,
          `${vttTimestamp(frameToMs(timed.startFrame, fps))} --> ${vttTimestamp(frameToMs(timed.endFrame, fps))}`,
          lines.get(timed.lineId)?.text ?? "",
        ],
        "\n"
      )
  );

  return `${Arr.join(["WEBVTT", `NOTE source-sha256 ${plan.sourceSha256}`, ...cues], "\n\n")}\n`;
};
