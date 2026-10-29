// The tests' one runtime adapter (the platform services) and the independent reader of a written media file: it
// uses the probes (ffprobe and ffmpeg), never the Encoder under test.
import { NodeServices } from "@effect/platform-node";
import type { MuxProbe } from "@reebeat/services/contract";
import {
  Array as Arr,
  Effect,
  Layer,
  Option,
  String as Str,
  pipe,
} from "effect";

import { MediaTools } from "../src/mediaTools.ts";
import { decodeMonoPcm, probeMedia } from "../src/probe.ts";
import { outputSampleRate } from "../src/settings.ts";

export const platform = NodeServices.layer;

/** The platform services and the media tools over them. */
export const toolbox = Layer.provideMerge(MediaTools.layer, platform);

/** The text of each cue of a WebVTT text: the rows after its timing row. */
const cueTexts = (text: string): string[] =>
  Arr.map(
    Arr.filter(Str.split(text, "\n\n"), (block) => Str.includes("-->")(block)),
    (block) => {
      const rows = pipe(block, Str.trim, Str.split("\n"));

      const timing = Arr.findFirstIndex(rows, (row) =>
        Str.includes("-->")(row)
      );

      return Arr.join(
        Arr.drop(rows, Option.getOrElse(timing, () => 0) + 1),
        " "
      );
    }
  );

/** What `mux` wrote at `file`, read back with the probes. A tool failure is a defect of the test. */
export const probeMux = (file: string) =>
  Effect.orDie(
    Effect.gen(function* probe() {
      const tools = yield* MediaTools;
      const media = yield* probeMedia(file);

      const video = yield* Effect.fromOption(
        Arr.findFirst(media.streams, (stream) => stream.codec_type === "video")
      );

      const embedded = new TextDecoder().decode(
        yield* tools.run("ffmpeg", [
          "-v",
          "error",
          "-i",
          file,
          "-map",
          "0:s:0",
          "-f",
          "webvtt",
          "pipe:1",
        ])
      );

      return {
        audio: {
          sampleRate: outputSampleRate,
          samples: yield* decodeMonoPcm(file),
        },
        chapters: Arr.map(media.chapters, (chapter) => ({
          endMs: Math.round(chapter.end_time * 1000),
          startMs: Math.round(chapter.start_time * 1000),
          title: chapter.tags?.title ?? "",
        })),
        frames: video.nb_frames ?? 0,
        height: video.height ?? 0,
        metadata: {
          comment: media.format.tags?.comment ?? "",
          title: media.format.tags?.title ?? "",
        },
        subtitles: cueTexts(embedded),
        width: video.width ?? 0,
      } satisfies MuxProbe;
    }).pipe(Effect.provide(toolbox))
  );

/** One solid-colour PNG of `size` x `size`, made by ffmpeg. */
export const solidPng = (colour: string, size: number) =>
  Effect.gen(function* png() {
    const tools = yield* MediaTools;

    return yield* tools.run("ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      `color=c=${colour}:s=${size}x${size}`,
      "-frames:v",
      "1",
      "-f",
      "image2pipe",
      "-c:v",
      "png",
      "pipe:1",
    ]);
  });
