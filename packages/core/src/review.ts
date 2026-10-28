// The review text of `reebeat plan` (design 4.0, modelled on `terraform plan`): per Scene its Elements with `+`
// (enter), `-` (exit) and `~` (update) across `> AUTO-ANIMATE` boundaries, its Lines with Cue markers, and one
// summary line. Deterministic: the same Plan gives the same text. A plain function.
import { Array as Arr, Option } from "effect";

import type {
  Cue,
  Element,
  Identity,
  Line,
  PlanJson,
  Scene,
  TimedLine,
  TimedScene,
} from "./plan.ts";

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
      ...Arr.map(element.classes, (name) => `.${name}`),
      ...(element.hidden ? ["hidden"] : []),
      quote(element.text),
    ],
    " "
  );

const classesOf = (element: Element): string =>
  element.classes.length === 0 ? "none" : Arr.join(element.classes, " ");

const changeText = (
  change: Identity["update"][number]["changes"][number],
  before: Element,
  after: Element
): string => {
  if (change === "cell") {
    return `cell ${before.cell}→${after.cell}`;
  }

  if (change === "classes") {
    return `classes ${classesOf(before)}→${classesOf(after)}`;
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
  `      ${mark} ${id.padEnd(idWidth)}  ${verb.padEnd(verbWidth)}  ${rest}`;

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

const marker = (cue: Cue): string =>
  `[[${cue.kind}${cue.arg === null ? "" : `: ${cue.arg}`}]]`;

/** The narration with its Cues written back in, after the word each one follows. */
const narrationWithCues = (line: Line): string => {
  const after = (index: number): readonly string[] =>
    Arr.flatMap(line.cues, (cue) =>
      cue.afterWord === index ? [marker(cue)] : []
    );

  return Arr.join(
    [
      ...after(-1),
      ...Arr.flatMap(line.words, (word, index) => [word, ...after(index)]),
    ],
    " "
  );
};

const hintText = (line: Line): string => {
  const parts = [
    ...(line.hints.speed === 1 ? [] : [`speed ${line.hints.speed}`]),
    ...(line.hints.pauseBefore === 0
      ? []
      : [`pause ${line.hints.pauseBefore} s`]),
  ];

  return parts.length === 0 ? "" : `  (${Arr.join(parts, ", ")})`;
};

const seconds = (plan: PlanJson, frames: number): string =>
  (frames / plan.settings.fps).toFixed(2);

const span = (plan: PlanJson, from: number, to: number): string =>
  `frames ${from}-${to} (${seconds(plan, from)}-${seconds(plan, to)} s)`;

const timedLineRows = (
  plan: PlanJson,
  timed: TimedLine | undefined
): readonly string[] =>
  timed === undefined
    ? []
    : [
        `        ${span(plan, timed.startFrame, timed.endFrame)}`,
        ...Arr.map(
          timed.cues,
          (cue) =>
            `        cue ${cue.cueId} fires at frame ${cue.fireFrame}, command at ${cue.commandFrame}`
        ),
      ];

const lineRows = (
  plan: PlanJson,
  line: Line,
  timed: TimedLine | undefined
): readonly string[] => [
  `      ${line.id}${hintText(line)}`,
  `        ${quote(narrationWithCues(line))}`,
  ...timedLineRows(plan, timed),
];

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
    "    Lines",
    ...Arr.flatMap(scene.lines, (line) =>
      lineRows(
        plan,
        line,
        Option.getOrUndefined(
          Arr.findFirst(
            timed?.lines ?? [],
            (candidate) => candidate.lineId === line.id
          )
        )
      )
    ),
  ];
};

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

  const cues = Arr.reduce(
    plan.scenes,
    0,
    (total, scene) =>
      total + Arr.reduce(scene.lines, 0, (sum, line) => sum + line.cues.length)
  );

  const enter = count((identity) => identity.enter.length);
  const exit = count((identity) => identity.exit.length);
  const update = count((identity) => identity.update.length);

  return `Plan: ${plan.scenes.length} scenes, ${lines} lines, ${cues} cues; ${enter} to enter, ${exit} to exit, ${update} to update`;
};

const timingSummary = (plan: PlanJson): string =>
  plan.timeline === undefined
    ? "Timeline: none yet (it is added by build, once speech has aligned the Lines)"
    : `Timeline: ${plan.timeline.totalFrames} frames, ${seconds(plan, plan.timeline.totalFrames)} s at ${plan.settings.fps} fps`;

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
 * when they are joined to the previous Scene by `> AUTO-ANIMATE`. With `timing` and a Timeline it adds frames.
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
      ...Arr.flatMap(plan.chapters, (chapter) =>
        chapterRows(plan, chapter, timing)
      ),
      "",
      summary(plan),
      ...(timing ? [timingSummary(plan)] : []),
      "",
    ],
    "\n"
  );
};
