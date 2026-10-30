// What F1 knows of one Scene from the written files (spec 0004): the frames at which its slide change, its Elements'
// events, its effect instances, its Beats and its States were OBSERVED, in the vocabulary of the Plan's machines. The
// Timeline supplies only what has no picture: the words of the narration, and the first Scene's slide change (the first
// picture of the video is not a change). Each span is the observed counterpart of the window `resolve.ts` computes from
// the renderer's declared lifecycle, so an expression evaluated over them (`leaves.ts`) and the resolved frames can be
// compared. Pure: the decoding happened before, `World` holds its results.
import { eventKind, showEffectOf, stateStart, stepsOf } from "@tsukuri/core";
import type {
  ElementEvent,
  LifecycleFrames,
  Scene,
  TimedPlan,
  TimedScene,
  Window,
} from "@tsukuri/core";
import { Array as Arr, Option, Order, Result } from "effect";

import { instanceKey } from "./effectFacts.ts";
import { subjectKey } from "./events.ts";
import type { Observed, Subject } from "./events.ts";
import type { Own } from "./own.ts";

/** Everything the observation found, keyed so the Plan's machines can read it. */
export interface World {
  readonly declared: LifecycleFrames;
  /** What every effect instance did, by `scene.effect#instance`. */
  readonly owns: ReadonlyMap<string, Own>;
  readonly plan: TimedPlan;
  /** The events of the picture that were asked for, by `subjectKey`; undefined: asked, and the picture shows none. */
  readonly seen: ReadonlyMap<string, Observed | undefined>;
}

/** Why a moment is that frame: a picture or sound that shows it, or the Timeline for what has no picture. */
export type Basis =
  | "first frame of the Scene"
  | "end of the Scene"
  | "observed"
  | "timeline";

/** An observed event with the reason for it. */
export interface Spanned {
  readonly basis: Basis;
  readonly span: Observed;
}

export type Found<A> = Result.Result<A, string>;

/** An event whose points are linear in time between the two ends of a window (the Timeline's, or a Beat's). */
export const linear = (window: Window): Observed => ({
  end: window.end,
  percent: (percent) =>
    window.start + ((window.end - window.start) * percent) / 100,
  start: window.start,
});

/** The Plan's Scene and the Timeline's, by index. */
export const sceneAt = (
  plan: TimedPlan,
  index: number
): Found<{ readonly scene: Scene; readonly timed: TimedScene }> =>
  Result.gen(function* at() {
    const scene = yield* Result.fromNullishOr(
      plan.scenes[index],
      () => `the Plan has no Scene ${index}`
    );

    const timed = yield* Result.fromNullishOr(
      plan.timeline.scenes[index],
      () => `the Timeline has no Scene ${index}`
    );

    return { scene, timed };
  });

const sceneChange = (index: number): Subject => ({
  kind: "transition",
  sceneIndex: index,
});

/**
 * The slide change into Scene `index` as the picture shows it: none for the first Scene (its picture is the first frame
 * of the video) and for a Scene whose change was not asked for.
 */
const changeSeen = (world: World, index: number): Found<Observed | null> => {
  const key = subjectKey(sceneChange(index));

  if (index === 0 || !world.seen.has(key)) {
    return Result.succeed(null);
  }

  return Result.fromNullishOr(
    world.seen.get(key),
    () =>
      `the slide change into Scene ${index + 1} is not observed in the picture`
  );
};

/** The slide change into Scene `index`: observed, and for the first Scene the Timeline's window from the first frame. */
export const transitionOf = (world: World, index: number): Found<Spanned> =>
  Result.gen(function* transition() {
    const { scene, timed } = yield* sceneAt(world.plan, index);
    const seen = yield* changeSeen(world, index);

    return seen === null
      ? {
          basis: "timeline",
          span: linear({
            end: timed.slideFrame + world.declared.transition[scene.transition],
            start: timed.slideFrame,
          }),
        }
      : { basis: "observed", span: seen };
  });

/**
 * The first and the last frame of Scene `index`: its slide change as observed (else the Timeline's frame), and the
 * frame before the next Scene's slide change as observed (else the Timeline's last frame).
 */
