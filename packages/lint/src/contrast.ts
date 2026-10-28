// Rule `contrast` (spec 0001, the theme): the WCAG 2.x contrast ratio of a text colour on its background. The
// Deck's theme asserts that every class colour keeps 4.5:1 (AA, normal text) on every background it can meet.
import { Array as Arr } from "effect";

import type { Diagnostic } from "./diagnostic.ts";

export const contrastRule = "contrast";

/** A text colour on a background, both `#rrggbb`; `label` says which pair it is. */
export interface ColorPair {
  readonly background: string;
  readonly foreground: string;
  readonly label: string;
}

/** Linear light of one 8-bit sRGB channel (WCAG 2.x relative luminance). */
const linear = (channel: number): number => {
  const unit = channel / 255;

  return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
};

/** The WCAG relative luminance of `#rrggbb`. */
const luminance = (hex: string): number => {
  const [red = 0, green = 0, blue = 0] = Arr.map([1, 3, 5], (start) =>
    Number.parseInt(hex.slice(start, start + 2), 16)
  );

  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
};

/** The WCAG contrast ratio of two `#rrggbb` colours, from 1 (equal) to 21 (black on white); order does not matter. */
export const contrastRatio = (first: string, second: string): number => {
  const lighter = Math.max(luminance(first), luminance(second));
  const darker = Math.min(luminance(first), luminance(second));

  return (lighter + 0.05) / (darker + 0.05);
};

/** One diagnostic for each pair whose ratio is below `minimum`. */
export const contrast = (
  pairs: readonly ColorPair[],
  minimum: number
): readonly Diagnostic[] =>
  Arr.flatMap(pairs, (pair) => {
    const ratio = contrastRatio(pair.foreground, pair.background);

    return ratio >= minimum
      ? []
      : [
          {
            message: `${pair.label}: ${pair.foreground} on ${pair.background} is ${ratio.toFixed(2)}:1, below ${minimum}:1`,
            rule: contrastRule,
          },
        ];
  });
