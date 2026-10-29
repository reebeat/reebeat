// Throwaway (spec 0007, Q5): after how many runs, and on which input, does the codec WITHOUT the escape layer fail?
import { Arbitrary, Effect, Result, Schema } from "effect";

import { GraphSchema } from "../vendor/0004/graph.ts";
import { decodeScxml, encodeScxml } from "./codec.ts";

const eq = Schema.toEquivalence(GraphSchema);
const result = await Effect.runPromise(
  Arbitrary.checkEffect(
    Arbitrary.schema(GraphSchema),
    (g) => {
      const encoded = encodeScxml(g, { escape: false });
      if (Result.isFailure(encoded)) return false;
      const back = decodeScxml(encoded.success, { escape: false });
      return Result.isSuccess(back) && eq(back.success, g);
    },
    { runs: 1000, seed: 7 }
  )
);
console.log(Arbitrary.formatCheckFailure(result));
