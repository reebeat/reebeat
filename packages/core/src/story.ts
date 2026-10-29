// The adapter from Fountain tokens to the Story: chapters, scenes, Elements, effects and Lines, before the
// cross-checks exist. Everything the vocabulary does not define becomes a Plan error with its line, never a
// silent drop. A plain function.
import { Array as Arr, Option, Result } from "effect";

import { parseEffectLine } from "./effects.ts";
import { parseElementLine } from "./elements.ts";
import { planError } from "./errors.ts";
import type { PlanError } from "./errors.ts";
import { oneOf, problem, reservedIds } from "./grammar.ts";
import { parseNarration } from "./narration.ts";
import type { FountainToken } from "./parse.ts";
import { idPattern } from "./plan.ts";
import type { Effect, Element, Line, Scene } from "./plan.ts";
import {
  defaultSpeed,
  parseSpeed,
  quickFactor,
  scaleSpeed,
  slowFactor,
} from "./speed.ts";

export interface LineDraft {
  readonly line: number;
  readonly text: string;
  readonly words: readonly string[];
  readonly hints: Line["hints"];
}

export interface SceneDraft {
  readonly heading: string;
  /** The author's `#id#` of the heading. */
  readonly id: string;
  readonly line: number;
  readonly transition: Scene["transition"];
  /** Index into `Story.chapters`; -1 for a Scene before any Section. */
  readonly chapterIndex: number;
  readonly effects: Effect[];
  /** The line of the `[[effects` block; none: the Scene has no block yet. */
  effectsLine: number | undefined;
  /** Ids of the effects whose `word(...)` wrote an occurrence number. */
  readonly explicitOccurrences: Set<string>;
  readonly elements: Element[];
  readonly lines: LineDraft[];
}

interface ChapterDraft {
  readonly line: number;
  /** The `= synopsis` lines under the Section, in order. */
  readonly synopsis: string[];
  readonly title: string;
}

export interface Story {
  readonly title: string | undefined;
  readonly author: string | undefined;
  /** The story's default speech rate: `Speed:` of the title page, or `defaultSpeed`. */
  readonly speed: number;
  readonly chapters: readonly ChapterDraft[];
  readonly scenes: readonly SceneDraft[];
  readonly errors: readonly PlanError[];
}

/** `(slowly)` and `(quickly)` are `preset`s: their `value` is a factor of the story default. `(speed N)` is `absolute`. */
type Parenthetical =
  | { readonly kind: "pause"; readonly line: number; readonly value: number }
  | {
      readonly kind: "speed";
      readonly line: number;
      readonly mode: "absolute" | "preset";
      readonly value: number;
    };

interface PendingTransition {
  readonly kind: "auto-animate" | "cut";
  readonly line: number;
}

interface State {
  title: string | undefined;
  author: string | undefined;
  /** The `Speed:` title key and the line it stands on; none: the default. */
  speed: { readonly line: number; readonly value: number } | undefined;
  readonly chapters: ChapterDraft[];
  readonly scenes: SceneDraft[];
  readonly errors: PlanError[];
  transition: PendingTransition | undefined;
  /** Inside a dialogue block: whether its Lines are skipped, and the Parentheticals waiting for dialogue. */
  dialogue: { skip: boolean; pending: Parenthetical[] } | undefined;
}

const pausePattern = /^\(pause\s+(?<seconds>\d+(?:\.\d+)?)\)$/iu;
const slowlyPattern = /^\(slowly\)$/iu;
const quicklyPattern = /^\(quickly\)$/iu;
const speedPattern = /^\(speed\s+(?<value>[^()]*)\)$/iu;

const unsupported = (state: State, line: number, message: string): void => {
  state.errors.push(planError("UnsupportedElement", line, message));
};

const currentScene = (state: State): SceneDraft | undefined =>
  state.scenes.at(-1);

