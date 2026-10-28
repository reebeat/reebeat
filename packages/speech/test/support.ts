// Shared by the tests. This file is the tests' one runtime adapter for files next to the tests (the `layer`
// blocks provide `NodeServices`); fixtures are built in temporary directories the tests create.
import { NodeServices } from "@effect/platform-node";
import { buildPlan } from "@reebeat/core";
import type { AlignedLine, Line, PlanJson } from "@reebeat/core";
import { Array as Arr, Effect, FileSystem, Path } from "effect";
import type { Crypto, Layer } from "effect";

import type { HeardWord } from "../src/align.ts";
import { speechCacheFiles } from "../src/cache.ts";
import type { CacheEntry } from "../src/entry.ts";
import { sha256Hex, speechKey, speechParams } from "../src/key.ts";
import { Speech, SpeechCache } from "../src/services.ts";

/** The platform services the tests run on: the tests' one runtime adapter. */
export const platform = NodeServices.layer;

/** Joins rows of a source text with newlines. */
const asText = (rows: readonly string[]): string => Arr.join(rows, "\n");

/** A story of two Lines, the second one slowly. */
const fixtureSource = asText([
  "Title: Speech",
  "",
  "# Part",
  "",
  "INT. ONE",
  "",
  "Box {#a}",
  "",
  "NARRATOR",
  "Hello there, friend.",
  "",
  "NARRATOR",
  "(slowly)",
  "Second line here.",
  "",
]);

/** The Plan of `fixtureSource`. */
export const fixturePlan = Effect.gen(function* build() {
  return yield* buildPlan(
    fixtureSource,
    yield* sha256Hex(new TextEncoder().encode(fixtureSource))
  );
});

/** A directory that is removed when the test's scope closes. */
export const tempDirectory = Effect.gen(function* create() {
  const fs = yield* FileSystem.FileSystem;

  return yield* fs.makeTempDirectoryScoped({ prefix: "reebeat-speech-test-" });
});

/** The directory of the same-id story, in the repository. */
export const storyDirectory = Effect.gen(function* locate() {
  const path = yield* Path.Path;

  return yield* path.fromFileUrl(
    new URL("../../../stories/same-id/", import.meta.url)
  );
});

/** The Lines of a Plan, in order, with the cache key of each. */
export const linesWithKeys = (plan: PlanJson) =>
  Effect.forEach(
    Arr.flatMap(plan.scenes, (scene) => scene.lines),
    (line) =>
      Effect.map(
        speechKey(speechParams({ speed: line.hints.speed, text: line.text })),
        (key) => ({ key, line })
      )
  );

/** What whisper would hear if it heard every word of `words` exactly, 100 ms each. */
export const perfectlyHeard = (
  words: readonly string[]
): readonly HeardWord[] =>
  Arr.map(words, (w, index) => ({
    endMs: index * 100 + 100,
    startMs: index * 100,
    w,
  }));

/** The entry and FLAC bytes of a Line as the pipeline would store them (the bytes are a stand-in). */
export const fixtureEntry = (
  line: PlanJson["scenes"][number]["lines"][number]
) =>
  Effect.gen(function* build() {
    const params = speechParams({ speed: line.hints.speed, text: line.text });
    const key = yield* speechKey(params);
    const flac = new TextEncoder().encode(`flac of ${line.id}`);

    const entry: CacheEntry = {
      audioSha256: yield* sha256Hex(flac),
      durationMs: line.words.length * 100,
      key,
      match: 1,
      params,
      words: Arr.map(line.words, (w, index) => ({
        endMs: index * 100 + 100,
        startMs: index * 100,
        w,
      })),
    };

    return { entry, flac };
  });

/** The aligned Line a cache hit must give for `entry`, written out from the contract (audio file is `<key>.flac`). */
export const alignedFrom = (
  lineId: string,
  entry: CacheEntry
): AlignedLine => ({
  audio: { file: `${entry.key}.flac`, sha256: entry.audioSha256 },
  durationMs: entry.durationMs,
  lineId,
  words: Arr.map(entry.words, ({ endMs, startMs, w }) => ({
    endMs,
    startMs,
    w,
  })),
});

/** Runs `Speech.alignLines` on a Plan from the Speech service in the environment. */
export const alignLines = (plan: PlanJson) =>
  Effect.gen(function* narrate() {
    const speech = yield* Speech;

    return yield* speech.alignLines(plan);
  });

/** Runs `use` against the speech cache of `directory`. */
export const inCache = <A, E>(
  directory: string,
  use: (cache: SpeechCache["Service"]) => Effect.Effect<A, E>
) =>
  Effect.gen(function* run() {
    return yield* use(yield* SpeechCache);
  }).pipe(Effect.provide(speechCacheFiles(directory)));

/** Stores the fixture entry of a Line in the cache of `directory` and returns it. */
export const storeFixture = (directory: string, line: Line) =>
  Effect.gen(function* store() {
    const fixture = yield* fixtureEntry(line);

    yield* inCache(directory, (cache) =>
      cache.put(fixture.entry, fixture.flac)
    );

    return fixture;
  });

/** Stores the fixture entry of each Line, in order. */
export const storeFixtures = (directory: string, lines: readonly Line[]) =>
  Effect.forEach(lines, (line) => storeFixture(directory, line));

/** The Lines of a Plan, in order. */
export const linesOf = (plan: PlanJson): readonly Line[] =>
  Arr.flatMap(plan.scenes, (scene) => scene.lines);

/** The error `Speech.alignLines` fails with on `plan` over `speech`. */
export const alignFailure = <E>(
  plan: PlanJson,
  speech: Layer.Layer<
    Speech,
    E,
    FileSystem.FileSystem | Path.Path | Crypto.Crypto
  >
) => alignLines(plan).pipe(Effect.provide(speech), Effect.flip);
