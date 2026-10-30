import { Schema } from "effect";

// The expected failures of the lifecycle tools (spec 0016). Each says what was asked and what is wrong; a tool returns
// one as a result with `isError: true`, encoded with its tag, never as a protocol error. None carries a foreign cause: a
// cause can hold a path or a stack, so the layer that met it logs it (to the operator) and fails with these fields
// only. One file holds the closed set.

/** No project has this id in the workspace. */
export class ProjectNotFound extends Schema.TaggedError<
  ProjectNotFound,
  { readonly brand: unique symbol }
>()("ProjectNotFound", {
  message: Schema.String,
  project: Schema.String,
}) {}

/** The project has no build (of this id), or its build cannot answer what was asked. */
export class BuildNotFound extends Schema.TaggedError<
  BuildNotFound,
  { readonly brand: unique symbol }
>()("BuildNotFound", {
  message: Schema.String,
  project: Schema.String,
}) {}

/** A revision other than the head was asked for: this slice keeps no history, so only the head can be read. */
export class Stale extends Schema.TaggedError<
  Stale,
  { readonly brand: unique symbol }
>()("Stale", {
  head: Schema.String,
  message: Schema.String,
  requested: Schema.String,
}) {}

/** The arguments are well formed but not answerable: a reversed range, a missing field of one kind. */
export class Invalid extends Schema.TaggedError<
  Invalid,
  { readonly brand: unique symbol }
>()("Invalid", {
  message: Schema.String,
}) {}

/** The Screenplay does not import: the first error the Fountain importer found, with its line. */
export class StoryInvalid extends Schema.TaggedError<
  StoryInvalid,
  { readonly brand: unique symbol }
>()("StoryInvalid", {
  line: Schema.optionalKey(Schema.Int),
  message: Schema.String,
  project: Schema.String,
}) {}

/** The file system refused: a path outside the workspace, a symbolic link, or a file that cannot be read or decoded. */
export class Unreadable extends Schema.TaggedError<
  Unreadable,
  { readonly brand: unique symbol }
>()("Unreadable", {
  message: Schema.String,
  project: Schema.String,
}) {}

/** A tool of the observer failed (ffmpeg, ffprobe), or the artifact has nothing at the asked place. */
export class ObserveFailed extends Schema.TaggedError<
  ObserveFailed,
  { readonly brand: unique symbol }
>()("ObserveFailed", {
  message: Schema.String,
}) {}

/** Every failure a tool of the read-only inspector can declare. */
export type ToolFailure =
  | BuildNotFound
  | Invalid
  | ObserveFailed
  | ProjectNotFound
  | Stale
  | StoryInvalid
  | Unreadable;
