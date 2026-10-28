// Opt-in: `bun run test:live` in packages/cli, with REEBEAT_KOKORO_CACHE and REEBEAT_WHISPER_MODEL set (see
// `scripts/refillSpeech.ts`). It regenerates one Line of stories/same-id with the real adapters into a scratch
// cache and compares the aligned Line with the committed one: the models, ffmpeg and whisper-cli must still
// produce what the committed cache holds. The aligned Line holds the SHA-256 of its FLAC, so equal Lines are
// equal audio.
import { assert, it } from "@effect/vitest";
import { speechStage } from "@reebeat/pipeline";
import { Effect, FileSystem } from "effect";

import { adapters, story } from "../test/story.ts";
import { platform } from "./platform.ts";

it.live("regenerates a Line to the committed asset", () =>
  Effect.gen(function* regenerate() {
    const fs = yield* FileSystem.FileSystem;
    const { cache, plan } = yield* story;

    const scene = yield* Effect.fromNullishOr(plan.scenes[1]);
    const line = yield* Effect.fromNullishOr(scene.lines[0]);
    const oneLine = { ...plan, scenes: [{ ...scene, lines: [line] }] };

    const fresh = yield* fs.makeTempDirectoryScoped({
      prefix: "reebeat-live-",
    });

    const regenerated = yield* Effect.provide(
      speechStage(oneLine, { refresh: true }),
      adapters(fresh)
    );

    const committed = yield* Effect.provide(
      speechStage(oneLine, { refresh: false }),
      adapters(cache)
    );

    assert.deepStrictEqual(regenerated, committed);
  }).pipe(Effect.provide(platform))
);
