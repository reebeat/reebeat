// The cross-checks of one Scene's effects (spec 0002, F2): every reference resolves (Element ids of this Scene, effect
// ids, a `word(...)` phrase that the narration has and that is unambiguous unless `, n` is written), no effect waits
// for itself, percents only on anchors with a window, `show` only on a `visible=false` Element, and every hidden
// Element is shown once. Plain functions over the assembled Scene; each returns its errors in the order found.
import { Array as Arr, Match, Schema } from "effect";

import { formatAnchor } from "./effects.ts";
import { planError } from "./errors.ts";
import type { PlanError } from "./errors.ts";
import { eventKind, hasWindow, showEffectOf } from "./events.ts";
import { didYouMean, oneOf, problem } from "./grammar.ts";
import { effectOf, elementOf } from "./lookup.ts";
import { EdgeSchema } from "./plan.ts";
import type { Anchor, Effect, ElementEvent, Offset, Scene } from "./plan.ts";
import { findPhrase, narrationWords, phraseTokens } from "./words.ts";

const names = (values: readonly string[]): string =>
  values.length === 0 ? "none" : oneOf(values);

/** `did you mean` for an id: the nearest id, written as the author would. */
const nearest = (found: string, known: readonly string[]): string | undefined =>
  didYouMean(found, known);

const elementIds = (scene: Scene): readonly string[] =>
  Arr.map(scene.elements, (element) => element.id);

const unknown = (
  scene: Scene,
  effect: Effect,
  what: string,
  found: string,
  known: readonly string[]
): PlanError =>
  planError(
    "UnknownReference",
    effect.line,
    problem(
      `${what} "${found}" is not in Scene ${scene.id}`,
      names(known),
      nearest(found, known)
    )
  );

/** The Elements `show` and `focus` name, and the rules of `show`. */
const targetErrors = (scene: Scene, effect: Effect): readonly PlanError[] => {
  const { target } = effect;

  if (target === undefined) {
    return [];
  }

  const element = elementOf(scene, target);

  if (element === undefined) {
    return [unknown(scene, effect, "Element", target, elementIds(scene))];
  }

  if (effect.verb === "show" && element.visible) {
    return [
      planError(
        "BadShow",
        effect.line,
        problem(
          `show of Element "${target}", which is visible`,
          `an Element with visible=false (line ${element.line}), or a focus effect`
        )
      ),
    ];
  }

  return [];
};

/** Hidden Elements need exactly one `show`. */
const hiddenErrors = (scene: Scene): readonly PlanError[] =>
  Arr.flatMap(scene.elements, (element) => {
    if (element.visible) {
      return [];
    }

    const shows = Arr.filter(
      scene.effects,
      (effect) => effect.verb === "show" && effect.target === element.id
    );

    if (shows.length === 0) {
      return [
        planError(
          "HiddenNeverRevealed",
          element.line,
          problem(
            `Element "${element.id}" is visible=false and no effect shows it`,
            `a line of the [[effects]] block: r1: show ${element.id} at word("<phrase>").end`
          )
        ),
      ];
    }

    const [first, second] = shows;

    return second === undefined
      ? []
      : [
          planError(
            "BadShow",
            second.line,
            problem(
              `Element "${element.id}" is shown twice (effects ${first?.id ?? ""} and ${second.id})`,
              "one show effect for each visible=false Element"
            )
          ),
        ];
  });

const wordErrors = (
  scene: Scene,
  effect: Effect,
  anchor: Extract<Anchor, { kind: "word" }>,
  explicit: boolean
): readonly PlanError[] => {
  const found = findPhrase(scene.lines, anchor.phrase);
  const text = formatAnchor(anchor);

  if (found.length === 0) {
    const first = phraseTokens(anchor.phrase)[0] ?? anchor.phrase;
    const close = nearest(first, narrationWords(scene.lines));

    return [
      planError(
        "UnknownReference",
        effect.line,
        problem(
          `${text}: the narration of Scene ${scene.id} has no "${anchor.phrase}"`,
          "words that the Lines of this Scene say",
          close === undefined ? undefined : `word("${close.toLowerCase()}")`
        )
      ),
    ];
  }

  if (!explicit && found.length > 1) {
    return [
      planError(
        "AmbiguousWord",
        effect.line,
        problem(
          `word("${anchor.phrase}") occurs ${found.length} times in Scene ${scene.id}`,
          "the occurrence you mean",
          `word("${anchor.phrase}", 1) to word("${anchor.phrase}", ${found.length})`
        )
      ),
    ];
  }

  return anchor.occurrence > found.length
    ? [
        planError(
          "UnknownReference",
          effect.line,
          problem(
            `${text}: occurrence ${anchor.occurrence}, but the phrase occurs ${found.length} time${found.length === 1 ? "" : "s"}`,
            `an occurrence from 1 to ${found.length}`
          )
        ),
      ]
    : [];
};

