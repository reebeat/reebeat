// WebVTT of the narration: one cue per Line, its start and end the Line's frames, its text the narration text
// exactly (no styling) but for the three characters WebVTT reserves in cue text: `&`, `<` and `>` are written as
// `&amp;`, `&lt;` and `&gt;`, which a reader (and ffmpeg's `mov_text` conversion) turns back into the narration. The file starts with `WEBVTT`, a blank line and a `NOTE` that carries the source hash
// (spec 0001, F2 and F5). The cue identifier is the Line id, so a check can name the Line.
import type { TimedPlan } from "@reebeat/core";
import { Array as Arr, String as Str, pipe } from "effect";

import { subtitleCues } from "./cues.ts";
import { vttTimestamp } from "./time.ts";

/** Cue text as WebVTT writes it: `&` first, so the entities it adds are not escaped again. */
const escapeCueText = (text: string): string =>
  pipe(
    text,
    Str.replaceAll("&", "&amp;"),
    Str.replaceAll("<", "&lt;"),
    Str.replaceAll(">", "&gt;")
  );

/** The WebVTT text of a scheduled Plan. */
export const vtt = (plan: TimedPlan): string => {
  const cues = Arr.map(subtitleCues(plan), (cue) =>
    Arr.join(
      [
        cue.id,
        `${vttTimestamp(cue.startMs)} --> ${vttTimestamp(cue.endMs)}`,
        escapeCueText(cue.text),
      ],
      "\n"
    )
  );

  return `${Arr.join(["WEBVTT", `NOTE source-sha256 ${plan.sourceSha256}`, ...cues], "\n\n")}\n`;
};
