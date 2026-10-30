// What the inspector's tests share: one workspace on real files (a project with a build, a project with no build, a
// project that does not import, a project with a config), the platform layers and an MCP client over the live server.
// The build is small but real: the Plan is scheduled by the core, the video is made by ffmpeg to the Plan's frame
// count, and `build.json` is written by the pipeline's own `writeManifest`, so the manifest is the one a build writes.
import { NodeCrypto, NodeServices } from "@effect/platform-node";
import {
  buildPlan,
  encodePlan,
  lineIdOf,
  referenceLifecycle,
  requireTimeline,
  schedule,
  wordsOf,
} from "@tsukuri/core";
import { MediaTools } from "@tsukuri/encode-ffmpeg";
import type { ToolDeclaration } from "@tsukuri/lifecycle";
import { sha256Hex, writeManifest } from "@tsukuri/pipeline";
import {
  Array as Arr,
  Context,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Result,
  Schema,
  String as Str,
} from "effect";
import type { PlatformError } from "effect";
import type { McpSchema } from "effect/ai";
import { McpTest } from "effect/ai";

import type { Workspace } from "../src/projectsFs.ts";
import { live } from "../src/runtime.ts";
import { protocols, registrations, serverInfo } from "../src/server.ts";

export const platform = Layer.merge(NodeServices.layer, NodeCrypto.layerDigest);

/** The checkout this package lives in: the documents the tools serve are read from it. */
export const checkout = Effect.map(Path.Path, (path) =>
  path.resolve(import.meta.dirname, "..", "..", "..")
);

export const harbourText = Arr.join(
  [
    "Title: Harbour",
    "Author: tsukuri tests",
    "",
    "# Arrival",
    "",
    "= A boat comes in.",
    "",
    "INT. PIER - DAY #pier#",
    "",
    "A boat {id=boat cell=tl class=box}",
    "The sign {id=sign cell=bc class=muted visible=false}",
    "",
    "[[effects",
    '  r1: show sign at word("pier").end',
    '  f1: focus boat at word("boat", 2).start',
    "]]",
    "",
    "NARRATOR",
    "The boat reaches the pier. Look at the boat.",
    "",
    "> AUTO-ANIMATE",
    "",
    "INT. QUAY - DAY #quay#",
    "",
    "A boat {id=boat cell=mc class=accent}",
    "The sign {id=sign cell=bc class=muted}",
    "",
    "NARRATOR",
    "Same boat, new place.",
    "",
  ],
  "\n"
);

/** A Screenplay the importer refuses: an effects block that names no Element. */
const brokenText = Arr.join(
  [
    "Title: Broken",
    "",
    "INT. ROOM - DAY #room#",
    "",
    "A thing {id=thing cell=tl class=box}",
    "",
    "[[effects",
    '  f1: focus ghost at word("hello").end',
    "]]",
    "",
    "NARRATOR",
    "Hello there.",
    "",
  ],
  "\n"
);

export interface Fixture {
  readonly workspace: Workspace;
  readonly harbourBuildDir: string;
  readonly totalFrames: number;
}

/** The five files of a build in `dir`, as `BuildFiles` names them. */
export const buildFilesIn = (dir: string) =>
  Effect.map(Path.Path, (path) => ({
    deck: path.join(dir, "deck.html"),
    dir,
    mp4: path.join(dir, "harbour.mp4"),
    plan: path.join(dir, "plan.json"),
    vtt: path.join(dir, "harbour.vtt"),
  }));

/** A directory under the temp directory, and the `stories/` and `build/` beside each other in it. */
export const scratchWorkspace = (prefix: string) =>
  Effect.gen(function* scratch() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const base = yield* fs.makeTempDirectoryScoped({ prefix });

    return {
      base,
      builds: path.join(base, "build"),
      root: path.join(base, "stories"),
    };
  });

/** In a directory: a link to `target` at the path of `segments`, in place of what is there (its parents are made). */
export const linkAt =
  (target: string, ...segments: readonly string[]) =>
  (
    dir: string
  ): Effect.Effect<
    void,
    PlatformError.PlatformError,
    FileSystem.FileSystem | Path.Path
  > =>
    Effect.gen(function* linked() {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const at = path.join(dir, ...segments);

      yield* fs.makeDirectory(path.dirname(at), { recursive: true });
      yield* fs.remove(at, { force: true });
      yield* fs.symlink(target, at);
    });

