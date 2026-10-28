// The expected failure of the verify stage. A falsifier that does not hold is a Verdict, never an error: this is
// for a build directory that cannot be checked at all.
import { Schema } from "effect";

/** The build directory cannot be checked: a file is missing or unreadable, `build.json` or `plan.json` does not decode, or the Plan has no Timeline. */
export class BuildInvalid extends Schema.TaggedError<
  BuildInvalid,
  { readonly brand: unique symbol }
>()("BuildInvalid", {
  cause: Schema.Defect(),
  message: Schema.String,
  path: Schema.String,
}) {}

/** Everything `runChecks` and `compareBuilds` can fail with. */
export type VerifyError = BuildInvalid;
