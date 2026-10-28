import { Schema } from "effect";

// The expected failures that belong to the CLI itself. Failures of the pipeline stages keep their own tagged errors
// (`@reebeat/core`, `@reebeat/speech`, `@reebeat/deck`, `@reebeat/video`) and surface unchanged.

/** The `.fountain` file cannot be read or is not valid UTF-8. */
export class SourceUnreadable extends Schema.TaggedError<
  SourceUnreadable,
  { readonly brand: unique symbol }
>()("SourceUnreadable", {
  cause: Schema.Defect(),
  message: Schema.String,
  path: Schema.String,
}) {}

/** `--out` names a directory that is neither empty nor an earlier build, so the build will not replace it. */
export class OutputDirOccupied extends Schema.TaggedError<
  OutputDirOccupied,
  { readonly brand: unique symbol }
>()("OutputDirOccupied", { message: Schema.String, path: Schema.String }) {}

/** The directory is not a finished build: `build.json` is missing, unreadable or names a file that is absent. */
export class NotABuild extends Schema.TaggedError<
  NotABuild,
  { readonly brand: unique symbol }
>()("NotABuild", { dir: Schema.String, message: Schema.String }) {}

/** Writing, moving or removing a file of the build failed. */
class BuildOutputFailed extends Schema.TaggedError<
  BuildOutputFailed,
  { readonly brand: unique symbol }
>()("BuildOutputFailed", {
  cause: Schema.Defect(),
  message: Schema.String,
  path: Schema.String,
}) {}

/** The `cause` handler of an effect that writes, moves or removes `path`: `what` completes "cannot ...". */
export const outputFailed = (path: string, what: string) => (cause: unknown) =>
  new BuildOutputFailed({
    cause,
    message: `cannot ${what} ${path}: ${cause instanceof Error ? cause.message : String(cause)}`,
    path,
  });

/** At least one verdict is not ok (`check`, `journey`). */
export class ChecksFailed extends Schema.TaggedError<
  ChecksFailed,
  { readonly brand: unique symbol }
>()("ChecksFailed", {
  failed: Schema.Array(Schema.String),
  message: Schema.String,
}) {}
