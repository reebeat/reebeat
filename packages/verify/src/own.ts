// What an effect INSTANCE did, as observed in the written files (spec 0002, F1; spec 0004, F1 and F5):
//
//   a `sound`        the start of the catalogue sound found in the decoded audio track near its fire frame; every
//                    instance of an `each(...)` sound has its own window and its own onset
//   a `show`         the first frame that differs in its target's cell, and the frame the fade settles
//   a `focus`        the first frame that differs in its target's cell; and, when the ring ends by its own `until`,
//                    the frame the ring starts to go (events.ts, "ring-end")
import { synthClip } from "@reebeat/sounds-synth";
import { Array as Arr } from "effect";

import { effectKey, ownSubject } from "./effectFacts.ts";
import type { EffectFact, RingPlan } from "./effectFacts.ts";
import { subjectKey } from "./events.ts";
import type { Observed } from "./events.ts";
import { frameStartMs, msToFrames } from "./units.ts";
import { locateSounds, soundMatchFloor } from "./wav.ts";
import type { SoundFound } from "./wav.ts";

/** How far from the fire frame, in milliseconds, the catalogue sound is looked for. */
const soundWindowMs = 150;

/**
 * Where a focus ring ends, as the picture shows it (`RingPlan` says which of these can be asked):
 * `seen` the cell stops showing the ring from frame `off` and no longer differs from the unringed picture from `gone`.
 */
export type Ring =
  | { readonly tag: "none" }
  | { readonly tag: "slide-change" }
  | { readonly by: string; readonly frame: number; readonly tag: "retaken" }
  | { readonly reason: string; readonly tag: "missing" }
  | { readonly gone: number; readonly off: number; readonly tag: "seen" };

/** What an effect instance did, observed: the frames at which it starts and ends, or why none was observed. */
export interface Own {
  readonly end: number | undefined;
  readonly reason: string;
  readonly ring: Ring;
  readonly score: number | undefined;
  readonly start: number | undefined;
}

const noRing: Ring = { tag: "none" };

/** The sound found at `offsetMs` from `fireFrame` with `score`; none when it matches under the floor. */
export const heardAs = (
  found: SoundFound,
  fireFrame: number,
  fps: number
): Own => {
  if (found.score < soundMatchFloor) {
    return {
      end: undefined,
      reason: `the sound is not found within ${soundWindowMs} ms (best match ${found.score.toFixed(2)}, at least ${soundMatchFloor} needed)`,
      ring: noRing,
      score: found.score,
      start: undefined,
    };
  }

  const start = fireFrame + msToFrames(found.offsetMs, fps);

  return { end: start, reason: "", ring: noRing, score: found.score, start };
};

/** Where every `sound` instance of the Timeline starts in the mixed track, by the key of its instance. */
export const hearSounds = (
  track: Float32Array,
  facts: readonly EffectFact[],
  fps: number
): ReadonlyMap<string, Own> => {
  const sounds = Arr.flatMap(facts, (fact) =>
    fact.effect.verb === "sound" && fact.effect.name !== undefined
      ? [{ fact, name: fact.effect.name }]
      : []
  );

  const found = locateSounds(
    track,
    Arr.map(sounds, ({ fact, name }) => ({
      expectedMs: frameStartMs(fact.timed.fireFrame, fps),
      reference: synthClip(name).samples,
    })),
    soundWindowMs
  );

  return new Map(
    Arr.map(Arr.zip(sounds, found), ([{ fact }, heard]): [string, Own] => [
      effectKey(fact),
      heardAs(heard, fact.timed.fireFrame, fps),
    ])
  );
};

/** The ring as the picture shows it, from what `RingPlan` asked of the decoded frames. */
export const ringOf = (
  plan: RingPlan,
  seen: ReadonlyMap<string, Observed | undefined>,
  fact: EffectFact
): Ring => {
  if (plan.tag !== "observe") {
    return plan;
  }

  const event = seen.get(subjectKey(plan.subject));

  return event === undefined
    ? {
        reason: `no frame from ${(fact.timed.endFrame ?? 0) - 3} on differs from the ringed picture in the cell of ${fact.effect.target ?? "its target"}`,
        tag: "missing",
      }
    : { gone: event.end, off: event.start, tag: "seen" };
};

/** What the effect instance did: a heard sound, or the step in its target's cell and, for a ring, where it ends. */
export const ownOf = (
  fact: EffectFact,
  seen: ReadonlyMap<string, Observed | undefined>,
  ring: Ring,
  sound?: Own
): Own => {
  if (sound !== undefined) {
    return sound;
  }

  const subject = ownSubject(fact);

  const event =
    subject === undefined ? undefined : seen.get(subjectKey(subject));

  return event === undefined
    ? {
        end: undefined,
        reason: `no frame within ${fact.timed.fireFrame - 3} to ${fact.timed.fireFrame + 12} differs in the cell of ${fact.effect.target ?? "its target"}`,
        ring,
        score: undefined,
        start: undefined,
      }
    : {
        end: fact.effect.verb === "show" ? event.end : event.start,
        reason: "",
        ring,
        score: undefined,
        start: event.start,
      };
};
