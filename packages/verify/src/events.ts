import type { ElementEvent, TimedPlan } from "@reebeat/core";
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

/** The frames after a slide change that are decoded: the Auto-Animate (0.8 s) and the fade are long over. */
const settleReach = 30;

/** The frames after a `show` or `focus` effect's fire frame that are decoded: a fade lasts 0.2 s. */
const stepReach = 12;

/**
 * What to look at: the incoming slide change of a Scene, one event of one Element of a Scene, or the step of a `show`
 * or `focus` effect (the change in its target's cell from its fire frame on; for a `show` that is the target's enter).
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

  if (subject.kind === "step") {
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

/** The frames decoded for a subject: from just before the event to well after it. */
const rangeOf = (plan: TimedPlan, subject: Subject) => {
  const last = plan.timeline.totalFrames - 1;

  if (subject.kind === "step") {
    return {
      from: Math.max(0, subject.fireFrame - lead),
      to: Math.min(last, subject.fireFrame + stepReach),
    };
  }

  const slide = plan.timeline.scenes[subject.sceneIndex]?.slideFrame ?? 0;

  return {
    from: Math.max(0, slide - lead),
    to: Math.min(last, slide + settleReach),
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
  const { from, to } = rangeOf(build.plan, subject);

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
  subject.sceneIndex === 0 && subject.kind !== "step"
    ? Effect.succeed(Option.none<Observed>())
    : look(build, subject);
