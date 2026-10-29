// An event expression over the frames that were OBSERVED (spec 0004, F1). `core` defines the algebra once
// (`evaluator`: all, first, each, within, offsets, throttle, stagger, `let`) and leaves the SOURCES to the caller;
// `schedule` supplies the frames the Timeline resolves, and this module supplies the frames the written video and mix
// show. Evaluating an effect's own `at` expression here and comparing it with the frame the effect was observed at
// checks a combinator against the picture with the same definition of it the Timeline used.
//
// Every source of an expression is a machine of `machines.ts`, so each is looked up in the vocabulary the machines
// generate:
//
//   word(...)                       no picture: the Timeline's frame (F8 observes the narration)
//   <element>.<transition>.<point>  the observed enter, exit, move or update of the Element (`one.move.start`)
//   <element>.<state>.enter|leave   the intervals of the Element's machines (`core`'s `occupancies`) built from the
//                                   observed transitions: `moving.enter` is `move.start`, `moving.leave` is `move.end`;
//                                   the first state's enter and the last state's leave are the Scene's first and last
//                                   frame, which are not events of the picture (the leaf says so)
//   scene...                        the observed slide change; `scene.start` and `scene.end` are its start and the frame
//                                   before the next one
//   <effect>.start|end|N%           the observed run of every instance of that effect; <effect>.active.enter ...
//   state(n) / beat(n)              the Scene's observed steps: Beat n starts at the observed start of the n-th group of
//                                   steps the Timeline fires together, State n holds from the end of the Beat before it
import {
  anchorsOf,
  elementEvents,
  evaluator,
  findPhrase,
  framesOfFlicks,
  initialState,
  machines,
  occupancies,
  once,
  rateOf,
  refsOf,
  stateEvent,
  statesOf,
} from "@reebeat/core";
import type {
  Anchor,
  Effect,
  Evaluate,
  Event,
  EventExpr,
  ElementEvent,
  Machine,
  Occurrence,
  Point,
  Scene,
  Sources,
  TimedPlan,
  Window,
} from "@reebeat/core";
import { Array as Arr, Match, Option, Result } from "effect";

import type { Observed, Subject } from "./events.ts";
import {
  beatOf,
  dwellOf,
  elementSpanOf,
  elementSubject,
  instancesOf,
  linear,
  runOf,
  sceneAt,
  sceneWindowOf,
  transitionOf,
} from "./observedScene.ts";
import type { Basis, Found, Spanned, World } from "./observedScene.ts";

/** The frames of one source of an expression and why they are those frames. */
export interface Leaf {
  readonly basis: Basis;
  readonly event: Event;
}

type EdgeAnchor = Extract<Anchor, { readonly kind: "edge" }>;

type StateAnchor = Extract<Anchor, { readonly kind: "occupancy" }>;

type WordAnchor = Extract<Anchor, { readonly kind: "word" }>;

const isElementEvent = (name: string): name is ElementEvent =>
  Arr.contains(elementEvents, name);

/** The occurrence of an observed event at a point: its edge, or N percent of the way. */
const occurrenceAt = (span: Observed, at: Point): Found<Occurrence> => {
  const frame = Match.value(at).pipe(
    Match.when("start", () => span.start),
    Match.when("end", () => span.end),
    Match.orElse(({ percent }) => span.percent(percent))
  );

  return frame === undefined
    ? Result.fail("the event is not observed at that point")
    : Result.succeed({ frame, window: { end: span.end, start: span.start } });
};

const edgeLeaf = (spanned: Spanned, at: Point): Found<Leaf> =>
  Result.map(occurrenceAt(spanned.span, at), (occurrence) => ({
    basis: spanned.basis,
    event: [occurrence],
  }));

/** The machine of the Scene's Elements that has the state `name`. */
const elementMachineWith = (name: string): Machine | undefined =>
  Option.getOrUndefined(
    Arr.findFirst(
      machines,
      (machine) =>
        machine.subject === "element" &&
        Arr.some(machine.states, (state) => state.name === name)
    )
  );

const machineOf = (subject: Machine["subject"]): Found<Machine> =>
  Result.fromOption(
    Arr.findFirst(machines, (machine) => machine.subject === subject),
    () => `no machine for ${subject}`
  );

/** The intervals `occupancies` of core returns: a state the machine is in over a window; `open` until the Scene's end. */
type Intervals = readonly {
  readonly open: boolean;
  readonly state: string;
  readonly window: Window;
}[];