/** What an Element needs for an event to happen in a Scene that is joined to the previous one by `> AUTO-ANIMATE`. */
const needs: Readonly<Record<ElementEvent, string>> = {
  enter: "an Element that the previous Scene lacks",
  exit: "an Element of the previous Scene that this Scene lacks",
  move: "a cell that differs from the previous Scene",
  update: "a class or text that differs from the previous Scene",
};

const eventsOf = (scene: Scene, id: string): string => {
  const happening = Arr.filter(
    ["enter", "exit", "move", "update"] as const,
    (event) => eventKind(scene, id, event) !== undefined
  );

  return happening.length === 0
    ? "no event in this Scene"
    : Arr.join(happening, ", ");
};

/** Why an Element has no `event` in this Scene: what was found and what was expected. */
const missingEvent = (scene: Scene, id: string, event: ElementEvent) => {
  const element = elementOf(scene, id);

  if (element !== undefined && !element.visible) {
    return {
      expected: `a show effect for ${id} (hidden Elements have enter, from their show effect, and nothing else)`,
      found: `${id}.${event} on Element "${id}", which is visible=false${event === "enter" ? " and has no show effect" : ""}`,
    };
  }

  if (scene.identity === null) {
    return {
      expected:
        "enter (an Element of a Scene that is not > AUTO-ANIMATE only enters with the slide)",
      found: `${id}.${event}: Scene ${scene.id} is not > AUTO-ANIMATE, so Elements only enter`,
    };
  }

  return {
    expected: `${needs[event]} (${id} has ${eventsOf(scene, id)})`,
    found: `Element "${id}" has no ${event} in Scene ${scene.id}`,
  };
};

const elementErrors = (
  scene: Scene,
  effect: Effect,
  anchor: Extract<Anchor, { kind: "element" }>
): readonly PlanError[] => {
  const ids = [...elementIds(scene), ...(scene.identity?.exit ?? [])];

  if (!ids.includes(anchor.id)) {
    return [unknown(scene, effect, "Element", anchor.id, ids)];
  }

  const kind = eventKind(scene, anchor.id, anchor.event);

  if (kind === undefined) {
    const { expected, found } = missingEvent(scene, anchor.id, anchor.event);

    return [planError("NoSuchEvent", effect.line, problem(found, expected))];
  }

  return [];
};

const effectErrors = (
  scene: Scene,
  effect: Effect,
  anchor: Extract<Anchor, { kind: "effect" }>
): readonly PlanError[] =>
  effectOf(scene, anchor.id) === undefined
    ? [
        unknown(
          scene,
          effect,
          "effect",
          anchor.id,
          Arr.map(scene.effects, (other) => other.id)
        ),
      ]
    : [];

/** Whether the anchored event has a window to take a percent of; `undefined` when the anchor fails elsewhere. */
const windowOf = (scene: Scene, anchor: Anchor): boolean | undefined =>
  Match.value(anchor).pipe(
    Match.discriminatorsExhaustive("kind")({
      effect: (found) => {
        const target = effectOf(scene, found.id);

        return target === undefined ? undefined : target.verb === "show";
      },
      element: (found) => {
        const kind = eventKind(scene, found.id, found.event);

        return kind === undefined ? undefined : hasWindow(scene, kind);
      },
      scene: () => false,
      transition: () => scene.transition !== "cut",
      word: () => true,
    })
  );

