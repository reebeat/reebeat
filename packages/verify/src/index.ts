// Public surface of @reebeat/verify: the output-side checks of the falsifiers on a build directory, the table
// that prints their verdicts and the exit code. It reads the written files and the source only (spec 0001).
export { runChecks } from "./check.ts";

export { compareBuilds } from "./builds.ts";

export { BuildInvalid } from "./errors.ts";

export type { VerifyError } from "./errors.ts";

export type { CheckOptions } from "./load.ts";

export { exitCode, renderVerdicts } from "./verdict.ts";

export type { FalsifierId, Measured, Status, Verdict } from "./verdict.ts";
