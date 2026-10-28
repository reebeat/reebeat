// build.json v2 and the silent stand-in (spec 0001, F5, F15 and F16). F5 reads the manifest's adapters and assets: a
// Line without the provenance of its audio, a service without an adapter, a local adapter that sends something and a
// secret-looking setting each fail it, naming what is wrong. F8 and the sound part of F1 are not applicable when, and
// only when, the manifest lists a stand-in narrator: the same silenced track under a manifest that lists a real
// narrator still fails both.
import { assert, layer } from "@effect/vitest";
import { decodeBuildManifest, encodeBuildManifest } from "@reebeat/pipeline";
import type { BuildManifest } from "@reebeat/pipeline";
import { Array as Arr, Effect, FileSystem, Path } from "effect";

import { exitCode } from "../src/index.ts";
import {
  Fixture,
  audioFilter,
  checkDirectory,
  copyBuild,
  failedIds,
  measuredOf,
  sealBuild,
  verdictOf,
} from "./support.ts";

/** Rewrites the `build.json` of `dir` with `change` applied to its manifest. */
const editManifest = Effect.fn("editManifest")(function* edit(
  dir: string,
  change: (manifest: BuildManifest) => BuildManifest
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const file = path.join(dir, "build.json");

  yield* fs.writeFileString(
    file,
    yield* encodeBuildManifest(
      change(yield* decodeBuildManifest(yield* fs.readFileString(file)))
    )
  );
});

const withNarrator = (id: string) => (manifest: BuildManifest) => ({
  ...manifest,
  adapters: Arr.map(manifest.adapters, (adapter) =>
    adapter.service === "SpeechSynthesizer" ? { ...adapter, id } : adapter
  ),
});

/** A copy of the intact build whose audio is silent and whose `build.json` is sealed again, listing `narrator` if given. */
const silencedCopy = Effect.fn("silencedCopy")(function* silencedCopy(
  name: string,
  narrator?: string
) {
  const fixture = yield* Fixture;
  const dir = yield* copyBuild(name);

  yield* audioFilter("volume=0")(dir);
  yield* sealBuild(dir, fixture.sourcePath);

  if (narrator !== undefined) {
    yield* editManifest(dir, withNarrator(narrator));
  }

  return dir;
});

