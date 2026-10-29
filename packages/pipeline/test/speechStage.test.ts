// The speech stage over the stand-ins: a hit, a miss (F12), a refresh, an alignment below the threshold, the
// provenance, and determinism. No model, no binary: the synthesiser, the aligner and the cache are stand-ins and
// the encoder is a fake that stores the samples as they are.
import { assert, layer } from "@effect/vitest";
import { buildPlan, schedule } from "@reebeat/core";
import { AssetCache, SpeechSynthesizer, WordAligner } from "@reebeat/services";
import { contractLifecycle } from "@reebeat/services/contract";
import {
  evenAligner,
  memoryCache,
  silentSynthesizer,
} from "@reebeat/services/standins";
import {
  Array as Arr,
  Crypto,
  Effect,
  Layer,
  Option,
  Predicate,
  Ref,
} from "effect";
import { Hex } from "effect/encoding";

import { speechStage } from "../src/speechStage.ts";
import {
  countingSynthesizer,
  fakeEncoder,
  fixturePlan,
  platform,
  recordingAligner,
  withSettings,
} from "./support.ts";

/** The stage's services over the stand-ins and one fresh memory cache. */
const world = Layer.provideMerge(
  Layer.mergeAll(silentSynthesizer, evenAligner, fakeEncoder, memoryCache),
  platform
);

/** A story of three Lines of ten words, at the title-page `Speed:`, the middle Line with its own hint rows. */
const rateStory = (speed: number, middleHint: string) =>
  Arr.join(
    [
      "Title: Rate",
      `Speed: ${speed}`,
      "",
      "# Part",
      "",
      "INT. ONE #sc1#",
      "",
      "NARRATOR",
      "One two three four five six seven eight nine ten.",
      "",
      "NARRATOR",
      ...(middleHint === "" ? [] : [middleHint]),
      "One two three four five six seven eight nine ten.",
      "",
      "NARRATOR",
      "One two three four five six seven eight nine ten.",
      "",
    ],
    "\n"
  );

/** The Plan of the rate story at `speed` with `middleHint` before its second Line. */
const ratePlan = (speed: number, middleHint: string) =>
  buildPlan(rateStory(speed, middleHint), "5ca1ab1e".repeat(8));

/** The audio file names of every Line of the rate story at `speed`, narrated into a fresh cache. */
const audioFilesAt = (speed: number) =>
  Effect.map(
    Effect.provide(
      Effect.flatMap(ratePlan(speed, ""), (plan) =>
        speechStage(plan, { refresh: true })
      ),
      world
    ),
    Arr.map((line) => line.audio.file)
  );

const linesOf = Effect.map(fixturePlan, (plan) =>
  Arr.flatMap(plan.scenes, (scene) => scene.lines)
);

const sha256Of = (bytes: Uint8Array) =>
  Effect.gen(function* digest() {
    return Hex.encode(yield* (yield* Crypto.Crypto).digest("SHA-256", bytes));
  });

