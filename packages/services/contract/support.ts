// Plain helpers the clauses share: comparisons of clips and spans, and the checks every adapter's `info` passes.
import { assert } from "@effect/vitest";
import type { RendererLifecycle } from "@tsukuri/core";
import { Array as Arr, Effect } from "effect";

import { secretLikeNames } from "../src/cacheKey.ts";
import type { AdapterInfo, AudioClip, WordSpan } from "../src/types.ts";

/** The length of a clip in milliseconds. */
export const durationMs = (clip: AudioClip): number =>
  (clip.samples.length / clip.sampleRate) * 1000;

/** Whether two clips have one rate and the same samples, bit for bit. */
export const sameClip = (left: AudioClip, right: AudioClip): boolean =>
  left.sampleRate === right.sampleRate &&
  left.samples.length === right.samples.length &&
  Arr.every(
    [...left.samples],
    (sample, index) => sample === right.samples[index]
  );

/** Whether two byte strings are equal. */
export const sameBytes = (left: Uint8Array, right: Uint8Array): boolean =>
  left.length === right.length &&
  Arr.every([...left], (byte, index) => byte === right[index]);

/** The tolerance, in milliseconds, for a span end that rounds past the clip end. */
const roundingMs = 1;

/** Asserts spans are ordered, do not overlap and lie inside a clip of `clipMs` milliseconds. */
export const assertSpansInside = (
  spans: readonly WordSpan[],
  clipMs: number
): void => {
  Arr.reduce(spans, 0, (previousEnd, span) => {
    assert.isAtLeast(span.startMs, 0, "a span starts inside the clip");
    assert.isAtLeast(
      span.endMs,
      span.startMs,
      "a span does not end before it starts"
    );
    assert.isAtLeast(
      span.startMs,
      previousEnd,
      "spans are monotonic: no word starts before the last ended"
    );
    assert.isAtMost(
      span.endMs,
      clipMs + roundingMs,
      "a span ends inside the clip"
    );

    return span.endMs;
  });
};

/** Asserts `info` is a well-formed declaration: name@version id, declared egress, non-secret settings. */
export const assertInfoDeclared = (info: AdapterInfo): void => {
  assert.match(info.id, /^[^@\s]+@\S+$/u, "id is name@version");
  assert.include(
    ["local", "integration"],
    info.egress.kind,
    "egress kind is declared"
  );

  if (info.egress.kind === "local") {
    assert.deepStrictEqual(
      info.egress.sends,
      [],
      "a local adapter sends nothing out"
    );
  } else {
    assert.isAbove(
      info.egress.sends.length,
      0,
      "an integration lists what it sends out"
    );
  }

  assert.deepStrictEqual(
    secretLikeNames(info.settings),
    [],
    "settings hold no secret"
  );
};

/**
 * Asserts a renderer's lifecycle declaration is sane: the transitions that animate and the `show` fade last a positive
 * time, an instant `cut` is not negative, the matched Element's start lag is not negative, the lags were measured at a
 * whole, positive frame rate, and the easing is a CSS cubic-bezier (the x of both control points inside [0, 1], so
 * progress is a function of time).
 */
export const assertLifecycleDeclared = (lifecycle: RendererLifecycle): void => {
  const { matched, measuredFps, showMs, transitionMs, unmatched } = lifecycle;

  assert.isAbove(transitionMs["auto-animate"], 0, "auto-animate takes time");
  assert.isAbove(transitionMs.default, 0, "the default fade takes time");
  assert.isAtLeast(transitionMs.cut, 0, "a cut is instant, not negative");
  assert.isAbove(showMs, 0, "a shown Element takes time to appear");
  assert.isAtLeast(matched.startLagFrames, 0, "a lag is not negative");
  assert.isTrue(
    Number.isInteger(measuredFps) && measuredFps >= 1,
    "the lags were measured at a whole, positive frame rate"
  );
  assert.isAtLeast(
    unmatched.enter.endLagFrames,
    unmatched.enter.startLagFrames,
    "an unmatched Element does not finish entering before it starts"
  );

  const [x1, , x2] = matched.easing;

  for (const x of [x1, x2]) {
    assert.isTrue(
      x >= 0 && x <= 1,
      `easing control point x=${x} is inside [0, 1]`
    );
  }
};

/**
 * The typed failure of `effect`, for a clause that expects one. When `effect` succeeds the clause fails with a
 * failed assertion (a defect), not with the success value in the error channel as `Effect.flip` would put it.
 */
export const failureOf = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  what: string
): Effect.Effect<E, never, R> =>
  Effect.matchEffect(effect, {
    onFailure: Effect.succeed,
    onSuccess: () =>
      Effect.sync(() => assert.fail(`${what} succeeded; it must fail`)),
  });

const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];

/** The width and height in a PNG's IHDR chunk, or undefined when the bytes are not a PNG. */
export const pngSize = (
  bytes: Uint8Array
): { readonly height: number; readonly width: number } | undefined => {
  if (!Arr.every(pngSignature, (byte, index) => bytes[index] === byte)) {
    return undefined;
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  return { height: view.getUint32(20), width: view.getUint32(16) };
};