const parseParenthetical = (
  token: FountainToken
): Result.Result<Parenthetical, PlanError> | undefined => {
  const text = token.text.trim();
  const pause = pausePattern.exec(text)?.groups?.seconds;
  const absolute = speedPattern.exec(text)?.groups?.value;
  const { line } = token;

  if (pause !== undefined) {
    return Result.succeed({ kind: "pause", line, value: Number(pause) });
  }

  if (slowlyPattern.test(text)) {
    return Result.succeed({
      kind: "speed",
      line,
      mode: "preset",
      value: slowFactor,
    });
  }

  if (quicklyPattern.test(text)) {
    return Result.succeed({
      kind: "speed",
      line,
      mode: "preset",
      value: quickFactor,
    });
  }

  return absolute === undefined
    ? undefined
    : Result.mapBoth(parseSpeed(absolute), {
        onFailure: (reason) =>
          planError("BadSpeed", line, `${text}: ${reason}`),
        onSuccess: (value): Parenthetical => ({
          kind: "speed",
          line,
          mode: "absolute",
          value,
        }),
      });
};

const speedKey = (state: State, token: FountainToken): void => {
  const parsed = parseSpeed(token.text);

  if (state.speed !== undefined) {
    state.errors.push(
      planError(
        "BadSpeed",
        token.line,
        `Speed: is already set on line ${state.speed.line}`
      )
    );
  } else if (Result.isFailure(parsed)) {
    state.errors.push(
      planError("BadSpeed", token.line, `Speed: ${parsed.failure}`)
    );
  } else {
    state.speed = { line: token.line, value: parsed.success };
  }
};

const titlePageToken = (state: State, token: FountainToken): void => {
  const text = token.text.replaceAll(/\s+/gu, " ").trim();

  if (token.type === "title") {
    state.title = text;
  } else if (token.type === "author" || token.type === "authors") {
    state.author = text;
  } else if (token.type === "speed") {
    speedKey(state, token);
  } else {
    unsupported(
      state,
      token.line,
      `title page key "${token.type}" is not supported: use Title:, Author: and Speed:`
    );
  }
};

const sectionToken = (state: State, token: FountainToken): void => {
  if (token.depth === 1) {
    state.chapters.push({
      line: token.line,
      synopsis: [],
      title: token.text.trim(),
    });
  } else {
    unsupported(
      state,
      token.line,
      "only a single-# Section is supported (one level of chapters)"
    );
  }
};

const synopsisToken = (state: State, token: FountainToken): void => {
  const chapter = state.chapters.at(-1);
  const text = token.text.trim();

  if (chapter === undefined) {
    unsupported(
      state,
      token.line,
      "a synopsis outlines a Section: put it under a # Section"
    );
  } else if (text !== "") {
    chapter.synopsis.push(text);
  }
};

/** The id of a Scene: the `#id#` of its heading, or the generated fallback after the error that says it is missing. */
const sceneIdOf = (state: State, token: FountainToken): string => {
  const fallback = `sc${state.scenes.length + 1}`;
  const heading = token.text.trim();
  const id = token.sceneNumber;

  if (id === "") {
    const written = /#[^#]*#\s*$/u.exec(heading)?.[0];

    state.errors.push(
      planError(
        "BadSceneId",
        token.line,
        written === undefined
          ? problem(
              `Scene heading "${heading}" has no id`,
              'the id between # at the end of the heading, as "INT. THE NEXT SCREEN - DAY #sc4#"',
              `"${heading} #${fallback}#"`
            )
          : problem(
              `"${written.trim()}" is not a Scene id`,
              "an identifier: a letter, then letters, digits, _ and -, between #"
            )
      )
    );
  } else if (!idPattern.test(id) || Arr.contains(reservedIds, id)) {
    state.errors.push(
      planError(
        "BadSceneId",
        token.line,
        problem(
          `Scene id "#${id}#" is not usable`,
          `an identifier (a letter, then letters, digits, _ and -) that is not ${oneOf(reservedIds)}`
        )
      )
    );
  } else if (Arr.some(state.scenes, (scene) => scene.id === id)) {
    state.errors.push(
      planError(
        "DuplicateId",
        token.line,
        problem(
          `Scene id "${id}" is already used`,
          "a different id for each Scene"
        )
      )
    );
  }

  return id === "" ? fallback : id;
};

