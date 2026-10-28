// The adapter to the verification code. `@reebeat/verify` is built in a parallel branch (spec 0001, M5); until it
// is merged this file is a local stand-in with the signatures that package declares, and it fails loudly with
// "not wired" instead of returning a verdict. At the merge this whole file becomes one re-export:
//
//   export { compareBuilds, renderVerdicts, runChecks } from "@reebeat/verify";
//   export type { Verdict, VerifyError } from "@reebeat/verify";
//
// and `VerifyNotWired` is deleted.
import type { MediaTools } from "@reebeat/video";
import { Array as Arr, Effect } from "effect";
import type { Crypto, FileSystem, Path } from "effect";

import { VerifyNotWired } from "./errors.ts";

export type FalsifierId =
  | "F1"
  | "F2"
  | "F3"
  | "F4"
  | "F5"
  | "F6"
  | "F7"
  | "F8"
  | "F9";

export interface Verdict {
  readonly detail: string;
  readonly id: FalsifierId;
  readonly measured: readonly (readonly [string, string | number])[];
  readonly ok: boolean;
}

export type VerifyError = VerifyNotWired;

/** What the verification needs from the platform. */
export type VerifyServices =
  | Crypto.Crypto
  | FileSystem.FileSystem
  | MediaTools
  | Path.Path;

export const runChecks = (_options: {
  readonly buildDir: string;
  readonly cacheDir?: string;
  readonly sourcePath: string;
}): Effect.Effect<readonly Verdict[], VerifyError, VerifyServices> =>
  Effect.fail(
    new VerifyNotWired({
      message: "not wired: @reebeat/verify is not merged yet (runChecks)",
    })
  );

export const compareBuilds = (
  _dirA: string,
  _dirB: string
): Effect.Effect<Verdict, VerifyError, VerifyServices> =>
  Effect.fail(
    new VerifyNotWired({
      message: "not wired: @reebeat/verify is not merged yet (compareBuilds)",
    })
  );

/** One row per verdict. */
export const renderVerdicts = (verdicts: readonly Verdict[]): string =>
  Arr.join(
    Arr.map(
      verdicts,
      (verdict) =>
        `${verdict.id}  ${verdict.ok ? "ok  " : "FAIL"}  ${verdict.detail}`
    ),
    "\n"
  );
