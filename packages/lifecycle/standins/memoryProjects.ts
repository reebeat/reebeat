// An in-memory `Projects` for tests: a fixed set of projects, builds and plan texts. It reads no file.
import { Array as Arr, Effect, Layer, Option, Order } from "effect";

import { BuildNotFound, ProjectNotFound } from "../src/errors.ts";
import type { BuildId, ProjectId } from "../src/ids.ts";
import { Projects } from "../src/projects.ts";
import type { BuildRecord, ProjectHead } from "../src/read.ts";

export interface MemoryProject {
  readonly build?: {
    readonly plan: string;
    readonly record: BuildRecord;
    readonly subtitles: string;
  };
  readonly head: ProjectHead;
  readonly text: string;
}

const notFound = (project: ProjectId, build: BuildId) =>
  new BuildNotFound({
    message: `project ${project} has no build ${build}`,
    project,
  });

export const memoryProjects = (
  entries: readonly MemoryProject[]
): Layer.Layer<Projects> => {
  const sorted = Arr.sort(
    entries,
    Order.mapInput(Order.String, (entry: MemoryProject) => entry.head.project)
  );

  const find = (project: ProjectId) =>
    Effect.fromOption(
      Arr.findFirst(sorted, (entry) => entry.head.project === project)
    ).pipe(
      Effect.mapError(
        () =>
          new ProjectNotFound({
            message: `no project ${project} in the workspace`,
            project,
          })
      )
    );

  return Layer.succeed(
    Projects,
    Projects.of({
      build: (project) =>
        Effect.map(find(project), (entry) =>
          Option.fromNullishOr(entry.build?.record)
        ),
      buildText: (project, build, which) =>
        Effect.flatMap(find(project), (entry) =>
          entry.build?.record.id === build
            ? Effect.succeed(
                entry.build[which === "plan" ? "plan" : "subtitles"]
              )
            : Effect.fail(notFound(project, build))
        ),
      head: (project) => Effect.map(find(project), (entry) => entry.head),
      list: Effect.succeed(Arr.map(sorted, (entry) => entry.head)),
      story: (project) =>
        Effect.map(find(project), (entry) => ({
          head: entry.head,
          text: entry.text,
        })),
    })
  );
};
