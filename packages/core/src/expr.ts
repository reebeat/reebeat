// Event expressions of the effects block (spec 0004), read and written:
//
//   event ::= term [ offset ]
//   term  ::= anchor | name | last(event, ...) | first(event, ...) | each(event, ..., [throttle=d] [stagger=d])
//           | within(event, state(n)) | when(<subject>.<transition>.progress >= N%)
//
// A recursive descent over the text after `at`, `until` or `=`, with positions; every problem is a Plan error that says
// what was found, what was expected and, when one is near, the nearest valid form (spec 0002, F2). The words and the
// units come from `grammar.ts`, the anchors from `anchors.ts`. Plain functions over `Result`.
import {
  Array as Arr,
  Match,
  Option,
  Record,
  Result,
  Schema,
  String as Str,
  pipe,
} from "effect";

import {
  aliasShift,
  formatAnchor,
  readAnchorPath,
  shiftedAlias,
} from "./anchors.ts";
import { planError } from "./errors.ts";
import type { PlanError } from "./errors.ts";
import {
  anchorWords,
  combinatorWords,
  didYouMean,
  durationPattern,
  durationUnits,
  oneOf,
  optionWords,
  percentUnit,
  problem,
  sourceUnits,
  offsetExamples,
  offsetPattern,
  keywords,
  reservedIds,
  retiredCombinators,
} from "./grammar.ts";
import { progressToken } from "./machines.ts";
import { EdgeSchema, edges, idPattern } from "./plan.ts";
import type { Anchor, Duration, EventExpr, Offset } from "./plan.ts";
import { flicksPerSecond } from "./time.ts";

const bad = (line: number, message: string): PlanError =>
  planError("BadEffect", line, message);

/** A value read from `text` and the position after it. */
type Parsed<A> = Result.Result<readonly [A, number], PlanError>;

const isEdge = (found: string): found is (typeof edges)[number] =>
  Arr.contains(edges, found);

const charAt = (text: string, at: number): string =>
  Option.getOrElse(Str.charAt(at)(text), () => "");

const isEdgePoint = Schema.is(EdgeSchema);

/** `value` times `factor`, without the float noise of the product (`0.1 * 1000`). */
const scaled = (value: number, factor: number): number =>
  Number((value * factor).toFixed(6));

const skipSpaces = (text: string, at: number): number => {
  let position = at;

  while (position < text.length && /\s/u.test(charAt(text, position))) {
    position += 1;
  }

  return position;
};

const identifierPattern = new RegExp(Str.slice(0, -1)(idPattern.source), "u");

const wordOf = (text: string, at: number): string =>
  identifierPattern.exec(Str.slice(at)(text))?.[0] ?? "";

const isCall = (text: string, at: number, word: string): boolean =>
  wordOf(text, at) === word && charAt(text, at + word.length) === "(";

/** The offset `+100ms`, `-3f`, `+50%` as the Plan stores it. */
const readOffset = (
  token: string,
  line: number
): Result.Result<Offset, PlanError> => {
  const groups = offsetPattern.exec(token)?.groups;

  if (groups === undefined) {
    return Result.fail(
      bad(
        line,
        problem(
          `"${token}" after the event is not an offset`,
          `an offset such as ${oneOf(offsetExamples)}, "${keywords.until}" or nothing`
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
            ? `offset "${token}" has no unit`
            : `unknown unit "${groups.unit ?? ""}" in offset "${token}"`,
          oneOf(Arr.map(sourceUnits, (known) => known.token)),
          didYouMean(
            groups.unit ?? "",
            Arr.map(sourceUnits, (known) => known.token)
          )
        )
      )
    );
  }

  const magnitude =
    unit.stored === "flicks"
      ? Math.round(scaled(Number(groups.value), unit.factor))
      : scaled(Number(groups.value), unit.factor);

  const signed = groups.sign === "-" ? -magnitude : magnitude;

  if (unit.stored === "f" && !Number.isInteger(signed)) {
    // The nearest whole form rounds the SIGNED value, as the schedule does (halves toward +infinity): -1.5f is -1f.
    const whole = Math.round(signed);

    return Result.fail(
      bad(
        line,
        problem(
          `frame offset "${token}" is not a whole number of frames`,
          "+Nf with an integer N, as +2f (seconds, milliseconds and percents may be decimal)",
          `${whole < 0 ? "-" : "+"}${Math.abs(whole)}f`
        )
      )
    );
  }

  return Result.succeed(
    unit.stored === "percent"
      ? { unit: "percent", value: signed }
      : { unit: unit.stored, value: signed }
  );
};

