// Fixed data the lifecycle tests share: two projects (one built), digests that are only names, and a build record.
import { String as Str } from "effect";

import {
  BuildIdSchema,
  ProjectIdSchema,
  RevisionIdSchema,
} from "../src/ids.ts";
import type { BuildRecord, ProjectHead } from "../src/read.ts";

const hex = (digit: string): string => Str.repeat(64)(digit);

export const alpha = ProjectIdSchema.make("alpha");
export const beta = ProjectIdSchema.make("beta");
export const gamma = ProjectIdSchema.make("gamma");

export const alphaText = "Title: Alpha\n\nINT. ROOM #sc1#\n";
export const betaText = "Title: Beta\n";
export const planText = '{"schema":1}';
export const vttText = "WEBVTT\n";

export const alphaHead: ProjectHead = {
  bytes: alphaText.length,
  hasConfig: false,
  project: alpha,
  revision: RevisionIdSchema.make(hex("a")),
  screenplaySha256: hex("1"),
};

export const betaHead: ProjectHead = {
  bytes: betaText.length,
  hasConfig: false,
  project: beta,
  revision: RevisionIdSchema.make(hex("b")),
  screenplaySha256: hex("2"),
};

export const alphaBuild: BuildRecord = {
  files: {
    deck: "/b/alpha/deck.html",
    dir: "/b/alpha",
    mp4: "/b/alpha/alpha.mp4",
    plan: "/b/alpha/plan.json",
    vtt: "/b/alpha/alpha.vtt",
  },
  id: BuildIdSchema.make(hex("c")),
  matchesHead: { config: "absent", screenplay: true },
  summary: {
    adapters: [
      { egress: { kind: "local", sends: [] }, id: "x@1", service: "Encoder" },
    ],
    files: [{ bytes: 3, path: "deck.html", sha256: hex("3") }],
    schema: 2,
    sourceSha256: hex("1"),
  },
};

export const otherBuild = BuildIdSchema.make(hex("d"));