layer(Fixture.layer, { excludeTestServices: true, timeout: "300 seconds" })(
  "build.json v2 and the silent stand-in",
  (it) => {
    it.effect(
      "the intact build lists the seven adapters with egress and the provenance of each Line's audio",
      () =>
        Effect.gen(function* listed() {
          const fixture = yield* Fixture;
          const verdict = verdictOf(yield* checkDirectory(fixture.build), "F5");

          assert.strictEqual(verdict.status, "pass", verdict.detail);
          assert.include(measuredOf(verdict), "adapters listed with egress: 7");
          assert.include(measuredOf(verdict), "assets with provenance: 2");
        })
    );

    it.effect.each([
      {
        change: (manifest: BuildManifest): BuildManifest => ({
          ...manifest,
          assets: Arr.drop(manifest.assets, 1),
        }),
        expected: "has no provenance for its audio",
        name: "f5-no-provenance",
        why: "a manifest without the provenance of one Line's audio, naming the Line",
      },
      {
        change: (manifest: BuildManifest): BuildManifest => ({
          ...manifest,
          adapters: Arr.filter(
            manifest.adapters,
            (adapter) => adapter.service !== "Encoder"
          ),
        }),
        expected: "lists 0 adapters for Encoder",
        name: "f5-no-adapter",
        why: "a manifest that lists no adapter for a service, naming the service",
      },
      {
        change: (manifest: BuildManifest): BuildManifest => ({
          ...manifest,
          adapters: Arr.map(manifest.adapters, (adapter) =>
            adapter.service === "Renderer"
              ? { ...adapter, egress: { kind: "local", sends: ["the plan"] } }
              : adapter
          ),
        }),
        expected: "is declared local but sends the plan",
        name: "f5-leaky",
        why: "a local adapter that declares it sends something, naming the adapter",
      },
    ])("F5: $why fails", ({ change, expected, name }) =>
      Effect.gen(function* controlled() {
        const dir = yield* copyBuild(name);

        yield* editManifest(dir, change);

        const verdicts = yield* checkDirectory(dir);

        assert.deepStrictEqual(failedIds(verdicts), ["F5"]);
        assert.include(verdictOf(verdicts, "F5").detail, expected);
      })
    );

    it.effect(
      "F5: a secret-looking setting in an adapter, in an asset and in the cache key's extra fails, naming the setting and never its value",
      () =>
        Effect.gen(function* secret() {
          const adapter = yield* copyBuild("f5-secret-adapter");
          const asset = yield* copyBuild("f5-secret-asset");
          const extra = yield* copyBuild("f5-secret-extra");

          yield* editManifest(adapter, (manifest) => ({
            ...manifest,
            adapters: Arr.map(manifest.adapters, (entry) => ({
              ...entry,
              settings: { ...entry.settings, apiToken: "canary-value" },
            })),
          }));
          yield* editManifest(asset, (manifest) => ({
            ...manifest,
            assets: Arr.map(manifest.assets, (entry) => ({
              ...entry,
              settings: { ...entry.settings, password: "canary-value" },
            })),
          }));
          yield* editManifest(extra, (manifest) => ({
            ...manifest,
            assets: Arr.map(manifest.assets, (entry) => ({
              ...entry,
              keyParts: {
                ...entry.keyParts,
                extra: {
                  aligner: { settings: { clientSecret: "canary-value" } },
                },
              },
            })),
          }));

          for (const [dir, name] of [
            [adapter, "apiToken"],
            [asset, "password"],
            [extra, "clientSecret"],
          ] as const) {
            const verdict = verdictOf(yield* checkDirectory(dir), "F5");

            assert.strictEqual(verdict.status, "fail", name);
            assert.include(verdict.detail, `a setting named "${name}"`);
            assert.notInclude(verdict.detail, "canary-value");
          }
        })
    );

    it.effect(
      "F8 and the sound part of F1 are N/A when the manifest lists a stand-in narrator over a silent track, and the exit code holds",
      () =>
        Effect.gen(function* standin() {
          const dir = yield* silencedCopy("standin-silent", "silent@1-standin");

          const verdicts = yield* checkDirectory(dir);
          const f8 = verdictOf(verdicts, "F8");
          const f1 = verdictOf(verdicts, "F1");

          assert.strictEqual(f8.status, "na");
          assert.include(f8.detail, "N/A (silent stand-in)");
          assert.strictEqual(f1.status, "pass", f1.detail);
          assert.include(
            measuredOf(f1),
            "sfx cues: N/A (silent stand-in): 1 not observed"
          );
          assert.deepStrictEqual(failedIds(verdicts), []);
          assert.strictEqual(exitCode(verdicts), 0);
        })
    );

    it.effect(
      "control: the same silenced track under a real narrator still fails F8 and F1",
      () =>
        Effect.gen(function* silenced() {
          const dir = yield* silencedCopy("real-silenced");

          const verdicts = yield* checkDirectory(dir);

          assert.strictEqual(verdictOf(verdicts, "F8").status, "fail");
          assert.strictEqual(verdictOf(verdicts, "F1").status, "fail");
          assert.include(
            verdictOf(verdicts, "F8").detail,
            "its audio is not found within 150 ms"
          );
        })
    );

    it.effect(
      "control: a narrator whose id merely contains standin is not a stand-in",
      () =>
        Effect.gen(function* lookalike() {
          const dir = yield* silencedCopy(
            "standin-lookalike",
            "standin-voice@1"
          );

          const verdicts = yield* checkDirectory(dir);

          assert.strictEqual(verdictOf(verdicts, "F8").status, "fail");
        })
    );
  }
);
