// F16, an integration adapter and its credential (design R3, rules 2 and 3). A TEST-ONLY fake of a hosted speech
// provider declares that it sends the script text and needs `FAKE_PROVIDER_KEY` from the environment. Without the key
// the build fails naming the requirement and writes nothing. With the key (a canary string) the build succeeds, the
// manifest and the summary list its egress, and the canary appears in no file of the build, no cache file or key, the
// plan, the manifest, nor anything printed. Two controls prove the search finds a leak: an adapter that logs its key
// leaves the canary in the output, and one that declares a setting named like a secret is refused.
import { assert, layer } from "@effect/vitest";
import { decodeBuildManifest } from "@reebeat/pipeline";
import { AdapterUnavailable, SpeechSynthesizer } from "@reebeat/services";
import { silentSynthesizer } from "@reebeat/services/standins";
import {
  Array as Arr,
  Config,
  Effect,
  Exit,
  FileSystem,
  Layer,
  Option,
  Path,
  Redacted,
} from "effect";

import type { Parts } from "../src/adapters.ts";
import { leftNothing, platform, runBuild, storySetup } from "./support.ts";

const canary = "canary-9f2d41c7a8e35b60";

const keyName = "FAKE_PROVIDER_KEY";

const sends = ["script text"];

interface Behaviour {
  /** Writes the credential to the log: the leak the search must find. */
  readonly logsKey?: boolean;
  /** Settings the adapter declares besides its voice. */
  readonly settings?: Readonly<Record<string, string>>;
}

/**
 * The fake hosted narrator: it reads its credential from the environment when it first speaks (`AdapterUnavailable`
 * when it is absent), then answers with the silent stand-in's audio; it declares what it sends out.
 */
const fakeHosted = (behaviour: Behaviour = {}): Parts["speech"] =>
  Layer.effect(
    SpeechSynthesizer,
    Effect.gen(function* hosted() {
      const stand = yield* Effect.provide(SpeechSynthesizer, silentSynthesizer);

      return SpeechSynthesizer.of({
        info: {
          egress: { kind: "integration", sends },
          id: "fake-hosted@1",
          settings: { voice: "v1", ...behaviour.settings },
        },
        synthesize: Effect.fn("fakeHosted.synthesize")(
          function* speak(request) {
            const key = yield* Effect.mapError(
              Config.Redacted(keyName),
              () =>
                new AdapterUnavailable({
                  adapter: "fake-hosted@1",
                  message: `${keyName} names the provider credential and is not set`,
                  requirement: `env ${keyName}`,
                  service: "SpeechSynthesizer",
                })
            );

            if (behaviour.logsKey === true) {
              yield* Effect.logInfo(
                `calling the provider with ${Redacted.value(key)}`
              );
            }

            return yield* stand.synthesize(request);
          }
        ),
      });
    })
  );

const setup = storySetup;

/** Every file under `dir`, as `[relative path, text]`; the text is read as UTF-8, which keeps the canary's bytes. */
const textsUnder = Effect.fnUntraced(function* textsUnder(dir: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  if (!(yield* fs.exists(dir))) {
    return [];
  }

  const names = yield* fs.readDirectory(dir, { recursive: true });

  const files = yield* Effect.filter(names, (name) =>
    Effect.map(fs.stat(path.join(dir, name)), (info) => info.type === "File")
  );

  return yield* Effect.forEach(files, (name) =>
    Effect.map(
      fs.readFileString(path.join(dir, name)),
      (text): readonly [string, string] => [name, text]
    )
  );
});

