// The contract suites of @tsukuri/lifecycle: clauses over `Projects` and `Observer`, and the helpers that register them.
export { failedClauseIds, registerClauses } from "./clause.ts";

export type { Clause } from "./clause.ts";

export { observerClauses } from "./observer.ts";

export { projectsClauses } from "./projects.ts";

export type { ProjectsFixture } from "./projects.ts";

export {
  documentOf,
  leavesOf,
  plainStringPaths,
  rootProperties,
  untrustedAt,
} from "./schemaWalk.ts";

export type { Leaf, SchemaDocument } from "./schemaWalk.ts";
