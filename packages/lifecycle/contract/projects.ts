// The contract of `Projects` (spec 0016): what every implementation of the read-only workspace keeps, run on the
// in-memory stand-in and, with real files, on the file-system Layer of `@tsukuri/mcp`.
import { assert } from "@effect/vitest";
import { Array as Arr, Effect, Option, Order } from "effect";

import type { BuildId, ProjectId } from "../src/ids.ts";
import { Projects } from "../src/projects.ts";
import type { BuildRecord } from "../src/read.ts";
import type { Clause } from "./clause.ts";

/** What the implementation under test holds: one project with a build, one without, and an id that is no project. */
export interface ProjectsFixture {
  readonly absent: ProjectId;
  readonly bare: { readonly project: ProjectId; readonly text: string };
  readonly built: {
    readonly plan: string;
    readonly project: ProjectId;
    readonly record: BuildRecord;
    readonly subtitles: string;
    readonly text: string;
  };
  readonly otherBuild: BuildId;
}

const expectFailure = <A, E extends { readonly _tag: string }>(
  effect: Effect.Effect<A, E>,
  tag: string
): Effect.Effect<void, A> =>
  Effect.flatMap(Effect.flip(effect), (failure) =>
    Effect.sync(() => {
      assert.strictEqual(failure._tag, tag);
    })
  );

/** The clauses over a fixture the test builds when it runs (real files are made in a temporary directory). */
export const projectsClauses = <R = never>(
  source: Effect.Effect<ProjectsFixture, never, R>
): readonly Clause<unknown, Projects | R>[] => [
  {
    id: "P1",
    means: "list names every project once, ordered by id",
    run: Effect.gen(function* listed() {
      const fixture = yield* source;
      const projects = yield* Projects;
      const heads = yield* projects.list;
      const ids = Arr.map(heads, (head) => head.project);

      assert.deepStrictEqual(ids, Arr.sort(ids, Order.String));
      assert.strictEqual(new Set(ids).size, ids.length);
      assert.isTrue(Arr.contains(ids, fixture.built.project));
      assert.isTrue(Arr.contains(ids, fixture.bare.project));
      assert.isFalse(Arr.contains(ids, fixture.absent));
    }),
  },
  {
    id: "P2",
    means:
      "head agrees with list, and an id that is no project is ProjectNotFound",
    run: Effect.gen(function* heads() {
      const fixture = yield* source;
      const projects = yield* Projects;
      const head = yield* projects.head(fixture.built.project);
      const listed = yield* projects.list;

      assert.deepStrictEqual(
        Arr.findFirst(
          listed,
          (entry) => entry.project === fixture.built.project
        ).pipe(Option.getOrUndefined),
        head
      );
      yield* expectFailure(projects.head(fixture.absent), "ProjectNotFound");
      yield* expectFailure(projects.story(fixture.absent), "ProjectNotFound");
      yield* expectFailure(projects.build(fixture.absent), "ProjectNotFound");
    }),
  },
  {
    id: "P3",
    means:
      "story returns the Screenplay text with the same head, twice the same",
    run: Effect.gen(function* stories() {
      const fixture = yield* source;
      const projects = yield* Projects;
      const first = yield* projects.story(fixture.built.project);
      const second = yield* projects.story(fixture.built.project);

      assert.strictEqual(first.text, fixture.built.text);
      assert.deepStrictEqual(first, second);
      assert.deepStrictEqual(
        first.head,
        yield* projects.head(fixture.built.project)
      );
    }),
  },
  {
    id: "P4",
    means:
      "a project without a build has none; one with a build reports it with whether it matches the head",
    run: Effect.gen(function* builds() {
      const fixture = yield* source;
      const projects = yield* Projects;
      const none = yield* projects.build(fixture.bare.project);
      const some = yield* projects.build(fixture.built.project);

      assert.isTrue(Option.isNone(none));
      assert.isTrue(Option.isSome(some));

      if (Option.isSome(some)) {
        assert.strictEqual(some.value.id, fixture.built.record.id);
        assert.deepStrictEqual(
          some.value.matchesHead,
          fixture.built.record.matchesHead
        );
        assert.deepStrictEqual(
          some.value.summary,
          fixture.built.record.summary
        );
      }
    }),
  },
  {
    id: "P5",
    means:
      "buildText returns the plan.json and the WebVTT text of that build; another build id is BuildNotFound",
    run: Effect.gen(function* texts() {
      const fixture = yield* source;
      const projects = yield* Projects;
      const { project, record } = fixture.built;

      assert.strictEqual(
        yield* projects.buildText(project, record.id, "plan"),
        fixture.built.plan
      );
      assert.strictEqual(
        yield* projects.buildText(project, record.id, "subtitles"),
        fixture.built.subtitles
      );
      yield* expectFailure(
        projects.buildText(project, fixture.otherBuild, "plan"),
        "BuildNotFound"
      );
      yield* expectFailure(
        projects.buildText(fixture.bare.project, fixture.otherBuild, "plan"),
        "BuildNotFound"
      );
    }),
  },
];
