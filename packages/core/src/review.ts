// The review text of `reebeat plan` (design 4.0, modelled on `terraform plan`): per Scene its Elements with `+`
// (enter), `-` (exit) and `~` (update) across `> AUTO-ANIMATE` boundaries, its derived events (`let`) and its effects
// as `intent -> frame` (specs 0002 and 0004; with the Timeline: every instance, its time in seconds at the Plan's
// rate, what ended each window), its Lines, and one summary line. Deterministic: the same Plan gives the same text.
// A plain function.
import { Array as Arr, Match, Option, String as Str } from "effect";

import { formatTiming } from "./effects.ts";
import { formatEvent } from "./expr.ts";
import { placedLines } from "./lines.ts";
import type { PlacedLine } from "./lines.ts";
import type {
  Effect,
  Element,
  Identity,
  Line,
  PlanJson,
  Scene,
  TimedEffect,
  TimedLine,
  TimedScene,
} from "./plan.ts";
import { soundsOf } from "./steps.ts";
import type { Carrier } from "./steps.ts";
import { rateOf } from "./time.ts";

export interface ReviewOptions {
  /** Adds frames and seconds from the Timeline (`reebeat plan --timing`). */
  readonly timing?: boolean;
}

const verbWidth = "update".length;

// A minimum id column, so adding an Element with a short id re-aligns no other row of the golden text.
const minimumIdWidth = 12;

const quote = (text: string): string => JSON.stringify(text);

const describe = (element: Element): string =>
  Arr.join(
    [
      `@${element.cell}`,
      `.${element.class}`,
      ...(element.visible ? [] : ["hidden"]),
      quote(element.text),
    ],
    " "
  );

const changeText = (
  change: Identity["update"][number]["changes"][number],
  before: Element,
  after: Element
): string => {
  if (change === "cell") {
    return `cell ${before.cell}→${after.cell}`;
  }

  if (change === "class") {
    return `class ${before.class}→${after.class}`;
  }

  return `text ${quote(before.text)}→${quote(after.text)}`;
};

const elementRow = (
  mark: string,
  id: string,
  verb: string,
  rest: string,
  idWidth: number
): string =>
  `      ${mark} ${Str.padEnd(idWidth)(id)}  ${Str.padEnd(verbWidth)(verb)}  ${rest}`;

const widest = (ids: readonly string[]): number =>
  Arr.reduce(ids, minimumIdWidth, (width, id) => Math.max(width, id.length));

const byId = (elements: readonly Element[]): ReadonlyMap<string, Element> =>
  new Map(Arr.map(elements, (element) => [element.id, element]));

const described = (
  elements: ReadonlyMap<string, Element>,
  id: string
): string =>
  Option.match(Option.fromNullishOr(elements.get(id)), {
    onNone: () => "",
    onSome: describe,
  });

/** The Element rows of a Scene joined to the previous one by `> AUTO-ANIMATE`: exit, update, same, enter. */
const diffRows = (
  scene: Scene,
  previous: Scene,
  identity: Identity
): readonly string[] => {
  const before = byId(previous.elements);
  const after = byId(scene.elements);

  const width = widest([
    ...identity.exit,
    ...Arr.map(identity.update, (change) => change.id),
    ...identity.same,
    ...identity.enter,
  ]);

  return [
    ...Arr.map(identity.exit, (id) =>
      elementRow("-", id, "exit", described(before, id), width)
    ),
    ...Arr.map(identity.update, ({ changes, id }) => {
      const earlier = before.get(id);
      const later = after.get(id);

      const text =
        earlier === undefined || later === undefined
          ? ""
          : Arr.join(
              Arr.map(changes, (change) => changeText(change, earlier, later)),
              ", "
            );

      return elementRow("~", id, "update", text, width);
    }),
    ...Arr.map(identity.same, (id) =>
      elementRow(" ", id, "same", described(after, id), width)
    ),
    ...Arr.map(identity.enter, (id) =>
      elementRow("+", id, "enter", described(after, id), width)
    ),
  ];
};

