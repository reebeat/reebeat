// Opt-in: `bun run test:live` in packages/speech, with REEBEAT_KOKORO_CACHE and REEBEAT_WHISPER_MODEL set (see
// the readme). It regenerates one Line of stories/same-id with the real models and compares the entry with the
// committed one: the models, ffmpeg and whisper-cli must still produce what the cache holds. The entry holds
// the SHA-256 of its FLAC, so equal entries are equal audio.
import { assert, it } from "@effect/vitest";
import { buildPlan } from "@reebeat/core";
import { Effect, FileSystem, Path } from "effect";

import { speechCacheFiles } from "../src/cache.ts";
import { sha256Hex } from "../src/key.ts";
import { SpeechCache } from "../src/services.ts";
import { speechLive } from "../src/speech.ts";
import {
  alignLines,
  linesWithKeys,
  platform,
  tempDirectory,
} from "../test/support.ts";

it.live("regenerates a Line to the committed entry", () =>
  Effect.gen(function* regenerate() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const story = yield* path.fromFileUrl(
      new URL("../../../stories/same-id/", import.meta.url)
    );

    const source = yield* fs.readFileString(path.join(story, "story.fountain"));

    const plan = yield* buildPlan(
      source,
      yield* sha256Hex(new TextEncoder().encode(source))
    );

    const scene = yield* Effect.fromNullishOr(plan.scenes[1]);
    const line = yield* Effect.fromNullishOr(scene.lines[0]);
    const oneLine = { ...plan, scenes: [{ ...scene, lines: [line] }] };
    const [target] = yield* linesWithKeys(oneLine);
    const key = yield* Effect.fromNullishOr(target?.key);
    const fresh = yield* tempDirectory;

    yield* alignLines(oneLine).pipe(Effect.provide(speechLive(fresh)));

    const read = (directory: string) =>
      Effect.gen(function* entry() {
        const found = yield* (yield* SpeechCache).get(key);

        return yield* Effect.fromOption(found);
      }).pipe(Effect.provide(speechCacheFiles(directory)));

    assert.deepStrictEqual(
      yield* read(fresh),
      yield* read(path.join(story, "speech-cache"))
    );
  }).pipe(Effect.provide(platform))
);
