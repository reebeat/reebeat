// The cues of a WebVTT file as data: the subtitles tsukuri writes are plain cues, each a timing line and its text.
import type { SubtitleCue } from "@tsukuri/lifecycle";
import { Array as Arr, Option, Result, String as Str } from "effect";

import { clip } from "./pages.ts";

const timing = /^(?<start>[\d:.]+) --> (?<end>[\d:.]+)/u;

const stamp =
  /^(?:(?<hours>\d+):)?(?<minutes>\d{2}):(?<seconds>\d{2})\.(?<millis>\d{3})$/u;

const msOf = (text: string): number => {
  const parts = stamp.exec(text)?.groups;

  return (
    Number(parts?.hours ?? 0) * 3_600_000 +
    Number(parts?.minutes ?? 0) * 60_000 +
    Number(parts?.seconds ?? 0) * 1000 +
    Number(parts?.millis ?? 0)
  );
};

/** The most characters of one cue's text a result carries. */
const cueLimit = 500;

const cueOf = (block: string) => {
  const lines = Str.split("\n")(block);

  const at = Option.getOrElse(
    Arr.findFirstIndex(lines, (line) => timing.test(line)),
    () => -1
  );

  const groups = timing.exec(lines[at] ?? "")?.groups;

  return groups?.start === undefined || groups.end === undefined
    ? Result.failVoid
    : Result.succeed<SubtitleCue>({
        endMs: msOf(groups.end),
        startMs: msOf(groups.start),
        text: clip(
          Str.trimEnd(Arr.join(Arr.drop(lines, at + 1), "\n")),
          cueLimit
        ),
      });
};

export const parseVtt = (text: string): readonly SubtitleCue[] =>
  Arr.filterMap(Str.split(/\n\n+/u)(Str.replaceAll("\r\n", "\n")(text)), cueOf);
