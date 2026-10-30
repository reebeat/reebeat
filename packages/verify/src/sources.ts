// F5, one source: `plan.json`, `deck.html` (attribute and meta), the `.vtt` NOTE, the mp4 `comment` and
// `build.json` carry the SHA-256 of the source file, plan.json equals the Plan the source builds (apart from its
// Timeline), and every file `build.json` lists exists with the listed hash and size.
import type { PlanJson } from "@tsukuri/core";
import { probeMedia } from "@tsukuri/encode-ffmpeg";
import { sha256Hex } from "@tsukuri/pipeline";
import { readDeck } from "@tsukuri/render-reveal";
import { vttSourceHash } from "@tsukuri/subtitles";
import {
  Array as Arr,
  Effect,
  FileSystem,
  Option,
  Path,
  Result,
  Struct,
  String as Str,
} from "effect";
import type { PlatformError } from "effect";
import type { Digest } from "effect/crypto";

import { guarded } from "./guard.ts";
import type { Build } from "./load.ts";
import { planDifference } from "./planDiff.ts";
import { manifestProblems } from "./provenance.ts";
import { rebuiltPlan } from "./truth.ts";
import { verdictOf } from "./verdict.ts";
import type { Measured } from "./verdict.ts";

const commentPrefix = "tsukuri source-sha256 ";

interface Carrier {
  readonly found: string | undefined;
  readonly name: string;
}

const short = (hash: string | undefined): string =>
  hash === undefined ? "absent" : `${Str.slice(0, 12)(hash)}...`;

/** Every place the hash lives, with what the written file says. */
const carriers = (
  build: Build,
  comment: string | undefined
): readonly Carrier[] => {
  const deck = readDeck(build.deckHtml);

  return [
    { found: build.plan.sourceSha256, name: "plan.json" },
    {
      found: deck.htmlSourceSha256 ?? undefined,
      name: "deck.html data-source-sha256",
    },
    {
      found: deck.metaSourceSha256 ?? undefined,
      name: "deck.html tsukuri:source-sha256 meta",
    },
    { found: vttSourceHash(build.vtt), name: ".vtt NOTE" },
    {
      found:
        comment !== undefined && Str.startsWith(commentPrefix)(comment)
          ? Str.slice(commentPrefix.length)(comment)
          : undefined,
      name: "mp4 comment",
    },
    { found: build.manifest.sourceSha256, name: "build.json" },
  ];
};

const planWithoutTimeline = (plan: Build["plan"]): PlanJson =>
  Struct.omit(plan, ["timeline"]);

/** The files that `build.json` must list: the ones the other checks read. */
const requiredFiles = (build: Build, path: Path.Path): readonly string[] => [
  "plan.json",
  "deck.html",
  path.basename(build.mp4),
  `${path.basename(build.mp4, ".mp4")}.vtt`,
];

const fileProblem = (
  build: Build,
  fs: FileSystem.FileSystem,
  path: Path.Path
) =>
  Effect.fnUntraced(function* verify(
    file: Build["manifest"]["files"][number]
  ): Effect.fn.Return<
    readonly string[],
    PlatformError.PlatformError,
    Digest.Digest
  > {
    const read = yield* Effect.result(
      fs.readFile(path.join(build.buildDir, file.path))
    );

    if (Result.isFailure(read)) {
      return [
        `build.json lists ${file.path}, which cannot be read: ${read.failure.message}`,
      ];
    }

    const hash = yield* sha256Hex(read.success);

    return [
      ...(hash === file.sha256
        ? []
        : [
            `${file.path} has sha256 ${short(hash)}, build.json lists ${short(file.sha256)}`,
          ]),
      ...(read.success.byteLength === file.bytes
        ? []
        : [
            `${file.path} has ${read.success.byteLength} bytes, build.json lists ${file.bytes}`,
          ]),
    ];
  });

/** F5 on every written file. */
export const oneSource = (build: Build) =>
  guarded(
    "F5",
    Effect.gen(function* observe() {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const media = yield* probeMedia(build.mp4);
      const places = carriers(build, media.format.tags?.comment);
      const expected = build.source.sha256;

      const hashProblems = Arr.flatMap(places, (place) =>
        place.found === expected
          ? []
          : [
              `${place.name} says ${short(place.found)}, the source file hashes to ${short(expected)}`,
            ]
      );

      const listed = new Set(
        Arr.map(build.manifest.files, (file) => file.path)
      );

      const unlisted = Arr.flatMap(requiredFiles(build, path), (name) =>
        listed.has(name) ? [] : [`build.json does not list ${name}`]
      );

      const fileProblems = Arr.flatten(
        yield* Effect.forEach(
          build.manifest.files,
          fileProblem(build, fs, path),
          { concurrency: 4 }
        )
      );

      const rebuilt = rebuiltPlan(build);

      const planProblem = Result.match(rebuilt, {
        onFailure: (message) => [message],
        onSuccess: (plan) =>
          Option.match(
            Option.fromNullishOr(
              planDifference(planWithoutTimeline(build.plan), plan)
            ),
            {
              onNone: () => [],
              onSome: (where) => [
                `plan.json is not the Plan of the current source: ${where}`,
              ],
            }
          ),
      });

      const provenance = manifestProblems(build.manifest, build.plan);

      const measured: Measured = [
        ["source sha256", short(expected)],
        ...Arr.map(places, (place): readonly [string, string] => [
          place.name,
          place.found === expected ? "equal" : short(place.found),
        ]),
        [
          "plan.json equals the Plan of the source",
          planProblem.length === 0 ? "yes" : "no",
        ],
        ["files verified against build.json", build.manifest.files.length],
        ["adapters listed with egress", build.manifest.adapters.length],
        ["assets with provenance", build.manifest.assets.length],
      ];

      return verdictOf(
        "F5",
        `${places.length} written files carry the source hash, plan.json is the Plan of the current source, ${build.manifest.files.length} files match build.json, and it lists ${build.manifest.adapters.length} adapters and the provenance of ${build.manifest.assets.length} assets`,
        [
          ...hashProblems,
          ...planProblem,
          ...unlisted,
          ...fileProblems,
          ...provenance,
        ],
        measured
      );
    })
  );