layer(world)("speech stage: miss, refresh, hit", (it) => {
  it.effect(
    "a miss without refresh is SpeechCacheMiss naming the Line and the key",
    () =>
      Effect.gen(function* miss() {
        const plan = yield* fixturePlan;

        const failure = yield* Effect.flip(
          speechStage(plan, { refresh: false })
        );

        assert.isTrue(Predicate.isTagged(failure, "SpeechCacheMiss"));
        assert.deepStrictEqual(
          Predicate.isTagged(failure, "SpeechCacheMiss")
            ? [failure.lineId, failure.textExcerpt]
            : [],
          ["sc1.l1", "Hello there, friend."]
        );
        assert.match(
          Predicate.isTagged(failure, "SpeechCacheMiss") ? failure.key : "",
          /^[0-9a-f]{64}$/u
        );
      })
  );

  it.effect(
    "refresh fills the cache, then a build without refresh hits every Line with the same result",
    () =>
      Effect.gen(function* refreshThenHit() {
        const plan = yield* fixturePlan;
        const cache = yield* AssetCache;
        const filled = yield* speechStage(plan, { refresh: true });
        const hit = yield* speechStage(plan, { refresh: false });

        assert.deepStrictEqual(hit, filled);
        assert.strictEqual((yield* cache.list).length, 2);
      })
  );

  it.effect(
    "each aligned Line names <key>.flac, hashes its audio, has its Line's words 1:1, and schedules",
    () =>
      Effect.gen(function* alignedLines() {
        const plan = yield* fixturePlan;
        const cache = yield* AssetCache;
        const aligned = yield* speechStage(plan, { refresh: true });

        for (const [index, line] of (yield* linesOf).entries()) {
          const entry = aligned[index];
          const key = entry?.audio.file.replace(/\.flac$/u, "") ?? "";

          const flac = Option.flatMap(yield* cache.get(key), (found) =>
            Arr.findFirst(found.files, (file) => file.name === "flac")
          );

          assert.strictEqual(entry?.lineId, line.id);
          assert.match(entry?.audio.file ?? "", /^[0-9a-f]{64}\.flac$/u);
          assert.deepStrictEqual(
            Arr.map(entry?.words ?? [], (word) => word.w),
            line.words
          );
          assert.isTrue(Option.isSome(flac));
          assert.strictEqual(
            entry?.audio.sha256,
            yield* sha256Of(
              Option.isSome(flac) ? flac.value.bytes : new Uint8Array()
            )
          );
        }

        assert.isDefined(
          (yield* schedule(plan, aligned, contractLifecycle)).timeline
        );
      })
  );

  it.effect(
    "the provenance records the synthesiser, the aligner and the encoder, the voice and the speed of each Line",
    () =>
      Effect.gen(function* provenance() {
        const plan = yield* fixturePlan;
        const cache = yield* AssetCache;
        const synthesizer = yield* SpeechSynthesizer;
        const aligner = yield* WordAligner;

        yield* speechStage(plan, { refresh: true });

        const stored = yield* cache.list;

        for (const line of yield* linesOf) {
          const found = Arr.findFirst(
            stored,
            (entry) => entry.keyParts.input === line.text
          );

          assert.isTrue(Option.isSome(found));

          if (Option.isSome(found)) {
            assert.strictEqual(found.value.adapter, synthesizer.info.id);
            assert.deepStrictEqual(
              found.value.settings,
              synthesizer.info.settings
            );
            assert.deepStrictEqual(found.value.egress, {
              kind: "local",
              sends: [],
            });
            assert.include(found.value.createdBy, aligner.info.id);
            assert.include(found.value.createdBy, "fake-encoder@1-standin");
            assert.deepStrictEqual(found.value.keyParts.extra, {
              aligner: aligner.info,
              pipeline: "speech-v2",
              speed: line.hints.speed,
              voice: "af_heart",
            });
          }
        }
      })
  );

  it.effect(
    "a words file that is not valid fails SpeechAssetInvalid, never a silent hit",
    () =>
      Effect.gen(function* invalid() {
        const plan = yield* fixturePlan;
        const cache = yield* AssetCache;
        yield* speechStage(plan, { refresh: true });

        const [any] = yield* cache.list;
        const key = any?.keyParts.key ?? "";
        const stored = yield* cache.get(key);

        if (Option.isSome(stored)) {
          yield* cache.put(key, {
            files: Arr.map(stored.value.files, (file) =>
              file.name === "words.json"
                ? { bytes: new TextEncoder().encode("{"), name: file.name }
                : file
            ),
            provenance: stored.value.provenance,
          });
        }

        const failure = yield* Effect.flip(
          speechStage(plan, { refresh: false })
        );

        assert.isTrue(Predicate.isTagged(failure, "SpeechAssetInvalid"));
      })
  );
});

interface Counters {
  readonly calls: Ref.Ref<number>;
  readonly requests: Ref.Ref<readonly unknown[]>;
}