export const sceneWindowOf = (world: World, index: number): Found<Window> =>
  Result.gen(function* bounds() {
    const { timed } = yield* sceneAt(world.plan, index);
    const opens = yield* changeSeen(world, index);
    const closes = yield* changeSeen(world, index + 1);

    return {
      end: closes === null ? timed.endFrame - 1 : closes.start - 1,
      start: opens === null ? timed.slideFrame : opens.start,
    };
  });

/** The step that observes the reveal of an Element that starts hidden: its `show` effect's change in the Element's cell. */
const revealStep = (
  plan: TimedPlan,
  index: number,
  scene: Scene,
  id: string
): Subject | undefined => {
  const show = showEffectOf(scene, id);

  const timed = Arr.findFirst(
    plan.timeline.scenes[index]?.effects ?? [],
    (candidate) => candidate.effectId === show?.id
  );

  return Option.getOrUndefined(
    Option.map(timed, (found): Subject => ({
      fireFrame: found.fireFrame,
      id,
      kind: "step",
      sceneIndex: index,
    }))
  );
};

/**
 * What the picture is asked for the event `name` of Element `id` of Scene `index`: its change in the Element's cell, the
 * reveal step of an Element that starts hidden, and nothing for an event that does not happen in the Scene or that has
 * no picture (the first Scene's slide change).
 */
export const elementSubject = (
  plan: TimedPlan,
  index: number,
  id: string,
  name: ElementEvent
): Subject | undefined => {
  const scene = plan.scenes[index];
  const kind = scene === undefined ? undefined : eventKind(scene, id, name);

  if (scene === undefined || kind === undefined) {
    return undefined;
  }

  if (kind === "show-enter") {
    return revealStep(plan, index, scene, id);
  }

  return index === 0
    ? undefined
    : { event: name, id, kind: "element", sceneIndex: index };
};

/**
 * The observed event `name` of Element `id` of Scene `index`; none when it does not happen there. The first Scene's
 * slide change has no picture: its enter is the Timeline's window.
 */
export const elementSpanOf = (
  world: World,
  index: number,
  id: string,
  name: ElementEvent
): Found<Spanned | null> =>
  Result.gen(function* span() {
    const { scene } = yield* sceneAt(world.plan, index);

    if (eventKind(scene, id, name) === undefined) {
      return null;
    }

    const subject = elementSubject(world.plan, index, id, name);

    if (subject === undefined) {
      // Only the first Scene's slide change has no picture to ask: its enter is the Timeline's window.
      return index === 0
        ? yield* transitionOf(world, index)
        : yield* Result.fail(`${id}.${name} has no picture to observe`);
    }

    const seen = yield* Result.fromNullishOr(
      world.seen.get(subjectKey(subject)),
      () => `${id}.${name} is not observed in the picture`
    );

    return { basis: "observed", span: seen };
  });

/** What one effect instance did: its window as observed, and the reason for it. */
interface Run {
  readonly basis: Basis;
  readonly window: Window;
}

/** The observed run of instance `instance` of effect `effectId`: from its observed start to where its change or ring ends. */
export const runOf = (
  world: World,
  index: number,
  effectId: string,
  instance: number
): Found<Run> =>
  Result.gen(function* run() {
    const { scene, timed } = yield* sceneAt(world.plan, index);
    const key = instanceKey(scene.id, effectId, instance);

    const own = yield* Result.fromNullishOr(
      world.owns.get(key),
      () => `effect ${key} is not observed`
    );

    const { start } = own;

    if (start === undefined) {
      return yield* Result.fail(`effect ${key} is not observed: ${own.reason}`);
    }

    const { ring } = own;

    if (ring.tag === "seen") {
      return {
        basis: "observed",
        window: { end: ring.off, start },
      } satisfies Run;
    }

    if (ring.tag === "slide-change") {
      const bounds = yield* sceneWindowOf(world, index);

      return {
        basis: "observed",
        window: { end: bounds.end, start },
      } satisfies Run;
    }

    if (ring.tag === "missing") {
      return yield* Result.fail(
        `the end of effect ${key} is not observed: ${ring.reason}`
      );
    }

    if (ring.tag === "retaken") {
      const resolved = Arr.findFirst(
        timed.effects,
        (candidate) =>
          candidate.effectId === effectId && candidate.instance === instance
      );

      return {
        basis: "timeline",
        window: {
          end: Option.match(resolved, {
            onNone: () => start,
            onSome: (found) => found.endFrame ?? start,
          }),
          start,
        },
      } satisfies Run;
    }

    return { basis: "observed", window: { end: own.end ?? start, start } };
  });

