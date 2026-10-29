// The committed cache of stories/same-id against the committed story: it must not be stale. Built with the real
// adapters' declarations (their layers build without a model, a binary or a network), every Line's key resolves to
// an asset whose words are the Line's words 1:1, and the aligned Lines schedule. A copy with one asset removed is
// the F12 cache-miss control. The cache is refilled by `reebeat build ... --refresh-speech` (see the pipeline README).
import { assert, layer } from "@effect/vitest";
import { schedule } from "@reebeat/core";
import { speechStage } from "@reebeat/pipeline";
import { revealLifecycle } from "@reebeat/render-reveal";
import { AssetCache } from "@reebeat/services";
import {
  Array as Arr,
  Effect,
  FileSystem,
  Order,
  Path,
  Predicate,
} from "effect";

import { platform } from "./platform.ts";
import { adapters, story } from "./story.ts";

layer(platform)("the committed speech cache", (it) => {
  it.effect(
    "has an asset for every Line of the story: the keys resolve and the words are the Line's words",
    () =>
      Effect.gen(function* fresh() {
        const { cache, plan } = yield* story;
        const lines = Arr.flatMap(plan.scenes, (scene) => scene.lines);

        const aligned = yield* Effect.provide(
          speechStage(plan, { refresh: false }),
          adapters(cache)
        );

        assert.strictEqual(aligned.length, lines.length);

        for (const [index, line] of lines.entries()) {
          assert.deepStrictEqual(
            Arr.map(aligned[index]?.words ?? [], (word) => word.w),
            line.words,
            `${line.id} words`
          );
        }
      })
  );

  it.effect("holds no asset that no Line of the story uses", () =>
    Effect.gen(function* unused() {
      const fs = yield* FileSystem.FileSystem;
      const { cache, plan } = yield* story;

      const aligned = yield* Effect.provide(
        speechStage(plan, { refresh: false }),
        adapters(cache)
      );

      const names = Arr.flatMap(aligned, ({ audio }) => {
        const key = audio.file.replace(/\.flac$/u, "");

        return [`${key}.flac`, `${key}.provenance.json`, `${key}.words.json`];
      });

      assert.deepStrictEqual(
        Arr.sort(yield* fs.readDirectory(cache), Order.String),
        Arr.sort(Arr.dedupe(names), Order.String)
      );
    })
  );

  it.effect(
    "schedules: the story runs 1664 frames, and each asset says what made it",
    () =>
      Effect.gen(function* schedules() {
        const { cache, plan } = yield* story;

        const [aligned, provenance] = yield* Effect.provide(
          Effect.all([
            speechStage(plan, { refresh: false }),
            Effect.flatMap(AssetCache, (store) => store.list),
          ]),
          adapters(cache)
        );

        const scheduled = yield* schedule(plan, aligned, revealLifecycle);

        assert.strictEqual(aligned.length, 12);
        assert.strictEqual(scheduled.timeline?.totalFrames, 1664);
        assert.deepStrictEqual(
          Arr.dedupe(Arr.map(provenance, (entry) => entry.adapter)),
          ["kokoro@1.2.1"]
        );
      })
  );

  it.effect(
    "F12 control: a copy with one asset removed fails SpeechCacheMiss naming that Line",
    () =>
      Effect.gen(function* control() {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const { cache, plan } = yield* story;

        const copy = yield* fs.makeTempDirectoryScoped({
          prefix: "reebeat-cache-",
        });

        yield* fs.copy(cache, copy, { overwrite: true });

        const aligned = yield* Effect.provide(
          speechStage(plan, { refresh: false }),
          adapters(cache)
        );

        const victim = yield* Effect.fromNullishOr(aligned[3]);
        const key = victim.audio.file.replace(/\.flac$/u, "");

        yield* fs.remove(path.join(copy, `${key}.provenance.json`));

        const error = yield* Effect.flip(
          Effect.provide(speechStage(plan, { refresh: false }), adapters(copy))
        );

        assert.isTrue(Predicate.isTagged(error, "SpeechCacheMiss"));

        if (Predicate.isTagged(error, "SpeechCacheMiss")) {
          assert.strictEqual(error.lineId, victim.lineId);
          assert.strictEqual(error.key, key);
          assert.include(error.message, victim.lineId);
          assert.include(error.message, key);
        }
      })
  );
});
