// The story of the repository and the real default adapters over its speech cache, for the committed-cache test and
// the live test. Building the adapters loads no model and needs no network.
import { buildPlan } from "@reebeat/core";
import { sha256Hex } from "@reebeat/pipeline";
import { decodeSelection } from "@reebeat/services";
import { Effect, FileSystem, Layer, Path } from "effect";

import { realParts, speechServicesOf } from "../src/adapters.ts";
import { platform } from "./platform.ts";

/** The services of the speech stage on the default (local) adapters over the cache in `directory`. */
export const adapters = (directory: string) =>
  Layer.unwrap(
    Effect.map(Effect.orDie(decodeSelection({})), (selection) =>
      speechServicesOf(realParts(selection, { cacheDir: directory }))
    )
  ).pipe(Layer.provide(platform));

/** The Plan of stories/same-id and where its speech cache is. */
export const story = Effect.gen(function* storyPlan() {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const directory = yield* path.fromFileUrl(
    new URL("../../../stories/same-id/", import.meta.url)
  );

  const source = yield* fs.readFileString(
    path.join(directory, "story.fountain")
  );

  const plan = yield* buildPlan(
    source,
    yield* sha256Hex(new TextEncoder().encode(source))
  );

  return { cache: path.join(directory, "speech-cache"), plan };
});
