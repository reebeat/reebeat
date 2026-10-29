// The Encoder contract against the real ffmpeg (offline: ffmpeg is in the devenv and the inputs are tiny), and
// what the contract does not say: the loud failures, nothing left behind, and the adapter without ffmpeg.
import { assert, layer } from "@effect/vitest";
import { Encoder, CaptureError } from "@reebeat/services";
import type { MuxRequest } from "@reebeat/services";
import { encoderContract } from "@reebeat/services/contract";
import {
  Array as Arr,
  Effect,
  FileSystem,
  Layer,
  Path,
  Stream,
  PlatformError,
} from "effect";
import { ChildProcessSpawner } from "effect/process";

import { ffmpegEncoder } from "../src/ffmpegEncoder.ts";
import { platform, probeMux, solidPng, toolbox } from "./support.ts";

const encoder = Layer.provideMerge(ffmpegEncoder, platform);

encoderContract("ffmpeg", encoder, { probe: probeMux });

const request = (
  outPath: string,
  frames: MuxRequest["frames"],
  tracks: MuxRequest["tracks"] = []
): MuxRequest => ({
  chapters: [{ endMs: 400, startMs: 0, title: "Only" }],
  fps: 10,
  frames,
  height: 64,
  metadata: { comment: "unit", title: "Unit" },
  ntsc: false,
  outPath,
  totalMs: 400,
  tracks,
  vtt: "WEBVTT\n\n00:00:00.000 --> 00:00:00.400\nHello\n",
  width: 64,
});

const inTemp = Effect.gen(function* temp() {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const directory = yield* fs.makeTempDirectoryScoped({
    prefix: "reebeat-enc-",
  });

  return { directory, fs, out: path.join(directory, "out.mp4"), path };
});

layer(Layer.merge(encoder, toolbox))("ffmpeg encoder", (it) => {
  it.effect("refuses an output name that is not a plain file name", () =>
    Effect.gen(function* name() {
      const { directory, path } = yield* inTemp;
      const encoderService = yield* Encoder;

      const failure = yield* Effect.flip(
        encoderService.mux(
          request(path.join(directory, "bad name.mp4"), Stream.empty)
        )
      );

      assert.strictEqual(failure._tag, "EncodeFailed");
    })
  );

  it.effect(
    "refuses the NTSC fraction of a frame rate, naming settings.ntsc, before it writes anything",
    () =>
      Effect.gen(function* ntsc() {
        const { fs, out } = yield* inTemp;
        const encoderService = yield* Encoder;

        const failure = yield* Effect.flip(
          encoderService.mux({
            ...request(out, Stream.empty),
            fps: 30,
            ntsc: true,
          })
        );

        assert.strictEqual(failure._tag, "AdapterUnavailable");
        assert.include(failure.message, "settings.ntsc true");
        assert.isFalse(yield* fs.exists(out));
      })
  );

  it.effect(
    "a failing frame stream fails the mux unchanged and leaves nothing behind",
    () =>
      Effect.gen(function* failing() {
        const { directory, fs, out } = yield* inTemp;
        const encoderService = yield* Encoder;
        const frame = yield* solidPng("red", 64);
        yield* fs.writeFileString(out, "an earlier build");

        const broken = new CaptureError({
          adapter: "test",
          cause: "timeout",
          message: "the capture timed out",
        });

        const failure = yield* Effect.flip(
          encoderService.mux(
            request(
              out,
              Stream.concat(Stream.make(frame, frame), Stream.fail(broken))
            )
          )
        );

        assert.deepStrictEqual(failure, broken);
        assert.deepStrictEqual(yield* fs.readDirectory(directory), []);
      })
  );

  it.effect("with no track the audio is silence of the video's length", () =>
    Effect.gen(function* silent() {
      const { directory, path } = yield* inTemp;
      const encoderService = yield* Encoder;
      const frame = yield* solidPng("blue", 64);
      const out = path.join(directory, "out.mp4");

      const result = yield* encoderService.mux(
        request(out, Stream.fromIterable(Arr.makeBy(4, () => frame)))
      );

      const probe = yield* probeMux(out);

      assert.strictEqual(result.frames, 4);
      assert.strictEqual(result.path, out);
      assert.strictEqual(probe.frames, 4);
      assert.strictEqual(probe.audio.samples.length > 0, true);
      assert.strictEqual(
        Arr.every(
          [...probe.audio.samples],
          (sample) => Math.abs(sample) < 1e-4
        ),
        true
      );
    })
  );
});

const unavailableSpawner = Layer.succeed(
  ChildProcessSpawner.ChildProcessSpawner,
  ChildProcessSpawner.make(() =>
    Effect.fail(
      PlatformError.badArgument({
        description: "ffmpeg is not installed",
        method: "spawn",
        module: "ChildProcess",
      })
    )
  )
);

layer(
  Layer.provideMerge(ffmpegEncoder, Layer.merge(platform, unavailableSpawner))
)("ffmpeg encoder without ffmpeg", (it) => {
  it.effect(
    "builds, says so in its id, and raises AdapterUnavailable on every use",
    () =>
      Effect.gen(function* missing() {
        const encoderService = yield* Encoder;
        const { directory, path } = yield* inTemp;

        const clip = { sampleRate: 24_000, samples: new Float32Array(240) };

        const failures = yield* Effect.all([
          Effect.flip(encoderService.encodeAudio(clip)),
          Effect.flip(encoderService.decodeAudio(new Uint8Array(4))),
          Effect.flip(
            encoderService.mux(
              request(path.join(directory, "o.mp4"), Stream.empty)
            )
          ),
        ]);

        assert.strictEqual(encoderService.info.id, "ffmpeg@unavailable");
        assert.deepStrictEqual(
          Arr.map(failures, (failure) => failure._tag),
          ["AdapterUnavailable", "AdapterUnavailable", "AdapterUnavailable"]
        );
      })
  );
});