const headingToken = (state: State, token: FountainToken): void => {
  const pending = state.transition;
  state.transition = undefined;
  const id = sceneIdOf(state, token);

  if (state.chapters.length === 0) {
    state.errors.push(
      planError(
        "SceneBeforeSection",
        token.line,
        "a Scene needs a Section before it: start the story with # Section"
      )
    );
  }

  if (pending?.kind === "auto-animate" && state.scenes.length === 0) {
    state.errors.push(
      planError(
        "BadTransition",
        pending.line,
        "> AUTO-ANIMATE on the first Scene: there is no previous Scene to animate from"
      )
    );
  }

  state.scenes.push({
    chapterIndex: state.chapters.length - 1,
    effects: [],
    effectsLine: undefined,
    elements: [],
    explicitOccurrences: new Set(),
    heading: token.text.trim(),
    id,
    line: token.line,
    lines: [],
    transition: pending?.kind ?? "default",
  });
};

const reservedId = (line: number, what: string, id: string): PlanError =>
  planError(
    "BadProperty",
    line,
    problem(
      `${what} id "${id}" is reserved by the anchor grammar`,
      `an identifier that is not ${oneOf(reservedIds)}`
    )
  );

const elementLine = (
  state: State,
  scene: SceneDraft,
  raw: string,
  line: number
): void => {
  const { element, errors } = parseElementLine(raw, line);
  state.errors.push(...errors);

  if (element === undefined) {
    return;
  }

  const earlier = Arr.findFirst(
    scene.elements,
    (other) => other.id === element.id
  );

  if (Option.isSome(earlier)) {
    state.errors.push(
      planError(
        "DuplicateId",
        line,
        problem(
          `Element id "${element.id}" is already used in this Scene (line ${earlier.value.line})`,
          "a different id for each Element of a Scene"
        )
      )
    );
  } else if (Arr.contains(reservedIds, element.id)) {
    state.errors.push(reservedId(line, "Element", element.id));
  } else {
    scene.elements.push(element);
  }
};

const effectRows = (
  state: State,
  scene: SceneDraft,
  first: number,
  rows: readonly string[]
): void => {
  for (const [index, row] of rows.entries()) {
    const line = first + 1 + index;

    if (row.trim() === "") {
      continue;
    }

    const parsed = parseEffectLine(row, line);

    if (Result.isFailure(parsed)) {
      state.errors.push(parsed.failure);
    } else if (
      Arr.some(scene.effects, (other) => other.id === parsed.success.effect.id)
    ) {
      state.errors.push(
        planError(
          "DuplicateId",
          line,
          problem(
            `effect id "${parsed.success.effect.id}" is already used in this Scene`,
            "a different id for each effect of a Scene"
          )
        )
      );
    } else {
      scene.effects.push(parsed.success.effect);

      if (parsed.success.explicitOccurrence) {
        scene.explicitOccurrences.add(parsed.success.effect.id);
      }
    }
  }
};

/** Reads the lines of an `[[effects ... ]]` block into the Scene's effects. */
const effectsBlock = (
  state: State,
  scene: SceneDraft,
  token: FountainToken
): void => {
  const rows = token.text.split("\n");
  const closed = rows.length > 1 && rows.at(-1)?.trim() === "]]";

  const bad = (message: string): void => {
    state.errors.push(planError("BadEffectsBlock", token.line, message));
  };

  if (scene.effectsLine !== undefined) {
    bad(
      problem(
        `a second [[effects]] block in this Scene (the first is on line ${scene.effectsLine})`,
        "one [[effects]] block per Scene"
      )
    );
  } else if (scene.lines.length > 0) {
    bad(
      problem(
        "an [[effects]] block after the first dialogue",
        "the block before the first NARRATOR line of its Scene"
      )
    );
  } else if (rows[0]?.trim() !== "[[effects") {
    bad(
      problem(
        `"${rows[0]?.trim() ?? ""}" opens an [[effects]] block`,
        '"[[effects" alone on its line, then one effect per line, then "]]" alone on its line'
      )
    );
  } else if (closed) {
    scene.effectsLine = token.line;
    effectRows(state, scene, token.line, rows.slice(1, -1));
  } else {
    bad(
      problem(
        "an [[effects]] block that never closes with ]] on a line of its own",
        'no blank line inside the block, and "]]" alone on its last line'
      )
    );
  }
};