const percentError = (effect: Effect, text: string, what: string): PlanError =>
  planError(
    "BadPercent",
    effect.line,
    problem(
      `${what} on ${text}, which has no window (it is an instant)`,
      "start or end, or a percent of a move, an update, a show, or the transition of a Scene that is not > CUT"
    )
  );

const isEdge = Schema.is(EdgeSchema);

/** The N of an `N%` point of the anchor, if it has one. */
const pointPercent = (anchor: Anchor): number | undefined => {
  if (anchor.kind !== "transition" && anchor.kind !== "element") {
    return undefined;
  }

  return isEdge(anchor.at) ? undefined : anchor.at.percent;
};

const percentErrors = (
  scene: Scene,
  effect: Effect,
  anchor: Anchor,
  offset: Offset | undefined
): readonly PlanError[] => {
  const text = formatAnchor(anchor);
  const point = pointPercent(anchor);
  const windowed = windowOf(scene, anchor);

  return [
    ...(point !== undefined && windowed === false
      ? [percentError(effect, text, `percent point ${point}%`)]
      : []),
    ...(offset?.unit === "percent" && windowed === false
      ? [percentError(effect, text, `percent offset ${offset.value}%`)]
      : []),
  ];
};

const anchorErrors = (
  scene: Scene,
  effect: Effect,
  explicit: ReadonlySet<string>
): readonly PlanError[] => {
  const { when } = effect;

  if ("absoluteMs" in when) {
    return [];
  }

  const { anchor } = when;

  const own = Match.value(anchor).pipe(
    Match.discriminatorsExhaustive("kind")({
      effect: (found) => effectErrors(scene, effect, found),
      element: (found) => elementErrors(scene, effect, found),
      scene: () => [],
      transition: () => [],
      word: (found) =>
        wordErrors(scene, effect, found, explicit.has(effect.id)),
    })
  );

  return [...own, ...percentErrors(scene, effect, anchor, when.offset)];
};

/** The effects an effect waits for: the effect it anchors to, or the `show` that makes its Element enter. */
const dependencies = (scene: Scene, effect: Effect): readonly string[] => {
  const { when } = effect;

  if ("absoluteMs" in when) {
    return [];
  }

  const { anchor } = when;

  if (anchor.kind === "effect") {
    return [anchor.id];
  }

  if (anchor.kind === "element" && anchor.event === "enter") {
    const shown = showEffectOf(scene, anchor.id);

    return shown === undefined ? [] : [shown.id];
  }

  return [];
};

/** One error per cycle of effects that wait for each other. */
const cycleErrors = (scene: Scene): readonly PlanError[] => {
  const errors: PlanError[] = [];
  const done = new Set<string>();

  const visit = (effect: Effect, path: readonly string[]): void => {
    const at = path.indexOf(effect.id);

    if (at !== -1) {
      const cycle = [...path.slice(at), effect.id];

      const first = Arr.flatMap(cycle, (id) => {
        const found = effectOf(scene, id);

        return found === undefined ? [] : [found];
      });

      const line = Math.min(...Arr.map(first, (other) => other.line));

      errors.push(
        planError(
          "EffectCycle",
          line,
          problem(
            `effects wait for each other: ${Arr.join(cycle, " -> ")}`,
            "a chain that ends at a word, the scene, the transition or an Element event"
          )
        )
      );

      return;
    }

    if (done.has(effect.id)) {
      return;
    }

    for (const id of dependencies(scene, effect)) {
      const next = effectOf(scene, id);

      if (next !== undefined) {
        visit(next, [...path, effect.id]);
      }
    }

    done.add(effect.id);
  };

  for (const effect of scene.effects) {
    visit(effect, []);
  }

  return errors;
};

/**
 * The errors of one Scene's effects. `explicit` holds the ids of the effects whose `word(...)` wrote an occurrence
 * number: only those may name a phrase that occurs more than once.
 */
export const validateScene = (
  scene: Scene,
  explicit: ReadonlySet<string>
): readonly PlanError[] => [
  ...Arr.flatMap(scene.effects, (effect) => [
    ...targetErrors(scene, effect),
    ...anchorErrors(scene, effect, explicit),
  ]),
  ...hiddenErrors(scene),
  ...cycleErrors(scene),
];