/** Runs `use` with fresh counters over the stand-ins that feed them; `match` replaces the aligner's match. */
const withCounters = <A, E, R>(
  use: (counters: Counters) => Effect.Effect<A, E, R>,
  match?: number
) =>
  Effect.gen(function* counted() {
    const calls = yield* Ref.make(0);
    const requests = yield* Ref.make<readonly unknown[]>([]);

    return yield* Effect.provide(
      use({ calls, requests }),
      Layer.provideMerge(
        Layer.mergeAll(
          countingSynthesizer(calls, silentSynthesizer),
          recordingAligner(requests, evenAligner, match),
          fakeEncoder,
          memoryCache
        ),
        platform
      )
    );
  });

layer(platform)("speech stage: what is called", (it) => {
  it.effect(
    "a hit calls neither the synthesiser nor the aligner; a refresh calls each once per Line",
    () =>
      withCounters(({ calls, requests }) =>
        Effect.gen(function* counted() {
          const plan = yield* fixturePlan;

          for (const _ of [1, 2]) {
            yield* speechStage(plan, { refresh: true });
            assert.strictEqual(yield* Ref.get(calls), 2);
            assert.strictEqual((yield* Ref.get(requests)).length, 2);
          }
        })
      )
  );

  it.effect("the provider's word timings go to the aligner as the hint", () =>
    withCounters(({ requests }) =>
      Effect.gen(function* hinted() {
        yield* speechStage(yield* fixturePlan, { refresh: true });

        for (const request of yield* Ref.get(requests)) {
          assert.isTrue(
            Predicate.hasProperty(request, "hint") &&
              Arr.isArray(request.hint) &&
              request.hint.length === 3
          );
        }
      })
    )
  );

  it.effect(
    "an alignment below 0.9 fails AlignmentBelowThreshold naming the Line, and caches nothing",
    () =>
      withCounters(
        () =>
          Effect.gen(function* below() {
            const failure = yield* Effect.flip(
              speechStage(yield* fixturePlan, { refresh: true })
            );

            assert.isTrue(
              Predicate.isTagged(failure, "AlignmentBelowThreshold")
            );
            assert.strictEqual(
              Predicate.isTagged(failure, "AlignmentBelowThreshold")
                ? failure.lineId
                : "",
              "sc1.l1"
            );
            assert.deepStrictEqual(yield* (yield* AssetCache).list, []);
          }),
        0.89
      )
  );
});

