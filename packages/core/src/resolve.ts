// Effect resolution (spec 0002, "plan contract for effects"): every anchor becomes an integer frame, from the aligned
// words (`TimedLine.words`), the Scene's `slideFrame` and the renderer's declared `RendererLifecycle`. All
// arithmetic is integer frames at `settings.fps`; a duration in milliseconds becomes frames with `Math.round`
// (halves round up), and an effect's frame is the integer sum of its anchor's frame and its offset's frames:
//
//   s                = the Scene's slideFrame;  W = s + round(fps * transitionMs[transition] / 1000)
//   word.start | end = the word's start | end frame (a phrase: its first word's start, its last word's end)
//   scene.start | end = s | the Scene's last frame (endFrame - 1)
//   transition.N%    = s + round(N/100 * (W - s))            (start = N 0, end = N 100)
//   move | update    = s + matched.startLagFrames .. W, N% by the declared easing (progress, not time)
//   enter            = unmatched: s + enter.startLag .. s + enter.endLag; slide: s .. W; show: fire .. fire + showMs
//   exit             = s, an instant
//   effect.start | end = the effect's fire frame | the end of its window (`show`: + showMs; others: = fire)
//   offset           = ms: round(fps * ms / 1000); f: frames; %: round(N/100 * window width) (needs a window)
//   absolute         = s + round(fps * ms / 1000)
//   fire frame       = anchor frame + offset frames; command frame = fire - 1 for show and focus, fire for sound
//
// Plain functions over `Result`; no Effect, no service.
import { Array as Arr, Order, Result } from "effect";

import { formatWhen } from "./effects.ts";
import { EffectOutsideScene, EmptyWindow, UnresolvedAnchor } from "./errors.ts";
import type { ScheduleError } from "./errors.ts";
import { eventKind, showEffectOf } from "./events.ts";
import type { EventKind } from "./events.ts";
import { effectOf } from "./lookup.ts";
import type {
  Anchor,
  Effect,
  Offset,
  Point,
  RendererLifecycle,
  Scene,
  Settings,
  TimedEffect,
  TimedLine,
} from "./plan.ts";
import { findPhrase } from "./words.ts";

/** The frames of an event: `end >= start`; equal means an instant. */
interface Window {
  readonly end: number;
  readonly start: number;
}

/** What an anchor resolved to: the frame it points at and the window of the anchored event. */
interface Resolved {
  readonly frame: number;
  readonly window: Window;
}

/** What the resolution of one Scene reads. */
export interface SceneTiming {
  readonly endFrame: number;
  readonly lines: readonly TimedLine[];
  readonly slideFrame: number;
}

interface Context {
  readonly active: Set<string>;
  readonly fires: Map<string, number>;
  readonly lifecycle: RendererLifecycle;
  readonly scene: Scene;
  readonly settings: Settings;
  readonly timing: SceneTiming;
}

/** Resolves another effect of the Scene; passed down so the helpers need no forward reference. */
type Fire = (effect: Effect) => Result.Result<number, ScheduleError>;

const frames = (context: Context, ms: number): number =>
  Math.round((context.settings.fps * ms) / 1000);

const unresolved = (
  context: Context,
  effect: Effect,
  message: string
): ScheduleError =>
  new UnresolvedAnchor({
    effectId: effect.id,
    message,
    sceneId: context.scene.id,
  });

const emptyWindow = (
  context: Context,
  effect: Effect,
  what: string
): ScheduleError =>
  new EmptyWindow({
    effectId: effect.id,
    message: `effect ${effect.id} (line ${effect.line}): ${what} needs a window, but the renderer's lifecycle makes it an instant`,
    sceneId: context.scene.id,
  });

/** The CSS cubic-bezier component at `t`. */
const bezier = (t: number, first: number, second: number): number =>
  3 * (1 - t) * (1 - t) * t * first + 3 * (1 - t) * t * t * second + t * t * t;

/**
 * The fraction of the time at which the eased progress reaches `progress`: bisection on the declared bezier
 * `[x1, y1, x2, y2]`, 48 halvings, so the same input gives the same frame on every machine.
 */
export const timeOfProgress = (
  easing: RendererLifecycle["matched"]["easing"],
  progress: number
): number => {
  const [x1, y1, x2, y2] = easing;
  let low = 0;
  let high = 1;

  for (let step = 0; step < 48; step += 1) {
    const middle = (low + high) / 2;

    if (bezier(middle, y1, y2) < progress) {
      low = middle;
    } else {
      high = middle;
    }
  }

  return bezier((low + high) / 2, x1, x2);
};

const linear = (window: Window, percent: number): number =>
  window.start + Math.round((percent / 100) * (window.end - window.start));

