// F3 of spec 0002: the grammar document is generated from the schema and every example in it parses. The checked-in
// `docs/grammar/effects.md` must equal what `grammarDocument()` writes (so an edit of `grammar.ts` or `plan.ts`
// fails until `bun tools/quality/genGrammar.ts` is run), every `fountain` example must build a Plan, and every
// `fountain-invalid` example must fail with exactly the error printed under it.
import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Effect, String as Str } from "effect";

import { buildPlan, collectErrors } from "../src/build.ts";
import { grammarDocument } from "../src/grammarDoc.ts";
import { verbs } from "../src/plan.ts";
import { fixtureSha256, readLocal } from "./support.ts";

const checkedIn = readLocal("../../../docs/grammar/effects.md");

interface Example {
  readonly error: { line: number; message: string; tag: string } | undefined;
  readonly kind: string;
  readonly source: string;
}

/** Every fenced `fountain` and `fountain-invalid` block of a document, with the error line that follows an invalid one. */
const examplesOf = (document: string): readonly Example[] =>
  Arr.map(
    [
      ...Str.matchAll(
        /```(?<kind>fountain(?:-invalid)?)\n(?<source>[\s\S]*?)\n```\n(?:\n> line (?<line>\d+), (?<tag>\w+): (?<message>.*)\n)?/gu
      )(document),
    ],
    ({ groups }): Example => ({
      error:
        groups?.tag === undefined
          ? undefined
          : {
              line: Number(groups.line),
              message: groups.message ?? "",
              tag: groups.tag,
            },
      kind: groups?.kind ?? "",
      source: `${groups?.source ?? ""}\n`,
    })
  );

describe("the grammar document", () => {
  it.effect("is the text its generator writes", () =>
    Effect.gen(function* generated() {
      assert.strictEqual(yield* checkedIn, grammarDocument());
    })
  );

  it.effect(
    "has valid examples and invalid ones, so both halves are tested",
    () =>
      Effect.gen(function* both() {
        const examples = examplesOf(yield* checkedIn);

        assert.isAtLeast(
          Arr.filter(examples, ({ kind }) => kind === "fountain").length,
          2
        );
        assert.isAtLeast(
          Arr.filter(examples, ({ kind }) => kind === "fountain-invalid")
            .length,
          5
        );
      })
  );

  it.effect("parses every valid example into a Plan", () =>
    Effect.gen(function* valid() {
      const examples = Arr.filter(
        examplesOf(yield* checkedIn),
        ({ kind }) => kind === "fountain"
      );

      for (const example of examples) {
        assert.deepStrictEqual(collectErrors(example.source), []);
        assert.isDefined(yield* buildPlan(example.source, fixtureSha256));
      }
    })
  );

  it.effect("fails every invalid example with the error printed under it", () =>
    Effect.gen(function* invalid() {
      const examples = Arr.filter(
        examplesOf(yield* checkedIn),
        ({ kind }) => kind === "fountain-invalid"
      );

      for (const example of examples) {
        const [first] = collectErrors(example.source);

        assert.isDefined(
          example.error,
          "an error is printed under the example"
        );
        assert.strictEqual(first?.line, example.error?.line);
        assert.strictEqual(first?._tag, example.error?.tag);
        assert.strictEqual(first?.message, example.error?.message);
      }
    })
  );

  it.effect("lists every verb of the schema as a row of its table", () =>
    Effect.gen(function* listed() {
      const document = yield* checkedIn;

      for (const verb of verbs) {
        assert.include(document, `| \`${verb}\` |`);
      }
    })
  );
});
