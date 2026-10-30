// Paging by construction (spec 0016, F8): a result never exceeds its budget because the page stops before it would.
// Budgets count JSON-escaped characters, which is what a client's size limit sees. Plain functions.
import { Array as Arr, String as Str } from "effect";

/** The most JSON characters one page of text or items may take. A result carries its value twice (a text block and structuredContent), so two pages and the fields around them stay under the 45,000-character budget of F8. */
export const pageBudget = 20_000;

/** The default and the largest number of items on a page. */
const defaultLimit = 50;

const jsonLength = (text: string): number => JSON.stringify(text).length;

/** A line cut to fit the budget by itself. */
const cutMarker = " [line cut]";

export interface TextPage {
  readonly fromLine: number;
  readonly nextLine?: number;
  readonly text: string;
  readonly toLine: number;
  readonly totalLines: number;
}

/** Lines of `text`; a trailing newline does not start another line. */
export const linesOf = (text: string): readonly string[] => {
  const lines = Str.split("\n")(text);

  return lines.at(-1) === "" ? Arr.take(lines, lines.length - 1) : lines;
};

const fit = (line: string): string => {
  if (jsonLength(line) <= pageBudget) {
    return line;
  }

  let end = Math.min(line.length, pageBudget - cutMarker.length - 2);

  while (
    end > 0 &&
    jsonLength(Str.slice(0, end)(line) + cutMarker) > pageBudget
  ) {
    end -= Math.ceil(end / 8);
  }

  return Str.slice(0, end)(line) + cutMarker;
};

/**
 * Lines `fromLine` to `toLine` (1-based, inclusive; the end of the text when absent) as one page that stops before the
 * budget. `nextLine` says where the next page starts when the page stopped early. A start past the end is an empty
 * page, so a client that walks pages never fails at the end.
 */
export const pageText = (
  text: string,
  fromLine: number,
  toLine?: number
): TextPage => {
  const lines = linesOf(text);
  const last = Math.min(toLine ?? lines.length, lines.length);
  const taken: string[] = [];
  let used = 0;
  let line = fromLine;

  while (line <= last) {
    const next = fit(lines[line - 1] ?? "");
    const cost = jsonLength(next) - 2 + 1;

    if (taken.length > 0 && used + cost > pageBudget) {
      break;
    }

    taken.push(next);
    used += cost;
    line += 1;
  }

  const base = {
    fromLine,
    text: Arr.join(taken, "\n"),
    toLine: fromLine + taken.length - 1,
    totalLines: lines.length,
  };

  return line <= last ? { ...base, nextLine: line } : base;
};

export interface ItemPage<A> {
  readonly items: readonly A[];
  readonly nextCursor?: number;
}

/**
 * Items from `cursor`, at most `limit`, stopping before the budget (each item costs its JSON length). The first
 * item of a page is always taken, so a page is never empty while items remain.
 */
export const pageItems = <A>(
  all: readonly A[],
  options: { readonly cursor?: number; readonly limit?: number }
): ItemPage<A> => {
  const start = options.cursor ?? 0;
  const limit = options.limit ?? defaultLimit;
  const items: A[] = [];
  let used = 0;
  let index = start;

  while (index < all.length && items.length < limit) {
    const item = all[index];

    if (item === undefined) {
      break;
    }

    const cost = JSON.stringify(item).length + 1;

    if (items.length > 0 && used + cost > pageBudget) {
      break;
    }

    items.push(item);
    used += cost;
    index += 1;
  }

  return index < all.length ? { items, nextCursor: index } : { items };
};

/** The most characters of one text a list item may carry. */
export const clip = (text: string, limit: number): string =>
  text.length <= limit ? text : `${Str.slice(0, limit - 1)(text)}…`;
