// F14, selection: which adapter fills each service is explicit configuration (a story's reebeat.config.json, then
// flags). An unknown key or value fails `UnknownSelection` naming the key, the value and the choices; a selected
// adapter whose requirement is missing fails `AdapterUnavailable` naming it, and the build never falls back to
// another adapter: no output, in particular none made by the stand-in.
import { assert, layer } from "@effect/vitest";
import { Array as Arr, Effect, Exit } from "effect";

import {
  leftNothing,
  platform,
  runBuild,
  runCli,
  storySetup,
  tempDirectory,
  writeText,
} from "./support.ts";

const setup = storySetup;

layer(platform)("selection of adapters (F14)", (it) => {
  it.effect.each([
    {
      expected:
        /^UnknownSelection: unknown adapter for "speech"; the choices are kokoro, silent$/u,
      flags: ["--speech", "elevenlabs"],
      why: "an unknown value of --speech",
    },
    {
      expected:
        /^UnknownSelection: unknown adapter for "aligner"; the choices are whisper, even$/u,
      flags: ["--aligner", "magic"],
      why: "an unknown value of --aligner",
    },
    {
      expected:
        /^UnknownSelection: unknown adapter for "cache"; the choices are fs$/u,
      flags: ["--cache", "redis"],
      why: "an unknown value of --cache",
    },
  ])(
    "$why fails UnknownSelection naming the key and the choices, and builds nothing",
    ({ expected, flags }) =>
      Effect.gen(function* unknown() {
        const where = yield* setup;
        const { exit, stderr, stdout } = yield* runBuild(where, flags);

        assert.isTrue(Exit.isFailure(exit));
        assert.match(stderr, expected);
        assert.strictEqual(stdout, "");
        yield* leftNothing(where);
      })
  );

  it.effect.each([
    {
      config: '{ "voice": "af_heart" }',
      expected:
        /^UnknownSelection: unknown selection key "voice"; the keys are /u,
      why: "an unknown key",
    },
    {
      config: '{ "speech": "robot" }',
      expected:
        /^UnknownSelection: unknown adapter for "speech"; the choices are kokoro, silent$/u,
      why: "an unknown value",
    },
    {
      config: "[1, 2]",
      expected:
        /^ConfigInvalid: cannot decode as a JSON object .*reebeat\.config\.json/u,
      why: "a JSON array",
    },
    {
      config: "{ speech: silent",
      expected: /^ConfigInvalid: cannot decode as a JSON object /u,
      why: "text that is not JSON",
    },
  ])(
    "reebeat.config.json with $why is refused before anything is built",
    ({ config, expected }) =>
      Effect.gen(function* configured() {
        const where = yield* setup;

        yield* writeText(where.dir, "reebeat.config.json", config);

        const { exit, stderr } = yield* runBuild(where);

        assert.isTrue(Exit.isFailure(exit));
        assert.match(stderr, expected);
        yield* leftNothing(where);
      })
  );

  it.effect(
    "every command reads the selection: plan --timing, check and journey refuse an unknown value too",
    () =>
      Effect.gen(function* everywhere() {
        const where = yield* setup;

        for (const args of [
          ["plan", where.story, "--timing", "--speech", "elevenlabs"],
          [
            "check",
            where.out,
            "--source",
            where.story,
            "--speech",
            "elevenlabs",
          ],
          ["journey", where.story, "--speech", "elevenlabs"],
        ]) {
          const { exit, stderr } = yield* runCli(args);

          assert.isTrue(Exit.isFailure(exit), Arr.join(args, " "));
          assert.match(
            stderr,
            /^UnknownSelection: unknown adapter for "speech"/u
          );
        }
      })
  );

  it.effect(
    "kokoro selected with no REEBEAT_KOKORO_CACHE and a refresh asked is AdapterUnavailable naming the requirement, and no stand-in output replaces it",
    () =>
      Effect.gen(function* unavailable() {
        const where = yield* setup;

        const { exit, stderr, stdout } = yield* runBuild(
          where,
          ["--speech", "kokoro", "--aligner", "even", "--refresh-speech"],
          { env: {} }
        );

        assert.isTrue(Exit.isFailure(exit));
        assert.match(stderr, /^AdapterUnavailable: .*REEBEAT_KOKORO_CACHE/u);
        assert.notInclude(stderr, "standin");
        assert.notInclude(stdout, "built ");
        yield* leftNothing(where);
      })
  );

  it.effect(
    "kokoro selected with a model directory that holds nothing and an empty cache is SpeechCacheMiss, never a silent build",
    () =>
      Effect.gen(function* empty() {
        const where = yield* setup;
        const models = yield* tempDirectory;

        const { exit, stderr } = yield* runBuild(
          where,
          ["--speech", "kokoro", "--aligner", "even"],
          { env: { REEBEAT_KOKORO_CACHE: models } }
        );

        assert.isTrue(Exit.isFailure(exit));
        assert.match(stderr, /^SpeechCacheMiss: /u);
        assert.notInclude(stderr, "standin");
        yield* leftNothing(where);
      })
  );

  it.effect(
    "whisper selected with no model is AdapterUnavailable naming the model, and the even stand-in does not take its place",
    () =>
      Effect.gen(function* noModel() {
        const where = yield* setup;

        const { exit, stderr } = yield* runBuild(
          where,
          ["--speech", "silent", "--aligner", "whisper"],
          { env: {} }
        );

        assert.isTrue(Exit.isFailure(exit));
        assert.match(stderr, /^AdapterUnavailable: .*REEBEAT_WHISPER_MODEL/u);
        assert.notInclude(stderr, "even@1");
        yield* leftNothing(where);
      })
  );
});
