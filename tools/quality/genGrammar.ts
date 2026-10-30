// Writes `docs/grammar/effects.md` from the grammar (spec 0002, F3): `bun tools/quality/genGrammar.ts`. The document is
// a pure function of `packages/core/src/grammar.ts` and `plan.ts`; a test of `packages/core` fails when the checked-in
// file differs from it, so run this after any change to the syntax.
import { grammarDocument } from "@tsukuri/core";
import { Effect } from "effect";

import { writeGenerated } from "./writeGenerated.ts";

writeGenerated(["docs", "grammar", "effects.md"], Effect.sync(grammarDocument));
