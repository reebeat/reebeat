import type { MuxRequest } from "@reebeat/services";
// Chapter marks in the ffmpeg metadata format (https://ffmpeg.org/ffmpeg-formats.html#Metadata-1): one chapter per
// request chapter, in milliseconds. Plain function.
import { Array as Arr } from "effect";

// `=`, `;`, `#`, `\` and a newline are escaped with a backslash.
const escapeValue = (text: string): string =>
  text.replaceAll(/[=;#\\\n]/gu, (char) => `\\${char}`);

/** The `ffmetadata` text of the chapters of a mux request. */
export const ffmetadata = (chapters: MuxRequest["chapters"]): string => {
  const blocks = Arr.map(chapters, (chapter) =>
    Arr.join(
      [
        "[CHAPTER]",
        "TIMEBASE=1/1000",
        `START=${chapter.startMs}`,
        `END=${chapter.endMs}`,
        `title=${escapeValue(chapter.title)}`,
      ],
      "\n"
    )
  );

  return `${Arr.join([";FFMETADATA1", ...blocks], "\n")}\n`;
};
