// The comparison two rules and a Renderer's own check share: where do two ordered lists first part ways?
import { Array as Arr, Option } from "effect";

/**
 * The first position at which two lists differ (a missing or extra member counts), or undefined when they agree.
 * `same` says whether the member `want` of `wanted` is the member `have` of `found`.
 */
export const firstDifference = <Wanted, Found>(
  wanted: readonly Wanted[],
  found: readonly Found[],
  same: (want: Wanted, have: Found) => boolean
): number | undefined =>
  Option.match(
    Arr.findFirstIndex(
      Arr.zip(wanted, found),
      ([want, have]) => !same(want, have)
    ),
    {
      onNone: () =>
        wanted.length === found.length
          ? undefined
          : Math.min(wanted.length, found.length),
      onSome: (position) => position,
    }
  );
