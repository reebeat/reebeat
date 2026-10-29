// Dialogue text to narration text, words and Cues (spec 0001, "Narration text" and "Cues"). A plain function.
import { Array as Arr, Schema } from "effect";

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
const focusPattern = /^focus:\s*(?<id>\S+)$/u;
const sfxPattern = /^sfx:\s*(?<name>\S+)$/u;
const isSfx = Schema.is(SfxNameSchema);

const collapse = (text: string): string => text.replaceAll(/\s+/gu, " ").trim();

const wordsOf = (text: string): readonly string[] =>
  text === "" ? [] : text.split(" ");

/** The 1-based source line of `offset` in a dialogue text whose first line is `firstLine`. */
const lineAt = (text: string, offset: number, firstLine: number): number =>
  firstLine + text.slice(0, offset).split("\n").length - 1;

/** Reads the inside of one `[[...]]`: a Cue, or the error that says why it is not one. */
const parseCue = (
  inner: string,
  line: number,
  afterWord: number
): CueDraft | PlanError => {
  const trimmed = inner.trim();
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

/** Blanks the Cues of `text` with spaces, keeping newlines and offsets. */
const maskCues = (text: string): string =>
  text.replaceAll(cuePattern, (cue) => cue.replaceAll(/[^\n]/gu, " "));

/**
 * Splits the dialogue of one Line. `text` is the token text (lines joined by `\n`); `firstLine` is the source
 * line of its first line. Narration is the text without its Cues, whitespace collapsed; a Cue follows the
 * last word before it.
 */
export const parseNarration = (text: string, firstLine: number): Narration => {
  const errors: PlanError[] = [];
  const cues: CueDraft[] = [];
  let before = "";
  let cursor = 0;

  for (const match of text.matchAll(cuePattern)) {
    before += text.slice(cursor, match.index);
    cursor = match.index + match[0].length;

    const parsed = parseCue(
      match.groups?.inner ?? "",
      lineAt(text, match.index, firstLine),
      wordsOf(collapse(before)).length - 1
    );

    if ("_tag" in parsed) {
      errors.push(parsed);
    } else {
      cues.push(parsed);
    }
  }

  const masked = maskCues(text);
  const stray = masked.search(/\[\[|\]\]/u);
  const emphasis = masked.search(/[*_]/u);

  if (stray !== -1) {
    errors.push(
      planError(
        "UnknownCue",
        lineAt(text, stray, firstLine),
        "unbalanced [[ or ]]: a Cue is written [[next]], [[focus: id]] or [[sfx: name]] on one line"
      )
    );
  }

  if (emphasis !== -1) {
    errors.push(
      planError(
        "EmphasisInDialogue",
        lineAt(text, emphasis, firstLine),
        "emphasis markers (* and _) are not allowed in dialogue: narration, subtitles and notes are one string"
      )
    );
  }

  const narration = collapse(text.replaceAll(cuePattern, ""));

  return { cues, errors, text: narration, words: wordsOf(narration) };
};
