// Regenerates the speech cache of stories/same-id with the real adapters (spec 0001, Revision "composable pieces").
// A composition root: it wires Kokoro, whisper.cpp, ffmpeg and the filesystem cache into the pipeline's speech stage,
// builds the Plan of the story, removes the old assets (their keys name adapters and settings, so a change of either
// leaves them stale) and fills the cache with `speechStage(plan, { refresh: true })`. The same command the cache's
// README names: `bun run refill:speech` in packages/cli. Needs the three environment names below.
//
//   REEBEAT_KOKORO_CACHE   directory of the Kokoro model files (311 MiB, downloaded on first use)
//   REEBEAT_WHISPER_MODEL  ggml-base.en.bin (SHA-256 in packages/align-whisper/src/whisperAligner.ts)
//   REEBEAT_WHISPER_BIN    the whisper.cpp binary (default `whisper-cli`)
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { whisperAligner } from "@reebeat/align-whisper";
import { fsAssetCache } from "@reebeat/cache-fs";
import { buildPlan, schedule } from "@reebeat/core";
import { ffmpegEncoder } from "@reebeat/encode-ffmpeg";
import { speechStage } from "@reebeat/pipeline";
import { kokoroSynthesizer } from "@reebeat/speech-kokoro";
import { Crypto, Duration, Effect, FileSystem, Layer, Path } from "effect";
import { Hex } from "effect/encoding";

const refill = Effect.gen(function* refillStory() {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const crypto = yield* Crypto.Crypto;
  const root = yield* path.fromFileUrl(new URL("../../../", import.meta.url));
  const story = path.join(root, "stories", "same-id");
  const cacheDir = path.join(story, "speech-cache");
  const source = yield* fs.readFileString(path.join(story, "story.fountain"));

  const sourceSha256 = Hex.encode(
    yield* crypto.digest("SHA-256", new TextEncoder().encode(source))
  );

  const plan = yield* buildPlan(source, sourceSha256);

  yield* fs.remove(cacheDir, { force: true, recursive: true });

  const adapters = Layer.mergeAll(
    kokoroSynthesizer,
    whisperAligner,
    ffmpegEncoder,
    fsAssetCache(cacheDir)
  ).pipe(Layer.provide(NodeServices.layer));

  const [elapsed, aligned] = yield* Effect.timed(
    Effect.provide(speechStage(plan, { refresh: true }), adapters)
  );

  const scheduled = yield* schedule(plan, aligned);

  yield* Effect.log(
    `${aligned.length} Lines narrated in ${Duration.toMillis(elapsed)} ms; the video runs ${scheduled.timeline?.totalFrames} frames`
  );
});

NodeRuntime.runMain(Effect.provide(refill, NodeServices.layer));
