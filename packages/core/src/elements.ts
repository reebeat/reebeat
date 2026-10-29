// One Action line is one Element: `text {#id @cell .class hidden}`. A plain function: it returns the Element
// (when its `#id` is known) and every problem found on the line.
import { Array as Arr, Schema } from "effect";

import { planError } from "./errors.ts";
import type { PlanError } from "./errors.ts";
import {
  CellSchema,
  ElementClassSchema,
  cells,
  elementClasses,
} from "./plan.ts";
import type { Element } from "./plan.ts";

/** The identifiers Elements and Cue targets share: a letter, then letters, digits, `_` and `-`. */
export const idPattern = /^[A-Za-z][A-Za-z0-9_-]*$/u;

const attributeBlock = /^(?<text>.*?)\s*\{(?<attributes>[^{}]*)\}\s*$/u;

const isCell = Schema.is(CellSchema);

const isClass = Schema.is(ElementClassSchema);

interface Attributes {
  cell: Element["cell"] | undefined;
  classes: Element["classes"][number][];
  readonly errors: PlanError[];
  hidden: boolean;
  id: string | undefined;
}

const unsupported = (line: number, message: string): PlanError =>
  planError("UnsupportedElement", line, message);

const unknownAttribute = (word: string): string =>
  `unknown Element attribute "${word}": use #id, @${Arr.join(cells, "|@")}, .${Arr.join(elementClasses, "|.")} or hidden`;

/** Applies one `{...}` word to the attributes collected so far. */
const applyAttribute = (
  attributes: Attributes,
  word: string,
  line: number
): void => {
  const value = word.slice(1);

  if (word === "hidden") {
    attributes.hidden = true;
  } else if (word.startsWith("#") && idPattern.test(value)) {
    if (attributes.id !== undefined) {
      attributes.errors.push(unsupported(line, "an Element has one #id"));
    }

    attributes.id = value;
  } else if (word.startsWith("@") && isCell(value)) {
    if (attributes.cell !== undefined) {
      attributes.errors.push(unsupported(line, "an Element has one @cell"));
    }

    attributes.cell = value;
  } else if (word.startsWith(".") && isClass(value)) {
    attributes.classes.push(value);
  } else {
    attributes.errors.push(unsupported(line, unknownAttribute(word)));
  }
};

export interface ParsedElement {
  /** Absent when the line has no usable `#id`. */
  readonly element: Element | undefined;
  readonly errors: readonly PlanError[];
}

/** Parses one non-empty line of an Action block; `line` is its 1-based source line. */
export const parseElementLine = (raw: string, line: number): ParsedElement => {
  const trimmed = raw.trim();
  const match = attributeBlock.exec(trimmed);
  const text = match?.groups?.text ?? trimmed;
  const errors: PlanError[] = [];

  const attributes: Attributes = {
    cell: undefined,
    classes: [],
    errors,
    hidden: false,
    id: undefined,
  };

  if (trimmed.includes("[[")) {
    errors.push(
      unsupported(
        line,
        "a Cue [[...]] belongs in NARRATOR dialogue, not in an Element"
      )
    );
  }

  for (const word of (match?.groups?.attributes ?? "").split(/\s+/u)) {
    if (word !== "") {
      applyAttribute(attributes, word, line);
    }
  }

  if (attributes.id === undefined) {
    errors.push(
      planError(
        "MissingId",
        line,
        `Element "${text}" has no #id: write "text {#id}"`
      )
    );

    return { element: undefined, errors };
  }

  return {
    element: {
      cell: attributes.cell ?? "mc",
      classes: attributes.classes,
      hidden: attributes.hidden,
      id: attributes.id,
      line,
      text,
    },
    errors,
  };
};
