// The net below the F6 fix (spec 0001, README "Determinism under load"): a frame in which an animation is live or a
// command ran is shot until two consecutive PNGs agree, a still frame is shot once, a transient
// `Page.captureScreenshot` failure is retried at most twice. No browser: the page is a fake that returns scripted
// screenshots, so the tests cannot be flaky themselves.
import { assert, describe, it } from "@effect/vitest";
import {
  Array as Arr,
  Effect,
  Exit,
  Fiber,
  Layer,
  Predicate,
  Ref,
  Schema,
  Stream,
} from "effect";
import { TestClock } from "effect/testing";

import { Browser } from "../src/browser.ts";
import type { DeckPage } from "../src/browser.ts";
import { captureFrames } from "../src/capture.ts";
import type { CaptureSchedule } from "../src/captureSchedule.ts";
import { BrowserFailed, FrameUnstable } from "../src/errors.ts";
import {
  maxShots,
  retryScreenshot,
  screenshotRetries,
  stableFrame,
} from "../src/stability.ts";

const png = (...bytes: number[]): Uint8Array => Uint8Array.from(bytes);

/** An effect that returns the scripted values in order (the last one when the script runs out) and counts its calls. */
const scripted = <A>(values: readonly A[]) =>
  Effect.gen(function* script() {
    const calls = yield* Ref.make(0);

    const take = Effect.gen(function* next() {
      const index = yield* Ref.getAndUpdate(calls, (count) => count + 1);
      const value = values[Math.min(index, values.length - 1)];

      assert.isDefined(value);

      return value;
    });

    return { calls, take };
  });

const transient = new BrowserFailed({
  cause: "protocol",
  message:
    "screenshot failed: Page.captureScreenshot: Unable to capture screenshot",
  operation: "screenshot",
});

const permanent = new BrowserFailed({
  cause: "closed",
  message: "screenshot failed: Target page, context or browser has been closed",
  operation: "screenshot",
});

describe("stableFrame", () => {
  it.effect(
    "returns the frame two consecutive shots agree on, not the first shot",
    () =>
      Effect.gen(function* differing() {
        const { calls, take } = yield* scripted([
          png(1),
          png(2),
          png(2),
          png(9),
        ]);

        // Control: without the check the first shot is the frame.
        assert.deepStrictEqual([...(yield* take)], [1]);

        yield* Ref.set(calls, 0);

        const stable = yield* stableFrame(7, take);

        assert.deepStrictEqual([...stable.png], [2]);
        assert.strictEqual(stable.shots, 3);
        assert.strictEqual(yield* Ref.get(calls), 3);
      })
  );

  it.effect("takes two shots when the second agrees with the first", () =>
    Effect.gen(function* agreeing() {
      const { calls, take } = yield* scripted([png(5, 5), png(5, 5)]);
      const stable = yield* stableFrame(0, take);

      assert.deepStrictEqual([...stable.png], [5, 5]);
      assert.strictEqual(stable.shots, 2);
      assert.strictEqual(yield* Ref.get(calls), 2);
    })
  );

  it.effect("fails with FrameUnstable naming the frame after maxShots", () =>
    Effect.gen(function* never() {
      const { calls, take } = yield* scripted(
        Arr.map([1, 2, 3, 4, 5, 6, 7], (byte) => png(byte))
      );

      const failure = yield* Effect.flip(stableFrame(42, take));

      assert.instanceOf(failure, FrameUnstable);
      assert.strictEqual(failure.frame, 42);
      assert.strictEqual(failure.shots, maxShots);
      assert.include(failure.message, "frame 42");
      assert.strictEqual(yield* Ref.get(calls), maxShots);
    })
  );

  it.effect("tells a frame that differs in length from one that agrees", () =>
    Effect.gen(function* lengths() {
      const { take } = yield* scripted([png(1), png(1, 0), png(1, 0)]);
      const stable = yield* stableFrame(1, take);

      assert.deepStrictEqual([...stable.png], [1, 0]);
      assert.strictEqual(stable.shots, 3);
    })
  );
});

/** A screenshot that always fails with `failure` and counts its calls. */
const alwaysFailing = (failure: BrowserFailed) =>
  Effect.gen(function* failing() {
    const attempts = yield* Ref.make(0);

    return {
      attempts,
      take: Effect.andThen(
        Ref.update(attempts, (count) => count + 1),
        Effect.fail(failure)
      ),
    };
  });

