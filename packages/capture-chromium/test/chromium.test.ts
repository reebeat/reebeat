// The FrameCapturer contract for headless Chromium, on the tiny fixture deck (the Renderer of the contract's layer is a
// stand-in that returns that page and reveal.js), the adapter's declaration, and the requirements it checks when it
// is built: each missing one is `AdapterUnavailable`, never a fallback.
import { assert, describe, it } from "@effect/vitest";
import {
  AdapterUnavailable,
  FrameCapturer,
  Renderer,
  localEgress,
} from "@tsukuri/services";
import {
  contractLifecycle,
  failingClauses,
  frameCapturerClauses,
  frameCapturerContract,
} from "@tsukuri/services/contract";
import {
  ConfigProvider,
  Effect,
  FileSystem,
  Layer,
  Path,
  Stream,
  String as Str,
} from "effect";

import { chromiumCapturer } from "../src/index.ts";
import { fixture } from "./fixturePlan.ts";
import { nodeServices } from "./support.ts";

/** Returns the fixture page and the reveal.js files next to it, as a `Renderer` would. */
const fixtureRenderer = Layer.effect(
  Renderer,
  Effect.gen(function* build() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const here = (relative: string) =>
      path.fromFileUrl(new URL(relative, import.meta.url));

    const files = [
      { from: "./fixtures/deck/deck.html", path: "deck.html" },
      {
        from: "../node_modules/reveal.js/dist/reveal.js",
        path: "assets/reveal.js",
      },
      {
        from: "../node_modules/reveal.js/dist/reveal.css",
        path: "assets/reveal.css",
      },
    ];

    const deck = {
      entry: "deck.html",
      files: yield* Effect.forEach(files, (file) =>
        Effect.map(
          Effect.flatMap(here(file.from), (source) => fs.readFile(source)),
          (content) => ({ content, path: file.path })
        )
      ),
    };

    return Renderer.of({
      info: {
        egress: localEgress,
        id: "fixture-deck@1",
        lifecycle: contractLifecycle,
        settings: {},
      },
      render: () => Effect.succeed(deck),
    });
  })
);

const adapter = Layer.mergeAll(chromiumCapturer, fixtureRenderer).pipe(
  Layer.provideMerge(nodeServices)
);

frameCapturerContract("chromiumCapturer", adapter);

describe("chromiumCapturer", () => {
  it.effect(
    "names itself after the browser and the clock it reads, and declares what changes its frames",
    () =>
      Effect.gen(function* info() {
        const { info: declared } = yield* FrameCapturer;

        assert.match(declared.id, /^chromium@\d+(?:\.\d+)+\+timeweb@0\.3\.2$/u);
        assert.deepStrictEqual(declared.egress, { kind: "local", sends: [] });
        assert.strictEqual(declared.settings.settle, true);
        assert.strictEqual(declared.settings.fps, 30);
        assert.strictEqual(declared.settings.width, 1280);
        assert.strictEqual(declared.settings.height, 720);
        assert.strictEqual(
          declared.settings.lags,
          "auto-animate:0,cut:0,default:1"
        );
      }).pipe(Effect.provide(adapter))
  );

  it.effect(
    "declares --disable-threaded-animation in its flags, so the build manifest records the determinism fix",
    () =>
      Effect.gen(function* flagged() {
        const { info: declared } = yield* FrameCapturer;

        assert.include(
          Str.split(String(declared.settings.flags), " "),
          "--disable-threaded-animation"
        );
      }).pipe(Effect.provide(adapter))
  );

  it.effect(
    "frames(plan) is the Timeline's total, and a Plan without a Timeline has none",
    () =>
      Effect.gen(function* count() {
        const capturer = yield* FrameCapturer;

        const timed = fixture;
        const { timeline: _timeline, ...bare } = timed;

        assert.strictEqual(capturer.frames(timed), 219);
        assert.strictEqual(capturer.frames(bare), 0);
      }).pipe(Effect.provide(adapter))
  );
});

/** The capturer built over an environment that holds exactly `values`. */
const withEnvironment = (values: Record<string, string>) =>
  chromiumCapturer.pipe(
    Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(values))),
    Layer.provide(nodeServices)
  );

/** What the first `capture` of a capturer over `values` fails with. */
const firstCapture = (values: Record<string, string>) =>
  Effect.gen(function* capturing() {
    const capturer = yield* FrameCapturer;

    return yield* Effect.flip(
      Stream.runCollect(capturer.capture({ deckDir: "/unused", plan: fixture }))
    );
  }).pipe(Effect.provide(withEnvironment(values)));

describe("requirements", () => {
  it.effect(
    "control: no TSUKURI_CHROMIUM does not stop the layer; the first capture is AdapterUnavailable naming the variable, and no fallback emits a frame",
    () =>
      Effect.gen(function* missing() {
        const error = yield* firstCapture({});

        assert.instanceOf(error, AdapterUnavailable);
        assert.strictEqual(error.service, "FrameCapturer");
        assert.strictEqual(error.adapter, "chromium");
        assert.strictEqual(error.requirement, "env TSUKURI_CHROMIUM");
      })
  );

  it.effect(
    "control: a binary that does not run is AdapterUnavailable naming the requirement, not its path",
    () =>
      Effect.gen(function* broken() {
        const error = yield* firstCapture({
          TSUKURI_CHROMIUM: "/nonexistent/chromium",
        });

        assert.instanceOf(error, AdapterUnavailable);
        assert.strictEqual(
          error.requirement,
          "binary named by TSUKURI_CHROMIUM"
        );
        assert.notInclude(error.message, "nonexistent");
      })
  );

  it.effect("the id of a capturer that cannot run says so", () =>
    Effect.gen(function* named() {
      const capturer = yield* FrameCapturer;

      assert.strictEqual(
        capturer.info.id,
        "chromium@unavailable+timeweb@unavailable"
      );
    }).pipe(Effect.provide(withEnvironment({})))
  );
});

describe("control", () => {
  it.effect(
    "a capturer that miscounts its frames fails C2 and nothing else",
    () =>
      Effect.gen(function* control() {
        const miscounting = Layer.effect(
          FrameCapturer,
          Effect.map(FrameCapturer, (real) =>
            FrameCapturer.of({
              ...real,
              frames: (plan) => real.frames(plan) + 1,
            })
          )
        ).pipe(Layer.provideMerge(adapter));

        assert.deepStrictEqual(
          yield* failingClauses(miscounting, frameCapturerClauses()),
          ["C2"]
        );
      })
  );
});
