// F5, confinement (spec 0016): hostile ids and hostile files. No tool input is a path, a link is never followed, a
// file that is not a regular file is not read, and nothing outside the workspace shows up in any result. The workspace
// is a real temporary directory next to a directory the agent must never read, which holds a canary.
import { assert, describe, it } from "@effect/vitest";
import { projectList } from "@tsukuri/lifecycle";
import {
  Array as Arr,
  Effect,
  Exit,
  FileSystem,
  Formatter,
  Path,
  String as Str,
} from "effect";

import { callTool, connectOver, platform, succeeded } from "./support.ts";

const canary = "OUTSIDE-THE-ROOT-CANARY-7c1d";

const hostileIds = [
  "..",
  ".",
  "../outside",
  "../../etc/passwd",
  "/etc/passwd",
  "harbour/../outside",
  "a/b",
  "a\\b",
  "A",
  "Harbour",
  "alpha ",
  " alpha",
  "-alpha",
  "al\u0000pha",
  "alpha\u0000",
  "%2e%2e",
  "%2e%2e%2foutside",
  "ａlpha",
  "ålpha",
  "e\u0301",
  "alpha\n",
  "",
  Str.repeat(64)("a"),
  "~",
  "$HOME",
  "alpha:stream",
  "con",
] as const;

const setup = Effect.gen(function* setupCorpus() {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const base = yield* fs.makeTempDirectoryScoped({
    prefix: "tsukuri-confine-",
  });

  const root = path.join(base, "stories");
  const builds = path.join(base, "build");
  const outside = path.join(base, "outside");

  const write = (file: string, text: string) =>
    Effect.andThen(
      fs.makeDirectory(path.dirname(file), { recursive: true }),
      fs.writeFileString(file, text)
    );

  yield* write(path.join(outside, "story.fountain"), `Title: ${canary}\n`);
  yield* write(path.join(outside, "build.json"), canary);
  yield* write(path.join(root, "alpha", "story.fountain"), "Title: Alpha\n");
  yield* fs.symlink(outside, path.join(root, "evil"));
  yield* write(path.join(root, "linkstory", "x"), "");
  yield* fs.symlink(
    path.join(outside, "story.fountain"),
    path.join(root, "linkstory", "story.fountain")
  );
  yield* fs.makeDirectory(path.join(root, "dirstory", "story.fountain"), {
    recursive: true,
  });
  yield* write(
    path.join(root, "bigstory", "story.fountain"),
    Str.repeat(8 * 1024 * 1024 + 1)("a")
  );
  yield* write(path.join(root, "linkedbuild", "story.fountain"), "Title: L\n");
  yield* fs
    .symlink(outside, path.join(builds, "linkedbuild"))
    .pipe(
      Effect.catch(() =>
        Effect.andThen(
          fs.makeDirectory(builds, { recursive: true }),
          fs.symlink(outside, path.join(builds, "linkedbuild"))
        )
      )
    );
  yield* write(path.join(root, "linkjson", "story.fountain"), "Title: J\n");
  yield* fs.makeDirectory(path.join(builds, "linkjson"), { recursive: true });
  yield* fs.symlink(
    path.join(outside, "build.json"),
    path.join(builds, "linkjson", "build.json")
  );
  yield* write(path.join(root, "badjson", "story.fountain"), "Title: B\n");
  yield* write(
    path.join(builds, "badjson", "build.json"),
    `{"schema":2,"note":"${canary}"}`
  );

  return { builds, root };
}).pipe(Effect.provide(platform));

describe("confinement (F5)", () => {
  it.effect("refuses every hostile id before any file is touched", () =>
    Effect.scoped(
      Effect.gen(function* ids() {
        const workspace = yield* setup;
        const client = yield* connectOver(workspace, "2025-11-25");

        for (const project of hostileIds) {
          for (const name of ["project_get", "story_read", "story_lint"]) {
            const exit = yield* Effect.exit(
              client.callTool({ arguments: { project }, name })
            );

            if (Exit.isSuccess(exit)) {
              assert.isTrue(
                exit.value.isError === true,
                `${name} accepted ${Formatter.formatJson(project)}`
              );
              assert.notInclude(Formatter.formatJson(exit.value), canary);
            }
          }
        }
      })
    )
  );

  it.effect(
    "lists only real projects and never follows a link out of the root",
    () =>
      Effect.scoped(
        Effect.gen(function* listing() {
          const workspace = yield* setup;
          const client = yield* connectOver(workspace, "2025-11-25");

          const listed = yield* callTool(client, projectList, {});
          const rows = yield* succeeded(listed);
          const projects = Arr.map(rows.projects, (row) => row.project);

          assert.deepStrictEqual(projects, [
            "alpha",
            "badjson",
            "linkedbuild",
            "linkjson",
          ]);
          assert.notInclude(Formatter.formatJson(listed.result), canary);
        })
      )
  );

  it.effect(
    "answers a link, a directory and an oversized file with a typed failure and the canary never appears",
    () =>
      Effect.scoped(
        Effect.gen(function* links() {
          const workspace = yield* setup;
          const client = yield* connectOver(workspace, "2025-11-25");

          for (const project of ["evil", "linkstory", "dirstory", "bigstory"]) {
            for (const name of [
              "project_get",
              "story_read",
              "story_lint",
              "plan_get",
              "build_get",
            ]) {
              const result = yield* client.callTool({
                arguments:
                  name === "plan_get"
                    ? { project, view: "review" }
                    : { project },
                name,
              });

              const text = Formatter.formatJson(result);

              assert.isTrue(result.isError === true, `${name} on ${project}`);
              assert.notInclude(text, canary);
              assert.match(
                text,
                /ProjectNotFound|Unreadable/u,
                `${name} on ${project}`
              );
            }
          }
        })
      )
  );

  it.effect(
    "refuses a build that is a link or does not decode, and keeps the project readable",
    () =>
      Effect.scoped(
        Effect.gen(function* builds() {
          const workspace = yield* setup;
          const client = yield* connectOver(workspace, "2025-11-25");

          for (const project of ["linkedbuild", "linkjson", "badjson"]) {
            const result = yield* client.callTool({
              arguments: { project },
              name: "build_get",
            });

            const read = yield* client.callTool({
              arguments: { project },
              name: "story_read",
            });

            assert.isTrue(result.isError === true, project);
            assert.match(Formatter.formatJson(result), /Unreadable/u, project);
            assert.notInclude(Formatter.formatJson(result), canary);
            assert.isTrue(read.isError !== true, `story_read on ${project}`);
          }
        })
      )
  );
});