const eased = (context: Context, window: Window, percent: number): number =>
  window.start +
  Math.round(
    timeOfProgress(context.lifecycle.matched.easing, percent / 100) *
      (window.end - window.start)
  );

const pointOf = (
  context: Context,
  effect: Effect,
  window: Window,
  at: Point,
  progress: boolean
): Result.Result<number, ScheduleError> => {
  if (at === "start") {
    return Result.succeed(window.start);
  }

  if (at === "end") {
    return Result.succeed(window.end);
  }

  if (window.end === window.start) {
    return Result.fail(emptyWindow(context, effect, `${at.percent}%`));
  }

  return Result.succeed(
    progress ? eased(context, window, at.percent) : linear(window, at.percent)
  );
};

/** The window of `kind` for an Element; a `show-enter` waits for the effect that shows it. */
const eventWindow = (
  context: Context,
  effect: Effect,
  id: string,
  kind: EventKind,
  fire: Fire
): Result.Result<Window, ScheduleError> => {
  const slide = context.timing.slideFrame;
  const { scene, lifecycle } = context;
  const end = slide + frames(context, lifecycle.transitionMs[scene.transition]);

  switch (kind) {
    case "matched": {
      const start = slide + lifecycle.matched.startLagFrames;

      return Result.succeed({ end: Math.max(start, end), start });
    }

    case "unmatched-enter": {
      const { endLagFrames, startLagFrames } = lifecycle.unmatched.enter;

      return Result.succeed({
        end: slide + Math.max(startLagFrames, endLagFrames),
        start: slide + startLagFrames,
      });
    }

    case "exit": {
      return Result.succeed({ end: slide, start: slide });
    }

    case "slide-enter": {
      return Result.succeed({ end, start: slide });
    }

    case "show-enter": {
      const shown = showEffectOf(scene, id);

      return shown === undefined
        ? Result.fail(unresolved(context, effect, `no show effect for ${id}`))
        : Result.map(fire(shown), (at) => ({
            end: at + frames(context, lifecycle.showMs),
            start: at,
          }));
    }

    default: {
      return Result.fail(
        unresolved(context, effect, `unknown event ${String(kind)}`)
      );
    }
  }
};

const wordAnchor = (
  context: Context,
  effect: Effect,
  anchor: Extract<Anchor, { kind: "word" }>
): Result.Result<Resolved, ScheduleError> => {
  const found = findPhrase(context.scene.lines, anchor.phrase)[
    anchor.occurrence - 1
  ];

  const line = context.timing.lines[found?.line ?? -1];
  const first = line?.words[found?.from ?? -1];
  const last = line?.words[found?.to ?? -1];

  if (first === undefined || last === undefined) {
    return Result.fail(
      unresolved(
        context,
        effect,
        `word("${anchor.phrase}", ${anchor.occurrence}) is not in the narration of Scene ${context.scene.id}`
      )
    );
  }

  return Result.succeed({
    frame: anchor.edge === "start" ? first.startFrame : last.endFrame,
    window: { end: last.endFrame, start: first.startFrame },
  });
};

const elementAnchor = (
  context: Context,
  effect: Effect,
  anchor: Extract<Anchor, { kind: "element" }>,
  fire: Fire
): Result.Result<Resolved, ScheduleError> => {
  const kind = eventKind(context.scene, anchor.id, anchor.event);

  if (kind === undefined) {
    return Result.fail(
      unresolved(
        context,
        effect,
        `Element ${anchor.id} has no ${anchor.event} in Scene ${context.scene.id}`
      )
    );
  }

  return Result.flatMap(
    eventWindow(context, effect, anchor.id, kind, fire),
    (window) =>
      Result.map(
        pointOf(context, effect, window, anchor.at, kind === "matched"),
        (frame) => ({ frame, window })
      )
  );
};

const effectAnchor = (
  context: Context,
  effect: Effect,
  anchor: Extract<Anchor, { kind: "effect" }>,
  fire: Fire
): Result.Result<Resolved, ScheduleError> => {
  const other = effectOf(context.scene, anchor.id);

  if (other === undefined) {
    return Result.fail(
      unresolved(
        context,
        effect,
        `no effect ${anchor.id} in Scene ${context.scene.id}`
      )
    );
  }

  return Result.map(fire(other), (at) => {
    const window = {
      end:
        other.verb === "show"
          ? at + frames(context, context.lifecycle.showMs)
          : at,
      start: at,
    };

    return {
      frame: anchor.edge === "start" ? window.start : window.end,
      window,
    };
  });
};

