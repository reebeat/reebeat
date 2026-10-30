// SubRip of the narration: numbered cues from 1, `HH:MM:SS,mmm --> HH:MM:SS,mmm`, then the narration text, then a
// blank line. SubRip has no escapes and no header, so the text is the narration exactly: `<`, `>` and `&` pass
// through unchanged. (Some players read `<i>` as markup; the narration of a Plan has no markup by construction.)
import type { TimedPlan } from "@tsukuri/core";
import { Array as Arr } from "effect";

import { subtitleCues } from "./cues.ts";
import { srtTimestamp } from "./time.ts";

/** The SubRip text of a scheduled Plan. */
export const srt = (plan: TimedPlan): string =>
  Arr.join(
    Arr.map(
      subtitleCues(plan),
      (cue, index) =>
        `${index + 1}\n${srtTimestamp(cue.startMs)} --> ${srtTimestamp(cue.endMs)}\n${cue.text}\n`
    ),
    "\n"
  );