/** A duration `250ms`, `0.3s`, `6f` (`throttle=` and `stagger=`): a positive length of time. */
const readDuration = (
  token: string,
  line: number,
  option: string
): Result.Result<Duration, PlanError> => {
  const groups = durationPattern.exec(token)?.groups;

  const unit = Option.getOrUndefined(
    Arr.findFirst(
      durationUnits,
      (candidate) => candidate.token === groups?.unit
    )
  );

  if (groups === undefined || unit === undefined) {
    return Result.fail(
      bad(
        line,
        problem(
          `"${token}" after ${option}= is not a duration`,
          `a number and a unit, as ${oneOf(Arr.map(durationUnits, ({ example, token: unitToken }) => `${example}${unitToken}`))}`
        )
      )
    );
  }

  const value =
    unit.stored === "flicks"
      ? Math.round(scaled(Number(groups.value), unit.factor))
      : scaled(Number(groups.value), unit.factor);

  if (value <= 0 || (unit.stored === "f" && !Number.isInteger(value))) {
    return Result.fail(
      bad(
        line,
        problem(
          `"${token}" after ${option}= is not a positive duration (frames are whole numbers)`,
          "a duration longer than zero"
        )
      )
    );
  }

  return Result.succeed({ unit: unit.stored, value });
};

const edgeProblem = (found: string, line: number, what: string): PlanError =>
  bad(
    line,
    problem(
      `unknown edge "${found}" in ${what}`,
      oneOf(edges),
      didYouMean(found, edges)
    )
  );

/** `word("<phrase>"[, <n>]).<edge>` from `at` (which stands on `word`). */
const readWord = (
  text: string,
  at: number,
  line: number
): Parsed<EventExpr> => {
  const pattern = new RegExp(
    String.raw`^${anchorWords.word}\(\s*"(?<phrase>[^"]*)"\s*(?:,\s*(?<n>\d+)\s*)?\)\.(?<edge>[A-Za-z]*)`,
    "u"
  );

  const groups = pattern.exec(Str.slice(at)(text))?.groups;
  const matched = pattern.exec(Str.slice(at)(text))?.[0] ?? "";

  if (groups === undefined) {
    return Result.fail(
      bad(
        line,
        problem(
          `"${pipe(text, Str.slice(at), Str.split(/[\s,)]/u))[0] ?? ""}" is not a word anchor`,
          `${anchorWords.word}("<phrase>"[, <n>]).start or .end`
        )
      )
    );
  }

  const phrase = pipe(
    groups.phrase ?? "",
    Str.replaceAll(/\s+/gu, " "),
    Str.trim
  );

  const occurrence = Number(groups.n ?? "1");
  const edge = groups.edge ?? "";

  if (phrase === "") {
    return Result.fail(
      bad(
        line,
        problem(
          `${anchorWords.word}("") names no word`,
          `a word or phrase of the narration, as ${anchorWords.word}("matches")`
        )
      )
    );
  }

  if (occurrence < 1) {
    return Result.fail(
      bad(
        line,
        problem(
          `${anchorWords.word}("${phrase}", ${occurrence}) counts from 0`,
          "an occurrence number from 1 (the first)"
        )
      )
    );
  }

  if (!isEdge(edge)) {
    return Result.fail(
      edgeProblem(edge, line, `${anchorWords.word}("${phrase}")`)
    );
  }

  return Result.succeed([
    {
      anchor: {
        edge,
        explicit: groups.n !== undefined,
        kind: "word",
        occurrence,
        phrase,
      },
      kind: "anchor",
    },
    at + matched.length,
  ]);
};

/** The characters of a path or a name: it ends at a space, a comma or a closing parenthesis (a Beat's parentheses stay). */
const pathEnd = (text: string, at: number): number => {
  const numbered = new RegExp(
    String.raw`^(?:${anchorWords.beat}|${anchorWords.state})\(\d+\)`,
    "u"
  ).exec(Str.slice(at)(text))?.[0];

  let position = at + (numbered?.length ?? 0);

  while (position < text.length && !/[\s,)]/u.test(charAt(text, position))) {
    position += 1;
  }

  return position;
};

const unreadable = (text: string, at: number, line: number): PlanError =>
  bad(
    line,
    problem(
      at >= text.length
        ? "the event ends too soon"
        : `"${Str.slice(at)(text)}" is not an event`,
      `an anchor, a derived event name, ${oneOf(Record.values(combinatorWords))}(...)`
    )
  );

