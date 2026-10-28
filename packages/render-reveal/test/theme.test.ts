// The theme's colours: every text class of the Deck keeps at least 4.5:1 (WCAG 2.x AA, normal text) against every
// background it can meet, checked by the lint rule `contrast` on the palette the stylesheet is generated from.
import { assert, describe, it } from "@effect/vitest";
import { elementClasses } from "@reebeat/core";
import { contrast } from "@reebeat/lint";
import { Array as Arr, Order, Record } from "effect";

import { classColors, palette, themeCss } from "../src/theme.ts";
import type { DeckSettings } from "../src/theme.ts";

/** A stylesheet with every pixel length replaced by 0px. */
const blankLengths = (css: string): string =>
  css.replaceAll(/\d+(?:\.\d+)?px/gu, "0px");

const standard: DeckSettings = { height: 720, transition: 0.8, width: 1280 };

/** Every class colour on each background it can meet (the slide; a box), as the lint rule reads them. */
const classPairs = (colors: Readonly<Record<string, string>>) =>
  Arr.flatMap(Record.toEntries(colors), ([name, color]) =>
    Arr.map([palette.slideBackground, palette.boxBackground], (background) => ({
      background,
      foreground: color,
      label: name,
    }))
  );

describe("theme", () => {
  it("styles exactly the classes the Plan allows", () => {
    assert.deepStrictEqual(
      Arr.sort(Record.keys(classColors), Order.String),
      Arr.sort(elementClasses, Order.String)
    );
  });

  it("keeps at least 4.5:1 for every class on the slide and on a box", () => {
    assert.deepStrictEqual(contrast(classPairs(classColors), 4.5), []);
  });

  it("control: the lint rule names a class whose colour falls below 4.5:1", () => {
    const [found, ...rest] = contrast(
      classPairs({ ...classColors, muted: "#8a8f9c" }),
      4.5
    );

    assert.strictEqual(rest.length, 1);
    assert.strictEqual(found?.rule, "contrast");
    assert.include(found?.message ?? "", "muted: #8a8f9c on #f7f5f0");
  });

  it("writes the palette's colours into the stylesheet", () => {
    const css = themeCss(standard);

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

  it("scales every length with the slide height and changes nothing else", () => {
    const large = themeCss({ ...standard, height: 1080, width: 1920 });
    const base = themeCss(standard);

    assert.include(base, "font-size: 46px;");
    assert.include(large, "font-size: 69px;");
    assert.include(base, "padding: 36px;");
    assert.include(large, "padding: 54px;");
    assert.notInclude(large, "46px");

    // Colours, classes and selectors do not depend on the size: with the lengths blanked the two sheets are equal.
    assert.strictEqual(blankLengths(large), blankLengths(base));
  });
});