const actionToken = (state: State, token: FountainToken): void => {
  const scene = currentScene(state);

  if (scene === undefined) {
    unsupported(
      state,
      token.line,
      "an Element must be inside a Scene: start one with a scene heading"
    );

    return;
  }

  const rows = token.text.split("\n");

  const opening = Option.getOrElse(
    Arr.findFirstIndex(rows, (row) => row.trim().startsWith("[[effects")),
    () => -1
  );

  for (const [offset, raw] of Arr.take(
    rows,
    opening === -1 ? rows.length : opening
  ).entries()) {
    if (raw.trim() !== "") {
      elementLine(state, scene, raw, token.line + offset);
    }
  }

  if (opening !== -1) {
    effectsBlock(state, scene, {
      ...token,
      line: token.line + opening,
      text: Arr.join(rows.slice(opening), "\n"),
    });
  }
};

const transitionToken = (state: State, token: FountainToken): void => {
  const name = token.text.trim().toUpperCase();

  if (name !== "AUTO-ANIMATE" && name !== "CUT") {
    state.errors.push(
      planError(
        "BadTransition",
        token.line,
        `transition "${token.text.trim()}" is not supported: use > AUTO-ANIMATE or > CUT`
      )
    );
  } else if (state.transition === undefined) {
    state.transition = {
      kind: name === "CUT" ? "cut" : "auto-animate",
      line: token.line,
    };
  } else {
    state.errors.push(
      planError(
        "BadTransition",
        token.line,
        "two transitions in a row: a Scene has one transition into it"
      )
    );
  }
};

/** Folds the Parentheticals before one dialogue paragraph into delivery hints; the speed is resolved here. */
const hintsOf = (
  state: State,
  pending: readonly Parenthetical[]
): Line["hints"] => {
  const base = state.speed?.value ?? defaultSpeed;
  let speed = base;
  let pauseBefore = 0;
  const seen = new Set<string>();

  for (const hint of pending) {
    if (seen.has(hint.kind)) {
      state.errors.push(
        planError(
          "BadParenthetical",
          hint.line,
          `a second ${hint.kind === "speed" ? "speed hint ((speed N), (slowly) or (quickly))" : "(pause N)"} before one Line`
        )
      );
    } else if (hint.kind === "pause") {
      pauseBefore = hint.value;
    } else {
      speed =
        hint.mode === "absolute" ? hint.value : scaleSpeed(base, hint.value);
    }

    seen.add(hint.kind);
  }

  return { pauseBefore, speed };
};

const characterToken = (state: State, token: FountainToken): void => {
  const { dialogue } = state;

  if (dialogue === undefined) {
    return;
  }

  const speaker = token.text.trim();

  if (speaker !== "NARRATOR") {
    dialogue.skip = true;
    unsupported(
      state,
      token.line,
      `character "${speaker}" is not supported: only NARRATOR speaks`
    );
  } else if (currentScene(state) === undefined) {
    dialogue.skip = true;
    unsupported(
      state,
      token.line,
      "dialogue must be inside a Scene: start one with a scene heading"
    );
  }
};

const parentheticalToken = (state: State, token: FountainToken): void => {
  const { dialogue } = state;

  if (dialogue === undefined || dialogue.skip) {
    return;
  }

  const hint = parseParenthetical(token);

  if (hint === undefined) {
    state.errors.push(
      planError(
        "BadParenthetical",
        token.line,
        `parenthetical ${token.text.trim()} is not supported: use (speed N), (slowly), (quickly) or (pause N)`
      )
    );
  } else if (Result.isFailure(hint)) {
    state.errors.push(hint.failure);
  } else {
    dialogue.pending.push(hint.success);
  }
};

const dialogueToken = (state: State, token: FountainToken): void => {
  const { dialogue } = state;
  const scene = currentScene(state);

  if (dialogue === undefined || dialogue.skip || scene === undefined) {
    return;
  }

  const hints = hintsOf(state, dialogue.pending);
  dialogue.pending = [];
  const narration = parseNarration(token.text, token.line);
  state.errors.push(...narration.errors);

  if (narration.text === "") {
    unsupported(
      state,
      token.line,
      "a Line has no narration text: write the words the narrator says"
    );

    return;
  }

  scene.lines.push({
    hints,
    line: token.line,
    text: narration.text,
    words: narration.words,
  });
};