/** A bare name is a derived event (`let`); the anchor words alone are not names. */
const readName = (
  name: string,
  line: number
): Result.Result<EventExpr, PlanError> =>
  Arr.contains(reservedIds, name)
    ? Result.fail(
        bad(
          line,
          problem(
            `"${name}" alone names no moment`,
            `${name}.<moment> (see the anchor shapes), or the name of a derived event`
          )
        )
      )
    : Result.succeed({ kind: "ref", name });

const readPathTerm = (
  text: string,
  at: number,
  line: number
): Parsed<EventExpr> => {
  const end = pathEnd(text, at);
  const token = Str.slice(at, end)(text);

  if (token === "") {
    return Result.fail(unreadable(text, at, line));
  }

  if (!Str.includes(".")(token) && identifierPattern.test(token)) {
    return Result.map(readName(token, line), (expr) => [expr, end] as const);
  }

  const shift = aliasShift(token);

  return Result.map(
    readAnchorPath(token, line),
    (anchor): readonly [EventExpr, number] => {
      const read: EventExpr = { anchor, kind: "anchor" };

      return [
        shift === 0
          ? read
          : { kind: "shift", of: read, offset: { unit: "f", value: shift } },
        end,
      ];
    }
  );
};

/** What follows a combinator's name and its `(`: the comma separated events, and the options of `each`. */
interface Arguments {
  readonly end: number;
  readonly events: readonly EventExpr[];
  readonly stagger: Duration | undefined;
  readonly throttle: Duration | undefined;
}

const emptyArguments = (end: number): Arguments => ({
  end,
  events: [],
  stagger: undefined,
  throttle: undefined,
});

const closeProblem = (
  text: string,
  at: number,
  line: number,
  name: string
): PlanError =>
  bad(
    line,
    problem(
      at >= text.length
        ? `${name}( is never closed`
        : `"${Str.slice(at)(text)}" inside ${name}(...)`,
      '"," between events and ")" after the last one'
    )
  );

const optionOf = (text: string, at: number): string | undefined =>
  Arr.findFirst(Record.values(optionWords), (word) =>
    Str.startsWith(`${word}=`)(Str.slice(at)(text))
  ).pipe(Option.getOrUndefined);

/** The option-shaped word (`throtle=`) at `at` that is not an option of `each`, if there is one. */
const unknownOption = (text: string, at: number): string | undefined => {
  const word = wordOf(text, at);

  return word !== "" &&
    charAt(text, at + word.length) === "=" &&
    !Arr.contains(Record.values(optionWords), word)
    ? word
    : undefined;
};

/** `throttle=` for `throtle`, when one is near enough. */
const nearOption = (misspelt: string): string | undefined => {
  const near = didYouMean(misspelt, Record.values(optionWords));

  return near === undefined ? undefined : `${near}=`;
};

const optionProblem = (
  line: number,
  found: string,
  expected: string
): PlanError => bad(line, problem(found, expected));

/** The order of an `each`: its events, then `throttle=`, then `stagger=`, each option once. */
const eachOrder = `${combinatorWords.each}(<events>, ${optionWords.throttle}=<duration>, ${optionWords.stagger}=<duration>), each option at most once`;

/** Why an option may not follow what `each` has read so far, or `undefined` when it may. */
const optionRefusal = (
  option: string,
  found: Arguments,
  line: number
): PlanError | undefined => {
  if (
    (option === optionWords.throttle && found.throttle !== undefined) ||
    (option === optionWords.stagger && found.stagger !== undefined)
  ) {
    return optionProblem(
      line,
      `${option}= given twice in ${combinatorWords.each}(...)`,
      eachOrder
    );
  }

  return option === optionWords.throttle && found.stagger !== undefined
    ? optionProblem(
        line,
        `${optionWords.throttle}= after ${optionWords.stagger}= in ${combinatorWords.each}(...)`,
        eachOrder
      )
    : undefined;
};

/** Reads one event; the parser passes `readEvent` down to the readers of the terms that hold events. */
type EventReader = (
  text: string,
  at: number,
  line: number
) => Parsed<EventExpr>;

const readOption = (
  text: string,
  at: number,
  line: number,
  option: string
): Parsed<Duration> => {
  const start = at + option.length + 1;
  const end = pathEnd(text, start);

  return Result.map(
    readDuration(Str.slice(start, end)(text), line, option),
    (duration) => [duration, end] as const
  );
};

