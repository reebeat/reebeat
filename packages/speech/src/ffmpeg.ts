// Flac on ffmpeg: Kokoro's float samples become the cache's FLAC (s16, 24 kHz, mono, level 8, bit-exact so the
// bytes do not depend on the ffmpeg build's encoder tag).
import { Effect, FileSystem, Layer, Path } from "effect";
import { ChildProcessSpawner } from "effect/process";

import { pipeline } from "./pipeline.ts";
import { Flac } from "./services.ts";
import { runTool, toolFailure } from "./tool.ts";

/** `Flac` through the `ffmpeg` on the `PATH`. */
export const flacFfmpeg = Layer.effect(
  Flac,
  Effect.gen(function* flacFfmpegLayer() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

    const fail = toolFailure(
      "ffmpeg",
      "cannot move audio through a temporary file"
    );

    const encode = Effect.fn("Flac.encode")(function* encode(
      samples: Float32Array
    ) {
      const directory = yield* Effect.mapError(
        fs.makeTempDirectoryScoped({ prefix: "reebeat-flac-" }),
        fail
      );

      const input = path.join(directory, "in.f32");
      const output = path.join(directory, "out.flac");

      yield* Effect.mapError(
        fs.writeFile(
          input,
          new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength)
        ),
        fail
      );
      yield* runTool(spawner, "ffmpeg", "ffmpeg", [
        "-nostdin",
        "-v",
        "error",
        "-y",
        "-f",
        "f32le",
        "-ar",
        String(pipeline.ttsSampleRate),
        "-ac",
        "1",
        "-i",
        input,
        ...pipeline.flacArgs,
        output,
      ]);

      return yield* Effect.mapError(fs.readFile(output), fail);
    }, Effect.scoped);

    return Flac.of({ encode });
  })
);