/** Why the first interval of `state` starts or ends where it does: the Scene's first or last frame, or an observed event. */
const basisOf = (
  intervals: Intervals,
  state: string,
  event: StateAnchor["event"]
): Basis => {
  const found = Arr.findFirstIndex(
    intervals,
    (interval) => interval.state === state
  );

  const interval = Option.flatMapNullishOr(found, (index) => intervals[index]);

  if (event === "enter" && Option.exists(found, (index) => index === 0)) {
    return "first frame of the Scene";
  }

  return event === "leave" && Option.exists(interval, ({ open }) => open)
    ? "last frame of the Scene"
    : "observed";
};

/** The enter or leave of `state` in the intervals; failing when the machine never reaches it. */
const stateLeaf = (
  intervals: Intervals,
  anchor: StateAnchor,
  what: string
): Found<Leaf> => {
  const event = stateEvent(intervals, anchor.state, anchor.event);

  return event.length === 0
    ? Result.fail(`${what} is never ${anchor.state} in this Scene`)
    : Result.succeed({
        basis: basisOf(intervals, anchor.state, anchor.event),
        event,
      });
};

const elementState = (
  world: World,
  index: number,
  anchor: StateAnchor,
  id: string
): Found<Leaf> =>
  Result.gen(function* element() {
    const { scene } = yield* sceneAt(world.plan, index);
    const bounds = yield* sceneWindowOf(world, index);

    const machine = yield* Result.fromNullishOr(
      elementMachineWith(anchor.state),
      () => `Element ${id} has no state ${anchor.state}`
    );

    const happenings = yield* Result.all(
      Arr.map(machine.transitions, ({ name }) =>
        isElementEvent(name)
          ? Result.map(elementSpanOf(world, index, id, name), (found) =>
              Arr.map(
                Option.toArray(Option.fromNullishOr(found)),
                (spanned) => ({
                  name,
                  window: {
                    end: spanned.span.end,
                    start: spanned.span.start,
                  },
                })
              )
            )
          : Result.succeed([])
      )
    );

    return yield* stateLeaf(
      occupancies(
        machine,
        initialState(scene, id, machine),
        Arr.flatten(happenings),
        bounds
      ),
      anchor,
      `Element ${id}`
    );
  });

const elementEdge = (
  world: World,
  index: number,
  anchor: EdgeAnchor,
  id: string
): Found<Leaf> =>
  Result.gen(function* element() {
    const { transition } = anchor;

    if (!isElementEvent(transition)) {
      return yield* Result.fail(`Element ${id} has no ${anchor.transition}`);
    }

    const found = yield* elementSpanOf(world, index, id, transition);

    const spanned = yield* Result.fromNullishOr(
      found,
      () => `Element ${id} has no ${transition} in this Scene`
    );

    return yield* edgeLeaf(spanned, anchor.at);
  });

/** Every instance of effect `id` as an observed run. */
const runsOf = (
  world: World,
  index: number,
  id: string
): Found<readonly { readonly basis: Basis; readonly window: Window }[]> =>
  Result.all(
    Arr.map(instancesOf(world.plan, index, id), (instance) =>
      runOf(world, index, id, instance)
    )
  );

const effectEdge = (
  world: World,
  index: number,
  anchor: EdgeAnchor,
  id: string
): Found<Leaf> =>
  Result.gen(function* effect() {
    const { scene } = yield* sceneAt(world.plan, index);
    const runs = yield* runsOf(world, index, id);

    if (
      anchor.at !== "start" &&
      Arr.some(
        scene.effects,
        (other) => other.id === id && other.verb === "sound"
      )
    ) {
      return yield* Result.fail(
        `${id} is a sound: it has no end; use ${id}.start`
      );
    }

    const events = yield* Result.all(
      Arr.map(runs, ({ window }) => occurrenceAt(linear(window), anchor.at))
    );

    return {
      basis: Arr.some(runs, ({ basis }) => basis === "timeline")
        ? "timeline"
        : "observed",
      event: events,
    } satisfies Leaf;
  });

const edgeOf = (world: World, index: number, anchor: EdgeAnchor): Found<Leaf> =>
  Match.value(anchor.subject).pipe(
    Match.discriminatorsExhaustive("kind")({
      beat: ({ n }) =>
        Result.flatMap(beatOf(world, index, n), (window) =>
          edgeLeaf({ basis: "observed", span: linear(window) }, anchor.at)
        ),
      effect: ({ id }) => effectEdge(world, index, anchor, id),
      element: ({ id }) => elementEdge(world, index, anchor, id),
      scene: () =>
        Result.flatMap(transitionOf(world, index), (spanned) =>
          edgeLeaf(spanned, anchor.at)
        ),
      state: () =>
        Result.fail(`a State holds, it has no transition ${anchor.transition}`),
    })
  );

