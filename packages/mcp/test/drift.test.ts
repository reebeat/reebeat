// The read models of `@tsukuri/lifecycle` are projections of types other packages own (spec 0016, "Revisions": the
// lifecycle package imports the core only, so a test here, where both are visible, keeps them in step). `build.json`
// stays defined once, by `@tsukuri/pipeline`; the summary the tools report must decode every manifest a build writes.
import { assert, describe, expectTypeOf, it } from "@effect/vitest";
import { BuildSummarySchema } from "@tsukuri/lifecycle";
import type { BuildSummary } from "@tsukuri/lifecycle";
import { encodeBuildManifest } from "@tsukuri/pipeline";
import type { BuildManifest } from "@tsukuri/pipeline";
import { Effect, Schema, String as Str } from "effect";

const zero = Str.repeat(64)("0");

const manifest: BuildManifest = {
  adapters: [
    {
      egress: { kind: "local", sends: [] },
      id: "kokoro@1.2.1",
      service: "SpeechSynthesizer",
      settings: { dtype: "fp32" },
    },
    {
      egress: { kind: "integration", sends: ["text"] },
      id: "cloud@1",
      service: "WordAligner",
      settings: {},
    },
  ],
  assets: [],
  files: [{ bytes: 3, path: "deck.html", sha256: zero }],
  schema: 2,
  sourcePath: "story.fountain",
  sourceSha256: zero,
};

describe("the build summary", () => {
  it("is what a BuildManifest is, minus what the tools do not report", () => {
    expectTypeOf<BuildManifest>().toExtend<BuildSummary>();
    assert.isTrue(true);
  });

  it.effect("decodes the text a build writes", () =>
    Effect.gen(function* decoded() {
      const text = yield* encodeBuildManifest(manifest);

      const summary = yield* Schema.decodeEffect(
        Schema.fromJsonString(BuildSummarySchema)
      )(text);

      assert.strictEqual(summary.sourceSha256, zero);
      assert.deepStrictEqual(summary.adapters[1]?.egress, {
        kind: "integration",
        sends: ["text"],
      });
    })
  );
});
