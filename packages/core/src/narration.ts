// Dialogue text to narration text, words and Cues (spec 0001, "Narration text" and "Cues"). A plain function.
import { Array as Arr, Option, Schema, String as Str, pipe } from "effect";

import { idPattern } from "./elements.ts";
import { planError } from "./errors.ts";
import type { PlanError } from "./errors.ts";
import { SfxNameSchema, sfxNames } from "./plan.ts";
import type { Cue } from "./plan.ts";

/** A Cue before ids exist: the id is `sc<N>.l<M>.c<K>`, assigned when the Plan is assembled. */
export type CueDraft = Omit<Cue, "anchor" | "id">;

export interface Narration {
  readonly cues: readonly CueDraft[];
  readonly errors: readonly PlanError[];
  readonly text: string;
  readonly words: readonly string[];
}

const cuePattern = /\[\[(?<inner>[\s\S]*?)\]\]/gu;
const cueSplit = new RegExp(cuePattern.source, "u");
const focusPattern = /^focus:\s*(?<id>\S+)$/u;
const sfxPattern = /^sfx:\s*(?<name>\S+)$/u;
const isSfx = Schema.is(SfxNameSchema);

const collapse = (text: string): string =>
  pipe(text, Str.replaceAll(/\s+/gu, " "), Str.trim);

const wordsOf = (text: string): readonly string[] =>
  text === "" ? [] : Str.split(text, " ");

/** The 1-based source line of `offset` in a dialogue text whose first line is `firstLine`. */
const lineAt = (text: string, offset: number, firstLine: number): number =>
  firstLine + pipe(text, Str.slice(0, offset), Str.split("\n")).length - 1;

/** Reads the inside of one `[[...]]`: a Cue, or the error that says why it is not one. */
const parseCue = (
  inner: string,
  line: number,
  afterWord: number
): CueDraft | PlanError => {
  const trimmed = Str.trim(inner);
  const focus = focusPattern.exec(trimmed)?.groups?.id;
  const sfx = sfxPattern.exec(trimmed)?.groups?.name;

  if (trimmed === "next") {
    return { afterWord, arg: null, kind: "next", line };
  }

  if (focus !== undefined && idPattern.test(focus)) {
    return { afterWord, arg: focus, kind: "focus", line };
  }

  if (sfx !== undefined && isSfx(sfx)) {
    return { afterWord, arg: sfx, kind: "sfx", line };
  }

  if (sfx !== undefined) {
    return planError(
      "UnknownSfx",
      line,
      `unknown sound "${sfx}": the catalogue is ${Arr.join(sfxNames, ", ")}`
    );
  }

  return planError(
    "UnknownCue",
    line,
    `unknown Cue [[${trimmed}]]: use [[next]], [[focus: id]] or [[sfx: ${Arr.join(sfxNames, "|")}]]`
  );
};

/** `[[` and `]]` around the inner text of a Cue. */
const cueBracketLength = 4;

/**
 * Splits `text` on its Cues. The pattern captures the inner text, so the result alternates the text between Cues
 * (even positions) with the inner text of a Cue (odd positions); an offset needs no match index.
 */
const cueParts = (text: string): readonly string[] => Str.split(text, cueSplit);

/** Blanks the Cues of `text` with spaces, keeping newlines and offsets. */
const maskCues = (text: string): string =>
  Arr.join(
    Arr.map(cueParts(text), (part, index) =>
      index % 2 === 1 ? Str.replaceAll(/[^\n]/gu, " ")(`[[${part}]]`) : part
    ),
    ""
  );

/**
 * Splits the dialogue of one Line. `text` is the token text (lines joined by `\n`); `firstLine` is the source
 * line of its first line. Narration is the text without its Cues, whitespace collapsed; a Cue follows the
 * last word before it.
 */
export const parseNarration = (text: string, firstLine: number): Narration => {
  const errors: PlanError[] = [];
  const cues: CueDraft[] = [];
  let before = "";
  let offset = 0;

  for (const [index, part] of cueParts(text).entries()) {
    if (index % 2 === 0) {
      before += part;
      offset += part.length;
    } else {
      const parsed = parseCue(
        part,
        lineAt(text, offset, firstLine),
        wordsOf(collapse(before)).length - 1
      );

      if ("_tag" in parsed) {
        errors.push(parsed);
      } else {
        cues.push(parsed);
      }

      offset += part.length + cueBracketLength;
    }
  }

  const masked = maskCues(text);
  const stray = Str.search(masked, /\[\[|\]\]/u);
  const emphasis = Str.search(masked, /[*_]/u);

  if (Option.isSome(stray)) {
    errors.push(
      planError(
        "UnknownCue",
        lineAt(text, stray.value, firstLine),
        "unbalanced [[ or ]]: a Cue is written [[next]], [[focus: id]] or [[sfx: name]] on one line"
      )
    );
  }

  if (Option.isSome(emphasis)) {
    errors.push(
      planError(
        "EmphasisInDialogue",
        lineAt(text, emphasis.value, firstLine),
        "emphasis markers (* and _) are not allowed in dialogue: narration, subtitles and notes are one string"
      )
    );
  }

  const narration = collapse(Str.replaceAll(cuePattern, "")(text));

  return { cues, errors, text: narration, words: wordsOf(narration) };
};
