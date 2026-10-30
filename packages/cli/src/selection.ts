// The selection of adapters (spec 0001, "composable pieces"): `tsukuri.config.json` beside the story, if it has one,
// with the flags on top. Nothing is guessed: an unknown key or value fails `UnknownSelection` naming the key, the value
// and the choices (`decodeSelection`), and a key neither the file nor a flag names takes the local default. Secrets are
// never read here: a credential comes from the environment, inside the adapter that needs it.
import { decodeSelection } from "@tsukuri/services";
import type { SelectionKey } from "@tsukuri/services";
import type { Option } from "effect";
import { Effect, FileSystem, Path, Record, Schema } from "effect";

import { ConfigInvalid } from "./errors.ts";

const configFile = "tsukuri.config.json";

/** What a flag says per key: the adapter's name, or nothing. */
export type SelectionFlags = Readonly<
  Record<SelectionKey, Option.Option<string>>
>;

const configJson = Schema.fromJsonString(
  Schema.Record(Schema.String, Schema.Json)
);

const decodeConfig = Schema.decodeUnknownEffect(configJson);

const invalid = (path: string, what: string) => (cause: unknown) =>
  new ConfigInvalid({
    cause,
    message: `cannot ${what} ${path}: ${cause instanceof Error ? cause.message : String(cause)}`,
    path,
  });

/** The object `tsukuri.config.json` holds beside `story`, or an empty one when the story has no such file. */
const readConfig = Effect.fnUntraced(function* readConfig(story: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const file = path.join(path.dirname(path.resolve(story)), configFile);

  const present = yield* Effect.mapError(
    fs.exists(file),
    invalid(file, "look for")
  );

  if (!present) {
    return {};
  }

  return yield* Effect.flatMap(
    Effect.mapError(fs.readFileString(file), invalid(file, "read")),
    (text) =>
      Effect.mapError(
        decodeConfig(text),
        invalid(file, "decode as a JSON object")
      )
  );
});

/** The selection for `story`: its config file, then `flags` over it, decoded against the registry. */
export const readSelection = Effect.fn("readSelection")(function* readSelection(
  story: string,
  flags: SelectionFlags
) {
  return yield* decodeSelection({
    ...(yield* readConfig(story)),
    ...Record.getSomes(flags),
  });
});
