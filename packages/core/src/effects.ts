// One line of an `[[effects]]` block (spec 0002, "plan contract for effects"), read and written:
//
//   <id>: <verb> <argument> at <when>
//
// The vocabulary comes from `plan.ts` and `grammar.ts`; this file owns the shape of the line. Every problem is a Plan
// error with what was found, what was expected and the nearest valid form. Plain functions: no Effect, no service.
import { Array as Arr, Match, Option, Result, Schema } from "effect";

import { planError } from "./errors.ts";
import type { PlanError } from "./errors.ts";
import {
  anchorFormsText,
  didYouMean,
  lineForm,
  oneOf,
  problem,
  reservedIds,
  sourceUnits,
  verbArguments,
} from "./grammar.ts";
import {
  EdgeSchema,
  ElementEventSchema,
  SfxNameSchema,
  VerbSchema,
  WhenSchema,
  edges,
  elementEvents,
  idPattern,
  sfxNames,
  verbs,
} from "./plan.ts";
import type { Anchor, Edge, Effect, Offset, Point, When } from "./plan.ts";

const isEdge = Schema.is(EdgeSchema);
const isEvent = Schema.is(ElementEventSchema);
const isSfx = Schema.is(SfxNameSchema);
const isVerb = Schema.is(VerbSchema);
const decodeWhen = Schema.decodeUnknownResult(WhenSchema);

const linePattern = /^(?<id>[^\s:]+)\s*:\s*(?<rest>.*)$/u;
const bodyPattern = /^(?<verb>\S+)\s+(?<argument>\S+)\s+at\s+(?<when>\S.*)$/u;

const wordPattern =
  /^word\(\s*"(?<phrase>[^"]*)"\s*(?:,\s*(?<n>\d+)\s*)?\)\.(?<edge>[^\s.]+)(?<rest>.*)$/u;

const absolutePattern =
  /^(?<value>\d+(?:\.\d+)?)(?<unit>[A-Za-z]*)(?:\s+because\s+"(?<reason>[^"]*)")?\s*$/u;

const offsetPattern =
  /^(?<sign>[+-])(?<value>\d+(?:\.\d+)?)(?<unit>[A-Za-z%]*)$/u;

const percentPattern = /^(?<value>\d+(?:\.\d+)?)%$/u;

const bad = (line: number, message: string): PlanError =>
  planError("BadEffect", line, message);

const collapse = (text: string): string => text.replaceAll(/\s+/gu, " ").trim();

/** `value` times `factor`, without the float noise of the product (`0.1 * 1000`). */
const scaled = (value: number, factor: number): number =>
  Number((value * factor).toFixed(6));

const edgeProblem = (found: string, line: number, context: string): PlanError =>
  bad(
    line,
    problem(
      `unknown edge "${found}" in ${context}`,
      oneOf(edges),
      didYouMean(found, edges)
    )
  );

const readEdge = (
  found: string,
  line: number,
  context: string
): Result.Result<Edge, PlanError> =>
  isEdge(found)
    ? Result.succeed(found)
    : Result.fail(edgeProblem(found, line, context));

/** `start`, `end` or `N%` of the window of `context`. */
const readPoint = (
  found: string,
  line: number,
  context: string
): Result.Result<Point, PlanError> => {
  const percent = percentPattern.exec(found)?.groups?.value;

  if (percent === undefined) {
    return readEdge(found, line, context);
  }

  const value = Number(percent);

  return value <= 100
    ? Result.succeed({ percent: value })
    : Result.fail(
        planError(
          "BadPercent",
          line,
          problem(
            `${found} in ${context} is more than a whole window`,
            "a percent from 0 to 100"
          )
        )
      );
};

const wordAnchor = (
  groups: Record<string, string | undefined>,
  line: number
): Result.Result<Anchor, PlanError> => {
  const phrase = collapse(groups.phrase ?? "");
  const occurrence = Number(groups.n ?? "1");

  if (phrase === "") {
    return Result.fail(
      bad(
        line,
        problem(
          'word("") names no word',
          'a word or phrase of the narration, as word("matches")'
        )
      )
    );
  }

  if (occurrence < 1) {
    return Result.fail(
      bad(
        line,
        problem(
          `word("${phrase}", ${occurrence}) counts from 0`,
          "an occurrence number from 1 (the first)"
        )
      )
    );
  }

  return Result.map(
    readEdge(groups.edge ?? "", line, `word("${phrase}")`),
    (edge): Anchor => ({
      edge,
      kind: "word",
      occurrence,
      phrase,
    })
  );
};

