// The committed cache of stories/same-id against the committed story: it must not be stale. Every Line's key
// resolves to an entry whose words are the Line's words 1:1, the audio matches its hash, and the aligned Lines
// schedule. A copy of the cache with one entry removed is the F12 cache-miss control.
import { assert, layer } from "@effect/vitest";
import { buildPlan, schedule } from "@reebeat/core";
import {
  Array as Arr,
  Effect,
  FileSystem,
  Option,
  Order,
  Path,
  Predicate,
} from "effect";

import { matchThreshold } from "../src/align.ts";
import { speechCacheFiles } from "../src/cache.ts";
import { sha256Hex } from "../src/key.ts";
import { SpeechCache } from "../src/services.ts";
import { speechCacheOnly } from "../src/speech.ts";
import {
  alignFailure,
  alignLines,
  linesWithKeys,
  platform,
  storyDirectory,
  tempDirectory,
} from "./support.ts";

const story = Effect.gen(function* storyPlan() {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const directory = yield* storyDirectory;

  const source = yield* fs.readFileString(
    path.join(directory, "story.fountain")
  );

  const plan = yield* buildPlan(
    source,
    yield* sha256Hex(new TextEncoder().encode(source))
  );

  return { cache: path.join(directory, "speech-cache"), plan };
});

layer(platform)("the committed speech cache", (it) => {
  it.effect(
    "holds, for every Line of the story, an entry whose words are the Line's words",
    () =>
      Effect.gen(function* fresh() {
        const { cache, plan } = yield* story;
        const lines = yield* linesWithKeys(plan);

        assert.isAbove(lines.length, 0);

        yield* Effect.forEach(lines, ({ key, line }) =>
          Effect.gen(function* check() {
            const found = yield* (yield* SpeechCache).get(key);

            assert.isTrue(
              Option.isSome(found),
              `${line.id} has an entry ${key}`
            );

            if (Option.isSome(found)) {
              assert.deepStrictEqual(
                Arr.map(found.value.words, (word) => word.w),
                line.words,
                `${line.id} words`
              );
              assert.isAtLeast(found.value.match, matchThreshold);
              assert.strictEqual(found.value.params.text, line.text);
              assert.strictEqual(found.value.params.speed, line.hints.speed);
            }
          }).pipe(Effect.provide(speechCacheFiles(cache)))
        );
      })
  );

  it.effect("has no entry that no Line of the story uses", () =>
    Effect.gen(function* unused() {
      const fs = yield* FileSystem.FileSystem;
      const { cache, plan } = yield* story;
      const keys = Arr.map(yield* linesWithKeys(plan), ({ key }) => key);

      const names = Arr.sort(
        Arr.flatMap(keys, (key) => [`${key}.flac`, `${key}.json`]),
        Order.String
      );

      assert.deepStrictEqual(
        Arr.sort(yield* fs.readDirectory(cache), Order.String),
        Arr.dedupe(names)
      );
    })
  );

  it.effect("schedules: the story runs 1735 frames", () =>
    Effect.gen(function* schedules() {
      const { cache, plan } = yield* story;

      const aligned = yield* alignLines(plan).pipe(
        Effect.provide(speechCacheOnly(cache))
      );

      const scheduled = yield* schedule(plan, aligned);

      assert.strictEqual(aligned.length, 12);
      assert.strictEqual(scheduled.timeline?.totalFrames, 1735);
    })
  );

  it.effect(
    "F12 control: a copy with one entry removed fails SpeechCacheMiss naming that Line",
    () =>
      Effect.gen(function* control() {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const { cache, plan } = yield* story;
        const copy = yield* tempDirectory;

        yield* fs.copy(cache, copy, { overwrite: true });

        const victim = yield* Effect.fromNullishOr(
          (yield* linesWithKeys(plan))[3]
        );

        yield* fs.remove(path.join(copy, `${victim.key}.json`));

        const error = yield* alignFailure(plan, speechCacheOnly(copy));

        assert.isTrue(Predicate.isTagged(error, "SpeechCacheMiss"));

        if (Predicate.isTagged(error, "SpeechCacheMiss")) {
          assert.strictEqual(error.lineId, victim.line.id);
          assert.strictEqual(error.key, victim.key);
          assert.include(error.message, victim.line.id);
          assert.include(error.message, victim.key);
          assert.include(error.message, error.textExcerpt);
          yield* Effect.log(error.message);
        }
      })
  );
});