const anchorOf = (
  context: Context,
  effect: Effect,
  anchor: Anchor,
  fire: Fire
): Result.Result<Resolved, ScheduleError> => {
  const { slideFrame, endFrame } = context.timing;

  switch (anchor.kind) {
    case "word": {
      return wordAnchor(context, effect, anchor);
    }

    case "scene": {
      const frame = anchor.edge === "start" ? slideFrame : endFrame - 1;

      return Result.succeed({ frame, window: { end: frame, start: frame } });
    }

    case "transition": {
      const window = {
        end:
          slideFrame +
          frames(
            context,
            context.lifecycle.transitionMs[context.scene.transition]
          ),
        start: slideFrame,
      };

      return Result.map(
        pointOf(context, effect, window, anchor.at, false),
        (frame) => ({ frame, window })
      );
    }

    case "element": {
      return elementAnchor(context, effect, anchor, fire);
    }

    case "effect": {
      return effectAnchor(context, effect, anchor, fire);
    }

    default: {
      return Result.fail(unresolved(context, effect, "unknown anchor"));
    }
  }
};

const offsetFrames = (
  context: Context,
  effect: Effect,
  offset: Offset | undefined,
  window: Window
): Result.Result<number, ScheduleError> => {
  if (offset === undefined) {
    return Result.succeed(0);
  }

  if (offset.unit === "f") {
    return Result.succeed(offset.value);
  }

  if (offset.unit === "ms") {
    return Result.succeed(frames(context, offset.value));
  }

  return window.end === window.start
    ? Result.fail(emptyWindow(context, effect, `offset ${offset.value}%`))
    : Result.succeed(
        Math.round((offset.value / 100) * (window.end - window.start))
      );
};

/** The frame at which the capture issues the effect: one before a visible change, the fire frame for a sound. */
export const commandOf = (effect: Effect, fire: number): number =>
  effect.verb === "sound" ? fire : fire - 1;

const outsideScene = (
  context: Context,
  effect: Effect,
  fire: number
): ScheduleError | undefined => {
  const { slideFrame, endFrame } = context.timing;
  const command = commandOf(effect, fire);

  if (fire >= slideFrame && command >= slideFrame && fire < endFrame) {
    return undefined;
  }

  return new EffectOutsideScene({
    effectId: effect.id,
    message: `effect ${effect.id} (line ${effect.line}) resolves to frame ${fire} (command at ${command}), outside Scene ${context.scene.id} (frames ${slideFrame} to ${endFrame - 1}): its anchor and offset must keep it, and its command, inside the Scene`,
    sceneId: context.scene.id,
  });
};

/** The resolved fire frame of one effect, memoised; an effect that waits for itself is `UnresolvedAnchor`. */
const fireOf = (
  context: Context,
  effect: Effect
): Result.Result<number, ScheduleError> => {
  const known = context.fires.get(effect.id);

  if (known !== undefined) {
    return Result.succeed(known);
  }

  if (context.active.has(effect.id)) {
    return Result.fail(
      unresolved(context, effect, `effect ${effect.id} waits for itself`)
    );
  }

  context.active.add(effect.id);

  const { when } = effect;
  const fire: Fire = (other) => fireOf(context, other);

  const resolved = Result.flatMap(
    "absoluteMs" in when
      ? Result.succeed(
          context.timing.slideFrame + frames(context, when.absoluteMs)
        )
      : Result.flatMap(anchorOf(context, effect, when.anchor, fire), (anchor) =>
          Result.map(
            offsetFrames(context, effect, when.offset, anchor.window),
            (offset) => anchor.frame + offset
          )
        ),
    (at) => {
      const outside = outsideScene(context, effect, at);

      return outside === undefined ? Result.succeed(at) : Result.fail(outside);
    }
  );

  context.active.delete(effect.id);

  if (Result.isSuccess(resolved)) {
    context.fires.set(effect.id, resolved.success);
  }

  return resolved;
};

/**
 * The Scene's effects with their frames, in resolved time order (ties keep source order), or the first reason one
 * cannot be resolved.
 */
export const resolveEffects = (
  scene: Scene,
  timing: SceneTiming,
  settings: Settings,
  lifecycle: RendererLifecycle
): Result.Result<readonly TimedEffect[], ScheduleError> => {
  const context: Context = {
    active: new Set(),
    fires: new Map(),
    lifecycle,
    scene,
    settings,
    timing,
  };

  const timed: TimedEffect[] = [];

  for (const effect of scene.effects) {
    const fire = fireOf(context, effect);

    if (Result.isFailure(fire)) {
      return Result.fail(fire.failure);
    }

    timed.push({
      commandFrame: commandOf(effect, fire.success),
      effectId: effect.id,
      fireFrame: fire.success,
      intent: formatWhen(effect.when),
    });
  }

  return Result.succeed(
    Arr.sort(
      timed,
      Order.mapInput(Order.Number, (effect: TimedEffect) => effect.fireFrame)
    )
  );
};
