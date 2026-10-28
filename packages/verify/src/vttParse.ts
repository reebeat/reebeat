// WebVTT text to cues: the identifier, the times in milliseconds and the text lines. Reads what ffmpeg writes for a
// `mov_text` stream as well as what `@reebeat/video` writes; the header, NOTE and STYLE blocks are skipped.
import { Array as Arr, Option } from "effect";

export interface VttCue {
  readonly endMs: number;
  readonly startMs: number;
  /** The text lines joined by a newline, with `&amp;`, `&lt;` and `&gt;` unescaped. */
  readonly text: string;
}

const timing =
  /^(?:(?<sh>\d+):)?(?<sm>\d{2}):(?<ss>\d{2})\.(?<sf>\d{3})\s+-->\s+(?:(?<eh>\d+):)?(?<em>\d{2}):(?<es>\d{2})\.(?<ef>\d{3})/u;

const toMs = (
  hours: string | undefined,
  minutes: string | undefined,
  seconds: string | undefined,
  millis: string | undefined
): number =>
  (Number(hours ?? "0") * 60 + Number(minutes ?? "0")) * 60_000 +
  Number(seconds ?? "0") * 1000 +
  Number(millis ?? "0");

const unescape = (text: string): string =>
  text.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");

const cueOf = (block: string): Option.Option<VttCue> => {
  const rows = block.split("\n");

  return Option.flatMap(
    Arr.findFirstIndex(rows, (row) => timing.test(row)),
    (at) => {
      const found = timing.exec(rows[at] ?? "")?.groups;

      return found === undefined
        ? Option.none()
        : Option.some({
            endMs: toMs(found.eh, found.em, found.es, found.ef),
            startMs: toMs(found.sh, found.sm, found.ss, found.sf),
            text: unescape(Arr.join(Arr.drop(rows, at + 1), "\n")),
          });
    }
  );
};

/** Every cue of a WebVTT text, in order. */
export const parseVtt = (text: string): readonly VttCue[] =>
  Arr.getSomes(
    Arr.map(
      Arr.filter(
        text
          .replaceAll("\r\n", "\n")
          .trim()
          .split(/\n{2,}/u),
        (block) => !block.startsWith("WEBVTT") && !block.startsWith("NOTE")
      ),
      cueOf
    )
  );

/** The hash of the `NOTE source-sha256 <hash>` row of a WebVTT file written by `@reebeat/video`, or undefined. */
export const vttSourceHash = (text: string): string | undefined => {
  const prefix = "NOTE source-sha256 ";

  return Option.getOrUndefined(
    Option.map(
      Arr.findFirst(text.split("\n"), (row) => row.startsWith(prefix)),
      (row) => row.slice(prefix.length).trim()
    )
  );
};