/** After an argument: the close of the call, or a comma and the next argument (`more`). */
const afterArgument = (
  text: string,
  at: number,
  line: number,
  name: string,
  found: Arguments,
  more: (position: number, found: Arguments) => Parsed<Arguments>
): Parsed<Arguments> => {
  const position = skipSpaces(text, at);
  const next = charAt(text, position);

  if (next === ")") {
    return Result.succeed([{ ...found, end: position + 1 }, position + 1]);
  }

  return next === ","
    ? more(position + 1, found)
    : Result.fail(closeProblem(text, position, line, name));
};

const nextArgument = (
  text: string,
  at: number,
  line: number,
  name: string,
  found: Arguments,
  read: EventReader
): Parsed<Arguments> => {
  const start = skipSpaces(text, at);

  const option =
    name === combinatorWords.each ? optionOf(text, start) : undefined;

  const more = (position: number, args: Arguments): Parsed<Arguments> =>
    nextArgument(text, position, line, name, args, read);

  const misspelt =
    name === combinatorWords.each ? unknownOption(text, start) : undefined;

  if (misspelt !== undefined) {
    return Result.fail(
      bad(
        line,
        problem(
          `unknown option ${misspelt}= in ${combinatorWords.each}(...)`,
          oneOf(
            Arr.map(Record.values(optionWords), (word) => `${word}=<duration>`)
          ),
          nearOption(misspelt)
        )
      )
    );
  }

  const refused =
    option === undefined ? undefined : optionRefusal(option, found, line);

  if (refused !== undefined) {
    return Result.fail(refused);
  }

  if (option !== undefined) {
    return Result.flatMap(
      readOption(text, start, line, option),
      ([duration, end]) =>
        afterArgument(
          text,
          end,
          line,
          name,
          option === optionWords.throttle
            ? { ...found, throttle: duration }
            : { ...found, stagger: duration },
          more
        )
    );
  }

  return Result.flatMap(read(text, start, line), ([event, end]) =>
    found.throttle !== undefined || found.stagger !== undefined
      ? Result.fail(
          optionProblem(
            line,
            `"${Str.slice(start, end)(text)}" after an option of ${name}(...)`,
            eachOrder
          )
        )
      : afterArgument(
          text,
          end,
          line,
          name,
          { ...found, events: [...found.events, event] },
          more
        )
  );
};

const readArguments = (
  text: string,
  at: number,
  line: number,
  name: string,
  read: EventReader
): Parsed<Arguments> =>
  nextArgument(text, at, line, name, emptyArguments(at), read);

const needsTwo = (
  name: string,
  line: number,
  count: number
): Result.Result<true, PlanError> =>
  count >= 2
    ? Result.succeed(true)
    : Result.fail(
        bad(
          line,
          problem(
            `${name}(...) with ${count} event${count === 1 ? "" : "s"}`,
            `${name}(...) of two or more events, or just the event`
          )
        )
      );

const readGroup = (
  text: string,
  at: number,
  line: number,
  name: "each" | "first" | "last",
  read: EventReader
): Parsed<EventExpr> =>
  Result.flatMap(
    readArguments(text, at + name.length + 1, line, name, read),
    ([parsed, end]) =>
      Result.flatMap(
        needsTwo(name, line, parsed.events.length),
        (): Parsed<EventExpr> => {
          if (name !== combinatorWords.each) {
            return Result.succeed([
              { kind: name, of: parsed.events },
              end,
            ] as const);
          }

          return Result.succeed([
            {
              kind: "each",
              of: parsed.events,
              stagger: parsed.stagger ?? null,
              throttle: parsed.throttle ?? null,
            },
            end,
          ] as const);
        }
      )
  );

const readWithin = (
  text: string,
  at: number,
  line: number,
  read: EventReader
): Parsed<EventExpr> =>
  Result.flatMap(
    read(text, at + combinatorWords.within.length + 1, line),
    ([inner, afterEvent]) => {
      const comma = skipSpaces(text, afterEvent);
      const stateAt = skipSpaces(text, comma + 1);

      const found = new RegExp(
        String.raw`^${anchorWords.state}\((?<n>\d+)\)\s*\)`,
        "u"
      ).exec(Str.slice(stateAt)(text));

      if (charAt(text, comma) !== "," || found?.groups?.n === undefined) {
        const written = /^(?<word>[A-Za-z]+)\((?<n>\d+)\)/u.exec(
          Str.slice(stateAt)(text)
        )?.groups;

        const near =
          written?.word === undefined
            ? undefined
            : didYouMean(written.word, [anchorWords.state]);

        return Result.fail(
          bad(
            line,
            problem(
              written === undefined
                ? `${combinatorWords.within}(...) without its State`
                : `"${written.word}(${written.n ?? ""})" is not a State in ${combinatorWords.within}(...)`,
              `${combinatorWords.within}(<event>, ${anchorWords.state}(<n>))`,
              near === undefined ? undefined : `${near}(${written?.n ?? "<n>"})`
            )
          )
        );
      }

      return Result.succeed([
        { kind: "within", of: inner, state: Number(found.groups.n) },
        stateAt + found[0].length,
      ] as const);
    }
  );

