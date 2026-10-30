import { Context } from "effect";
import type { Effect, Option } from "effect";

import type { BuildNotFound, ProjectNotFound, Unreadable } from "./errors.ts";
import type { BuildId, ProjectId } from "./ids.ts";
import type {
  BuildRecord,
  BuildTextName,
  ProjectHead,
  StoryText,
} from "./read.ts";

/**
 * The projects of one workspace, read-only in this slice (spec 0016, Revisions "first slice"). A project is a directory
 * in the workspace root that holds `story.fountain`; its head is what its files say now (there is no history). Its
 * build is the directory `<builds>/<project id>` with a decodable `build.json`, if any. Nothing here takes a path: an
 * id that is not a project is `ProjectNotFound`, and a path that leaves the workspace or is a symbolic link is
 * `Unreadable`, never followed.
 */
export class Projects extends Context.Service<
  Projects,
  {
    /** The build of a project, if it has one: its id, its summary and whether it matches the head. */
    readonly build: (
      project: ProjectId
    ) => Effect.Effect<
      Option.Option<BuildRecord>,
      ProjectNotFound | Unreadable
    >;
    /** The text of the build's `plan.json` or WebVTT file. `BuildNotFound` when the project has no build with that id. */
    readonly buildText: (
      project: ProjectId,
      build: BuildId,
      which: BuildTextName
    ) => Effect.Effect<string, BuildNotFound | ProjectNotFound | Unreadable>;
    /** The head of one project. */
    readonly head: (
      project: ProjectId
    ) => Effect.Effect<ProjectHead, ProjectNotFound | Unreadable>;
    /** Every project of the workspace, ordered by id. */
    readonly list: Effect.Effect<readonly ProjectHead[], Unreadable>;
    /** The Screenplay and its head. */
    readonly story: (
      project: ProjectId
    ) => Effect.Effect<StoryText, ProjectNotFound | Unreadable>;
  }
>()("@tsukuri/lifecycle/Projects") {}
