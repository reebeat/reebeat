// The journey program (`reebeat journey`): build, check, build again, compare (F6); the first failure stops it. It
// runs the real build program on the stand-ins and a fake capturer, with a fake verification.
import { assert, layer } from "@effect/vitest";
import { Effect, FileSystem, Layer, Path } from "effect";

import { journey } from "../src/journey.ts";
import { readManifest } from "../src/manifest.ts";
import type { Verifier } from "../src/verifier.ts";
import {
  fakeVerifier,
  fakeWorld,
  platform,
  standins,
  storyFile,
  verdict,
} from "./support.ts";

const prepare = Effect.gen(function* preparation() {
  const path = yield* Path.Path;
  const story = yield* storyFile();
  const dir = path.dirname(story);
  const outRoot = path.join(dir, "build");
  const name = path.basename(dir);

  return {
    cacheDir: path.join(dir, "speech-cache"),
    first: path.join(outRoot, name),
    outRoot,
    second: path.join(outRoot, `${name}-2`),
    story,
  };
});

const journeyWith = (
  prepared: { cacheDir: string; outRoot: string; story: string },
  verifier: Layer.Layer<Verifier>
) =>
  Effect.gen(function* run() {
    return yield* journey({
      cacheDir: prepared.cacheDir,
      outRoot: prepared.outRoot,
      refreshSpeech: false,
      selection: yield* standins,
      story: prepared.story,
    });
  }).pipe(Effect.provide(Layer.mergeAll(verifier, fakeWorld())));

layer(platform)("the journey", (it) => {
  it.effect("builds, checks, builds again and compares, in that order", () =>
    Effect.gen(function* all() {
      const calls: string[] = [];
      const prepared = yield* prepare;
      const { first, second, story } = prepared;

      yield* journeyWith(
        prepared,
        fakeVerifier([verdict("F1", "pass")], verdict("F6", "pass"), calls)
      );

      assert.deepStrictEqual(calls, [
        `check ${first} ${story}`,
        `compare ${first} ${second}`,
      ]);
      yield* readManifest(first);
      yield* readManifest(second);
    })
  );

  it.effect(
    "stops at a failing check: the second build is not made and nothing is compared",
    () =>
      Effect.gen(function* stopped() {
        const fs = yield* FileSystem.FileSystem;
        const calls: string[] = [];
        const prepared = yield* prepare;

        const failure = yield* Effect.flip(
          journeyWith(
            prepared,
            fakeVerifier([verdict("F3", "fail")], verdict("F6", "pass"), calls)
          )
        );

        assert.strictEqual(failure._tag, "ChecksFailed");
        assert.deepStrictEqual(calls, [
          `check ${prepared.first} ${prepared.story}`,
        ]);
        assert.isFalse(yield* fs.exists(prepared.second));
      })
  );

  it.effect("fails when the two builds differ (F6)", () =>
    Effect.gen(function* different() {
      const failure = yield* Effect.flip(
        journeyWith(
          yield* prepare,
          fakeVerifier([verdict("F1", "pass")], verdict("F6", "fail"), [])
        )
      );

      assert.strictEqual(failure._tag, "ChecksFailed");
      assert.include(failure.message, "F6");
    })
  );
});
