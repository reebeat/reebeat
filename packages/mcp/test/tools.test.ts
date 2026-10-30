// The eight read-only tools over an in-memory client of the live server (spec 0016), in every protocol era: what each
// returns on a real workspace and a real build, how each fails, and what a result carries besides its JSON. Results are
// decoded with the declarations' own schemas, so a test reads typed values, never raw JSON.
import { assert, describe, it } from "@effect/vitest";
import {
  artifactObserve,
  buildGet,
  docsGet,
  planGet,
  projectGet,
  projectList,
  storyLint,
  storyRead,
  tools as declarations,
} from "@tsukuri/lifecycle";
import {
  Array as Arr,
  Effect,
  Exit,
  Formatter,
  Option,
  String as Str,
} from "effect";

import {
  callTool,
  connect,
  eras,
  failedWith,
  fixtureLayer,
  harbourText,
  succeeded,
  textBlocks,
} from "./support.ts";

const zeros = Str.repeat(64)("0");

describe.each(eras)("the tools in the %s era", (era) => {
  it.layer(fixtureLayer)("on a workspace with a build", (suite) => {
    suite.effect(
      "lists the eight declared tools, each read-only and strict",
      () =>
        Effect.scoped(
          Effect.gen(function* listing() {
            const listed = yield* (yield* connect(era)).listTools();

            assert.deepStrictEqual(
              Arr.map(listed.tools, (tool) => tool.name),
              Arr.map(declarations, (tool) => tool.name)
            );

            for (const tool of listed.tools) {
              assert.deepStrictEqual(
                [
                  tool.annotations?.readOnlyHint,
                  tool.annotations?.destructiveHint,
                  tool.annotations?.idempotentHint,
                  tool.annotations?.openWorldHint,
                ],
                [true, false, true, false]
              );
              assert.strictEqual(
                tool.inputSchema.additionalProperties,
                false,
                tool.name
              );
              assert.isDefined(tool.outputSchema);
            }
          })
        )
    );

    suite.effect(
      "project_list names every project with its stage, and not what is no project",
      () =>
        Effect.scoped(
          Effect.gen(function* list() {
            const client = yield* connect(era);

            const { projects } = yield* succeeded(
              yield* callTool(client, projectList, {})
            );

            assert.deepStrictEqual(
              Arr.map(projects, (row) => [
                row.project,
                row.stage,
                row.hasBuild,
              ]),
              [
                ["badbuild", "planned", false],
                ["broken", "drafted", false],
                ["harbour", "built", true],
                ["nobuild", "drafted", false],
                ["withconfig", "planned", false],
              ]
            );
          })
        )
    );

    suite.effect(
      "project_get says what is allowed and keeps a build of an older Screenplay at planned",
      () =>
        Effect.scoped(
          Effect.gen(function* get() {
            const client = yield* connect(era);

            const harbour = yield* succeeded(
              yield* callTool(client, projectGet, { project: "harbour" })
            );

            const bare = yield* succeeded(
              yield* callTool(client, projectGet, { project: "nobuild" })
            );

            assert.strictEqual(harbour.stage, "built");
            assert.deepStrictEqual(harbour.build?.matchesHead, {
              config: "absent",
              screenplay: true,
            });
            assert.include(harbour.allowed, "artifact_observe");
            assert.notInclude(bare.allowed, "artifact_observe");
            assert.isUndefined(bare.build);
          })
        )
    );

    suite.effect(
      "an unknown project is a result with isError and its tag, never a protocol error",
      () =>
        Effect.scoped(
          Effect.gen(function* missing() {
            const called = yield* callTool(yield* connect(era), projectGet, {
              project: "ghost",
            });

            const failure = yield* failedWith(called);

            assert.isTrue(called.result.isError);
            assert.strictEqual(failure._tag, "ProjectNotFound");
          })
        )
    );

    suite.effect(
      "a malformed request is refused with the problem named: excess and missing properties, a path as an id",
      () =>
        Effect.scoped(
          Effect.gen(function* malformed() {
            const client = yield* connect(era);

            for (const args of [
              { extra: 1, project: "harbour" },
              {},
              { project: "../etc" },
              { project: "/etc/passwd" },
              { project: "harbour/../broken" },
            ]) {
              const refused = yield* Effect.exit(
                client.callTool({ arguments: args, name: "project_get" })
              );

              assert.isTrue(
                Exit.isFailure(refused) ||
                  (Exit.isSuccess(refused) && refused.value.isError === true),
                Formatter.formatJson(args)
              );
            }
          })
        )
    );

    suite.effect(
      "story_read returns the Screenplay in pages and marks its text untrusted by type",
      () =>
        Effect.scoped(
          Effect.gen(function* read() {
            const client = yield* connect(era);

            const whole = yield* succeeded(
              yield* callTool(client, storyRead, { project: "harbour" })
            );

            const part = yield* succeeded(
              yield* callTool(client, storyRead, {
                fromLine: 8,
                project: "harbour",
                toLine: 9,
              })
            );

            const lines = Str.split("\n")(harbourText);

            assert.strictEqual(
              whole.text,
              Arr.join(Arr.take(lines, lines.length - 1), "\n")
            );
            assert.strictEqual(
              part.text,
              Arr.join(Arr.take(Arr.drop(lines, 7), 2), "\n")
            );
            assert.deepStrictEqual([part.fromLine, part.toLine], [8, 9]);
          })
        )
    );

    suite.effect(
      "story_read refuses a reversed range as Invalid and another revision as Stale",
      () =>
        Effect.scoped(
          Effect.gen(function* refused() {
            const client = yield* connect(era);

            const reversed = yield* failedWith(
              yield* callTool(client, storyRead, {
                fromLine: 5,
                project: "harbour",
                toLine: 2,
              })
            );

            const stale = yield* failedWith(
              yield* callTool(client, storyRead, {
                project: "harbour",
                revision: zeros,
              })
            );

            const { revision } = yield* succeeded(
              yield* callTool(client, projectGet, { project: "harbour" })
            );

            const fresh = yield* callTool(client, storyRead, {
              project: "harbour",
              revision,
            });

            assert.strictEqual(reversed._tag, "Invalid");
            assert.strictEqual(stale._tag, "Stale");
            assert.isTrue(Option.isSome(fresh.value));
          })
        )
    );

    suite.effect(
      "story_lint finds the importer's error with its line, and a clean Screenplay has none",
      () =>
        Effect.scoped(
          Effect.gen(function* lint() {
            const client = yield* connect(era);

            const broken = yield* succeeded(
              yield* callTool(client, storyLint, { project: "broken" })
            );

            const clean = yield* succeeded(
              yield* callTool(client, storyLint, { project: "harbour" })
            );

            assert.isAbove(broken.errors, 0);
            assert.isNumber(broken.diagnostics[0]?.line);
            assert.strictEqual(broken.diagnostics[0]?.severity, "error");
            assert.strictEqual(clean.errors, 0);
            assert.strictEqual(clean.timing, "not-checked");
          })
        )
    );

    suite.effect(
      "plan_get gives the review text, the Plan JSON and, after a build, the timing",
      () =>
        Effect.scoped(
          Effect.gen(function* plan() {
            const client = yield* connect(era);

            const ask = (project: string, view: "json" | "review" | "timing") =>
              callTool(client, planGet, { project, view });

            const review = yield* succeeded(yield* ask("harbour", "review"));
            const json = yield* succeeded(yield* ask("harbour", "json"));
            const timing = yield* succeeded(yield* ask("harbour", "timing"));
            const noBuild = yield* failedWith(yield* ask("nobuild", "timing"));
            const invalid = yield* failedWith(yield* ask("broken", "review"));

            assert.include(review.text, "Scene pier");
            assert.isTrue(Str.startsWith("{")(json.text));
            assert.match(timing.text, /frame/iu);
            assert.strictEqual(noBuild._tag, "BuildNotFound");
            assert.strictEqual(invalid._tag, "StoryInvalid");
          })
        )
    );

    suite.effect(
      "build_get lists the files with digests, whether it is of the head, and file links",
      () =>
        Effect.scoped(
          Effect.gen(function* build() {
            const client = yield* connect(era);

            const called = yield* callTool(client, buildGet, {
              project: "harbour",
            });

            const value = yield* succeeded(called);

            const links = Arr.filter(
              called.result.content,
              (block) => block.type === "resource_link"
            );

            assert.deepStrictEqual(
              Arr.map(value.artifacts, (artifact) => artifact.name),
              ["deck", "video", "subtitles", "plan"]
            );
            assert.deepStrictEqual(value.matchesHead, {
              config: "absent",
              screenplay: true,
            });
            assert.strictEqual(links.length, 4);

            for (const link of links) {
              assert.match(link.uri, /^file:\/\/\//u);
            }

            const absent = yield* failedWith(
              yield* callTool(client, buildGet, { project: "nobuild" })
            );

            const other = yield* failedWith(
              yield* callTool(client, buildGet, {
                build: zeros,
                project: "harbour",
              })
            );

            const broken = yield* failedWith(
              yield* callTool(client, buildGet, { project: "badbuild" })
            );

            assert.deepStrictEqual(
              [absent._tag, other._tag, broken._tag],
              ["BuildNotFound", "BuildNotFound", "Unreadable"]
            );
          })
        )
    );

    suite.effect(
      "artifact_observe returns a frame as a JPEG image block of at most 64 KiB",
      () =>
        Effect.scoped(
          Effect.gen(function* frame() {
            const client = yield* connect(era);

            const ask = (
              at:
                | { readonly frame: number }
                | { readonly ms: number }
                | { readonly effect: string; readonly scene: string }
            ) =>
              callTool(client, artifactObserve, {
                at,
                kind: "frame",
                project: "harbour",
              });

            const byFrame = yield* ask({ frame: 12 });
            const byMs = yield* ask({ ms: 400 });
            const byEffect = yield* ask({ effect: "f1", scene: "pier" });

            for (const called of [byFrame, byMs, byEffect]) {
              const image = Arr.findFirst(
                called.result.content,
                (block) => block.type === "image"
              );

              const value = yield* succeeded(called);

              assert.isTrue(Option.isSome(image));
              assert.strictEqual(
                Option.map(image, (block) =>
                  block.type === "image" ? block.mimeType : ""
                ).pipe(Option.getOrElse(() => "")),
                "image/jpeg"
              );
              assert.isAtMost(value.frame?.bytes ?? 0, 65_536);
            }

            assert.strictEqual((yield* succeeded(byFrame)).frame?.frame, 12);
            assert.strictEqual((yield* succeeded(byMs)).frame?.frame, 12);
            assert.strictEqual((yield* succeeded(byEffect)).frame?.frame, 78);
          })
        )
    );

    suite.effect(
      "artifact_observe reads audio, subtitles, chapters and streams, and refuses what cannot be answered",
      () =>
        Effect.scoped(
          Effect.gen(function* observe() {
            const client = yield* connect(era);

            const ask = (input: Parameters<typeof callTool>[2]) =>
              callTool(client, artifactObserve, input);

            const audio = yield* succeeded(
              yield* ask({
                fromMs: 0,
                kind: "audio",
                project: "harbour",
                toMs: 1000,
              })
            );

            const subtitles = yield* succeeded(
              yield* ask({ kind: "subtitles", project: "harbour" })
            );

            const streams = yield* succeeded(
              yield* ask({ kind: "streams", project: "harbour" })
            );

            const chapters = yield* ask({
              kind: "chapters",
              project: "harbour",
            });

            assert.strictEqual(audio.audio?.buckets.length, 10);
            assert.deepStrictEqual(
              Arr.map(subtitles.subtitles?.cues ?? [], (cue) => cue.text),
              ["The boat reaches the pier.", "Look at the boat."]
            );
            assert.isTrue(
              Arr.some(
                streams.streams ?? [],
                (stream) => stream.type === "video"
              )
            );
            assert.isTrue(Option.isSome(chapters.value));

            for (const args of [
              { kind: "frame", project: "harbour" },
              { at: { frame: 1_000_000 }, kind: "frame", project: "harbour" },
              { fromMs: 5, kind: "audio", project: "harbour", toMs: 1 },
              { fromMs: 0, kind: "audio", project: "harbour", toMs: 90_000 },
              { kind: "audio", project: "harbour" },
            ]) {
              const failure = yield* failedWith(yield* ask(args));

              assert.strictEqual(
                failure._tag,
                "Invalid",
                Formatter.formatJson(args)
              );
            }
          })
        )
    );

    suite.effect(
      "docs_get serves the grammar, the glossary and the lifecycle skill",
      () =>
        Effect.scoped(
          Effect.gen(function* docs() {
            const client = yield* connect(era);

            for (const topic of ["grammar", "glossary", "lifecycle"] as const) {
              const page = yield* succeeded(
                yield* callTool(client, docsGet, { topic })
              );

              assert.isAbove(page.text.length, 100, topic);
              assert.strictEqual(page.topic, topic);
            }
          })
        )
    );

    suite.effect(
      "a result's text blocks are a summary line, then the JSON of the value",
      () =>
        Effect.scoped(
          Effect.gen(function* blocks() {
            const called = yield* callTool(yield* connect(era), projectGet, {
              project: "harbour",
            });

            const [summary, json] = textBlocks(called.result);

            assert.strictEqual(summary, "harbour: built, build of the head");
            assert.include(json, '"project":"harbour"');
          })
        )
    );
  });
});