/** Where the canary is: every file name or text of the build and the cache, and the output, that contains it. */
const leaks = Effect.fnUntraced(function* leaks(
  where: { readonly cache: string; readonly out: string },
  printed: readonly string[]
) {
  const files = [
    ...Arr.map(yield* textsUnder(where.out), ([name, text]) => ({
      name: `build/${name}`,
      text,
    })),
    ...Arr.map(yield* textsUnder(where.cache), ([name, text]) => ({
      name: `cache/${name}`,
      text,
    })),
  ];

  return [
    ...Arr.flatMap(files, ({ name, text }) =>
      name.includes(canary) || text.includes(canary) ? [name] : []
    ),
    ...Arr.flatMap(printed, (text, index) =>
      text.includes(canary) ? [index === 0 ? "stdout" : "stderr"] : []
    ),
  ];
});

layer(platform)("an integration adapter and its credential (F16)", (it) => {
  it.effect(
    "without its credential the build fails naming the requirement, writes nothing and sends nothing",
    () =>
      Effect.gen(function* missing() {
        const where = yield* setup;

        const { exit, stderr, stdout } = yield* runBuild(
          where,
          ["--aligner", "even", "--refresh-speech"],
          { env: {}, speech: fakeHosted() }
        );

        assert.isTrue(Exit.isFailure(exit));
        assert.match(stderr, /^AdapterUnavailable: .*FAKE_PROVIDER_KEY/u);
        assert.notInclude(stdout, "built ");
        yield* leftNothing(where);
      })
  );

  it.effect(
    "with its credential the build succeeds, lists the egress, and the canary is in no file, key, plan, manifest or output",
    () =>
      Effect.gen(function* present() {
        const fs = yield* FileSystem.FileSystem;
        const where = yield* setup;

        const { exit, stderr, stdout } = yield* runBuild(
          where,
          ["--aligner", "even", "--refresh-speech"],
          { env: { [keyName]: canary }, speech: fakeHosted() }
        );

        assert.isTrue(Exit.isSuccess(exit), stderr);

        // The manifest lists the adapter and what it sends; the summary says so too.
        const manifest = yield* decodeBuildManifest(
          yield* fs.readFileString(`${where.out}/build.json`)
        );

        const hosted = Arr.findFirst(
          manifest.adapters,
          (adapter) => adapter.service === "SpeechSynthesizer"
        );

        assert.deepStrictEqual(
          Option.getOrUndefined(
            Option.map(hosted, (adapter) => adapter.egress)
          ),
          { kind: "integration", sends }
        );
        assert.include(
          stdout,
          "SpeechSynthesizer: fake-hosted@1, egress: integration, sends script text"
        );

        // The key never reached the build, the plan, the manifest, the cache keys and provenance, or the output.
        assert.deepStrictEqual(yield* leaks(where, [stdout, stderr]), []);

        // The files the search read are the build's and the cache's own: it looked at something.
        assert.isAbove((yield* textsUnder(where.out)).length, 5);
        assert.isAbove((yield* textsUnder(where.cache)).length, 3);
      })
  );

  it.effect(
    "control: an adapter that logs its key leaves the canary in the output, and the search finds it",
    () =>
      Effect.gen(function* leaking() {
        const where = yield* setup;

        const { stderr, stdout } = yield* runBuild(
          where,
          ["--aligner", "even", "--refresh-speech"],
          {
            env: { [keyName]: canary },
            speech: fakeHosted({ logsKey: true }),
          }
        );

        assert.deepStrictEqual(yield* leaks(where, [stdout, stderr]), [
          "stdout",
        ]);
      })
  );

  it.effect(
    "control: an adapter that declares a setting named like a secret is refused before anything is written",
    () =>
      Effect.gen(function* named() {
        const where = yield* setup;

        const { exit, stderr } = yield* runBuild(
          where,
          ["--aligner", "even", "--refresh-speech"],
          {
            env: { [keyName]: canary },
            speech: fakeHosted({ settings: { apiKey: canary } }),
          }
        );

        assert.isTrue(Exit.isFailure(exit));
        assert.match(
          stderr,
          /^SecretLikeSetting: setting "apiKey" of fake-hosted@1/u
        );
        assert.notInclude(stderr, canary);
        yield* leftNothing(where);
      })
  );
});
