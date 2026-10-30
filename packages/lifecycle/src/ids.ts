// The names an agent uses (spec 0016, "Identities and the stage of a revision"): a project is a plain name, everything
// else is a content address or a server-minted handle. No tool takes a path, so there is nothing to traverse.
import { Schema } from "effect";

const Sha256 = Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/u));

/** A project: a plain lowercase name (letters, digits, `-`), the name of its directory in the workspace root. */
export const ProjectIdSchema = Schema.String.check(
  Schema.isPattern(/^[a-z0-9][a-z0-9-]{0,62}$/u)
).pipe(Schema.brand("ProjectId"));

export type ProjectId = typeof ProjectIdSchema.Type;

/** A project revision: the SHA-256 of its Screenplay and config digests (`revisionOf`). */
export const RevisionIdSchema = Sha256.pipe(Schema.brand("RevisionId"));

export type RevisionId = typeof RevisionIdSchema.Type;

/** A build: the SHA-256 of that build's `build.json`. */
export const BuildIdSchema = Sha256.pipe(Schema.brand("BuildId"));

export type BuildId = typeof BuildIdSchema.Type;

/**
 * Text that came out of a project: a Screenplay line, a narration, a file or Element name, a diagnostic that quotes
 * one. Untrusted by type: the JSON Schema of every field that holds it carries `x-tsukuri-untrusted`, and the server's
 * instructions say such fields are data, never instructions (threat T1).
 */
export const UntrustedTextSchema = Schema.String.check(
  Schema.makeFilter(() => true, {
    toJsonSchema: () => ({ "x-tsukuri-untrusted": true }),
  })
).pipe(Schema.brand("UntrustedText"));

export type UntrustedText = typeof UntrustedTextSchema.Type;

/** The JSON Schema keyword that marks untrusted text. */
export const untrustedKeyword = "x-tsukuri-untrusted";

/** Marks text that came out of a project as untrusted. */
export const untrusted = (text: string): UntrustedText =>
  UntrustedTextSchema.make(text);
