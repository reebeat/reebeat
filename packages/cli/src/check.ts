// `reebeat check`: the output-side falsifiers over a finished build. It reads only the written files and the
// source: the verdicts come from `@reebeat/verify`, through the `Verifier` service.
import { Array as Arr, Console, Effect } from "effect";

import { ChecksFailed } from "./errors.ts";
import { readManifest } from "./manifest.ts";
import { Verifier } from "./verifier.ts";
import { exitCode, renderVerdicts } from "./verify.ts";
import type { Verdict } from "./verify.ts";

/** Prints the verdicts and fails with `ChecksFailed`, naming each falsifier that failed, unless all are ok. */
export const reportVerdicts = Effect.fn("reportVerdicts")(
  function* reportVerdicts(verdicts: readonly Verdict[]) {
    yield* Console.log(renderVerdicts(verdicts));

    const failed = Arr.map(
      Arr.filter(verdicts, (verdict) => !verdict.ok),
      (verdict) => verdict.id
    );

    if (exitCode(verdicts) !== 0) {
      return yield* new ChecksFailed({
        failed,
        message: `${failed.length} of ${verdicts.length} checks failed: ${Arr.join(failed, ", ")}`,
      });
    }

    return verdicts;
  }
);

/**
 * Checks `dir` against `source`. A directory without a valid `build.json` is refused with `NotABuild` before any
 * check runs: a build that stopped half way leaves none (F12).
 */
export const checkBuild = Effect.fn("checkBuild")(
  function* checkBuild(options: {
    readonly dir: string;
    readonly source: string;
  }) {
    const verifier = yield* Verifier;

    yield* readManifest(options.dir);

    return yield* reportVerdicts(
      yield* verifier.check({
        buildDir: options.dir,
        sourcePath: options.source,
      })
    );
  }
);
