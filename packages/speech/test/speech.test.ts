// The live pipeline of Speech, with the models replaced by test layers through the services' interfaces: a miss
// narrates and fills the cache, a hit loads nothing, a poor alignment (F12) and a failing tool fill nothing.
import { assert, layer } from "@effect/vitest";
import { schedule } from "@reebeat/core";
import {
  Array as Arr,
  Effect,
  FileSystem,
  Layer,
  Predicate,
  Ref,
} from "effect";

import type { HeardWord } from "../src/align.ts";
import { speechCacheFiles } from "../src/cache.ts";
import { SpeechToolFailed } from "../src/errors.ts";
import { pipeline } from "../src/pipeline.ts";
import { Aligner, Flac, Tts } from "../src/services.ts";
import { speechCacheOnly, speechFromServices } from "../src/speech.ts";
import {
  alignFailure,
  alignLines,
  fixturePlan,
  perfectlyHeard,
  platform,
  tempDirectory,
} from "./support.ts";

/** Calls of each fake model, to show a hit loads none. */
const counters = Effect.all({
  align: Ref.make(0),
  encode: Ref.make(0),
  synthesize: Ref.make(0),
});

type Counters = Effect.Success<typeof counters>;

const speechSecond = Math.round(pipeline.ttsSampleRate);

/**
 * The fake models around a cache directory. The Tts "speaks" 100 ms per word; the Aligner hears what `hears`
 * says for a FLAC whose bytes name the text.
 */
const fakeModels = (
  directory: string,
  calls: Counters,
  hears: (text: string) => readonly HeardWord[],
  synthesize: Effect.Effect<void, SpeechToolFailed> = Effect.void
) =>
  speechFromServices.pipe(
    Layer.provide(
      Layer.mergeAll(
        speechCacheFiles(directory),
        Layer.succeed(
          Tts,
          Tts.of({
            synthesize: ({ speed, text }) =>
              Effect.gen(function* speak() {
                yield* Ref.update(calls.synthesize, (n) => n + 1);
                yield* synthesize;

                return new Float32Array(
                  Math.round(
                    (speechSecond * text.split(" ").length * 0.1) / speed
                  )
                );
              }),
          })
        ),
        Layer.succeed(
          Flac,
          Flac.of({
            encode: (samples) =>
              Effect.as(
                Ref.update(calls.encode, (n) => n + 1),
                new TextEncoder().encode(`flac ${samples.length}`)
              ),
          })
        ),
        Layer.succeed(
          Aligner,
          Aligner.of({
            align: (flac) =>
              Effect.as(
                Ref.update(calls.align, (n) => n + 1),
                hears(new TextDecoder().decode(flac))
              ),
          })
        )
      )
    )
  );

const wordsOf = (text: string): readonly string[] => text.split(" ");

/** What a FLAC of `n` samples "says" in these tests: the words of the fixture Lines, by length. */
const hearsFixture = (flacText: string): readonly HeardWord[] =>
  flacText === `flac ${Math.round(speechSecond * 0.3)}`
    ? perfectlyHeard(wordsOf("Hello there, friend."))
    : perfectlyHeard(wordsOf("Second line here."));

/** A run over fake models that fails: its error, the calls the models got and what the cache directory holds. */
const failedRun = (
  hears: (text: string) => readonly HeardWord[],
  synthesize?: Effect.Effect<void, SpeechToolFailed>
) =>
  Effect.gen(function* run() {
    const fs = yield* FileSystem.FileSystem;
    const directory = yield* tempDirectory;
    const calls = yield* counters;

    const error = yield* alignFailure(
      yield* fixturePlan,
      fakeModels(directory, calls, hears, synthesize)
    );

    return { calls, error, files: yield* fs.readDirectory(directory) };
  });

layer(platform)("Speech with the models", (it) => {
  it.effect(
    "narrates a miss, fills the cache, and a second run is all hits",
    () =>
      Effect.gen(function* fill() {
        const fs = yield* FileSystem.FileSystem;
        const directory = yield* tempDirectory;
        const plan = yield* fixturePlan;
        const calls = yield* counters;

        const first = yield* alignLines(plan).pipe(
          Effect.provide(fakeModels(directory, calls, hearsFixture))
        );

        assert.strictEqual(yield* Ref.get(calls.synthesize), 2);
        assert.strictEqual((yield* fs.readDirectory(directory)).length, 4);

        // The second Line is "slowly": 0.9, so its audio is longer and its key is another one.
        assert.deepStrictEqual(
          Arr.map(first, (line) => line.lineId),
          ["sc1.l1", "sc1.l2"]
        );
        assert.notStrictEqual(first[0]?.audio.file, first[1]?.audio.file);

        const second = yield* alignLines(plan).pipe(
          Effect.provide(fakeModels(directory, calls, hearsFixture))
        );

        assert.deepStrictEqual(second, first);
        assert.strictEqual(yield* Ref.get(calls.synthesize), 2);
        assert.strictEqual(yield* Ref.get(calls.encode), 2);
        assert.strictEqual(yield* Ref.get(calls.align), 2);

        const onlyCache = yield* alignLines(plan).pipe(
          Effect.provide(speechCacheOnly(directory))
        );

        assert.deepStrictEqual(onlyCache, first);

        // What came out of the pipeline schedules.
        const scheduled = yield* schedule(plan, first);

        assert.isAbove(scheduled.timeline?.totalFrames ?? 0, 0);
      })
  );

  it.effect(
    "F12: an alignment below 0.9 fails AlignmentBelowThreshold and caches nothing",
    () =>
      Effect.gen(function* poor() {
        const { error, files } = yield* failedRun(() =>
          perfectlyHeard(["entirely", "other", "words"])
        );

        assert.isTrue(Predicate.isTagged(error, "AlignmentBelowThreshold"));

        if (Predicate.isTagged(error, "AlignmentBelowThreshold")) {
          assert.strictEqual(error.lineId, "sc1.l1");
          assert.strictEqual(error.threshold, 0.9);
          assert.isBelow(error.match, 0.9);
          assert.include(error.message, "entirely other words");
        }

        assert.deepStrictEqual(files, []);
      })
  );

  it.effect(
    "a failing model stops the run with its typed error and caches nothing",
    () =>
      Effect.gen(function* broken() {
        const { calls, error, files } = yield* failedRun(
          hearsFixture,
          Effect.fail(
            new SpeechToolFailed({
              cause: "boom",
              message: "kokoro-js failed",
              tool: "kokoro",
            })
          )
        );

        assert.strictEqual(error._tag, "SpeechToolFailed");
        assert.strictEqual(yield* Ref.get(calls.synthesize), 1);
        assert.deepStrictEqual(files, []);
      })
  );
});
