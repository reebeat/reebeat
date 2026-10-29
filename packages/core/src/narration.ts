// Dialogue text to narration text and words (spec 0002: dialogue is prose, byte for byte what is spoken and
// subtitled, so it contains no `[[...]]` at all). A note in dialogue is a release-1 Cue and an error that gives the
// replacement. A plain function.

import { planError } from "./errors.ts";
import type { PlanError } from "./errors.ts";
import { problem } from "./grammar.ts";

export interface Narration {
  readonly errors: readonly PlanError[];
  readonly text: string;
  readonly words: readonly string[];
}

const notePattern = /\[\[(?<inner>[\s\S]*?)\]\]/gu;
const focusPattern = /^focus:\s*(?<id>\S+)$/u;
const sfxPattern = /^sfx:\s*(?<name>\S+)$/u;

const collapse = (text: string): string => text.replaceAll(/\s+/gu, " ").trim();

const wordsOf = (text: string): readonly string[] =>
  text === "" ? [] : text.split(" ");

/** The 1-based source line of `offset` in a dialogue text whose first line is `firstLine`. */
const lineAt = (text: string, offset: number, firstLine: number): number =>
  firstLine + text.slice(0, offset).split("\n").length - 1;

const releaseLine = (inner: string, after: string): string | undefined => {
  const focus = focusPattern.exec(inner)?.groups?.id;
  const sfx = sfxPattern.exec(inner)?.groups?.name;

  if (inner === "next") {
    return `r1: show <element id> at ${after}`;
  }

  if (focus !== undefined) {
    return `f1: focus ${focus} at ${after}`;
  }

  return sfx === undefined ? undefined : `s1: sound ${sfx} at ${after}`;
};

/** The effects line that replaces the release-1 Cue `inner`, timed against the word before it. */
const replacement = (inner: string, before: readonly string[]): string => {
  const last = before
    .at(-1)
    ?.replaceAll(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");

  const after = last === undefined ? "transition.start" : `word("${last}").end`;
  const line = releaseLine(inner, after);

  return line === undefined
    ? "remove it: effects live in the [[effects]] block of the Scene"
    : `write ${line} in the [[effects]] block of the Scene`;
};

/**
 * Splits the dialogue of one Line. `text` is the token text (lines joined by `\n`); `firstLine` is the source line
 * of its first line. Every `[[...]]` is an error with its replacement; the narration is the text without them.
 */
export const parseNarration = (text: string, firstLine: number): Narration => {
  const errors: PlanError[] = [];
  let before = "";
  let cursor = 0;

  for (const match of text.matchAll(notePattern)) {
    before += text.slice(cursor, match.index);
    cursor = match.index + match[0].length;

    const inner = collapse(match.groups?.inner ?? "");

    errors.push(
      planError(
        "ReleaseOneForm",
        lineAt(text, match.index, firstLine),
        problem(
          `release-1 cue [[${inner}]] in dialogue`,
          `no note in dialogue; ${replacement(inner, wordsOf(collapse(before)))}`
        )
      )
    );
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

  return { errors, text: narration, words: wordsOf(narration) };
};