/** The observed intervals of `machine` for one `happening` over the Scene's observed window. */
const intervalsOf = (
  world: World,
  index: number,
  machine: Machine,
  happening: { readonly name: string; readonly window: Window }
): Found<Intervals> =>
  Result.map(sceneWindowOf(world, index), (bounds) =>
    occupancies(machine, machine.initial, [happening], bounds)
  );

const effectState = (
  world: World,
  index: number,
  anchor: StateAnchor,
  id: string
): Found<Leaf> =>
  Result.gen(function* effect() {
    const machine = yield* machineOf("effect");
    const runs = yield* runsOf(world, index, id);

    const leaves = yield* Result.all(
      Arr.map(runs, ({ window }) =>
        Result.flatMap(
          intervalsOf(world, index, machine, { name: "run", window }),
          (intervals) => stateLeaf(intervals, anchor, `effect ${id}`)
        )
      )
    );

    return {
      basis: Option.match(Arr.head(leaves), {
        onNone: () => "observed" as const,
        onSome: (leaf) => leaf.basis,
      }),
      event: Arr.flatMap(leaves, (leaf) => leaf.event),
    };
  });

const beatState = (
  world: World,
  index: number,
  anchor: StateAnchor,
  n: number
): Found<Leaf> =>
  Result.gen(function* beat() {
    const machine = yield* machineOf("beat");
    const window = yield* beatOf(world, index, n);

    return yield* stateLeaf(
      yield* intervalsOf(world, index, machine, { name: "change", window }),
      anchor,
      `beat(${n})`
    );
  });

const dwellState = (
  world: World,
  index: number,
  anchor: StateAnchor,
  n: number
): Found<Leaf> =>
  Result.map(dwellOf(world, index, n), (window) => ({
    basis: "observed",
    event: once(anchor.event === "enter" ? window.start : window.end, window),
  }));

const sceneState = (
  world: World,
  index: number,
  anchor: StateAnchor
): Found<Leaf> =>
  Result.gen(function* scene() {
    const machine = yield* machineOf("scene");
    const change = yield* transitionOf(world, index);

    return yield* stateLeaf(
      yield* intervalsOf(world, index, machine, {
        name: "transition",
        window: { end: change.span.end, start: change.span.start },
      }),
      anchor,
      "the Scene"
    );
  });

const stateOf = (
  world: World,
  index: number,
  anchor: StateAnchor
): Found<Leaf> =>
  Match.value(anchor.subject).pipe(
    Match.discriminatorsExhaustive("kind")({
      beat: ({ n }) => beatState(world, index, anchor, n),
      effect: ({ id }) => effectState(world, index, anchor, id),
      element: ({ id }) => elementState(world, index, anchor, id),
      scene: () => sceneState(world, index, anchor),
      state: ({ n }) => dwellState(world, index, anchor, n),
    })
  );

/** A word of the narration: the Timeline's frames, since there is nothing in the picture to observe. */
const wordLeaf = (
  plan: TimedPlan,
  index: number,
  anchor: WordAnchor
): Found<Leaf> =>
  Result.gen(function* word() {
    const { scene, timed } = yield* sceneAt(plan, index);
    const at = findPhrase(scene.lines, anchor.phrase)[anchor.occurrence - 1];

    const line = Option.fromNullishOr(at).pipe(
      Option.flatMap((found) => Arr.get(timed.lines, found.line)),
      Option.flatMap((timedLine) =>
        Option.all({
          first: Arr.get(timedLine.words, at?.from ?? -1),
          last: Arr.get(timedLine.words, at?.to ?? -1),
        })
      )
    );

    const words = yield* Result.fromOption(
      line,
      () =>
        `word("${anchor.phrase}", ${anchor.occurrence}) is not in the narration of Scene ${scene.id}`
    );

    return {
      basis: "timeline",
      event: once(
        anchor.edge === "start" ? words.first.startFrame : words.last.endFrame,
        { end: words.last.endFrame, start: words.first.startFrame }
      ),
    } satisfies Leaf;
  });

/** The frames of one source of an expression in Scene `index`, and why they are those frames. */
export const leafOf = (
  world: World,
  index: number,
  anchor: Anchor
): Found<Leaf> =>
  Match.value(anchor).pipe(
    Match.discriminatorsExhaustive("kind")({
      edge: (found) => edgeOf(world, index, found),
      occupancy: (found) => stateOf(world, index, found),
      word: (found) => wordLeaf(world.plan, index, found),
    })
  );

/** The sources of an expression, read from what was observed (`core`'s evaluator supplies the algebra). */
const observedSources = (world: World, index: number): Sources<string> => ({
  anchor: (anchor) =>
    Result.map(leafOf(world, index, anchor), (leaf) => leaf.event),
  emptyWindow: (what) =>
    `${what} needs a window, but the observed event is an instant`,
  frames: (flicks) => framesOfFlicks(rateOf(world.plan.settings), flicks),
  state: (n) => dwellOf(world, index, n),
  unresolved: (message) => message,
});

