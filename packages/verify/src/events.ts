// F1, the events of the picture: where in the written video a slide change or an Element's enter, exit, move or update
// really starts, ends and is N percent through (spec 0002, "plan contract for effects"). The Plan says WHEN each
// happens (`Timeline`, resolved from the renderer's declared lifecycle); this module looks at the decoded frames and
// says when it DID happen, with no knowledge of the renderer. A renderer that declares the wrong lifecycle makes the
// two differ.
//
//   start    the first frame whose pixels in the event's region differ from the old picture (200 pixels by more than 8
//            gray levels, the threshold of F7)
//   end      the first frame whose pixels differ from the settled picture by less than 1% of the change (at least 200)
//   N%       a box that moves is N% through when the centre of its ink is N% of the way from its old to its new place,
//            a colour that changes when the blend of its pixels is; anything else is N% of the way in time
//            between `start` and `end`
//
// A focus ring that ends by its own `until` (spec 0004, F5) is the mirror of the ring's start: the clip begins on the
// ringed picture, the "old picture" is the ring, the "new picture" is the cell without it, and the ring is going from
// the first frame the cell differs from the ringed picture (the capture commands the ring off one frame before, as it
// commands it on one frame before its fire frame).
import { lifecycleFrames } from "@reebeat/core";
import type {
  ElementEvent,
  LifecycleFrames,
  RendererLifecycle,
  TimedPlan,
} from "@reebeat/core";
import { decodeGrayFrames } from "@reebeat/encode-ffmpeg";
import type { Box, GrayClip } from "@reebeat/encode-ffmpeg";
import { Effect, Option } from "effect";

import { eventWindow, frameAtFraction } from "./frames.ts";
import type { Following } from "./frames.ts";
import type { Build } from "./load.ts";
import { elementBox, unionBox } from "./regions.ts";

/**
 * The frames before the event that are decoded: the first one is the old picture, and the first two show the flicker the
 * encoder may leave on the picture (`changeFloor`), so an event up to three frames early is still after them.
 */
const lead = 5;

/** The frames kept after the declared end of an event: a declaration that is a little short is still seen as late. */
const margin = 2 * lead;

const framesOf = (plan: TimedPlan, ms: number): number =>
  Math.ceil((plan.settings.fps * ms) / 1000);

/**
 * The frames after a slide change in which one of its events may still be going on, from the Plan's Auto-Animate
 * `transition`, the transition the renderer declares for this Scene, its matched Elements' start lag and its unmatched
 * Elements' last frame, plus the margin.
 */
const settleReach = (
  plan: TimedPlan,
  declared: LifecycleFrames,
  sceneIndex: number
): number =>
  Math.max(
    framesOf(plan, plan.settings.transition * 1000),
    declared.transition[plan.scenes[sceneIndex]?.transition ?? "default"],
    declared.matchedStart,
    declared.enterEnd
  ) + margin;

/** The frames after a `show` or `focus` effect's fire frame that are decoded: the declared show time plus the margin. */
const stepReach = (declared: LifecycleFrames): number => declared.show + margin;

/**
 * What to look at: the incoming slide change of a Scene, one event of one Element of a Scene, the step of a `show` or
 * `focus` effect (the change in its target's cell from its fire frame on; for a `show` that is the target's enter), or
 * the end of a focus ring that ends by its own `until` (the change in its target's cell from the ring's `endFrame` on).
 */
export type Subject =
  | { readonly kind: "transition"; readonly sceneIndex: number }
  | {
      readonly event: ElementEvent;
      readonly id: string;
      readonly kind: "element";
      readonly sceneIndex: number;
    }
  | {
      readonly fireFrame: number;
      readonly id: string;
      readonly kind: "step";
      readonly sceneIndex: number;
    }
  | {
      readonly endFrame: number;
      readonly id: string;
      readonly kind: "ring-end";
      readonly sceneIndex: number;
    };

/** What a subject looks at, as a key to find its observation again and to look at it once. */
export const subjectKey = (subject: Subject): string => {
  if (subject.kind === "transition") {
    return `transition ${subject.sceneIndex}`;
  }

  if (subject.kind === "element") {
    return `element ${subject.sceneIndex} ${subject.id} ${subject.event}`;
  }

  if (subject.kind === "step") {
    return `step ${subject.sceneIndex} ${subject.id} ${subject.fireFrame}`;
  }

  return `ring-end ${subject.sceneIndex} ${subject.id} ${subject.endFrame}`;
};