/** A workspace under `base`: `stories/` and `build/`. */
export const buildWorkspaceIn = (base: string) =>
  Effect.gen(function* fixture() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const tools = yield* MediaTools;
    const root = path.join(base, "stories");
    const builds = path.join(base, "build");

    const write = (project: string, name: string, text: string) =>
      Effect.andThen(
        fs.makeDirectory(path.join(root, project), { recursive: true }),
        fs.writeFileString(path.join(root, project, name), text)
      );

    yield* write("harbour", "story.fountain", harbourText);
    yield* write("broken", "story.fountain", brokenText);
    yield* write("withconfig", "story.fountain", harbourText);
    yield* write("withconfig", "tsukuri.config.json", "{}\n");
    yield* write("nobuild", "story.fountain", "Title: Bare\n");
    yield* write("badbuild", "story.fountain", harbourText);
    yield* fs.makeDirectory(path.join(root, "not-a-project"), {
      recursive: true,
    });

    const sha = yield* sha256Hex(new TextEncoder().encode(harbourText));
    const plan = yield* buildPlan(harbourText, sha);

    const aligned = Arr.flatMap(plan.scenes, (scene) =>
      Arr.map(scene.lines, (line, index) => ({
        audio: { file: `${Str.repeat(64)("1")}.flac`, sha256: "x" },
        durationMs: wordsOf(line.text).length * 200,
        lineId: lineIdOf(scene.id, index + 1),
        words: Arr.map(wordsOf(line.text), (w, at) => ({
          endMs: (at + 1) * 200,
          startMs: at * 200,
          w,
        })),
      }))
    );

    const timed = yield* Effect.fromResult(
      requireTimeline(yield* schedule(plan, aligned, referenceLifecycle))
    );

    const { totalFrames } = timed.timeline;
    const { fps } = timed.settings;
    const seconds = totalFrames / fps;
    const dir = path.join(builds, "harbour");

    yield* fs.makeDirectory(dir, { recursive: true });

    // A build whose manifest does not decode: reading it is refused and logged, and the project stays readable.
    yield* fs.makeDirectory(path.join(builds, "badbuild"), { recursive: true });
    yield* fs.writeFileString(
      path.join(builds, "badbuild", "build.json"),
      "not json"
    );
    yield* fs.writeFileString(
      path.join(dir, "plan.json"),
      yield* encodePlan(timed)
    );
    yield* fs.writeFileString(
      path.join(dir, "deck.html"),
      "<!doctype html><title>Harbour</title>\n"
    );

    yield* fs.writeFileString(
      path.join(dir, "harbour.vtt"),
      "WEBVTT\n\n00:00:00.200 --> 00:00:01.400\nThe boat reaches the pier.\n\n00:00:01.600 --> 00:00:02.400\nLook at the boat.\n"
    );

    yield* tools.run("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      `testsrc=size=320x180:rate=${fps}:duration=${seconds}`,
      "-f",
      "lavfi",
      "-i",
      `sine=frequency=440:sample_rate=16000:duration=${seconds}`,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-g",
      "6",
      "-c:a",
      "aac",
      "-shortest",
      "-y",
      path.join(dir, "harbour.mp4"),
    ]);

    yield* writeManifest(dir, {
      adapters: [],
      assets: [],
      source: { path: "stories/harbour/story.fountain", sha256: sha },
    });

    return {
      harbourBuildDir: dir,
      totalFrames,
      workspace: { builds, root },
    } satisfies Fixture;
  });

/** A workspace in a temporary directory that is removed with the Scope. */
const buildWorkspace = Effect.flatMap(
  Effect.flatMap(FileSystem.FileSystem, (fs) =>
    fs.makeTempDirectoryScoped({ prefix: "tsukuri-mcp-" })
  ),
  buildWorkspaceIn
);

/** The fixture as a service, so one temporary workspace serves a whole suite. */
export class FixtureService extends Context.Service<FixtureService, Fixture>()(
  "@tsukuri/mcp/test/Fixture"
) {}

export const fixtureLayer = Layer.provide(
  Layer.effect(FixtureService, buildWorkspace),
  Layer.provideMerge(MediaTools.layer, platform)
);

/** The protocol versions the server speaks, as the in-memory client names them. */
export const eras = ["2026-07-28", "2025-11-25", "2025-06-18"] as const;

/** An in-memory client of the live server over `workspace`, in one protocol era. */
export const connectOver = (
  workspace: Workspace,
  version: (typeof eras)[number]
) =>
  Effect.flatMap(checkout, (root) =>
    McpTest.makeClient(Layer.provide(registrations, live(workspace, root)), {
      ...serverInfo,
      protocolVersion: version,
      protocols,
    })
  ).pipe(Effect.provide(platform));

/** An in-memory client of the live server over the fixture workspace. */
export const connect = (version: (typeof eras)[number]) =>
  Effect.flatMap(FixtureService, ({ workspace }) =>
    connectOver(workspace, version)
  );

/** A call of a tool of `declaration`, its result decoded by the declaration's own schemas. */
export interface Called<D extends ToolDeclaration> {
  /** The declared failure, when the result is an error. */
  readonly failure: Option.Option<D["errors"]["Type"]>;
  readonly result: McpSchema.CallToolResult;
  /** The structured value, when the result is not an error. */
  readonly value: Option.Option<D["output"]["Type"]>;
}

/** Calls the tool `declaration` names with `input` and decodes what comes back with its output or errors schema. */
export const callTool = <D extends ToolDeclaration>(
  client: McpTest.Client,
  declaration: D,
  input: Schema.JsonObject
) =>
  Effect.gen(function* called() {
    const result = yield* client.callTool({
      arguments: input,
      name: declaration.name,
    });

    if (result.isError === true) {
      const [block] = result.content;
      const text = block?.type === "text" ? block.text : "";

      const failure = yield* Schema.decodeEffect(
        Schema.fromJsonString(declaration.errors)
      )(text);

      const failed: Called<D> = {
        failure: Option.some(failure),
        result,
        value: Option.none(),
      };

      return failed;
    }

    const value = yield* Schema.decodeUnknownEffect(declaration.output)(
      result.structuredContent
    );

    const decoded: Called<D> = {
      failure: Option.none(),
      result,
      value: Option.some(value),
    };

    return decoded;
  });

/** The value of a call that must have succeeded. */
export const succeeded = <D extends ToolDeclaration>(called: Called<D>) =>
  Effect.fromOption(called.value);

/** The declared failure of a call that must have failed. */
export const failedWith = <D extends ToolDeclaration>(called: Called<D>) =>
  Effect.fromOption(called.failure);

/** The text of every text block of a result, in order. */
export const textBlocks = (
  result: McpSchema.CallToolResult
): readonly string[] =>
  Arr.filterMap(result.content, (block) =>
    block.type === "text" ? Result.succeed(block.text) : Result.failVoid
  );
