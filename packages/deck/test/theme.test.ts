// The theme's colours: every text class of the Deck keeps at least 4.5:1 (WCAG 2.x AA, normal text) against every
// background it can meet, computed with the WCAG formula from the palette the stylesheet is generated from.
import { assert, describe, it } from "@effect/vitest";
import { elementClasses } from "@reebeat/core";
import { Array as Arr, Order, Record } from "effect";

import { classColors, palette, themeCss } from "../src/theme.ts";

/** Linear light of one 8-bit sRGB channel (WCAG 2.x relative luminance). */
const linear = (channel: number): number => {
  const unit = channel / 255;

  return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
};

const luminance = (hex: string): number => {
  const [red = 0, green = 0, blue = 0] = Arr.map([1, 3, 5], (start) =>
    Number.parseInt(hex.slice(start, start + 2), 16)
  );

  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
};

const contrast = (first: string, second: string): number => {
  const lighter = Math.max(luminance(first), luminance(second));
  const darker = Math.min(luminance(first), luminance(second));

  return (lighter + 0.05) / (darker + 0.05);
};

describe("theme", () => {
  it("styles exactly the classes the Plan allows", () => {
    assert.deepStrictEqual(
      Arr.sort(Record.keys(classColors), Order.String),
      Arr.sort(elementClasses, Order.String)
    );
  });

  it("keeps at least 4.5:1 for every class on the slide and on a box", () => {
    for (const [name, color] of Record.toEntries(classColors)) {
      for (const background of [
        palette.slideBackground,
        palette.boxBackground,
      ]) {
        assert.isAtLeast(
          contrast(color, background),
          4.5,
          `${name} ${color} on ${background}`
        );
      }
    }
  });

  it("writes the palette's colours into the stylesheet", () => {
    const css = themeCss();

    for (const color of [
      palette.accent,
      palette.boxBackground,
      palette.focusRing,
      palette.muted,
      palette.slideBackground,
      palette.text,
    ]) {
      assert.include(css, color);
    }
  });

  it("control: the formula rejects a pair below the threshold", () => {
    assert.isBelow(contrast("#777777", "#ffffff"), 4.5);
    assert.closeTo(contrast("#000000", "#ffffff"), 21, 1e-9);
    assert.closeTo(contrast("#ffffff", "#ffffff"), 1, 1e-9);
  });
});
