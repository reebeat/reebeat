// The story of the repository and the real adapters over its speech cache, for the committed-cache test and the live
// test. Building the adapters loads no model and needs no network.
import { buildPlan } from "@reebeat/core";
import { Crypto, Effect, FileSystem, Layer, Path } from "effect";
import { Hex } from "effect/encoding";

import { speechAdapters } from "../src/speechAdapters.ts";
import { platform } from "./platform.ts";

/** The real adapters of the speech stage over the cache in `directory`. No model is loaded to build them. */
export const adapters = (directory: string) =>
  speechAdapters(directory).pipe(Layer.provide(platform));

/** The Plan of stories/same-id and where its speech cache is. */
export const story = Effect.gen(function* storyPlan() {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const crypto = yield* Crypto.Crypto;

  const directory = yield* path.fromFileUrl(
    new URL("../../../stories/same-id/", import.meta.url)
  );

  const source = yield* fs.readFileString(
    path.join(directory, "story.fountain")
  );

  const plan = yield* buildPlan(
    source,
    Hex.encode(
      yield* crypto.digest("SHA-256", new TextEncoder().encode(source))
    )
  );

  return { cache: path.join(directory, "speech-cache"), plan };
});