const whenPattern = new RegExp(
  String.raw`^${combinatorWords.when}\(\s*(?<path>(?:[A-Za-z]+\(\d+\))?[^\s>()]*)\s*>=\s*(?<value>\d+(?:\.\d+)?)\s*${percentUnit.token}\s*\)`,
  "u"
);

/** The threshold written with `progress` spelt right, when the last word of the path is near it. */
const nearProgress = (
  path: string,
  value: string | undefined
): string | undefined => {
  const words = Str.split(path, ".");
  const last = words.at(-1) ?? "";
  const near = didYouMean(last, [progressToken]);

  return near === undefined || value === undefined || words.length < 2
    ? undefined
    : `${combinatorWords.when}(${Arr.join([...Arr.dropRight(words, 1), near], ".")} >= ${value}${percentUnit.token})`;
};

const readWhen = (
  text: string,
  at: number,
  line: number
): Parsed<EventExpr> => {
  const found = whenPattern.exec(Str.slice(at)(text));
  const path = found?.groups?.path ?? "";
  const value = Number(found?.groups?.value ?? "NaN");

  if (found === null || !Str.endsWith(`.${progressToken}`)(path)) {
    return Result.fail(
      bad(
        line,
        problem(
          `"${pipe(text, Str.slice(at), Str.split(")"))[0] ?? ""})" is not a progress threshold`,
          `${combinatorWords.when}(<subject>.<transition>.${progressToken} >= <N>${percentUnit.token})`,
          nearProgress(path, found?.groups?.value)
        )
      )
    );
  }

  if (value > 100) {
    return Result.fail(
      bad(
        line,
        problem(
          `${value}${percentUnit.token} in ${combinatorWords.when}(...) is more than a whole transition`,
          "a percent from 0 to 100"
        )
      )
    );
  }

  return Result.map(
    readAnchorPath(path, line, true),
    (anchor) =>
      [
        {
          anchor:
            anchor.kind === "edge"
              ? { ...anchor, at: { percent: value } }
              : anchor,
          kind: "anchor",
        } satisfies EventExpr,
        at + found[0].length,
      ] as const
  );
};

const unknownCall = (name: string, line: number): PlanError =>
  bad(
    line,
    problem(
      `unknown combinator "${name}"`,
      oneOf(Record.values(combinatorWords)),
      Option.getOrUndefined(
        Option.orElse(Record.get(retiredCombinators, name), () =>
          Option.fromNullishOr(didYouMean(name, Record.values(combinatorWords)))
        )
      )
    )
  );

const readTerm = (
  text: string,
  at: number,
  line: number,
  read: EventReader
): Parsed<EventExpr> => {
  const name = wordOf(text, at);
  const call = charAt(text, at + name.length) === "(";

  if (isCall(text, at, anchorWords.word)) {
    return readWord(text, at, line);
  }

  if (isCall(text, at, combinatorWords.last)) {
    return readGroup(text, at, line, combinatorWords.last, read);
  }

  if (isCall(text, at, combinatorWords.first)) {
    return readGroup(text, at, line, combinatorWords.first, read);
  }

  if (isCall(text, at, combinatorWords.each)) {
    return readGroup(text, at, line, combinatorWords.each, read);
  }

  if (isCall(text, at, combinatorWords.within)) {
    return readWithin(text, at, line, read);
  }

  if (isCall(text, at, combinatorWords.when)) {
    return readWhen(text, at, line);
  }

  return call && name !== anchorWords.beat && name !== anchorWords.state
    ? Result.fail(unknownCall(name, line))
    : readPathTerm(text, at, line);
};

