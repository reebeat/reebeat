import { sha256Hex } from "@reebeat/speech";
// The screenplay as the pipeline sees it: its text and the SHA-256 of its bytes. The CLI is the composition root
// that hashes (Effect's `Crypto`, through `sha256Hex`); `buildPlan` copies the hash and computes nothing.
// The file is read as bytes and decoded without removing a byte-order mark, so the hash of the text the core
// receives is the hash of the file's bytes, which is what `reebeat check` compares (F5).
import { Effect, FileSystem, Path } from "effect";

import { SourceUnreadable } from "./errors.ts";

interface Source {
  /** SHA-256 of the file's bytes, lower-case hexadecimal. */
  readonly sha256: string;
  readonly text: string;
}

const unreadable = (path: string, what: string) => (cause: unknown) =>
  new SourceUnreadable({
    cause,
    message: `cannot ${what} ${path}: ${cause instanceof Error ? cause.message : String(cause)}`,
    path,
  });

/** Reads a `.fountain` file. Fails with `SourceUnreadable` when it is missing or not valid UTF-8. */
export const readSource = Effect.fn("readSource")(function* readSource(
  path: string
) {
  const fs = yield* FileSystem.FileSystem;

  const bytes = yield* Effect.mapError(
    fs.readFile(path),
    unreadable(path, "read")
  );

  const text = yield* Effect.try({
    catch: unreadable(path, "decode as UTF-8"),
    try: () =>
      new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes),
  });

  const sha256 = yield* Effect.mapError(
    sha256Hex(bytes),
    unreadable(path, "hash")
  );

  return { sha256, text } satisfies Source;
});

/** The default name of a story's build and of its files: the name of the directory the story lives in. */
export const storyName = Effect.fnUntraced(function* storyName(story: string) {
  const path = yield* Path.Path;

  return path.basename(path.dirname(path.resolve(story)));
});

/** The default speech cache of a story: `speech-cache` beside it. */
export const defaultCache = Effect.fnUntraced(function* defaultCache(
  story: string
) {
  const path = yield* Path.Path;

  return path.join(path.dirname(path.resolve(story)), "speech-cache");
});
