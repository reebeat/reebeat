// The Fountain adapter: `fountain-js` 1.2.4 plus a line-recovery preprocessor (spec 0001, Revisions, "M0 measured:
// parser"). `fountain-js` gives no line numbers, so the source is cut into blank-line blocks that remember their
// first line, each block is parsed alone, and each token gets the first block line that contains its text.
// A plain function: no Effect, no error channel.
import { Array as Arr } from "effect";
import { Fountain } from "fountain-js";

/** A `fountain-js` token with the 1-based source line it starts on. */
export interface FountainToken {
  /** Section depth (`#` count); 0 for other tokens. */
  readonly depth: number;
  readonly line: number;
  /** The `#1#` scene number of a scene heading, which `fountain-js` strips from `text`; empty when absent. */
  readonly sceneNumber: string;
  /** The token text; empty for tokens that have none (`dialogue_begin`, `page_break`, ...). */
  readonly text: string;
  /** True for the tokens of the title page (`Title:`, `Author:`, ...). */
  readonly titlePage: boolean;
  readonly type: string;
}

interface Block {
  readonly lines: readonly string[];
  /** 1-based source line of `lines[0]`. */
  readonly start: number;
}

/** Replaces every boneyard by its newlines, so the text outside it keeps its line numbers. */
const maskBoneyards = (source: string): string =>
  source.replaceAll(/\/\*[\s\S]*?\*\//gu, (boneyard) =>
    "\n".repeat(boneyard.split("\n").length - 1)
  );

/** Fountain's own rule: a line of whitespace is blank, except exactly two spaces (a forced line break). */
const isBlank = (line: string): boolean => line !== "  " && line.trim() === "";

const toBlocks = (source: string): readonly Block[] => {
  const blocks: Block[] = [];
  // A byte order mark is not text; `sourceSha256` still covers it, because the hash is of the source as given.
  const text = source.replace(/^\uFEFF/u, "").replaceAll(/\r\n?/gu, "\n");
  const lines = maskBoneyards(text).split("\n");
  let start = 0;
  let current: string[] = [];

  for (const [index, line] of lines.entries()) {
    if (!isBlank(line)) {
      start = current.length === 0 ? index + 1 : start;
      current.push(line);
    } else if (current.length > 0) {
      blocks.push({ lines: current, start });
      current = [];
    }
  }

  if (current.length > 0) {
    blocks.push({ lines: current, start });
  }

  return blocks;
};

/**
 * `fountain-js` keeps one static flag between calls (`Lexer.lastLineWasDualDialogue`), so a block with dual
 * dialogue would make the next block look like the left half of one. Parsing a plain dialogue block clears it.
 */
const resetLexerState = (): void => {
  new Fountain().parse("A\nb", false);
};

/** The index of the first line at or after `from` that contains `needle`; `from` when none does. */
const locate = (
  lines: readonly string[],
  from: number,
  needle: string
): number => {
  for (let index = from; index < lines.length; index += 1) {
    if (lines[index]?.includes(needle) === true) {
      return index;
    }
  }

  return from;
};

const parseBlock = (block: Block, first: boolean): readonly FountainToken[] => {
  resetLexerState();
  // Only the first block may be a title page: a sentinel line in front keeps `Note: x` in a later block an Action.
  const body = Arr.join(block.lines, "\n");

  const parsed = new Fountain().parse(
    first ? body : `x\n\n${body}`,
    true
  ).tokens;

  const tokens: FountainToken[] = [];
  let cursor = 0;

  for (const token of first ? parsed : parsed.slice(1)) {
    const text = token.text ?? "";
    const needle = (text.split("\n")[0] ?? "").trim();
    const index = text === "" ? 0 : locate(block.lines, cursor, needle);

    tokens.push({
      depth: token.depth ?? 0,
      line: block.start + index,
      sceneNumber: token.scene_number ?? "",
      text,
      titlePage: token.is_title === true,
      type: token.type,
    });

    if (text !== "") {
      cursor = index + text.split("\n").length;
    }
  }

  return tokens;
};

/**
 * Tokenises a Fountain source. Boneyards are removed, blank lines separate blocks, and every token carries the
 * 1-based line of the source it starts on.
 */
export const parseFountain = (source: string): readonly FountainToken[] =>
  Arr.flatMap(toBlocks(source), (block, index) =>
    parseBlock(block, index === 0)
  );
