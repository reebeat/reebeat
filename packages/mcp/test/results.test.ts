// F8, results fit (spec 0016): for worst-case inputs, every result is at most 45,000 characters of JSON, a long text or
// list comes in pages that together hold all of it, a frame is at most 64 KiB, and no blob above 64 KiB appears. The
// pure paging is checked over generated text; the tools are checked over a workspace built to be as large as the
// importer, the manifest and the subtitle file allow.
import { assert, describe, it } from "@effect/vitest";
import {
  artifactObserve,
  buildGet,
  docsGet,
  planGet,
  storyLint,
  storyRead,
} from "@tsukuri/lifecycle";
import type { ToolDeclaration } from "@tsukuri/lifecycle";
import { encodeBuildManifest } from "@tsukuri/pipeline";
import {
  Array as Arr,
  Effect,
  FileSystem,
  Formatter,
  Path,
  Schema,
  String as Str,
} from "effect";
import type { McpSchema, McpTest } from "effect/ai";

import { present } from "../src/optional.ts";
import { linesOf, pageBudget, pageItems, pageText } from "../src/pages.ts";
import {
  FixtureService,
  callTool,
  connectOver,
  fixtureLayer,
  harbourText,
  platform,
  scratchWorkspace,
  succeeded,
} from "./support.ts";

const bound = 45_000;

/**
 * The characters of a result as a client counts them: every text block, as the model reads it, plus the JSON of
 * `structuredContent` (the JSON is sent twice, spec 0016 "Results are data"). The bytes of an image have their own 64 KiB
 * bound, and the escaping of a JSON string inside the wire frame is the transport's, not the result's.
 */
const sizeOf = (result: McpSchema.CallToolResult): number =>
  Arr.reduce(result.content, 0, (sum, block) =>
    block.type === "text" ? sum + block.text.length : sum
  ) + Formatter.formatJson(result.structuredContent).length;

const units = ['"', "\\", "\u0001", "é", "😀", "x", "\t"] as const;

const Worst = Schema.Struct({
  lines: Schema.Int.check(Schema.isBetween({ maximum: 400, minimum: 0 })),
  repeat: Schema.Int.check(Schema.isBetween({ maximum: 60_000, minimum: 0 })),
  unit: Schema.Literals(units),
});

describe("paging by construction", () => {
  it.prop(
    "a page of text never exceeds its budget, and the pages together hold every line",
    [Worst],
    ([{ lines, repeat, unit }]) => {
      const text = Arr.join(
        Arr.makeBy(lines + 1, (index) =>
          Str.repeat(index % 2 === 0 ? repeat : 3)(unit)
        ),
        "\n"
      );

      const expected = linesOf(text).length;

      let from = 1;
      let pages = 0;
      let covered = 0;

      while (pages < 5000) {
        const page = pageText(text, from);

        assert.isAtMost(Formatter.formatJson(page).length, pageBudget + 400);
        covered += page.toLine - page.fromLine + 1;
        pages += 1;

        if (page.nextLine === undefined) {
          break;
        }

        assert.isAbove(page.nextLine, from);
        from = page.nextLine;
      }

      assert.strictEqual(covered, expected);
    }
  );

  it.prop(
    "a page of items never exceeds its budget, takes at least one item, and the pages together hold every item",
    [
      Schema.Int.check(Schema.isBetween({ maximum: 3000, minimum: 1 })),
      Schema.Int.check(Schema.isBetween({ maximum: 30_000, minimum: 1 })),
    ],
    ([count, each]) => {
      const items = Arr.makeBy(count, (index) => ({
        index,
        text: Str.repeat(each % 5000)("é"),
      }));

      let cursor: number | undefined;
      let seen = 0;

      for (let guard = 0; guard < 4000; guard += 1) {
        const page = pageItems(items, {
          ...present("cursor", cursor),
          limit: 100,
        });

        assert.isAtMost(page.items.length, 100);
        seen += page.items.length;

        if (page.nextCursor === undefined) {
          break;
        }

        assert.isAbove(page.items.length, 0);
        cursor = page.nextCursor;
      }

      assert.strictEqual(seen, count);
    }
  );
});