/** `term [ offset ]`: an offset is a sign, a number and a unit after a space. */
const readEvent: EventReader = (text, at, line) =>
  Result.flatMap(
    readTerm(text, skipSpaces(text, at), line, readEvent),
    ([term, end]) => {
      const start = skipSpaces(text, end);

      if (charAt(text, start) !== "+" && charAt(text, start) !== "-") {
        return Result.succeed([term, end] as const);
      }

      const stop = pathEnd(text, start);

      return Result.map(
        readOffset(Str.slice(start, stop)(text), line),
        (offset) =>
          [
            { kind: "shift", of: term, offset } satisfies EventExpr,
            stop,
          ] as const
      );
    }
  );

/** An event, and what follows it. The text it was written as is not kept: `formatEvent` writes it back. */
export interface ReadEvent {
  readonly event: EventExpr;
  /** The index in `text` after the event and the spaces after it. */
  readonly rest: number;
}

/** Reads the event at the start of `text`; what follows is for the caller (`until`, or nothing). */
export const readEventPrefix = (
  text: string,
  line: number
): Result.Result<ReadEvent, PlanError> =>
  Result.map(readEvent(text, 0, line), ([event, end]) => ({
    event,
    rest: skipSpaces(text, end),
  }));

/** Flicks as the source writes them: whole seconds, whole milliseconds, or decimal seconds. */
const formatFlicks = (flicks: number): string => {
  if (flicks % flicksPerSecond === 0) {
    return `${flicks / flicksPerSecond}s`;
  }

  return flicks % (flicksPerSecond / 1000) === 0
    ? `${flicks / (flicksPerSecond / 1000)}ms`
    : `${flicks / flicksPerSecond}s`;
};

/** `+100ms`, `-3f`, `+50%`: an offset as it is written (a time in the whole unit that holds it, else decimal seconds). */
const formatOffset = (offset: Offset): string => {
  const sign = offset.value < 0 ? "-" : "+";

  if (offset.unit === "percent") {
    return `${sign}${Math.abs(offset.value)}${percentUnit.token}`;
  }

  return offset.unit === "f"
    ? `${sign}${Math.abs(offset.value)}f`
    : `${sign}${formatFlicks(Math.abs(offset.value))}`;
};

const formatDuration = (duration: Duration): string =>
  duration.unit === "f" ? `${duration.value}f` : formatFlicks(duration.value);

const formatAnchorEvent = (anchor: Anchor): string => {
  if (anchor.kind === "edge" && !isEdgePoint(anchor.at)) {
    const base = formatAnchor({ ...anchor, at: edges[0] });

    return `${combinatorWords.when}(${Str.slice(0, base.length - edges[0].length)(base)}${progressToken} >= ${anchor.at.percent}${percentUnit.token})`;
  }

  return formatAnchor(anchor);
};

/** An offset after its event; an anchor moved by the frames an alias declares is written as that alias (`scene.end`). */
const formatShift = (
  of: EventExpr,
  offset: Offset,
  format: (expr: EventExpr) => string
): string => {
  const alias =
    of.kind === "anchor" && offset.unit === "f"
      ? shiftedAlias(of.anchor, offset.value)
      : undefined;

  return alias ?? `${format(of)} ${formatOffset(offset)}`;
};

const formatGroup = (
  name: string,
  of: readonly EventExpr[],
  format: (expr: EventExpr) => string
): string => `${name}(${Arr.join(Arr.map(of, format), ", ")})`;

/**
 * The event in its canonical form: a percent of a transition is the threshold `when(<path>.progress >= N%)`, every
 * combinator is written as a call, an offset follows its event.
 */
export const formatEvent = (expr: EventExpr): string =>
  Match.value(expr).pipe(
    Match.discriminatorsExhaustive("kind")({
      anchor: (found) => formatAnchorEvent(found.anchor),
      each: (found) =>
        `${combinatorWords.each}(${Arr.join(
          [
            ...Arr.map(found.of, formatEvent),
            ...(found.throttle === null
              ? []
              : [`${optionWords.throttle}=${formatDuration(found.throttle)}`]),
            ...(found.stagger === null
              ? []
              : [`${optionWords.stagger}=${formatDuration(found.stagger)}`]),
          ],
          ", "
        )})`,
      first: (found) =>
        formatGroup(combinatorWords.first, found.of, formatEvent),
      last: (found) => formatGroup(combinatorWords.last, found.of, formatEvent),
      ref: (found) => found.name,
      shift: (found) => formatShift(found.of, found.offset, formatEvent),
      within: (found) =>
        `${combinatorWords.within}(${formatEvent(found.of)}, ${anchorWords.state}(${found.state}))`,
    })
  );
