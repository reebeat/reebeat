// A fixed `Observer` for tests: the same tiny JPEG for every frame, one stream. It starts no process.
import { Effect, Layer, Result } from "effect";
import { Base64 } from "effect/encoding";

import { ObserveFailed } from "../src/errors.ts";
import { Observer } from "../src/observer.ts";

/** A 1 x 1 JPEG (124 bytes). */
const tinyJpeg = Result.getOrElse(
  Base64.decode(
    "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA="
  ),
  () => new Uint8Array()
);

export const fixedObserver: Layer.Layer<Observer> = Layer.succeed(
  Observer,
  Observer.of({
    audio: (_files, window) =>
      Effect.succeed({
        buckets: [{ fromMs: window.fromMs, peakDb: -12, rmsDb: -20 }],
        onsetsMs: [],
      }),
    frame: (_files, request) =>
      tinyJpeg.byteLength > request.maxBytes
        ? Effect.fail(
            new ObserveFailed({
              message: `no image fits in ${request.maxBytes} bytes`,
            })
          )
        : Effect.succeed({
            bytes: tinyJpeg,
            height: 1,
            mimeType: "image/jpeg",
            width: 1,
          }),
    media: () =>
      Effect.succeed({
        chapters: [],
        durationMs: 1000,
        streams: [{ codec: "h264", type: "video" }],
      }),
  })
);
