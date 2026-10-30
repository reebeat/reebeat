import { Schema } from "effect";

// The expected failures that belong to the CLI itself. Failures of the pipeline stages keep their own tagged errors
// (`@tsukuri/core`, `@tsukuri/services`, `@tsukuri/pipeline`, the adapters) and surface unchanged.

/** `tsukuri.config.json` cannot be read or is not a JSON object. The choices themselves are `UnknownSelection`. */
export class ConfigInvalid extends Schema.TaggedError<
  ConfigInvalid,
  { readonly brand: unique symbol }
>()("ConfigInvalid", {
  cause: Schema.Defect(),
  message: Schema.String,
  path: Schema.String,
}) {}

/** The directory is not a finished build: `build.json` is missing, unreadable or names a file that is absent. */
export class NotABuild extends Schema.TaggedError<
  NotABuild,
  { readonly brand: unique symbol }
>()("NotABuild", { dir: Schema.String, message: Schema.String }) {}

/** At least one verdict fails (`check`, `journey`). */
export class ChecksFailed extends Schema.TaggedError<
  ChecksFailed,
  { readonly brand: unique symbol }
>()("ChecksFailed", {
  failed: Schema.Array(Schema.String),
  message: Schema.String,
}) {}

/** `tsukuri lint` found at least one error in the story. */
export class LintFailed extends Schema.TaggedError<
  LintFailed,
  { readonly brand: unique symbol }
>()("LintFailed", { errors: Schema.Int, message: Schema.String }) {}
