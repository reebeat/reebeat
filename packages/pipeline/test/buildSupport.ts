// What the build program's tests run on: the stand-ins of the services, a fake Renderer, a fake FrameCapturer and a
// fake Encoder that records what `mux` was asked and writes a placeholder file. No model, browser or binary: the
// tests prove what the program does with the services, not what an adapter does (the contract suites do that).
import { NodeServices } from "@effect/platform-node";
import {
  CaptureError,
  Encoder,
  FrameCapturer,
  Renderer,
  localEgress,
} from "@reebeat/services";
import type {
  AdapterInfo,
  AssetCache,
  MuxRequest,
  SoundLibrary,
  SpeechSynthesizer,
  WordAligner,
} from "@reebeat/services";
import {
  evenAligner,
  memoryCache,
  silentSynthesizer,
  toneSounds,
} from "@reebeat/services/standins";
import {
  Array as Arr,
  Effect,
  FileSystem,
  Layer,
  Path,
  Ref,
  Stream,
} from "effect";
import type { Crypto } from "effect";

import { fakeEncoder } from "./support.ts";

export const platform = NodeServices.layer;

/** The info of a local fake: nothing is sent out. */
const localInfo = (id: string): AdapterInfo => ({
  egress: localEgress,
  id,
  settings: {},
});

/** A story of two Sections, a CUT and an AUTO-ANIMATE, with a `next`, a `focus` and an `sfx`. */
export const storyText = Arr.join(
  [
    "Title: Build",
    "Author: Test",
    "",
    "# One",
    "",
    "INT. ONE",
    "",
    "Box {#a @mc .box}",
    "Later {#b @bc .label hidden}",
    "",
    "NARRATOR",
    "One two three. [[next]] Four five. [[sfx: pop]]",
    "",
    "# Two",
    "",
    "> AUTO-ANIMATE",
    "",
    "INT. TWO",
    "",
    "Box {#a @tl .box}",
    "",
    "NARRATOR",
    "Six seven. [[focus: a]] Eight.",
    "",
  ],
  "\n"
);

/** A Renderer that writes two files: the page and one binary asset in a subdirectory. */
export const fakeRenderer = (
  adapter: AdapterInfo = localInfo("fake-renderer@1-standin")
) =>
  Layer.succeed(
    Renderer,
    Renderer.of({
      info: adapter,
      render: (plan) =>
        Effect.succeed({
          entry: "deck.html",
          files: [
            {
              content: `<html data-source-sha256="${plan.sourceSha256}"></html>`,
              path: "deck.html",
            },
            { content: Uint8Array.of(1, 2, 3), path: "assets/deck.bin" },
          ],
        }),
    })
  );

/** One byte per frame. */
export const tinyFrames = (count: number) =>
  Stream.fromIterable(Arr.makeBy(count, (index) => Uint8Array.of(index % 256)));

/**
 * A FrameCapturer whose frames are `frames(count)`, after checking that the page the Renderer wrote is already in
 * `deckDir`: the build must write the deck before it captures.
 */
export const fakeCapturer = (
  frames: (count: number) => Stream.Stream<Uint8Array, CaptureError>
) =>
  Layer.effect(
    FrameCapturer,
    Effect.gen(function* capturer() {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;

      return FrameCapturer.of({
        capture: ({ deckDir, plan }) =>
          Stream.unwrap(
            Effect.map(
              Effect.orDie(fs.exists(path.join(deckDir, "deck.html"))),
              (written) =>
                written
                  ? frames(plan.timeline?.totalFrames ?? 0)
                  : Stream.fail(
                      new CaptureError({
                        adapter: "fake-capturer@1-standin",
                        cause: "no page",
                        message: `${deckDir}/deck.html was not written before the capture`,
                      })
                    )
            )
          ),
        frames: (plan) => plan.timeline?.totalFrames ?? 0,
        info: localInfo("fake-capturer@1-standin"),
      });
    })
  );

/** The capturer of a healthy machine. */
const healthyCapturer = fakeCapturer(tinyFrames);

/** What a recording Encoder saw of one `mux`: the request without its frames, and how many frames it consumed. */
export interface Muxed {
  readonly frames: number;
  readonly request: Omit<MuxRequest, "frames">;
}

/** The fake Encoder (lossless clips as raw floats) that records each `mux` in `seen` and writes `outPath`. */
const recordingEncoder = (seen: Ref.Ref<readonly Muxed[]>) =>
  Layer.effect(
    Encoder,
    Effect.gen(function* encoder() {
      const fs = yield* FileSystem.FileSystem;
      const inner = yield* Effect.provide(Encoder, fakeEncoder);

      return Encoder.of({
        ...inner,
        mux: ({ frames, ...request }) =>
          Effect.scoped(
            Effect.gen(function* mux() {
              const count = yield* Stream.runCount(frames);

              yield* Effect.orDie(fs.writeFileString(request.outPath, "mp4"));
              yield* Ref.update(seen, (all) => [
                ...all,
                { frames: count, request },
              ]);

              return { bytes: 3, frames: count, path: request.outPath };
            })
          ),
      });
    })
  ).pipe(Layer.provide(platform));

/** The seven layers a build runs on. */
export interface Parts {
  readonly aligner: Layer.Layer<WordAligner>;
  readonly cache: Layer.Layer<AssetCache, never, Crypto.Crypto>;
  readonly capturer: Layer.Layer<
    FrameCapturer,
    never,
    FileSystem.FileSystem | Path.Path
  >;
  readonly encoder: Layer.Layer<Encoder>;
  readonly renderer: Layer.Layer<Renderer>;
  readonly sounds: Layer.Layer<SoundLibrary>;
  readonly speech: Layer.Layer<SpeechSynthesizer>;
}

/** The seven services of the build over the stand-ins and the fakes: a test replaces one by spreading. */
export const parts = (seen: Ref.Ref<readonly Muxed[]>): Parts => ({
  aligner: evenAligner,
  cache: memoryCache,
  capturer: healthyCapturer,
  encoder: recordingEncoder(seen),
  renderer: fakeRenderer(),
  sounds: toneSounds,
  speech: silentSynthesizer,
});

/** The layer of `chosen` parts over the platform. */
export const worldOf = (chosen: Parts) =>
  Layer.mergeAll(
    chosen.speech,
    chosen.aligner,
    chosen.sounds,
    chosen.renderer,
    chosen.capturer,
    chosen.encoder,
    chosen.cache
  ).pipe(Layer.provideMerge(platform));