const dialogueEnd = (state: State): void => {
  const first = state.dialogue?.pending[0];

  if (first !== undefined) {
    state.errors.push(
      planError(
        "BadParenthetical",
        first.line,
        "a parenthetical needs dialogue after it"
      )
    );
  }

  state.dialogue = undefined;
};

const unsupportedReason = (type: string): string => {
  switch (type) {
    case "centered": {
      return "centred text is not supported";
    }

    case "dual_dialogue_begin":
    case "dual_dialogue_end": {
      return "dual dialogue is not supported";
    }

    case "lyrics": {
      return "lyrics are not supported";
    }

    case "page_break": {
      return "page breaks are not supported";
    }

    case "note": {
      return "a [[note]] outside an [[effects]] block is not supported: write the block as [[effects NEWLINE <lines> NEWLINE ]]";
    }

    default: {
      return `${type} is not supported`;
    }
  }
};

/** Tokens that may stand between a transition and the scene heading it leads into. */
const passesTransition = (type: string): boolean =>
  type === "scene_heading" ||
  type === "section" ||
  type === "spaces" ||
  type === "synopsis" ||
  type === "transition";

const dispatch = (state: State, token: FountainToken): void => {
  switch (token.type) {
    case "action": {
      actionToken(state, token);
      break;
    }

    case "character": {
      characterToken(state, token);
      break;
    }

    case "dialogue": {
      dialogueToken(state, token);
      break;
    }

    case "dialogue_begin": {
      state.dialogue = { pending: [], skip: false };
      break;
    }

    case "dialogue_end": {
      dialogueEnd(state);
      break;
    }

    case "parenthetical": {
      parentheticalToken(state, token);
      break;
    }

    case "scene_heading": {
      headingToken(state, token);
      break;
    }

    case "section": {
      sectionToken(state, token);
      break;
    }

    case "transition": {
      transitionToken(state, token);
      break;
    }

    case "synopsis": {
      synopsisToken(state, token);
      break;
    }

    case "spaces": {
      break;
    }

    default: {
      unsupported(state, token.line, unsupportedReason(token.type));
    }
  }
};

const walk = (state: State, token: FountainToken): void => {
  if (token.titlePage) {
    titlePageToken(state, token);

    return;
  }

  if (state.transition !== undefined && !passesTransition(token.type)) {
    state.errors.push(
      planError(
        "BadTransition",
        state.transition.line,
        "a transition must lead into a scene heading: put it right before one"
      )
    );
    state.transition = undefined;
  }

  dispatch(state, token);
};

/** Checks that stand after the whole token stream: dangling transition, empty Sections and Scenes. */
const finish = (state: State): void => {
  if (state.transition !== undefined) {
    state.errors.push(
      planError(
        "BadTransition",
        state.transition.line,
        "a transition must lead into a scene heading: this one ends the story"
      )
    );
  }

  for (const [index, chapter] of state.chapters.entries()) {
    if (!Arr.some(state.scenes, (scene) => scene.chapterIndex === index)) {
      unsupported(
        state,
        chapter.line,
        `Section "${chapter.title}" has no Scene`
      );
    }
  }

  for (const scene of state.scenes) {
    if (scene.lines.length === 0) {
      unsupported(
        state,
        scene.line,
        `Scene "${scene.heading}" has no NARRATOR dialogue: a Scene needs at least one Line`
      );
    }
  }
};

/** Adapts the tokens of one Fountain source to the Story. */
export const adaptTokens = (tokens: readonly FountainToken[]): Story => {
  const state: State = {
    author: undefined,
    chapters: [],
    dialogue: undefined,
    errors: [],
    scenes: [],
    speed: undefined,
    title: undefined,
    transition: undefined,
  };

  for (const token of tokens) {
    walk(state, token);
  }

  finish(state);

  return {
    author: state.author,
    chapters: state.chapters,
    errors: state.errors,
    scenes: state.scenes,
    speed: state.speed?.value ?? defaultSpeed,
    title: state.title,
  };
};
