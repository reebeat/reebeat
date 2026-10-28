import { assert } from "@effect/vitest";
// The contract of FrameCapturer: what every capturer (headless Chromium on a controlled clock) promises. The
// adapter's layer also provides the Renderer, because a capture needs a written Deck.
import type { PlanJson } from "@reebeat/core";
import {
  Array as Arr,
  Effect,
  FileSystem,
  Path,
  Predicate,
  Stream,
} from "effect";
import type { Layer, PlatformError } from "effect";

import type { CaptureError, RenderFailed } from "../src/errors.ts";
import { FrameCapturer } from "../src/frameCapturer.ts";
import { Renderer } from "../src/renderer.ts";
import { registerClauses } from "./clause.ts";
import type { Clause } from "./clause.ts";
import { contractPlan } from "./fixture.ts";
import type { FixtureError } from "./fixture.ts";
import { assertInfoDeclared, sameBytes } from "./support.ts";

export interface FrameCapturerOptions {
  /** A Plan with a Timeline; the default is the contract Plan. */
  readonly plan?: PlanJson;
}

type Services = FrameCapturer | Renderer | FileSystem.FileSystem | Path.Path;

const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];

/** The width and height in a PNG's IHDR chunk, or undefined when the bytes are not a PNG. */
const pngSize = (
  bytes: Uint8Array
): { readonly height: number; readonly width: number } | undefined => {
  if (!Arr.every(pngSignature, (byte, index) => bytes[index] === byte)) {
    return undefined;
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  return { height: view.getUint32(20), width: view.getUint32(16) };
};

/** Renders `plan` and writes the deck into a temporary directory owned by the scope; returns the directory. */
const writeDeck = Effect.fnUntraced(function* writeDeck(plan: PlanJson) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const deck = yield* (yield* Renderer).render(plan);

  const directory = yield* fs.makeTempDirectoryScoped({
    prefix: "reebeat-contract-",
  });

  yield* Effect.forEach(deck.files, (file) =>
    Effect.gen(function* write() {
      const target = path.join(directory, file.path);

      yield* fs.makeDirectory(path.dirname(target), { recursive: true });
      yield* Predicate.isString(file.content)
        ? fs.writeFileString(target, file.content)
        : fs.writeFile(target, file.content);
    })
  );

  return directory;
});

/** Every PNG one capture of `plan` emits, in order. */
const captureAll = Effect.fnUntraced(function* captureAll(plan: PlanJson) {
  const directory = yield* writeDeck(plan);

  return yield* Stream.runCollect(
    (yield* FrameCapturer).capture({ deckDir: directory, plan })
  );
});

/** The clauses of the contract, as data (a test runs them against broken adapters). */
export const frameCapturerClauses = (
  options: FrameCapturerOptions = {}
): readonly Clause<
  CaptureError | FixtureError | PlatformError.PlatformError | RenderFailed,
  Services
>[] => {
  const plan =
    options.plan === undefined ? contractPlan : Effect.succeed(options.plan);

  return [
    {
      id: "C1",
      means: "`frames(plan)` is a pure, positive whole number",
      run: Effect.gen(function* clause() {
        const capturer = yield* FrameCapturer;
        const given = yield* plan;
        const count = capturer.frames(given);

        assert.isTrue(Number.isInteger(count));
        assert.isAbove(count, 0);
        assert.strictEqual(capturer.frames(given), count);
      }),
    },
    {
      id: "C2",
      means: "`capture` emits exactly `frames(plan)` frames",
      run: Effect.scoped(
        Effect.gen(function* clause() {
          const given = yield* plan;
          const frames = yield* captureAll(given);

          assert.strictEqual(
            frames.length,
            (yield* FrameCapturer).frames(given)
          );
        })
      ),
    },
    {
      id: "C3",
      means: "every frame is a PNG of the Plan's canvas size",
      run: Effect.scoped(
        Effect.gen(function* clause() {
          const given = yield* plan;
          const frames = yield* captureAll(given);
          const { height, width } = given.settings;

          for (const [index, frame] of frames.entries()) {
            assert.deepStrictEqual(
              pngSize(frame),
              { height, width },
              `frame ${index}`
            );
          }
        })
      ),
    },
    {
      id: "C4",
      means: "two runs emit the same frames, byte for byte",
      run: Effect.scoped(
        Effect.gen(function* clause() {
          const given = yield* plan;
          const first = yield* captureAll(given);
          const second = yield* captureAll(given);

          assert.strictEqual(second.length, first.length);

          for (const [index, frame] of first.entries()) {
            assert.isTrue(
              sameBytes(frame, second[index] ?? new Uint8Array()),
              `frame ${index}`
            );
          }
        })
      ),
    },
    {
      id: "C5",
      means:
        "info declares its id, its egress (local sends nothing) and non-secret settings",
      run: Effect.gen(function* clause() {
        assertInfoDeclared((yield* FrameCapturer).info);
      }),
    },
  ];
};

/** Registers the FrameCapturer contract; `layer` provides the capturer, a Renderer and the platform file services. */
export const frameCapturerContract = <LE>(
  label: string,
  layer: Layer.Layer<Services, LE>,
  options?: FrameCapturerOptions
): void => {
  registerClauses(label, layer, frameCapturerClauses(options));
};
