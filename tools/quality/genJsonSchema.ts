// Writes `docs/schema/tsukuri-ir.schema.json` from the IR (spec 0004): `bun tools/quality/genJsonSchema.ts`. The document
// is a pure function of `GraphSchema` in `packages/core/src/graph.ts` (`graphJsonSchema`), with the provenance of each
// construct (`origin`, `deviation`) from its annotations; a test of `packages/core` fails when the checked-in file
// differs from it, so run this after any change to the IR.
import { graphJsonSchema } from "@tsukuri/core";
import { Effect } from "effect";

import { writeGenerated } from "./writeGenerated.ts";

writeGenerated(
  ["docs", "schema", "tsukuri-ir.schema.json"],
  Effect.suspend(() => Effect.fromResult(graphJsonSchema()))
);
