// Dialogue text to narration text and words (spec 0002: dialogue is prose, byte for byte what is spoken and
// subtitled, so it contains no `[[...]]` at all). A note in dialogue is a release-1 cue: it is returned with its
// position, and the Scene (`hints.ts`) turns it into an error that carries the replacement. A plain function.

import { planError } from "./errors.ts";
import type { PlanError } from "./errors.ts";
import { problem } from "./grammar.ts";

/** A release-1 cue `[[...]]` in dialogue: what it says, where it stands, and how many words of its Line come before. */
export interface LegacyCue {
  readonly inner: string;
  readonly line: number;
  readonly wordsBefore: number;
}

export interface Narration {
  /** The release-1 cues of the Line, in order; the Scene turns them into errors that carry a replacement. */
  readonly cues: readonly LegacyCue[];
  readonly errors: readonly PlanError[];
  readonly text: string;
  readonly words: readonly string[];
}

const notePattern = /\[\[(?<inner>[\s\S]*?)\]\]/gu;

const collapse = (text: string): string => text.replaceAll(/\s+/gu, " ").trim();

const wordsOf = (text: string): readonly string[] =>
  text === "" ? [] : text.split(" ");

/** The 1-based source line of `offset` in a dialogue text whose first line is `firstLine`. */
const lineAt = (text: string, offset: number, firstLine: number): number =>
  firstLine + text.slice(0, offset).split("\n").length - 1;

/**
 * Splits the dialogue of one Line. `text` is the token text (lines joined by `\n`); `firstLine` is the source line
 * of its first line. Every `[[...]]` is an error with its replacement; the narration is the text without them.
 */
export const parseNarration = (text: string, firstLine: number): Narration => {
  const errors: PlanError[] = [];
  const cues: LegacyCue[] = [];
  let before = "";
  let cursor = 0;

  for (const match of text.matchAll(notePattern)) {
    before += text.slice(cursor, match.index);
    cursor = match.index + match[0].length;

    cues.push({
      inner: collapse(match.groups?.inner ?? ""),
      line: lineAt(text, match.index, firstLine),
      wordsBefore: wordsOf(collapse(before)).length,
    });
  }

  const masked = text.replaceAll(notePattern, (note) =>
    note.replaceAll(/[^\n]/gu, " ")
  );

  const stray = masked.search(/\[\[|\]\]/u);

  if (stray !== -1) {
    errors.push(
      planError(
        "ReleaseOneForm",
        lineAt(text, stray, firstLine),
        problem(
          "unbalanced [[ or ]] in dialogue",
          "no note in dialogue; effects live in the [[effects]] block of the Scene"
        )
      )
    );
  }

  const emphasis = masked.search(/[*_]/u);

  if (emphasis !== -1) {
    errors.push(
      planError(
        "EmphasisInDialogue",
        lineAt(text, emphasis, firstLine),
        problem(
          "emphasis markers (* and _) in dialogue",
          "plain words: narration, subtitles and notes are one string"
        )
      )
    );
  }

  const narration = collapse(text.replaceAll(notePattern, ""));

  return { cues, errors, text: narration, words: wordsOf(narration) };
};