layer(platform)("speech stage: the key and determinism", (it) => {
  it.effect(
    "two builds on fresh caches give the same keys and the same Lines",
    () =>
      Effect.gen(function* deterministic() {
        const plan = yield* fixturePlan;

        const first = yield* Effect.provide(
          speechStage(plan, { refresh: true }),
          world
        );

        const second = yield* Effect.provide(
          speechStage(plan, { refresh: true }),
          world
        );

        assert.deepStrictEqual(first, second);
      })
  );

  it.effect("another voice is another key", () =>
    Effect.gen(function* voiced() {
      const plan = yield* fixturePlan;

      const withVoice = (voice: string) =>
        Effect.provide(speechStage(plan, { refresh: true, voice }), world);

      assert.notDeepEqual(
        Arr.map(yield* withVoice("af_heart"), (line) => line.audio.file),
        Arr.map(yield* withVoice("bf_emma"), (line) => line.audio.file)
      );
    })
  );

  it.effect("another aligner setting is another key", () =>
    Effect.gen(function* aligned() {
      const plan = yield* fixturePlan;

      const retuned = Layer.provideMerge(
        Layer.mergeAll(
          silentSynthesizer,
          withSettings(evenAligner, { model: "other" }),
          fakeEncoder,
          memoryCache
        ),
        platform
      );

      assert.notDeepEqual(
        Arr.map(
          yield* Effect.provide(speechStage(plan, { refresh: true }), world),
          (line) => line.audio.file
        ),
        Arr.map(
          yield* Effect.provide(speechStage(plan, { refresh: true }), retuned),
          (line) => line.audio.file
        )
      );
    })
  );

  it.effect(
    "a secret-looking setting of the aligner, nested in the key's extra, is refused before any key or asset exists",
    () =>
      Effect.gen(function* secret() {
        const plan = yield* fixturePlan;

        const leaky = Layer.provideMerge(
          Layer.mergeAll(
            silentSynthesizer,
            withSettings(evenAligner, { apiToken: "canary-value" }),
            fakeEncoder,
            memoryCache
          ),
          platform
        );

        const { failure, listed } = yield* Effect.provide(
          Effect.gen(function* attempt() {
            const flipped = yield* Effect.flip(
              speechStage(plan, { refresh: true })
            );

            return {
              failure: flipped,
              listed: yield* (yield* AssetCache).list,
            };
          }),
          leaky
        );

        assert.isTrue(Predicate.isTagged(failure, "SecretLikeSetting"));
        assert.include(failure.message, "apiToken");
        assert.notInclude(failure.message, "canary-value");
        assert.deepStrictEqual(listed, []);
      })
  );

  it.effect(
    "another speech rate is another key: no rate reuses the audio of another",
    () =>
      Effect.gen(function* rated() {
        const atOne = yield* audioFilesAt(1);

        assert.notDeepEqual(atOne, yield* audioFilesAt(1.1));
        assert.deepStrictEqual(atOne, yield* audioFilesAt(1));

        // A cache filled at one rate is a miss at another, and a hit at its own.
        const shared = Layer.provideMerge(
          Layer.mergeAll(
            silentSynthesizer,
            evenAligner,
            fakeEncoder,
            memoryCache
          ),
          platform
        );

        const missAtOtherRate = Effect.gen(function* sharedCache() {
          const slow = yield* ratePlan(1, "");
          const fast = yield* ratePlan(1.1, "");

          yield* speechStage(slow, { refresh: true });
          yield* speechStage(slow, { refresh: false });

          return yield* Effect.flip(speechStage(fast, { refresh: false }));
        });

        const failure = yield* Effect.provide(missAtOtherRate, shared);

        assert.isTrue(Predicate.isTagged(failure, "SpeechCacheMiss"));
      })
  );
});

/** The spoken length of every Line: the end of its last word (the stand-in adds a constant 400 ms of silence). */
const spokenMs = (source: string) =>
  Effect.map(
    Effect.flatMap(buildPlan(source, "5ca1ab1e".repeat(8)), (plan) =>
      Effect.provide(speechStage(plan, { refresh: true }), world)
    ),
    Arr.map((line) => line.words.at(-1)?.endMs ?? 0)
  );

layer(platform)("speech stage: the rate scales the narration", (it) => {
  it.effect(
    "a story built at Speed 1.1 narrates in 1/1.1 of the time of one built at 1.0",
    () =>
      Effect.gen(function* scaled() {
        // Ten words at 330 ms: 3300 ms at 1.0; 3300 / 1.1 = 3000 ms at 1.1; 3300 / 2 = 1650 ms at 2.
        assert.deepStrictEqual(
          yield* spokenMs(rateStory(1, "")),
          [3300, 3300, 3300]
        );
        assert.deepStrictEqual(
          yield* spokenMs(rateStory(1.1, "")),
          [3000, 3000, 3000]
        );
        assert.deepStrictEqual(
          yield* spokenMs(rateStory(2, "")),
          [1650, 1650, 1650]
        );
      })
  );

  it.effect("a (speed N) before one Line changes only that Line", () =>
    Effect.gen(function* single() {
      assert.deepStrictEqual(
        yield* spokenMs(rateStory(1.1, "(speed 2)")),
        [3000, 1650, 3000]
      );
      // (slowly) is 0.9 of the story default: 3300 / 0.99 = 3333 ms.
      assert.deepStrictEqual(
        yield* spokenMs(rateStory(1.1, "(slowly)")),
        [3000, 3333, 3000]
      );
    })
  );
});
