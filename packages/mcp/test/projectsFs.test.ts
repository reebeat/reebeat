import {
  BuildIdSchema,
  BuildSummarySchema,
  ProjectIdSchema,
} from "@tsukuri/lifecycle";
import type { BuildRecord } from "@tsukuri/lifecycle";
import { projectsClauses, registerClauses } from "@tsukuri/lifecycle/contract";
import type { ProjectsFixture } from "@tsukuri/lifecycle/contract";
// The file-system `Projects` on real files (spec 0016): the contract the in-memory stand-in keeps runs here on the
// files `tsukuri build` writes.
import { sha256Hex } from "@tsukuri/pipeline";
import { Effect, FileSystem, Layer, Path, Schema, String as Str } from "effect";

import { fileProjects } from "../src/projectsFs.ts";
import {
  FixtureService,
  buildFilesIn,
  fixtureLayer,
  harbourText,
  platform,
} from "./support.ts";

const decoder = new TextDecoder();

const decodeSummary = Schema.decodeUnknownEffect(
  Schema.fromJsonString(BuildSummarySchema)
);

/** What the files hold, read independently of the layer under test. */
const expected = Effect.gen(function* expectedFixture() {
  const fixture = yield* FixtureService;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const dir = fixture.harbourBuildDir;
  const manifestBytes = yield* fs.readFile(path.join(dir, "build.json"));
  const summary = yield* decodeSummary(decoder.decode(manifestBytes));

  const record: BuildRecord = {
    files: yield* buildFilesIn(dir),
    id: BuildIdSchema.make(yield* sha256Hex(manifestBytes)),
    matchesHead: { config: "absent", screenplay: true },
    summary,
  };

  return {
    absent: ProjectIdSchema.make("ghost"),
    bare: { project: ProjectIdSchema.make("nobuild"), text: "Title: Bare\n" },
    built: {
      plan: yield* fs.readFileString(path.join(dir, "plan.json")),
      project: ProjectIdSchema.make("harbour"),
      record,
      subtitles: yield* fs.readFileString(path.join(dir, "harbour.vtt")),
      text: harbourText,
    },
    otherBuild: BuildIdSchema.make(Str.repeat(64)("0")),
  } satisfies ProjectsFixture;
}).pipe(Effect.orDie, Effect.provide(platform));

const provided = Layer.unwrap(
  Effect.map(FixtureService, ({ workspace }) => fileProjects(workspace))
).pipe(Layer.provideMerge(fixtureLayer), Layer.provide(platform));

registerClauses("fileProjects", provided, projectsClauses(expected));
