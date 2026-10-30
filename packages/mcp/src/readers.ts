// What more than one tool needs from the services: the head check, the build of a project, the Plan of a build.
import { decodePlan, requireTimeline } from "@tsukuri/core";
import { BuildNotFound, Projects, Stale, Unreadable } from "@tsukuri/lifecycle";
import type { BuildRecord, ProjectHead, ProjectId } from "@tsukuri/lifecycle";
import { Effect, Option } from "effect";

export const count = (n: number, noun: string): string =>
  `${n} ${noun}${n === 1 ? "" : "s"}`;

/** Only the head can be read: a revision that is not it is `Stale`. */
const requireHead = (head: ProjectHead, revision: string | undefined) =>
  revision === undefined || revision === head.revision
    ? Effect.succeed(head)
    : Effect.fail(
        new Stale({
          head: head.revision,
          message: `only the head revision ${head.revision} can be read; ${revision} is not it`,
          requested: revision,
        })
      );

/** The Screenplay of a project at its head, after checking the revision the caller names (only the head can be read). */
export const headStory = (project: ProjectId, revision: string | undefined) =>
  Effect.gen(function* headOfStory() {
    const projects = yield* Projects;
    const story = yield* projects.story(project);

    yield* requireHead(story.head, revision);

    return story;
  });

/** The build of a project, or none. */
export const buildOf = (project: ProjectId) =>
  Effect.gen(function* buildOfProject() {
    const projects = yield* Projects;

    return Option.getOrUndefined(yield* projects.build(project));
  });

/** The build of a project, `BuildNotFound` when there is none or when `wanted` names another. */
export const requireBuild = (project: ProjectId, wanted?: string) =>
  Effect.gen(function* requireProjectBuild() {
    const record = yield* buildOf(project);

    if (record === undefined) {
      return yield* new BuildNotFound({
        message: `${project} has no build in the builds directory: a person makes one with tsukuri build`,
        project,
      });
    }

    if (wanted !== undefined && wanted !== record.id) {
      return yield* new BuildNotFound({
        message: `${project} has no build ${wanted}; its build is ${record.id}`,
        project,
      });
    }

    return record;
  });

/** The `plan.json` of a build, decoded, with its Timeline. */
export const timedPlanOf = (project: ProjectId, record: BuildRecord) =>
  Effect.gen(function* timed() {
    const projects = yield* Projects;
    const text = yield* projects.buildText(project, record.id, "plan");

    const plan = yield* decodePlan(text).pipe(
      Effect.mapError(
        () =>
          new Unreadable({
            message: `${project}: plan.json is not a Plan`,
            project,
          })
      )
    );

    return yield* Effect.fromResult(requireTimeline(plan)).pipe(
      Effect.mapError(
        () =>
          new Unreadable({
            message: `${project}: plan.json has no usable Timeline`,
            project,
          })
      )
    );
  });
