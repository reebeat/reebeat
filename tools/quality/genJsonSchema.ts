// Writes `docs/schema/reebeat-ir.schema.json` from the IR (spec 0004): `bun tools/quality/genJsonSchema.ts`. The document
// is a pure function of `GraphSchema` in `packages/core/src/graph.ts` (`graphJsonSchema`), with the provenance of each
// construct (`origin`, `deviation`) from its annotations; a test of `packages/core` fails when the checked-in file
// differs from it, so run this after any change to the IR.
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { graphJsonSchema } from "@reebeat/core";
import { Effect, FileSystem, Path } from "effect";

const main = Effect.gen(function* main() {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const file = path.resolve("docs", "schema", "reebeat-ir.schema.json");

  yield* fs.makeDirectory(path.dirname(file), { recursive: true });
  yield* fs.writeFileString(file, yield* Effect.fromResult(graphJsonSchema()));

  return yield* Effect.log(`Wrote ${file}.`);
});

NodeRuntime.runMain(main.pipe(Effect.provide(NodeServices.layer)), {
  disableErrorReporting: true,
});
