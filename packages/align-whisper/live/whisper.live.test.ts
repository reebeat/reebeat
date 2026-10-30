// Opt-in: `bun run test:live` in packages/align-whisper, with TSUKURI_WHISPER_MODEL naming ggml-base.en.bin and
// whisper-cli and ffmpeg on the PATH. Two suites: the WordAligner contract, and real speech (the committed
// narration of one Line of stories/same-id) aligned to the times its asset records. When the binary or the model
// is absent both FAIL (every clause fails with AdapterUnavailable); neither skips.
import { assert, layer } from "@effect/vitest";
import { WordAligner } from "@tsukuri/services";
import { wordAlignerContract } from "@tsukuri/services/contract";
import {
  Array as Arr,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Schema,
  Stream,
  String as Str,
} from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import { whisperAligner } from "../src/whisperAligner.ts";
import { platform } from "./support.ts";

const aligner = Layer.provide(whisperAligner, platform);

// The aligner never hears hints: the contract's default clip is silence, so only the structural clauses apply.
wordAlignerContract("whisper.cpp", aligner, { usesHint: false });

const text = "Picture a box on a screen.";

const Provenance = Schema.fromJsonString(
  Schema.Struct({
    provenance: Schema.Struct({
      keyParts: Schema.Struct({ input: Schema.String, key: Schema.String }),
    }),
  })
);

const WordsFile = Schema.fromJsonString(
  Schema.Struct({
    words: Schema.Array(
      Schema.Struct({ endMs: Schema.Int, startMs: Schema.Int })
    ),
  })
);

/** The committed asset of `text`: its narration decoded to mono float samples at 24 kHz, and its word times. */
const committed = Effect.gen(function* asset() {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

  const cache = yield* path.fromFileUrl(
    new URL("../../../stories/same-id/speech-cache/", import.meta.url)
  );

  const parts = yield* Effect.forEach(
    Arr.filter(yield* fs.readDirectory(cache), (name) =>
      Str.endsWith(".provenance.json")(name)
    ),
    (name) =>
      Effect.map(
        Effect.flatMap(fs.readFileString(path.join(cache, name)), (json) =>
          Schema.decodeEffect(Provenance)(json)
        ),
        ({ provenance }) => provenance.keyParts
      )
  );

  const { key } = yield* Effect.fromNullishOr(
    Option.getOrUndefined(Arr.findFirst(parts, (part) => part.input === text))
  );

  const chunks = yield* Effect.scoped(
    Effect.flatMap(
      spawner.spawn(
        ChildProcess.make(
          "ffmpeg",
          [
            "-nostdin",
            "-v",
            "error",
            "-i",
            path.join(cache, `${key}.flac`),
            "-f",
            "f32le",
            "-ac",
            "1",
            "pipe:1",
          ],
          { stdin: "ignore" }
        )
      ),
      (handle) => Stream.runCollect(handle.stdout)
    )
  );

  const bytes = Uint8Array.from(Arr.flatMap(chunks, (chunk) => [...chunk]));

  const words = yield* Effect.flatMap(
    fs.readFileString(path.join(cache, `${key}.words.json`)),
    (json) => Schema.decodeEffect(WordsFile)(json)
  );

  return {
    clip: { sampleRate: 24_000, samples: new Float32Array(bytes.buffer) },
    spans: Arr.map(words.words, ({ endMs, startMs }) => ({ endMs, startMs })),
  };
});

layer(Layer.merge(aligner, platform))("whisper.cpp on real speech", (it) => {
  it.effect(
    "reproduces the word times the committed asset records, with a full match",
    () =>
      Effect.gen(function* real() {
        const { clip, spans } = yield* committed;

        const { match, spans: heard } = yield* (yield* WordAligner).align({
          clip,
          words: Str.split(text, " "),
        });

        assert.isAtLeast(match, 0.9);
        assert.deepStrictEqual(heard, spans);
      })
  );
});
