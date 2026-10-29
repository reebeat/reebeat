// The README of `stories/same-id` quotes the story's effect lines; a line it quotes that the story does not write (it
// listed `+100ms` where the story says `+0.1s`) is a copy that drifted. Every quoted effect line must appear in
// `story.fountain` verbatim (the README lists some of the story's effects, not all).
import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Effect, Option, String as Str } from "effect";

import { readLocal } from "./support.ts";

/** The effect lines the README quotes in backticks, as written (`s1: sound ... at ...`). */
const quoted = (readme: string): readonly string[] =>
  Arr.flatMap(
    [...Str.matchAll(/`(?<line>[a-z]\d+: [^`]+)`/gu)(readme)],
    (found) => (found.groups?.line === undefined ? [] : [found.groups.line])
  );

/** An elided reason (`because "..."`) is quoted up to the opening quote of its reason. */
const needleOf = (line: string): string =>
  Option.match(Str.indexOf('"..."')(line), {
    onNone: () => line,
    onSome: (elided) => Str.slice(0, elided)(line),
  });

describe("stories/same-id/README.md", () => {
  it.effect("quotes only effect lines that story.fountain writes", () =>
    Effect.gen(function* readme() {
      const text = yield* readLocal("../../../stories/same-id/README.md");
      const story = yield* readLocal("../../../stories/same-id/story.fountain");
      const lines = quoted(text);

      assert.isAbove(lines.length, 5, "the README quotes the story's effects");
      assert.deepStrictEqual(
        Arr.filter(lines, (line) => !Str.includes(needleOf(line))(story)),
        []
      );
    })
  );

  it("negative control: a line that the story does not write is found", () => {
    const story = '  r1: show note at word("matches").end +0.1s';

    assert.isTrue(
      Str.includes(needleOf('r1: show note at word("matches").end +0.1s'))(
        story
      )
    );
    assert.isFalse(
      Str.includes(needleOf('r1: show note at word("matches").end +100ms'))(
        story
      )
    );
  });
});
