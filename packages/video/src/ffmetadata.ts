// Chapter marks in the ffmpeg metadata format (https://ffmpeg.org/ffmpeg-formats.html#Metadata-1): one chapter per
// Section, in milliseconds, each ending where the next starts and the last at the end of the Video.
import { Array as Arr } from "effect";

import { frameToMs } from "./time.ts";
import type { TimedPlan } from "./timedPlan.ts";

// `=`, `;`, `#`, `\` and a newline are escaped with a backslash.
const escapeValue = (text: string): string =>
  text.replaceAll(/[=;#\\\n]/gu, (char) => `\\${char}`);

/** The `ffmetadata` text of a scheduled Plan. */
export const ffmetadata = (plan: TimedPlan): string => {
  const { fps } = plan.settings;
  const { chapters, totalFrames } = plan.timeline;

  const titles = new Map(
    Arr.map(plan.chapters, (chapter): [string, string] => [
      chapter.id,
      chapter.title,
    ])
  );

  const blocks = Arr.map(chapters, (chapter, index) => {
    const next = chapters[index + 1];
    const start = frameToMs(chapter.startFrame, fps);

    const end = frameToMs(
      next === undefined ? totalFrames : next.startFrame,
      fps
    );

    return Arr.join(
      [
        "[CHAPTER]",
        "TIMEBASE=1/1000",
        `START=${start}`,
        `END=${end}`,
        `title=${escapeValue(titles.get(chapter.chapterId) ?? chapter.chapterId)}`,
      ],
      "\n"
    );
  });

  return `${Arr.join([";FFMETADATA1", ...blocks], "\n")}\n`;
};
