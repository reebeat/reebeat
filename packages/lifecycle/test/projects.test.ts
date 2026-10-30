import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Effect, Layer } from "effect";

import {
  failedClauseIds,
  projectsClauses,
  registerClauses,
} from "../contract/index.ts";
import type { ProjectsFixture } from "../contract/index.ts";
import { Projects } from "../src/projects.ts";
import { memoryProjects } from "../standins/index.ts";
import {
  alpha,
  alphaBuild,
  alphaHead,
  alphaText,
  beta,
  betaHead,
  betaText,
  gamma,
  otherBuild,
  planText,
  vttText,
} from "./fixtures.ts";

const fixture: ProjectsFixture = {
  absent: gamma,
  bare: { project: beta, text: betaText },
  built: {
    plan: planText,
    project: alpha,
    record: alphaBuild,
    subtitles: vttText,
    text: alphaText,
  },
  otherBuild,
};

const entries = [
  {
    build: { plan: planText, record: alphaBuild, subtitles: vttText },
    head: alphaHead,
    text: alphaText,
  },
  { head: betaHead, text: betaText },
];

registerClauses(
  "memoryProjects",
  memoryProjects(entries),
  projectsClauses(Effect.succeed(fixture))
);

describe("the Projects contract can fail", () => {
  it.effect("a stand-in that lists in the wrong order fails P1 only", () =>
    Effect.gen(function* run() {
      const unsorted = Layer.effect(
        Projects,
        Effect.map(Projects, (projects) =>
          Projects.of({
            ...projects,
            list: Effect.map(projects.list, Arr.reverse),
          })
        )
      ).pipe(Layer.provide(memoryProjects(entries)));

      assert.deepStrictEqual(
        yield* failedClauseIds(
          unsorted,
          projectsClauses(Effect.succeed(fixture))
        ),
        ["P1"]
      );
    })
  );

  it.effect(
    "a stand-in that holds no build for the built project fails P4 and P5",
    () =>
      Effect.gen(function* run() {
        const buildless = memoryProjects([
          { head: alphaHead, text: alphaText },
          { head: betaHead, text: betaText },
        ]);

        const failed = yield* failedClauseIds(
          buildless,
          projectsClauses(Effect.succeed(fixture))
        );

        assert.deepStrictEqual(failed, ["P4", "P5"]);
      })
  );

  it.effect("a stand-in with another Screenplay text fails P3 only", () =>
    Effect.gen(function* run() {
      const edited = memoryProjects([
        {
          build: { plan: planText, record: alphaBuild, subtitles: vttText },
          head: alphaHead,
          text: "changed",
        },
        { head: betaHead, text: betaText },
      ]);

      assert.deepStrictEqual(
        yield* failedClauseIds(
          edited,
          projectsClauses(Effect.succeed(fixture))
        ),
        ["P3"]
      );
    })
  );

  it.effect(
    "a stand-in that also holds the absent project fails P1 and P2",
    () =>
      Effect.gen(function* run() {
        const extra = memoryProjects([
          ...entries,
          { head: { ...betaHead, project: gamma }, text: "" },
        ]);

        assert.deepStrictEqual(
          yield* failedClauseIds(
            extra,
            projectsClauses(Effect.succeed(fixture))
          ),
          ["P1", "P2"]
        );
      })
  );
});