const hugeStory = Arr.join(
  [
    "Title: Huge",
    "",
    "# Big",
    "",
    "= A very large story.",
    "",
    "INT. ROOM - DAY #room#",
    "",
    "A thing {id=thing cell=tl class=box}",
    "",
    "[[effects",
    ...Arr.makeBy(
      800,
      (index) =>
        `  e${index}: sound pop at 1.5s because "${Str.repeat(200)("r")} ${index}"`
    ),
    "]]",
    "",
    "NARRATOR",
    `${Str.repeat(1_500_000)('"é\u0001')} end.`,
    "",
    ...Arr.makeBy(
      1500,
      (index) =>
        `NARRATOR\nA line number ${index} that goes on and on and on.\n`
    ),
  ],
  "\n"
);

const two = (n: number): string => Str.padStart(2, "0")(String(n));

/** A workspace whose one project has a very long Screenplay and whose build lists 5,000 files and 6,000 cues. */
const hugeWorkspace = Effect.gen(function* workspaceOf() {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const fixture = yield* FixtureService;
  const { builds, root } = yield* scratchWorkspace("tsukuri-huge-");
  const dir = path.join(builds, "huge");

  yield* fs.makeDirectory(path.join(root, "huge"), { recursive: true });
  yield* fs.writeFileString(
    path.join(root, "huge", "story.fountain"),
    hugeStory
  );
  yield* fs.makeDirectory(dir, { recursive: true });

  for (const name of ["deck.html", "plan.json", "harbour.mp4"]) {
    yield* fs.copyFile(
      path.join(fixture.harbourBuildDir, name),
      path.join(dir, name)
    );
  }

  yield* fs.rename(path.join(dir, "harbour.mp4"), path.join(dir, "huge.mp4"));

  const cues = Arr.makeBy(6000, (index) => {
    const second = Math.floor(index / 2);

    const stamp = (extra: number) =>
      `00:${two(Math.floor(second / 60) % 60)}:${two(second % 60)}.${Str.padStart(3, "0")(String(extra))}`;

    return `${stamp(0)} --> ${stamp(400)}\n${Str.repeat(60)('"x\u0001')}`;
  });

  yield* fs.writeFileString(
    path.join(dir, "huge.vtt"),
    `WEBVTT\n\n${Arr.join(cues, "\n\n")}\n`
  );

  const zero = Str.repeat(64)("0");

  const real = Arr.map(
    ["deck.html", "plan.json", "huge.mp4", "huge.vtt"],
    (name) => ({ bytes: 1, path: name, sha256: zero })
  );

  const phantom = Arr.makeBy(5000, (index) => ({
    bytes: 1,
    path: `assets/${Str.repeat(120)("é")}-${index}.bin`,
    sha256: zero,
  }));

  yield* fs.writeFileString(
    path.join(dir, "build.json"),
    yield* encodeBuildManifest({
      adapters: [],
      assets: [],
      files: [...real, ...phantom],
      schema: 2,
      sourcePath: "story.fountain",
      sourceSha256: zero,
    })
  );

  return { builds, root };
}).pipe(Effect.provide(platform));

/** Walks a paged text tool from line 1 to its end; every page is measured, and the lines add up. */
const walkLines = <E>(
  label: string,
  fetch: (from: number) => Effect.Effect<
    {
      readonly page: {
        readonly fromLine: number;
        readonly nextLine?: number;
        readonly toLine: number;
        readonly totalLines: number;
      };
      readonly size: number;
    },
    E
  >
) =>
  Effect.gen(function* walk() {
    let from = 1;
    let covered = 0;
    let total = 0;

    for (let guard = 0; guard < 2000; guard += 1) {
      const { page, size } = yield* fetch(from);

      assert.isAtMost(size, bound, `${label} page ${guard}`);
      covered += page.toLine - page.fromLine + 1;
      total = page.totalLines;

      if (page.nextLine === undefined) {
        break;
      }

      from = page.nextLine;
    }

    assert.strictEqual(covered, total, `${label} covers every line`);
  });