const eventAnchor = (
  parts: readonly string[],
  line: number,
  text: string
): Result.Result<Anchor, PlanError> => {
  const [id = "", event = "", at = ""] = parts;

  if (!isEvent(event)) {
    return Result.fail(
      bad(
        line,
        problem(
          `unknown event "${event}" in ${text}`,
          oneOf(elementEvents),
          didYouMean(event, elementEvents)
        )
      )
    );
  }

  return Result.map(readPoint(at, line, text), (point): Anchor => ({
    at: point,
    event,
    id,
    kind: "element",
  }));
};

const pathAnchor = (
  text: string,
  line: number
): Result.Result<Anchor, PlanError> => {
  const parts = text.split(".");
  const [first = "", second = ""] = parts;

  if (first === "scene" && parts.length === 2) {
    return Result.map(readEdge(second, line, text), (edge): Anchor => ({
      edge,
      kind: "scene",
    }));
  }

  if (first === "transition" && parts.length === 2) {
    return Result.map(readPoint(second, line, text), (at): Anchor => ({
      at,
      kind: "transition",
    }));
  }

  if (parts.length === 3) {
    return eventAnchor(parts, line, text);
  }

  if (parts.length === 2 && isEvent(second)) {
    return Result.fail(
      bad(
        line,
        problem(
          `${text} names an event but no point of it`,
          `${text}.start, ${text}.end or ${text}.<N>%`
        )
      )
    );
  }

  return parts.length === 2
    ? Result.map(readEdge(second, line, text), (edge): Anchor => ({
        edge,
        id: first,
        kind: "effect",
      }))
    : Result.fail(
        bad(line, problem(`"${text}" is not an anchor`, anchorFormsText))
      );
};

const readOffset = (
  text: string,
  line: number
): Result.Result<readonly Offset[], PlanError> => {
  if (text === "") {
    return Result.succeed([]);
  }

  const groups = offsetPattern.exec(text)?.groups;

  if (groups === undefined) {
    return Result.fail(
      bad(
        line,
        problem(
          `"${text}" after the anchor is not an offset`,
          "an offset such as +0.1s, -200ms, +3f or +50%, or nothing"
        )
      )
    );
  }

  const unit = Option.getOrUndefined(
    Arr.findFirst(sourceUnits, (candidate) => candidate.token === groups.unit)
  );

  if (unit === undefined) {
    return Result.fail(
      bad(
        line,
        problem(
          groups.unit === ""
            ? `offset "${text}" has no unit`
            : `unknown unit "${groups.unit ?? ""}" in offset "${text}"`,
          oneOf(Arr.map(sourceUnits, (known) => known.token)),
          didYouMean(
            groups.unit ?? "",
            Arr.map(sourceUnits, (known) => known.token)
          )
        )
      )
    );
  }

  const value = scaled(Number(groups.value), unit.factor);

  if (unit.stored === "f" && !Number.isInteger(value)) {
    return Result.fail(
      bad(
        line,
        problem(
          `frame offset "${text}" is not a whole number of frames`,
          "+Nf with an integer N, as +2f (seconds, milliseconds and percents may be decimal)",
          `${groups.sign}${Math.round(value)}f`
        )
      )
    );
  }

  const signed = groups.sign === "-" ? -value : value;

  return Result.succeed([
    unit.stored === "percent"
      ? { unit: "percent", value: signed }
      : { unit: unit.stored, value: signed },
  ]);
};

/** `12.5s because "reason"`; `AbsoluteNeedsReason` when the reason is missing (F5). */
const absoluteWhen = (
  text: string,
  line: number
): Result.Result<When, PlanError> => {
  const groups = absolutePattern.exec(text)?.groups;

  if (groups?.unit !== "s") {
    return Result.fail(
      bad(
        line,
        problem(
          `"${text}" is not an absolute time`,
          'an absolute time in seconds with its reason: at 12.5s because "<reason>"'
        )
      )
    );
  }

  const reason = collapse(groups.reason ?? "");

  if (reason === "") {
    return Result.fail(
      planError(
        "AbsoluteNeedsReason",
        line,
        problem(
          `absolute time "${text}" has no reason`,
          `at ${groups.value ?? ""}s because "<why this moment is fixed>"`
        )
      )
    );
  }

  return Result.succeed({
    absoluteMs: Math.round(scaled(Number(groups.value), 1000)),
    reason,
  });
};

