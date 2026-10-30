// The screenplay as the build program sees it: its text and the SHA-256 of its bytes. `buildPlan` copies the hash
// and computes nothing. The file is read as bytes and decoded without removing a byte-order mark, so the hash of the
// text the core receives is the hash of the file's bytes, which is what `tsukuri check` compares (F5).
import { Effect, FileSystem } from "effect";

import { SourceUnreadable } from "./errors.ts";
import { sha256Hex } from "./hash.ts";

export interface Source {
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

  return { sha256: yield* sha256Hex(bytes), text } satisfies Source;
});
