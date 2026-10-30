// What the read-only tools know about a project and its build (spec 0016 and its Revisions): lifecycle's own read
// models, in its own types. `BuildSummary` is a projection of `build.json`: the file's format stays defined once, by
// `BuildManifestSchema` in `@tsukuri/pipeline`, and a test in `@tsukuri/mcp` keeps the two true.
import { Schema } from "effect";

import type { BuildId, ProjectId, RevisionId } from "./ids.ts";

/** How the head of a project relates to a build on disk. `build.json` records no config digest (gap G15). */
export const MatchesHeadSchema = Schema.Struct({
  /** The project has no `tsukuri.config.json`, or has one whose effect on the build is not recorded. */
  config: Schema.Literals(["absent", "unknown"]),
  /** The build's `sourceSha256` equals the SHA-256 of the project's Screenplay bytes. */
  screenplay: Schema.Boolean,
});

export type MatchesHead = typeof MatchesHeadSchema.Type;

/**
 * A SHA-256 digest: 64 lowercase hexadecimal digits, checked when a `build.json` is decoded, so a digest field cannot
 * carry text (spec 0018, Revision 14).
 */
export const Sha256Schema = Schema.String.check(
  Schema.isPattern(/^[0-9a-f]{64}$/u)
);

/** The seven services of a build, as `serviceNames` of `@tsukuri/services` lists them; a test in `@tsukuri/mcp` keeps them equal. */
export const ServiceNameSchema = Schema.Literals([
  "SpeechSynthesizer",
  "WordAligner",
  "SoundLibrary",
  "Renderer",
  "FrameCapturer",
  "Encoder",
  "AssetCache",
]);

/** An adapter id as the adapters write it (`kokoro@1.2.1`, `chromium@155.0.8059.39+timeweb@0.3.2`): no space, no sentence. */
export const AdapterIdSchema = Schema.String.check(
  Schema.isPattern(/^[A-Za-z0-9][A-Za-z0-9._+@-]{0,127}$/u)
);

export const BuildFileSchema = Schema.Struct({
  bytes: Schema.Int,
  path: Schema.String,
  sha256: Sha256Schema,
});

/**
 * An adapter as `build.json` records it. The id, the service and (above) the digests are checked structurally when the
 * file is decoded; what an adapter says it sends out is its own text, so `build_get` types it untrusted on the way out.
 */
export const BuildAdapterSchema = Schema.Struct({
  egress: Schema.Struct({
    kind: Schema.Literals(["local", "integration"]),
    sends: Schema.Array(Schema.String),
  }),
  id: AdapterIdSchema,
  service: ServiceNameSchema,
});

/** The parts of `build.json` the tools report. Settings and asset provenance stay in the file. */
export const BuildSummarySchema = Schema.Struct({
  adapters: Schema.Array(BuildAdapterSchema),
  files: Schema.Array(BuildFileSchema),
  schema: Schema.Literal(2),
  sourceSha256: Sha256Schema,
});

export type BuildSummary = typeof BuildSummarySchema.Type;

/** The head of a project: what its files say now. */
export interface ProjectHead {
  readonly bytes: number;
  readonly hasConfig: boolean;
  readonly project: ProjectId;
  readonly revision: RevisionId;
  /** SHA-256 of the Screenplay's bytes. */
  readonly screenplaySha256: string;
}

/** The files of one build, as absolute paths. Internal: no tool returns a path except as a `file://` link. */
export interface BuildFiles {
  readonly deck: string;
  readonly dir: string;
  readonly mp4: string;
  readonly plan: string;
  readonly vtt: string;
}

export interface BuildRecord {
  readonly files: BuildFiles;
  readonly id: BuildId;
  readonly matchesHead: MatchesHead;
  readonly summary: BuildSummary;
}

/** The text files of a build the tools read: its `plan.json` and its WebVTT subtitles. */
export type BuildTextName = "plan" | "subtitles";

/** The Screenplay of a project and its head. */
export interface StoryText {
  readonly head: ProjectHead;
  readonly text: string;
}

/** A project revision is named by the digests of what it holds; the config digest is `none` when there is no config. */
export const revisionText = (
  screenplaySha256: string,
  configSha256: string | undefined
): string =>
  `screenplay:${screenplaySha256}\nconfig:${configSha256 ?? "none"}\n`;

/** What an observed frame is: bytes and where they come from. */
export interface FrameImage {
  readonly bytes: Uint8Array;
  readonly height: number;
  readonly mimeType: "image/jpeg";
  readonly width: number;
}

export interface AudioBucket {
  readonly fromMs: number;
  readonly peakDb: number;
  readonly rmsDb: number;
}

export interface AudioStats {
  readonly buckets: readonly AudioBucket[];
  readonly onsetsMs: readonly number[];
}

export interface SubtitleCue {
  readonly endMs: number;
  readonly startMs: number;
  readonly text: string;
}

export interface StreamFacts {
  readonly channels?: number;
  readonly codec: string;
  readonly durationMs?: number;
  readonly fps?: string;
  readonly frames?: number;
  readonly height?: number;
  readonly sampleRate?: number;
  readonly type: string;
  readonly width?: number;
}

export interface ChapterFacts {
  readonly endMs: number;
  readonly startMs: number;
  readonly title?: string;
}

export interface MediaFacts {
  readonly chapters: readonly ChapterFacts[];
  readonly durationMs?: number;
  readonly streams: readonly StreamFacts[];
}