const elementRows = (
  scene: Scene,
  previous: Scene | undefined
): readonly string[] => {
  if (scene.identity !== null && previous !== undefined) {
    return diffRows(scene, previous, scene.identity);
  }

  const width = widest(Arr.map(scene.elements, (element) => element.id));

  return Arr.map(scene.elements, (element) =>
    elementRow(" ", element.id, "show", describe(element), width)
  );
};

const hintText = (plan: PlanJson, line: Line): string => {
  const parts = [
    ...(line.hints.speed === plan.settings.speed
      ? []
      : [`speed ${line.hints.speed}`]),
    ...(line.hints.pauseBefore === 0
      ? []
      : [`pause ${line.hints.pauseBefore} s`]),
  ];

  return parts.length === 0 ? "" : `  (${Arr.join(parts, ", ")})`;
};

const seconds = (plan: PlanJson, frames: number): string => {
  const { den, num } = rateOf(plan.settings);

  return ((frames * den) / num).toFixed(2);
};

const span = (plan: PlanJson, from: number, to: number): string =>
  `frames ${from}-${to} (${seconds(plan, from)}-${seconds(plan, to)} s)`;

const timedLineRows = (
  plan: PlanJson,
  timed: TimedLine | undefined
): readonly string[] =>
  timed === undefined
    ? []
    : [`        ${span(plan, timed.startFrame, timed.endFrame)}`];

const lineRows = (
  plan: PlanJson,
  { id, line }: PlacedLine,
  timed: TimedLine | undefined
): readonly string[] => [
  `      ${id}${hintText(plan, line)}`,
  `        ${quote(line.text)}`,
  ...timedLineRows(plan, timed),
];

/** What an effect does, as the review prints it: `sound whoosh`, `show note`. */
const doing = (effect: Effect): string =>
  `${effect.verb} ${effect.name ?? effect.target ?? ""}`;

/** Where the Deck plays a sound (`soundsOf`, the one rule the Deck and the check share), as the row says it. */
const carrierText = (carrier: Carrier): string =>
  Match.value(carrier).pipe(
    Match.discriminatorsExhaustive("kind")({
      alone: () => "plays alone",
      slide: () => "rides the slide",
      step: (found) => `rides step ${found.effectId}`,
    })
  );

/** How the window of an effect ended (`TimedEffect.endedBy`), as the row says it. */
const endedByText: Readonly<
  Record<NonNullable<TimedEffect["endedBy"]>, string>
> = {
  replaced: "by the next focus",
  "slide-change": "interrupted by the slide change",
  until: "by until",
  window: "by its window",
};

/** `frame 66 (2.20 s)`: a frame and its time at the Plan's rate. */
const frameText = (plan: PlanJson, frame: number): string =>
  `frame ${frame} (${seconds(plan, frame)} s)`;

/** The frames an event resolved to: one, several (`frames 10, 20 (0.33, 0.67 s)`), or none. */
const framesText = (plan: PlanJson, frames: readonly number[]): string => {
  const [only] = frames;

  if (only === undefined) {
    return "no occurrence";
  }

  return frames.length === 1
    ? frameText(plan, only)
    : `frames ${Arr.join(
        Arr.map(frames, (frame) => `${frame}`),
        ", "
      )} (${Arr.join(
        Arr.map(frames, (frame) => seconds(plan, frame)),
        ", "
      )} s)`;
};

/** One row of the Effects list: an effect, or one instance of it (an `each` makes several). */
interface EffectRow {
  readonly effect: Effect;
  readonly instance: TimedEffect | undefined;
  readonly label: string;
}

const effectRowsOf = (
  scene: Scene,
  timed: TimedScene | undefined
): readonly EffectRow[] =>
  Arr.flatMap(scene.effects, (effect): readonly EffectRow[] => {
    const instances = Arr.filter(
      timed?.effects ?? [],
      (candidate) => candidate.effectId === effect.id
    );

    return Arr.isReadonlyArrayNonEmpty(instances)
      ? Arr.map(instances, (instance) => ({
          effect,
          instance,
          label:
            instances.length > 1
              ? `${effect.id}#${instance.instance}`
              : effect.id,
        }))
      : [{ effect, instance: undefined, label: effect.id }];
  });

