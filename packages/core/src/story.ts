// The adapter from Fountain tokens to the Story: chapters, scenes, Elements, Lines and Cues, before ids and
// cross-checks exist. Everything the vocabulary does not define becomes a Plan error with its line, never a
// silent drop. A plain function.
import { Array as Arr, Option } from "effect";

import { parseElementLine } from "./elements.ts";
import { planError } from "./errors.ts";
import type { PlanError } from "./errors.ts";
import { parseNarration } from "./narration.ts";
import type { CueDraft } from "./narration.ts";
import type { FountainToken } from "./parse.ts";
import type { Element, Line, Scene } from "./plan.ts";

export interface LineDraft {
  readonly line: number;
  readonly text: string;
  readonly words: readonly string[];
  readonly hints: Line["hints"];
  readonly cues: readonly CueDraft[];
}

export interface SceneDraft {
  readonly heading: string;
  readonly line: number;
  readonly transition: Scene["transition"];
  /** Index into `Story.chapters`; -1 for a Scene before any Section. */
  readonly chapterIndex: number;
  readonly elements: Element[];
  readonly lines: LineDraft[];
}

interface ChapterDraft {
  readonly title: string;
  readonly line: number;
}

export interface Story {
  readonly title: string | undefined;
  readonly author: string | undefined;
  readonly chapters: readonly ChapterDraft[];
  readonly scenes: readonly SceneDraft[];
  readonly errors: readonly PlanError[];
}

interface Parenthetical {
  readonly kind: "speed" | "pause";
  readonly value: number;
  readonly line: number;
}

interface PendingTransition {
  readonly kind: "auto-animate" | "cut";
  readonly line: number;
}

interface State {
  title: string | undefined;
  author: string | undefined;
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

const slowSpeed = 0.9;
const quickSpeed = 1.1;

const unsupported = (state: State, line: number, message: string): void => {
  state.errors.push(planError("UnsupportedElement", line, message));
};

const currentScene = (state: State): SceneDraft | undefined =>
  state.scenes.at(-1);

const parseParenthetical = (
  token: FountainToken
): Parenthetical | undefined => {
  const text = token.text.trim();
  const pause = pausePattern.exec(text)?.groups?.seconds;

  if (pause !== undefined) {
    return { kind: "pause", line: token.line, value: Number(pause) };
  }

  if (slowlyPattern.test(text)) {
    return { kind: "speed", line: token.line, value: slowSpeed };
  }

  if (quicklyPattern.test(text)) {
    return { kind: "speed", line: token.line, value: quickSpeed };
  }

  return undefined;
};

const titlePageToken = (state: State, token: FountainToken): void => {
  const text = token.text.replaceAll(/\s+/gu, " ").trim();

  if (token.type === "title") {
    state.title = text;
  } else if (token.type === "author" || token.type === "authors") {
    state.author = text;
  } else {
    unsupported(
      state,
      token.line,
      `title page key "${token.type}" is not supported: use Title: and Author:`
    );
  }
};

const sectionToken = (state: State, token: FountainToken): void => {
  if (token.depth === 1) {
    state.chapters.push({ line: token.line, title: token.text.trim() });
  } else {
    unsupported(
      state,
      token.line,
      "only a single-# Section is supported (one level of chapters)"
    );
  }
};

const headingToken = (state: State, token: FountainToken): void => {
  const pending = state.transition;
  state.transition = undefined;

  if (token.sceneNumber !== "") {
    unsupported(
      state,
      token.line,
      `scene number #${token.sceneNumber}# is not supported: Scene ids are generated (sc1, sc2, ...)`
    );
  }

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
    elements: [],
    heading: token.text.trim(),
    line: token.line,
    lines: [],
    transition: pending?.kind ?? "default",
  });
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

  for (const [offset, raw] of token.text.split("\n").entries()) {
    if (raw.trim() === "") {
      continue;
    }

    const line = token.line + offset;
    const { element, errors } = parseElementLine(raw, line);
    state.errors.push(...errors);

    if (element === undefined) {
      continue;
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
          `Element #${element.id} is already used in this Scene (line ${earlier.value.line})`
        )
      );
    } else {
      scene.elements.push(element);
    }
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

/** Folds the Parentheticals before one dialogue paragraph into delivery hints. */
const hintsOf = (
  state: State,
  pending: readonly Parenthetical[]
): Line["hints"] => {
  let speed = 1;
  let pauseBefore = 0;
  const seen = new Set<string>();

  for (const hint of pending) {
    if (seen.has(hint.kind)) {
      state.errors.push(
        planError(
          "BadParenthetical",
          hint.line,
          `a second ${hint.kind === "speed" ? "(slowly) or (quickly)" : "(pause N)"} before one Line`
        )
      );
    } else if (hint.kind === "speed") {
      speed = hint.value;
    } else {
      pauseBefore = hint.value;
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
        `parenthetical ${token.text.trim()} is not supported: use (slowly), (quickly) or (pause N)`
      )
    );
  } else {
    dialogue.pending.push(hint);
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
      "a Line has no narration text (only Cues): write the words the narrator says"
    );

    return;
  }

  scene.lines.push({
    cues: narration.cues,
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

    case "note": {
      return "a [[note]] outside dialogue is not supported: Cues belong in NARRATOR dialogue";
    }

    case "page_break": {
      return "page breaks are not supported";
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

    case "spaces":
    case "synopsis": {
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
    title: state.title,
  };
};