/** The evaluator of Scene `index`'s expressions over the observed frames: its `let` lines are shared by name. */
export const evaluateObserved = (
  world: World,
  index: number
): Evaluate<string> =>
  evaluator(
    observedSources(world, index),
    new Map(
      Arr.map(
        world.plan.scenes[index]?.events ?? [],
        ({ event, name }): [string, EventExpr] => [name, event]
      )
    )
  );

/** The sources an expression names, a `let` name followed to its own sources, each once and in first-use order. */
export const leavesOf = (scene: Scene, expr: EventExpr): readonly Anchor[] => {
  const seen = new Set<string>();

  const visit = (found: EventExpr, depth: number): readonly Anchor[] => [
    ...anchorsOf(found),
    ...(depth > 10
      ? []
      : Arr.flatMap(refsOf(found), (name) => {
          if (seen.has(name)) {
            return [];
          }

          seen.add(name);

          return Option.match(
            Arr.findFirst(scene.events, (derived) => derived.name === name),
            {
              onNone: () => [],
              onSome: (derived) => visit(derived.event, depth + 1),
            }
          );
        })),
  ];

  return visit(expr, 0);
};

/** What the picture must be asked for the sources of one expression of Scene `index`. */
const subjectsOfAnchor = (
  plan: TimedPlan,
  index: number,
  anchor: Anchor
): readonly Subject[] => {
  if (anchor.kind === "word") {
    return [];
  }

  const { subject } = anchor;

  if (subject.kind === "scene") {
    return [{ kind: "transition", sceneIndex: index }];
  }

  if (subject.kind !== "element") {
    return [];
  }

  const machine = Arr.findFirst(
    machines,
    (candidate) =>
      candidate.subject === "element" &&
      anchor.kind === "occupancy" &&
      Arr.some(candidate.states, (state) => state.name === anchor.state)
  );

  const names: readonly string[] =
    anchor.kind === "edge"
      ? [anchor.transition]
      : Option.match(machine, {
          onNone: () => [],
          onSome: (found) => Arr.map(found.transitions, ({ name }) => name),
        });

  return Arr.flatMap(names, (name) =>
    isElementEvent(name)
      ? Option.toArray(
          Option.fromNullishOr(elementSubject(plan, index, subject.id, name))
        )
      : []
  );
};

/** The slide change into the Scene as a source: `transition.start`. */
const slideStart: EventExpr = {
  anchor: {
    at: "start",
    kind: "edge",
    subject: { kind: "scene" },
    transition: "transition",
  },
  kind: "anchor",
};

/** The event an effect is timed by: its `at` expression, or for an absolute time the slide change plus that time. */
export const whenExpression = (effect: Effect): EventExpr =>
  "absoluteFlicks" in effect.when
    ? {
        kind: "shift",
        of: slideStart,
        offset: { unit: "flicks", value: effect.when.absoluteFlicks },
      }
    : effect.when.event;

/** The expressions of Scene `index` that F1 evaluates: each effect's `at` and `until`, and each `let`. */
const expressionsOf = (scene: Scene): readonly EventExpr[] => [
  ...Arr.map(scene.events, ({ event }) => event),
  ...Arr.flatMap(scene.effects, (effect) => [
    whenExpression(effect),
    ...Option.toArray(Option.fromNullishOr(effect.until?.event)),
  ]),
];

/**
 * What the picture is asked for in Scene `index`: the observed events behind every source its expressions name; and,
 * when an expression reads a state, a `within`, an `until` or an absolute time, the Scene's own slide change and the one
 * after it (the Scene's first and last frame).
 */
export const subjectsOf = (
  plan: TimedPlan,
  index: number
): readonly Subject[] => {
  const scene = plan.scenes[index];

  if (scene === undefined) {
    return [];
  }

  const expressions = expressionsOf(scene);
  const anchors = Arr.flatMap(expressions, anchorsOf);

  const needsBounds =
    Arr.some(anchors, (anchor) => anchor.kind === "occupancy") ||
    Arr.some(expressions, (expr) => statesOf(expr).length > 0) ||
    Arr.some(scene.effects, (effect) => effect.until !== undefined);

  const bounds: readonly Subject[] = needsBounds
    ? Arr.filter(
        [
          { kind: "transition", sceneIndex: index },
          { kind: "transition", sceneIndex: index + 1 },
        ],
        ({ sceneIndex }) => sceneIndex > 0 && sceneIndex < plan.scenes.length
      )
    : [];

  return [
    ...Arr.flatMap(anchors, (anchor) => subjectsOfAnchor(plan, index, anchor)),
    ...bounds,
  ];
};