/** What ended the window of an instance: its end frame and how, on a row of its own. */
const endRows = (
  plan: PlanJson,
  instance: TimedEffect | undefined
): readonly string[] =>
  instance === undefined ||
  instance.endFrame === null ||
  instance.endedBy === null
    ? []
    : [
        `        ends ${frameText(plan, instance.endFrame)}, ${endedByText[instance.endedBy]}`,
      ];

const instanceKey = (effectId: string, instance: TimedEffect | undefined) =>
  `${effectId}#${instance?.instance ?? 1}`;

/**
 * One row per effect instance: `s1  sound whoosh  one.move.start  ->  frame 732 (24.40 s)` (the frame and its time once
 * the Timeline exists; `s1#2` is the second instance of an effect whose event happens several times), the canonical
 * form beside what was written when they differ, for a sound where the Deck plays it (`(rides the slide)`,
 * `(rides step r1)` or `(plays alone)`), and for an effect with a window a row that says where it ended and what ended
 * it (`until`, the slide change, or its own window). The carrier needs the resolved times (the nearest step before a
 * word), so it is printed with the frames only.
 */
const effectRows = (
  plan: PlanJson,
  scene: Scene,
  timed: TimedScene | undefined
): readonly string[] => {
  const rows = effectRowsOf(scene, timed);

  const idWidth = Arr.reduce(rows, 2, (width, { label }) =>
    Math.max(width, label.length)
  );

  const doingWidth = Arr.reduce(rows, 0, (width, { effect }) =>
    Math.max(width, doing(effect).length)
  );

  const carriers = new Map(
    timed === undefined
      ? []
      : Arr.map(
          soundsOf(plan, scene),
          ({ carrier, effect, timed: instance }): [string, string] => [
            instanceKey(effect.id, instance),
            carrierText(carrier),
          ]
        )
  );

  return Arr.flatMap(rows, ({ effect, instance, label }) => {
    const carrier = carriers.get(instanceKey(effect.id, instance));
    const when = `${Str.padEnd(doingWidth)(doing(effect))}  ${formatTiming(effect)}`;

    const frame =
      instance === undefined
        ? ""
        : `  ->  ${frameText(plan, instance.fireFrame)}`;

    return [
      `      ${Str.padEnd(idWidth)(label)}  ${when}${frame}${carrier === undefined ? "" : `  (${carrier})`}`,
      ...endRows(plan, instance),
    ];
  });
};

/** One row per derived event (`let`): what was written, its canonical form, and the frames it resolved to. */
const eventRows = (
  plan: PlanJson,
  scene: Scene,
  timed: TimedScene | undefined
): readonly string[] => {
  const width = Arr.reduce(scene.events, 2, (longest, { name }) =>
    Math.max(longest, name.length)
  );

  return Arr.map(scene.events, (derived) => {
    const found = Option.getOrUndefined(
      Arr.findFirst(
        timed?.events ?? [],
        (candidate) => candidate.name === derived.name
      )
    );

    const frames =
      found === undefined ? "" : `  ->  ${framesText(plan, found.frames)}`;

    return `      ${Str.padEnd(width)(derived.name)}  ${formatEvent(derived.event)}${frames}`;
  });
};

const sceneRows = (
  plan: PlanJson,
  scene: Scene,
  previous: Scene | undefined,
  timed: TimedScene | undefined
): readonly string[] => {
  const into =
    scene.identity === null || previous === undefined
      ? scene.transition
      : `${scene.transition} from ${previous.id}`;

  return [
    `  Scene ${scene.id}  ${scene.heading}  (line ${scene.line}, transition: ${into})`,
    ...(timed === undefined
      ? []
      : [
          `    slide change at frame ${timed.slideFrame}, ${span(plan, timed.slideFrame, timed.endFrame)}`,
        ]),
    "    Elements",
    ...elementRows(scene, previous),
    ...(scene.events.length === 0
      ? []
      : ["    Events", ...eventRows(plan, scene, timed)]),
    ...(scene.effects.length === 0
      ? []
      : ["    Effects", ...effectRows(plan, scene, timed)]),
    "    Lines",
    ...Arr.flatMap(placedLines(scene), (placed) =>
      lineRows(plan, placed, timed?.lines[placed.position - 1])
    ),
  ];
};

