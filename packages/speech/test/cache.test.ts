// The cache on a directory and the cache-only Speech: hits, misses (F12), and entries that cannot be trusted.
import { assert, layer } from "@effect/vitest";
import {
  Array as Arr,
  Effect,
  Exit,
  FileSystem,
  Option,
  Order,
  Path,
  Predicate,
  Record,
  Schema,
} from "effect";

import { CacheEntrySchema, decodeEntry, encodeEntry } from "../src/entry.ts";
import { speechCacheOnly } from "../src/speech.ts";
import {
  alignFailure,
  alignLines,
  alignedFrom,
  fixtureEntry,
  fixturePlan,
  inCache,
  linesOf,
  platform,
  storeFixture,
  storeFixtures,
  tempDirectory,
} from "./support.ts";

const KeysOnly = Schema.fromJsonString(
  Schema.Record(Schema.String, Schema.Unknown)
);

const firstLine = Effect.gen(function* firstLine() {
  const plan = yield* fixturePlan;
  const line = plan.scenes[0]?.lines[0];

  return { line: yield* Effect.fromNullishOr(line), plan };
});

layer(platform)("entries", (it) => {
  it.effect(
    "round-trip through their JSON text, keys in alphabetical order",
    () =>
      Effect.gen(function* roundTrip() {
        const { line } = yield* firstLine;
        const { entry } = yield* fixtureEntry(line);
        const text = yield* encodeEntry(entry);

        assert.deepStrictEqual(yield* decodeEntry(text), entry);

        for (const object of [
          yield* Schema.decodeEffect(KeysOnly)(text),
          yield* Schema.decodeEffect(KeysOnly)(
            yield* Schema.encodeEffect(Schema.fromJsonString(CacheEntrySchema))(
              entry
            )
          ),
        ]) {
          const keys = Record.keys(object);

          assert.deepStrictEqual(keys, Arr.sort(keys, Order.String));
        }
      })
  );

  it.effect.each([
    ["not JSON", "{"],
    ["a missing field", '{"key":"k"}'],
    [
      "a negative time",
      '{"audioSha256":"a","durationMs":-1,"key":"k","match":1,"params":{},"words":[]}',
    ],
  ])("are rejected when the file is %s", ([, text]) =>
    Effect.gen(function* rejected() {
      const exit = yield* Effect.exit(decodeEntry(text));

      assert.isTrue(Exit.isFailure(exit));
    })
  );
});

/** The fixture entry of the first Line, stored in a new directory, and the failure reading it gives. */
const storedEntry = Effect.gen(function* stored() {
  const directory = yield* tempDirectory;
  const { line } = yield* firstLine;
  const { entry } = yield* storeFixture(directory, line);

  return {
    directory,
    entry,
    readFailure: inCache(directory, (cache) =>
      Effect.flip(cache.get(entry.key))
    ),
  };
});

layer(platform)("the cache directory", (it) => {
  it.effect(
    "returns what it was given, and nothing for a key it does not hold",
    () =>
      Effect.gen(function* putGet() {
        const directory = yield* tempDirectory;
        const { line } = yield* firstLine;
        const { entry, flac } = yield* fixtureEntry(line);

        yield* inCache(directory, (cache) =>
          Effect.gen(function* use() {
            assert.isTrue(Option.isNone(yield* cache.get(entry.key)));
            yield* cache.put(entry, flac);
            assert.deepStrictEqual(
              yield* cache.get(entry.key),
              Option.some(entry)
            );
          })
        );
      })
  );

  it.effect("writes the audio next to the words, under the key", () =>
    Effect.gen(function* layout() {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* tempDirectory;
      const { line } = yield* firstLine;
      const { entry } = yield* storeFixture(directory, line);

      assert.deepStrictEqual(
        Arr.sort(yield* fs.readDirectory(directory), Order.String),
        [`${entry.key}.flac`, `${entry.key}.json`]
      );
    })
  );

  it.effect(
    "fails with SpeechCacheFailed when the audio no longer matches its hash",
    () =>
      Effect.gen(function* tampered() {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const { directory, entry, readFailure } = yield* storedEntry;

        yield* fs.writeFile(
          path.join(directory, `${entry.key}.flac`),
          new TextEncoder().encode("not the audio")
        );

        const failure = yield* readFailure;

        assert.strictEqual(failure._tag, "SpeechCacheFailed");
        assert.strictEqual(failure.operation, "verify");
        assert.strictEqual(failure.key, entry.key);
      })
  );

  it.effect(
    "fails with SpeechCacheFailed when the words file is not an entry, or is another key's",
    () =>
      Effect.gen(function* unreadable() {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const { directory, entry, readFailure } = yield* storedEntry;
        const words = path.join(directory, `${entry.key}.json`);

        yield* fs.writeFileString(words, "{ truncated");
        assert.strictEqual((yield* readFailure).operation, "read");

        yield* fs.writeFileString(
          words,
          yield* encodeEntry({ ...entry, key: "someotherkey" })
        );
        assert.strictEqual((yield* readFailure).operation, "verify");
      })
  );
});

layer(platform)("speechCacheOnly", (it) => {
  it.effect("a hit gives the AlignedLine of the entry, Line by Line", () =>
    Effect.gen(function* hit() {
      const directory = yield* tempDirectory;
      const { plan } = yield* firstLine;
      const lines = linesOf(plan);
      const fixtures = yield* storeFixtures(directory, lines);

      const aligned = yield* alignLines(plan).pipe(
        Effect.provide(speechCacheOnly(directory))
      );

      assert.deepStrictEqual(
        aligned,
        Arr.map(fixtures, ({ entry }, index) =>
          alignedFrom(lines[index]?.id ?? "", entry)
        )
      );
      assert.strictEqual(
        aligned[0]?.audio.file,
        `${fixtures[0]?.entry.key}.flac`
      );
    })
  );

  it.effect(
    "F12: a miss fails SpeechCacheMiss naming the Line, its text and its key",
    () =>
      Effect.gen(function* miss() {
        const directory = yield* tempDirectory;
        const { plan } = yield* firstLine;
        const [first, second] = linesOf(plan);

        // The first Line is cached, the second is not.
        yield* storeFixture(directory, yield* Effect.fromNullishOr(first));

        const lost = yield* fixtureEntry(yield* Effect.fromNullishOr(second));
        const error = yield* alignFailure(plan, speechCacheOnly(directory));

        assert.isTrue(Predicate.isTagged(error, "SpeechCacheMiss"));

        if (Predicate.isTagged(error, "SpeechCacheMiss")) {
          assert.strictEqual(error.lineId, "sc1.l2");
          assert.strictEqual(error.key, lost.entry.key);
          assert.strictEqual(error.textExcerpt, "Second line here.");
          assert.include(error.message, "sc1.l2");
          assert.include(error.message, lost.entry.key);
        }
      })
  );
});