/** The instances the Timeline resolved for effect `effectId` of Scene `index`. */
export const instancesOf = (
  plan: TimedPlan,
  index: number,
  effectId: string
): readonly number[] =>
  Arr.map(
    Arr.filter(
      plan.timeline.scenes[index]?.effects ?? [],
      (timed) => timed.effectId === effectId
    ),
    (timed) => timed.instance
  );

/** One step of the Scene as observed: the frame the Timeline fires it at, where it starts and where its change ends. */
interface StepRun {
  readonly end: number;
  readonly fire: number;
  readonly start: number;
}

const stepRuns = (
  world: World,
  scene: Scene,
  after: number
): Found<readonly StepRun[]> =>
  Result.all(
    Arr.flatMap(stepsOf(world.plan, scene), (step) => {
      const { timed } = step;

      if (
        step.edge === "end" ||
        timed === undefined ||
        timed.fireFrame <= after
      ) {
        return [];
      }

      const key = instanceKey(scene.id, step.effect.id, timed.instance);
      const own = world.owns.get(key);
      const start = own?.start;

      return [
        start === undefined
          ? Result.fail(`step ${key} is not observed`)
          : Result.succeed({
              end: step.effect.verb === "show" ? (own?.end ?? start) : start,
              fire: timed.fireFrame,
              start,
            }),
      ];
    })
  );

/**
 * The Beats of Scene `index` as observed: the Timeline says which steps fire together (one Beat for each distinct fire
 * frame after the Scene's first frame), the picture says where each starts, and the Beat lasts as long as the slowest
 * of its steps' changes (a `show` fades, a `focus` is an instant), exactly as `resolve.ts` builds them.
 */
export const beatsOf = (
  world: World,
  index: number
): Found<readonly Window[]> =>
  Result.gen(function* beats() {
    const { scene, timed } = yield* sceneAt(world.plan, index);
    const runs = yield* stepRuns(world, scene, timed.slideFrame);

    return Arr.map(
      Arr.sort(Arr.dedupe(Arr.map(runs, ({ fire }) => fire)), Order.Number),
      (fire): Window => {
        const group = Arr.filter(runs, (run) => run.fire === fire);
        const start = Math.min(...Arr.map(group, (run) => run.start));

        return {
          end: Math.max(start, ...Arr.map(group, (run) => run.end)),
          start,
        };
      }
    );
  });

/** Beat `n` (1-based) as observed. */
export const beatOf = (world: World, index: number, n: number): Found<Window> =>
  Result.flatMap(beatsOf(world, index), (beats) =>
    Result.fromNullishOr(
      beats[n - 1],
      () =>
        `beat(${n}) is not observed: ${beats.length} Beat${beats.length === 1 ? "" : "s"} observed in this Scene`
    )
  );

/**
 * State `n` (1-based) as observed: its dwell, from the end of the last Beat before it (`stateStart`) to the start of the
 * Beat after it (the Scene's last frame for the last State, which is then `last`: it is left at the frame after, the
 * next slide change).
 */
export const dwellDetail = (
  world: World,
  index: number,
  n: number
): Found<{ readonly last: boolean; readonly window: Window }> =>
  Result.gen(function* dwell() {
    const beats = yield* beatsOf(world, index);
    const bounds = yield* sceneWindowOf(world, index);

    if (n > beats.length + 1) {
      return yield* Result.fail(
        `state(${n}) is not observed: ${beats.length + 1} State${beats.length === 0 ? "" : "s"} observed in this Scene`
      );
    }

    // The one definition of the schedule: never before the end of any earlier Beat, even when Beats overlap.
    const start = stateStart(
      bounds.start,
      Arr.map(beats, (beat) => beat.end),
      n
    );

    return {
      last: n === beats.length + 1,
      window: {
        end: Option.match(Arr.get(beats, n - 1), {
          onNone: () => bounds.end,
          onSome: (beat) => Math.max(start, beat.start),
        }),
        start,
      },
    };
  });

/** The window State `n` is scoped to by `within`: both ends included. */
export const dwellOf = (
  world: World,
  index: number,
  n: number
): Found<Window> =>
  Result.map(dwellDetail(world, index, n), ({ window }) => window);