/** Every absolute time of the Plan, with the Scene, the effect and the reason that was written. */
const absoluteRows = (plan: PlanJson): readonly string[] =>
  Arr.flatMap(plan.scenes, (scene) =>
    Arr.flatMap(scene.effects, (effect) =>
      "absoluteFlicks" in effect.when
        ? [
            `  ${scene.id} ${effect.id} (line ${effect.line}): at ${formatTiming(effect)}`,
          ]
        : []
    )
  );

const summary = (plan: PlanJson): string => {
  const identities = Arr.flatMap(plan.scenes, (scene) =>
    scene.identity === null ? [] : [scene.identity]
  );

  const count = (pick: (identity: Identity) => number): number =>
    Arr.reduce(identities, 0, (total, identity) => total + pick(identity));

  const lines = Arr.reduce(
    plan.scenes,
    0,
    (total, scene) => total + scene.lines.length
  );

  const effects = Arr.reduce(
    plan.scenes,
    0,
    (total, scene) => total + scene.effects.length
  );

  const enter = count((identity) => identity.enter.length);
  const exit = count((identity) => identity.exit.length);
  const update = count((identity) => identity.update.length);

  return `Plan: ${plan.scenes.length} scenes, ${lines} lines, ${effects} effects; ${enter} to enter, ${exit} to exit, ${update} to update`;
};

const absoluteSummary = (plan: PlanJson): readonly string[] => {
  const rows = absoluteRows(plan);

  return [
    ...rows,
    `${rows.length} absolute time${rows.length === 1 ? "" : "s"}`,
  ];
};

const timingSummary = (plan: PlanJson): string =>
  plan.timeline === undefined
    ? "Timeline: none yet (it is added by build, once speech has aligned the Lines)"
    : `Timeline: ${plan.timeline.totalFrames} frames, ${seconds(plan, plan.timeline.totalFrames)} s at ${plan.settings.fps}${plan.settings.ntsc ? " NTSC" : ""} fps`;

const timedScene = (plan: PlanJson, sceneId: string): TimedScene | undefined =>
  Option.getOrUndefined(
    Arr.findFirst(
      plan.timeline?.scenes ?? [],
      (candidate) => candidate.sceneId === sceneId
    )
  );

const chapterRows = (
  plan: PlanJson,
  chapter: PlanJson["chapters"][number],
  timing: boolean
): readonly string[] => [
  "",
  `Chapter ${chapter.id}  ${chapter.title}  (line ${chapter.line})`,
  ...(chapter.synopsis === undefined
    ? []
    : [`  Synopsis: ${chapter.synopsis}`]),
  ...Arr.flatMap(plan.scenes, (scene, index) =>
    scene.chapterId === chapter.id
      ? sceneRows(
          plan,
          scene,
          plan.scenes[index - 1],
          timing ? timedScene(plan, scene.id) : undefined
        )
      : []
  ),
];

/**
 * The review text of a Plan. Scenes list their Elements once, with `+ - ~` marks (and a blank mark for `same`)
 * when they are joined to the previous Scene by `> AUTO-ANIMATE`, then their effects (with frames when `timing` and a
 * Timeline are there). The last line counts the absolute times; each is listed with its reason above it.
 */
export const reviewText = (
  plan: PlanJson,
  options: ReviewOptions = {}
): string => {
  const timing = options.timing === true;

  return Arr.join(
    [
      `Story: ${plan.title}${plan.author === undefined ? "" : ` (${plan.author})`}`,
      `Source: sha256 ${plan.sourceSha256}`,
      `Speech rate: ${plan.settings.speed} (a Line that differs says so)`,
      ...Arr.flatMap(plan.chapters, (chapter) =>
        chapterRows(plan, chapter, timing)
      ),
      "",
      summary(plan),
      ...(timing ? [timingSummary(plan)] : []),
      ...absoluteSummary(plan),
      "",
    ],
    "\n"
  );
};