/** An event observed in the video, in frame numbers of the video. */
export interface Observed {
  readonly end: number;
  /** The frame (a fraction of a frame) at which the event is `percent` percent through. */
  readonly percent: (percent: number) => number | undefined;
  readonly start: number;
}

/** The part of the frame the event is looked for in; the whole frame (none) for a slide change. */
const regionOf = (plan: TimedPlan, subject: Subject): Box | undefined => {
  if (subject.kind === "transition") {
    return undefined;
  }

  if (subject.kind === "step" || subject.kind === "ring-end") {
    return Option.getOrUndefined(
      elementBox(plan, subject.sceneIndex, subject.id)
    );
  }

  const { event, id, sceneIndex } = subject;
  const now = Option.getOrUndefined(elementBox(plan, sceneIndex, id));
  const before = Option.getOrUndefined(elementBox(plan, sceneIndex - 1, id));

  if (event === "enter") {
    return now;
  }

  if (event === "exit") {
    return before;
  }

  return now === undefined || before === undefined
    ? (now ?? before)
    : unionBox(now, before);
};

const followingOf = (subject: Subject): Following | undefined => {
  if (subject.kind !== "element") {
    return undefined;
  }

  if (subject.event === "move") {
    return "ink";
  }

  return subject.event === "update" ? "blend" : undefined;
};

/** The Scene's last frame: the frame before its slide change out. */
const sceneLastFrame = (plan: TimedPlan, sceneIndex: number): number =>
  (plan.timeline.scenes[sceneIndex]?.endFrame ?? plan.timeline.totalFrames) - 1;

/**
 * The frames decoded for a subject: from just before the event to past the end the renderer declared for it (plus the
 * margin), so that a declaration that is too short is seen as a difference and not cut off. The end of a ring stops at
 * the Scene's last frame: the slide change is not the ring.
 */
export const observationRange = (
  plan: TimedPlan,
  lifecycle: RendererLifecycle,
  subject: Subject
) => {
  const last = plan.timeline.totalFrames - 1;
  const declared = lifecycleFrames(plan.settings, lifecycle);

  if (subject.kind === "step") {
    return {
      from: Math.max(0, subject.fireFrame - lead),
      to: Math.min(last, subject.fireFrame + stepReach(declared)),
    };
  }

  if (subject.kind === "ring-end") {
    return {
      from: Math.max(0, subject.endFrame - lead),
      to: Math.min(
        last,
        sceneLastFrame(plan, subject.sceneIndex),
        subject.endFrame + stepReach(declared)
      ),
    };
  }

  const slide = plan.timeline.scenes[subject.sceneIndex]?.slideFrame ?? 0;

  return {
    from: Math.max(0, slide - lead),
    to: Math.min(last, slide + settleReach(plan, declared, subject.sceneIndex)),
  };
};

/** The event of a decoded clip, with the points of it the Plan can be anchored to. */
const observedIn = (
  clip: GrayClip,
  region: Box | undefined,
  following: Following | undefined
): Observed | undefined => {
  const window = eventWindow(clip, region, following);

  if (window === undefined) {
    return undefined;
  }

  const percent = (point: number): number | undefined => {
    const edge = point <= 0 || point >= 100;
    const linear = window.start + ((window.end - window.start) * point) / 100;

    return edge || following === undefined
      ? linear
      : frameAtFraction(clip, region, following, point / 100);
  };

  return { end: window.end, percent, start: window.start };
};

const look = Effect.fn("observeEvent.look")(function* look(
  build: Build,
  subject: Subject
) {
  const { from, to } = observationRange(build.plan, build.lifecycle, subject);

  const clip = yield* decodeGrayFrames(
    build.mp4,
    from,
    to,
    build.plan.settings
  );

  return Option.fromNullishOr(
    observedIn(clip, regionOf(build.plan, subject), followingOf(subject))
  );
});

/**
 * The event in the written video, or none when there is nothing to see: the first Scene has no slide change (its
 * picture is the first frame of the video), and an event whose region shows no change has not happened.
 */
export const observeEvent = (build: Build, subject: Subject) =>
  subject.sceneIndex === 0 &&
  subject.kind !== "step" &&
  subject.kind !== "ring-end"
    ? Effect.succeed(Option.none<Observed>())
    : look(build, subject);
