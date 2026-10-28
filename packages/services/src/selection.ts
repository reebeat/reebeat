// The ONE registry of choices (spec 0001, design R3): which adapter fills each service. Selection is explicit
// configuration read at the composition root (`reebeat.config.json` or flags); an unknown key or value fails
// naming the key and the choices, and a selected adapter whose requirement is missing fails `AdapterUnavailable`
// when its Layer is built. There is never a fallback to another adapter. Defaults are the local adapters.
import {
  Array as Arr,
  Effect,
  Option,
  Predicate,
  Record,
  Schema,
} from "effect";

import { UnknownSelection } from "./errors.ts";
import { isJsonArray, isJsonObject } from "./json.ts";

/** Every key of a selection and the adapters that may fill it. */
export const choices = {
  aligner: ["whisper", "even"],
  cache: ["fs"],
  capturer: ["chromium"],
  encoder: ["ffmpeg"],
  renderer: ["reveal"],
  sounds: ["synth"],
  speech: ["kokoro", "silent"],
} as const;

/** The adapter chosen when a key is absent: the local one. */
export const defaults = {
  aligner: "whisper",
  cache: "fs",
  capturer: "chromium",
  encoder: "ffmpeg",
  renderer: "reveal",
  sounds: "synth",
  speech: "kokoro",
} as const satisfies {
  readonly [K in keyof typeof choices]: (typeof choices)[K][number];
};

export type SelectionKey = keyof typeof choices;

export const SelectionSchema = Schema.Struct({
  aligner: Schema.Literals(choices.aligner).pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed(defaults.aligner))
  ),
  cache: Schema.Literals(choices.cache).pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed(defaults.cache))
  ),
  capturer: Schema.Literals(choices.capturer).pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed(defaults.capturer))
  ),
  encoder: Schema.Literals(choices.encoder).pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed(defaults.encoder))
  ),
  renderer: Schema.Literals(choices.renderer).pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed(defaults.renderer))
  ),
  sounds: Schema.Literals(choices.sounds).pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed(defaults.sounds))
  ),
  speech: Schema.Literals(choices.speech).pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed(defaults.speech))
  ),
});

export type Selection = typeof SelectionSchema.Type;

const decode = Schema.decodeUnknownEffect(SelectionSchema, {
  onExcessProperty: "error",
});

const keys: readonly string[] = Record.keys(choices);

/** A value as an error shows it: a string as written, an object or array as a placeholder. */
const shown = (value: Schema.Json): string => {
  if (Predicate.isString(value)) {
    return value;
  }

  return isJsonObject(value) || isJsonArray(value) ? "<object>" : String(value);
};

const rejected = (
  key: string,
  value: Schema.Json,
  options: readonly string[],
  message: string
): UnknownSelection =>
  new UnknownSelection({ choices: options, key, message, value: shown(value) });

/** What is wrong with `input`, named as a key, its value and the choices it should have used. */
const diagnose = (input: Schema.Json, detail: string): UnknownSelection => {
  if (!isJsonObject(input)) {
    return rejected(
      "selection",
      input,
      keys,
      `a selection is an object of adapter names (${detail})`
    );
  }

  const unknownKey = Arr.findFirst(
    Record.toEntries(input),
    ([key]) => !Arr.contains(keys, key)
  );

  if (Option.isSome(unknownKey)) {
    const [key, value] = unknownKey.value;

    return rejected(
      key,
      value,
      keys,
      `unknown selection key "${key}"; the keys are ${Arr.join(keys, ", ")}`
    );
  }

  const badValue = Arr.findFirst(
    Record.toEntries(choices),
    ([key, options]) => {
      const names: readonly string[] = options;
      const chosen = input[key];

      return (
        chosen !== undefined &&
        !(Predicate.isString(chosen) && Arr.contains(names, chosen))
      );
    }
  );

  if (Option.isSome(badValue)) {
    const [key, options] = badValue.value;

    return rejected(
      key,
      input[key] ?? null,
      options,
      `unknown adapter for "${key}"; the choices are ${Arr.join(options, ", ")}`
    );
  }

  return rejected("selection", input, keys, detail);
};

/**
 * Decodes a selection (the parsed JSON of `reebeat.config.json`): absent keys take the local default. Fails
 * `UnknownSelection` naming the key, the value and the choices for an unknown key or an unknown value.
 */
export const decodeSelection = (
  input: Schema.Json
): Effect.Effect<Selection, UnknownSelection> =>
  Effect.mapError(decode(input), (issue) => diagnose(input, issue.message));
