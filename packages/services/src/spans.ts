// The even spread the stand-ins and the contract share: `count` words over `totalMs`, each the same length, rounded
// to whole milliseconds so that one word ends where the next starts and the last ends at `totalMs`.
import { Array as Arr } from "effect";

import type { WordSpan } from "./types.ts";

/** `count` adjacent spans that fill `totalMs` evenly. */
export const evenSpans = (
  totalMs: number,
  count: number
): readonly WordSpan[] =>
  Arr.makeBy(count, (index) => ({
    endMs: Math.round(((index + 1) * totalMs) / count),
    startMs: Math.round((index * totalMs) / count),
  }));
