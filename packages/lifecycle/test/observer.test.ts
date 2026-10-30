import { assert, describe, it } from "@effect/vitest";
import { Effect, Layer } from "effect";

import {
  failedClauseIds,
  observerClauses,
  registerClauses,
} from "../contract/index.ts";
import { Observer } from "../src/observer.ts";
import { fixedObserver } from "../standins/index.ts";
import { alphaBuild } from "./fixtures.ts";

registerClauses(
  "fixedObserver",
  fixedObserver,
  observerClauses(Effect.succeed(alphaBuild.files))
);

describe("the Observer contract can fail", () => {
  it.effect(
    "an observer that returns an image that is not a JPEG fails O1 only",
    () =>
      Effect.gen(function* run() {
        const broken = Layer.succeed(
          Observer,
          Observer.of({
            audio: () => Effect.succeed({ buckets: [], onsetsMs: [] }),
            frame: () =>
              Effect.succeed({
                bytes: new Uint8Array([1, 2, 3]),
                height: 1,
                mimeType: "image/jpeg",
                width: 1,
              }),
            media: () =>
              Effect.succeed({
                chapters: [],
                streams: [{ codec: "h264", type: "video" }],
              }),
          })
        );

        assert.deepStrictEqual(
          yield* failedClauseIds(
            broken,
            observerClauses(Effect.succeed(alphaBuild.files))
          ),
          ["O1", "O2"]
        );
      })
  );
});