describe("retryScreenshot", () => {
  it.effect(
    "calls a transient failure again, twice at most, and returns the shot that works",
    () =>
      Effect.gen(function* recovers() {
        const attempts = yield* Ref.make(0);

        const take = Effect.flatMap(
          Ref.getAndUpdate(attempts, (count) => count + 1),
          (index) =>
            index < screenshotRetries
              ? Effect.fail(transient)
              : Effect.succeed(png(3))
        );

        const fiber = yield* Effect.forkChild(retryScreenshot(take));

        yield* TestClock.adjust("10 seconds");

        assert.deepStrictEqual([...(yield* Fiber.join(fiber))], [3]);
        assert.strictEqual(yield* Ref.get(attempts), screenshotRetries + 1);
      })
  );

  it.effect("fails loudly after the second retry", () =>
    Effect.gen(function* exhausted() {
      const { attempts, take } = yield* alwaysFailing(transient);

      const fiber = yield* Effect.forkChild(Effect.exit(retryScreenshot(take)));

      yield* TestClock.adjust("10 seconds");

      const exit = yield* Fiber.join(fiber);

      assert.isTrue(Exit.isFailure(exit));
      assert.strictEqual(yield* Ref.get(attempts), screenshotRetries + 1);
    })
  );

  it.effect("does not retry a failure that is not the transient one", () =>
    Effect.gen(function* once() {
      const { attempts, take } = yield* alwaysFailing(permanent);

      const failure = yield* Effect.flip(retryScreenshot(take));

      assert.strictEqual(failure.message, permanent.message);
      assert.strictEqual(yield* Ref.get(attempts), 1);
    })
  );
});

/** A page whose frame `n` shows `shots[n]` in turn, with `live[n]` animations and no browser behind it. */
const fakePage = (
  shots: readonly (readonly Uint8Array[])[],
  live: readonly number[]
) =>
  Effect.gen(function* page() {
    const current = yield* Ref.make(-1);
    const taken = yield* Ref.make<readonly number[]>([]);

    const deckPage: DeckPage = {
      clockGoTo: () => Effect.void,
      command: () => Effect.void,
      ready: Effect.void,
      screenshot: Effect.gen(function* shoot() {
        const frame = yield* Ref.get(current);
        const count = (yield* Ref.get(taken))[frame] ?? 0;

        yield* Ref.update(taken, (counts) =>
          Object.assign([...counts], { [frame]: count + 1 })
        );

        const own = shots[frame] ?? [];
        const shot = own[Math.min(count, own.length - 1)];

        assert.isDefined(shot);

        return shot;
      }),
      seek: (frame) =>
        Effect.andThen(
          Ref.set(current, frame),
          Effect.succeed(live[frame] ?? 0)
        ),
    };

    const layer = Layer.succeed(
      Browser,
      Browser.of({
        open: () => Effect.succeed(deckPage),
        versions: Effect.succeed({ chromium: "fake", timeweb: "fake" }),
      })
    );

    return { layer, taken };
  });

const schedule = (commandFrames: readonly number[]): CaptureSchedule => ({
  commands: Arr.map(commandFrames, (frame) => ({
    command: { kind: "stepFragment" },
    frame,
    source: `c${frame}`,
  })),
  fps: 30,
  height: 720,
  totalFrames: 4,
  width: 1280,
});

describe("captureFrames", () => {
  it.effect(
    "shoots a still frame once and a frame with a live animation or a command until two agree",
    () =>
      Effect.gen(function* capture() {
        // frame 0 still; frame 1 a command (first shot wrong); frame 2 a live animation (first shot wrong);
        // frame 3 still again.
        const { layer, taken } = yield* fakePage(
          [
            [png(0)],
            [png(10), png(11), png(11)],
            [png(20), png(21), png(22), png(22)],
            [png(30)],
          ],
          [0, 0, 2, 0]
        );

        const frames = yield* Stream.runCollect(
          captureFrames(schedule([1]), {
            deckUrl: "file:///fake/deck.html",
            settleNewAnimations: true,
          })
        ).pipe(Effect.provide(layer));

        assert.deepStrictEqual(
          Arr.map([...frames], (frame) => [...frame]),
          [[0], [11], [22], [30]]
        );
        assert.deepStrictEqual(yield* Ref.get(taken), [1, 3, 4, 1]);
      })
  );

  it.effect(
    "fails with FrameUnstable naming the frame that never settles",
    () =>
      Effect.gen(function* unstable() {
        const { layer } = yield* fakePage(
          [
            [png(0)],
            Arr.map([1, 2, 3, 4, 5, 6], (byte) => png(byte)),
            [png(0)],
            [png(0)],
          ],
          [0, 1, 0, 0]
        );

        const failure = yield* Effect.flip(
          Stream.runCollect(
            captureFrames(schedule([]), {
              deckUrl: "file:///fake/deck.html",
              settleNewAnimations: true,
            })
          ).pipe(Effect.provide(layer))
        );

        assert.isTrue(Predicate.isTagged(failure, "FrameUnstable"));
        assert.deepStrictEqual(
          Schema.is(FrameUnstable)(failure) ? failure.frame : undefined,
          1
        );
      })
  );
});
