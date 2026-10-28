// Opt-in: `bun run test:live` in packages/cli, with REEBEAT_KOKORO_CACHE and REEBEAT_WHISPER_MODEL set (see
// `scripts/refillSpeech.ts`). It regenerates one Line of stories/same-id with the real adapters into a scratch
// cache and compares the aligned Line with the committed one: the models, ffmpeg and whisper-cli must still
// produce what the committed cache holds. The aligned Line holds the SHA-256 of its FLAC, so equal Lines are
// equal audio.
import { assert, it } from "@effect/vitest";
import { whisperAligner } from "@reebeat/align-whisper";
import { fsAssetCache } from "@reebeat/cache-fs";
import { buildPlan } from "@reebeat/core";
import { ffmpegEncoder } from "@reebeat/encode-ffmpeg";
import { speechStage } from "@reebeat/pipeline";
import { kokoroSynthesizer } from "@reebeat/speech-kokoro";
import { Crypto, Effect, FileSystem, Layer, Path } from "effect";
import { Hex } from "effect/encoding";

import { platform } from "./platform.ts";

const adapters = (directory: string) =>
  Layer.mergeAll(
    kokoroSynthesizer,
    whisperAligner,
    ffmpegEncoder,
    fsAssetCache(directory)
  ).pipe(Layer.provide(platform));

it.live("regenerates a Line to the committed asset", () =>
  Effect.gen(function* regenerate() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const crypto = yield* Crypto.Crypto;

    const story = yield* path.fromFileUrl(
      new URL("../../../stories/same-id/", import.meta.url)
    );

    const source = yield* fs.readFileString(path.join(story, "story.fountain"));

    const plan = yield* buildPlan(
      source,
      Hex.encode(
        yield* crypto.digest("SHA-256", new TextEncoder().encode(source))
      )
    );

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
      adapters(path.join(story, "speech-cache"))
    );

    assert.deepStrictEqual(regenerated, committed);
  }).pipe(Effect.provide(platform))
);
