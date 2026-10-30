// What every generator script of this directory shares: write one generated file, relative to the directory the script
// is run from (the repository root), then say so. Each script (`genGrammar.ts`, `genJsonSchema.ts`) names the file and
// the text; a test of `packages/core` compares the checked-in file with the same text, so a generated file never drifts.
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Effect, FileSystem, Path } from "effect";

/** Runs the program that writes `text` to the file at `segments` (created with its directories) and logs where. */
export const writeGenerated = <E>(
  segments: readonly string[],
  text: Effect.Effect<string, E>
): void => {
  const main = Effect.gen(function* main() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const file = path.resolve(...segments);

    yield* fs.makeDirectory(path.dirname(file), { recursive: true });
    yield* fs.writeFileString(file, yield* text);

    return yield* Effect.log(`Wrote ${file}.`);
  });

  NodeRuntime.runMain(main.pipe(Effect.provide(NodeServices.layer)), {
    disableErrorReporting: true,
  });
};
