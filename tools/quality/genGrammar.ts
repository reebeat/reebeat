// Writes `docs/grammar/effects.md` from the grammar (spec 0002, F3): `bun tools/quality/genGrammar.ts`. The document is
// a pure function of `packages/core/src/grammar.ts` and `plan.ts`; a test of `packages/core` fails when the checked-in
// file differs from it, so run this after any change to the syntax.
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { grammarDocument } from "@tsukuri/core";
import { Effect, FileSystem, Path } from "effect";

const main = Effect.gen(function* main() {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const file = path.resolve("docs", "grammar", "effects.md");

  yield* fs.makeDirectory(path.dirname(file), { recursive: true });
  yield* fs.writeFileString(file, grammarDocument());

  return yield* Effect.log(`Wrote ${file}.`);
});

NodeRuntime.runMain(main.pipe(Effect.provide(NodeServices.layer)), {
  disableErrorReporting: true,
});