const NextCursor = Schema.Struct({
  nextCursor: Schema.optionalKey(Schema.Finite),
});

/** Walks a cursor-paged tool to its end; every page is measured, and there is more than one. */
const walkCursor = (
  client: McpTest.Client,
  declaration: ToolDeclaration,
  inputAt: (cursor: number | undefined) => Schema.JsonObject
) =>
  Effect.gen(function* walk() {
    let cursor: number | undefined;
    let pagesSeen = 0;

    for (let guard = 0; guard < 6000; guard += 1) {
      const called = yield* callTool(client, declaration, inputAt(cursor));

      const { nextCursor } = yield* Schema.decodeUnknownEffect(NextCursor)(
        called.result.structuredContent
      );

      assert.isAtMost(
        sizeOf(called.result),
        bound,
        `${declaration.name} page ${guard}`
      );
      pagesSeen += 1;

      if (nextCursor === undefined) {
        break;
      }

      cursor = nextCursor;
    }

    assert.isAbove(pagesSeen, 1, `${declaration.name} is paged`);
  });

describe("results fit (F8)", () => {
  it.layer(fixtureLayer)(
    "on the largest workspace the files allow",
    (suite) => {
      suite.effect(
        "every page of every paged text tool is within bounds and the pages cover the whole",
        () =>
          Effect.scoped(
            Effect.gen(function* pages() {
              const client = yield* connectOver(
                yield* hugeWorkspace,
                "2025-11-25"
              );

              yield* walkLines("story_read", (fromLine) =>
                Effect.gen(function* page() {
                  const called = yield* callTool(client, storyRead, {
                    fromLine,
                    project: "huge",
                  });

                  return {
                    page: yield* succeeded(called),
                    size: sizeOf(called.result),
                  };
                })
              );
              yield* walkLines("plan_get", (fromLine) =>
                Effect.gen(function* page() {
                  const called = yield* callTool(client, planGet, {
                    fromLine,
                    project: "huge",
                    view: "review",
                  });

                  return {
                    page: yield* succeeded(called),
                    size: sizeOf(called.result),
                  };
                })
              );
              yield* walkLines("docs_get", (fromLine) =>
                Effect.gen(function* page() {
                  const called = yield* callTool(client, docsGet, {
                    fromLine,
                    topic: "grammar",
                  });

                  return {
                    page: yield* succeeded(called),
                    size: sizeOf(called.result),
                  };
                })
              );
            })
          )
      );

      suite.effect(
        "every page of every cursor-paged tool is within bounds",
        () =>
          Effect.scoped(
            Effect.gen(function* pages() {
              const client = yield* connectOver(
                yield* hugeWorkspace,
                "2025-11-25"
              );

              yield* walkCursor(client, storyLint, (cursor) => ({
                ...present("cursor", cursor),
                project: "huge",
              }));
              yield* walkCursor(client, buildGet, (cursor) => ({
                ...present("cursor", cursor),
                project: "huge",
              }));
              yield* walkCursor(client, artifactObserve, (cursor) => ({
                ...present("cursor", cursor),
                kind: "subtitles",
                project: "huge",
              }));
            })
          )
      );

      suite.effect(
        "a frame is at most 64 KiB and no result carries a blob above it",
        () =>
          Effect.scoped(
            Effect.gen(function* frames() {
              const fixture = yield* FixtureService;

              const client = yield* connectOver(
                fixture.workspace,
                "2025-11-25"
              );

              for (const frame of [0, 5, 31, fixture.totalFrames - 1]) {
                const called = yield* callTool(client, artifactObserve, {
                  at: { frame },
                  kind: "frame",
                  maxBytes: 4096,
                  project: "harbour",
                });

                for (const block of called.result.content) {
                  if (block.type === "image") {
                    assert.isAtMost(block.data.byteLength, 4096);
                  }
                }

                assert.isAtMost(sizeOf(called.result), bound);
              }

              assert.isAbove(Str.length(harbourText), 0);
            })
          )
      );
    }
  );
});
