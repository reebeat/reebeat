// Finding a phrase of the narration (spec 0002: `word("matches", 2).end`). A phrase is one or more words that stand
// next to each other in one Line; words compare in their normalised form (`normaliseWord`: case, punctuation, US
// spelling, numerals), the same form the aligner uses. Plain functions.
import { Array as Arr, String as Str } from "effect";

import { normaliseWord } from "./align.ts";
import type { Line } from "./plan.ts";

/** Where a phrase stands: the index of its Line in the Scene and the inclusive range of its words in that Line. */
export interface PhraseMatch {
  readonly from: number;
  readonly line: number;
  readonly to: number;
}

/**
 * The words of a Line: its text split on single spaces (the text has its whitespace collapsed). The one place that
 * splits it; a Line stores no list of words, so the text and its words cannot disagree. The speech cache keys and
 * the aligner read these words, so the split is part of the cache contract.
 */
export const wordsOf = (text: string): readonly string[] =>
  text === "" ? [] : Str.split(text, " ");

/** The normalised words of a phrase. */
export const phraseTokens = (phrase: string): readonly string[] =>
  Arr.map(
    Arr.filter(Str.split(phrase, /\s+/u), (word) => word !== ""),
    normaliseWord
  );

/** Every place the phrase stands in the Lines of a Scene, in narration order. */
export const findPhrase = (
  lines: readonly Pick<Line, "text">[],
  phrase: string
): readonly PhraseMatch[] => {
  const wanted = phraseTokens(phrase);
  const found: PhraseMatch[] = [];

  if (wanted.length === 0) {
    return found;
  }

  for (const [line, { text }] of lines.entries()) {
    const spoken = Arr.map(wordsOf(text), normaliseWord);

    for (let from = 0; from + wanted.length <= spoken.length; from += 1) {
      if (
        Arr.every(wanted, (token, offset) => spoken[from + offset] === token)
      ) {
        found.push({ from, line, to: from + wanted.length - 1 });
      }
    }
  }

  return found;
};

/** The distinct words of a Scene's narration as the author writes them (punctuation stripped), for `did you mean`. */
export const narrationWords = (
  lines: readonly Pick<Line, "text">[]
): readonly string[] =>
  Arr.dedupe(
    Arr.flatMap(lines, ({ text }) =>
      Arr.filter(
        Arr.map(wordsOf(text), (word) =>
          Str.replaceAll(/[^\p{L}\p{N}'-]/gu, "")(word)
        ),
        (word) => word !== ""
      )
    )
  );
