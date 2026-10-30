// The stage of a project revision (spec 0016): derived from facts, never stored, so there is no field to forge and no
// update to forget. Total and pure.
import { Schema } from "effect";

export const stages = [
  "drafted",
  "planned",
  "built",
  "verified",
  "candidate",
  "released",
  "published",
] as const;

export const StageSchema = Schema.Literals(stages);

export type Stage = typeof StageSchema.Type;

/** What the server can read about one revision. Each fact comes from the project or the state directory. */
export interface Facts {
  /** The Screenplay imports and no lint rule reports an error. */
  readonly lintClean: boolean;
  /** A build of exactly this revision exists on disk. */
  readonly built: boolean;
  /** A verification record written by the server names that build and every verdict is a pass. */
  readonly verifiedByServer: boolean;
  /** A release candidate was frozen from that verified build. */
  readonly candidate: boolean;
  /** A person approved the release. */
  readonly releaseApproved: boolean;
  /** The release was published to a channel. */
  readonly published: boolean;
}

/** The highest stage whose facts all hold. */
export const stageOf = (facts: Facts): Stage => {
  const verified = facts.built && facts.verifiedByServer;

  if (verified && facts.candidate && facts.releaseApproved && facts.published) {
    return "published";
  }

  if (verified && facts.candidate && facts.releaseApproved) {
    return "released";
  }

  if (verified && facts.candidate) {
    return "candidate";
  }

  if (verified) {
    return "verified";
  }

  if (facts.built) {
    return "built";
  }

  return facts.lintClean ? "planned" : "drafted";
};
