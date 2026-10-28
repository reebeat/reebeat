// Plain helpers the clauses share: comparisons of clips and spans, and the checks every adapter's `info` passes.
import { assert } from "@effect/vitest";
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