/** The anchor and the text after it. */
const splitAnchor = (
  text: string,
  line: number
): Result.Result<{ anchor: Anchor; rest: string }, PlanError> => {
  const word = wordPattern.exec(text)?.groups;

  if (word !== undefined) {
    return Result.map(wordAnchor(word, line), (anchor) => ({
      anchor,
      rest: (word.rest ?? "").trim(),
    }));
  }

  if (text.startsWith("word(")) {
    return Result.fail(
      bad(
        line,
        problem(
          `"${text}" is not a word anchor`,
          'word("<phrase>"[, <n>]).start or .end'
        )
      )
    );
  }

  const [token = "", ...others] = text.split(/\s+/u);

  return Result.map(pathAnchor(token, line), (anchor) => ({
    anchor,
    rest: Arr.join(others, " "),
  }));
};

/** What follows `at`: an absolute time with its reason, or an anchor and an optional offset. */
const parseWhen = (
  text: string,
  line: number
): Result.Result<When, PlanError> => {
  if (/^\d/u.test(text)) {
    return absoluteWhen(text, line);
  }

  return Result.flatMap(splitAnchor(text, line), ({ anchor, rest }) =>
    Result.flatMap(readOffset(rest, line), (offsets) =>
      Result.mapError(
        decodeWhen(
          offsets[0] === undefined ? { anchor } : { anchor, offset: offsets[0] }
        ),
        (failure) =>
          bad(line, problem(`"${text}": ${failure.message}`, anchorFormsText))
      )
    )
  );
};

const readArgument = (
  verb: Effect["verb"],
  argument: string,
  line: number
): Result.Result<Pick<Effect, "name" | "target">, PlanError> => {
  if (verb !== "sound") {
    return idPattern.test(argument)
      ? Result.succeed({ target: argument })
      : Result.fail(
          bad(
            line,
            problem(
              `"${argument}" is not an Element id`,
              verbArguments[verb].argument
            )
          )
        );
  }

  return isSfx(argument)
    ? Result.succeed({ name: argument })
    : Result.fail(
        planError(
          "UnknownSfx",
          line,
          problem(
            `unknown sound "${argument}"`,
            oneOf(sfxNames),
            didYouMean(argument, sfxNames)
          )
        )
      );
};

export interface ParsedEffect {
  readonly effect: Effect;
  /** Whether a `word(...)` of the line wrote its occurrence number (`, 2`): only then may the phrase repeat. */
  readonly explicitOccurrence: boolean;
}

/** Reads one non-empty line of an `[[effects]]` block; `line` is its 1-based source line. */
export const parseEffectLine = (
  raw: string,
  line: number
): Result.Result<ParsedEffect, PlanError> => {
  const text = collapse(raw);
  const head = linePattern.exec(text)?.groups;
  const body = bodyPattern.exec(head?.rest ?? "")?.groups;

  if (head === undefined || body === undefined) {
    return Result.fail(
      bad(line, problem(`"${text}" is not an effect line`, lineForm))
    );
  }

  const id = head.id ?? "";
  const verb = body.verb ?? "";

  if (!idPattern.test(id) || Arr.contains(reservedIds, id)) {
    return Result.fail(
      bad(
        line,
        problem(
          `effect id "${id}" is not usable`,
          `an identifier that is not ${oneOf(reservedIds)}`
        )
      )
    );
  }

  if (!isVerb(verb)) {
    return Result.fail(
      bad(
        line,
        problem(`unknown verb "${verb}"`, oneOf(verbs), didYouMean(verb, verbs))
      )
    );
  }

  return Result.flatMap(
    readArgument(verb, body.argument ?? "", line),
    (argument) => {
      const written = body.when ?? "";

      return Result.map(parseWhen(written, line), (when): ParsedEffect => ({
        effect: { id, line, verb, when, written, ...argument },
        explicitOccurrence: wordPattern.exec(written)?.groups?.n !== undefined,
      }));
    }
  );
};

/** `start`, `end` or `N%`. */
const formatPoint = (point: Point): string =>
  isEdge(point) ? point : `${point.percent}%`;

/** The anchor as written: `one.move.50%`, `word("matches").end`, `transition.start`. */
export const formatAnchor = (anchor: Anchor): string =>
  Match.value(anchor).pipe(
    Match.discriminatorsExhaustive("kind")({
      effect: (found) => `${found.id}.${found.edge}`,
      element: (found) => `${found.id}.${found.event}.${formatPoint(found.at)}`,
      scene: (found) => `scene.${found.edge}`,
      transition: (found) => `transition.${formatPoint(found.at)}`,
      word: (found) =>
        `word("${found.phrase}"${found.occurrence === 1 ? "" : `, ${found.occurrence}`}).${found.edge}`,
    })
  );

/** The effect as one line of an `[[effects]]` block, its `when` as the author wrote it; `parseEffectLine` reads it back. */
export const formatEffect = (effect: Effect): string =>
  `${effect.id}: ${effect.verb} ${effect.name ?? effect.target ?? ""} at ${effect.written}`;
