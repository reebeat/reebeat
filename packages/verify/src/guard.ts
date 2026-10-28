// What a check may need, and the one place where an observation that cannot be made becomes a FAIL verdict.
import type { MediaTools, MediaToolFailed } from "@reebeat/encode-ffmpeg";
import { Effect } from "effect";
import type { Crypto, FileSystem, Path, PlatformError } from "effect";

import { fail } from "./verdict.ts";
import type { FalsifierId, Verdict } from "./verdict.ts";

/** The services the checks run on: the written files, hashing and ffmpeg. */
export type CheckServices =
  | Crypto.Crypto
  | FileSystem.FileSystem
  | MediaTools
  | Path.Path;

/** What an observation of the written files can fail with. */
export type ObservationError = MediaToolFailed | PlatformError.PlatformError;

/**
 * A check whose files cannot be decoded or read does not hold: the verdict is FAIL and names the tool's own message.
 * Only these two failures are recovered; a defect or an interruption still reaches the caller.
 */
export const guarded = <R>(
  id: FalsifierId,
  check: Effect.Effect<Verdict, ObservationError, R>
): Effect.Effect<Verdict, never, R> =>
  Effect.catchTag(check, ["MediaToolFailed", "PlatformError"], (failure) =>
    Effect.succeed(
      fail(id, `the written files cannot be observed: ${failure.message}`)
    )
  );
