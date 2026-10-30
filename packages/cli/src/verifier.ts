// The verification as a capability of the CLI: `check` and `journey` ask it, and the composition root decides
// what answers. The live layer is the verify package (through `verify.ts`); the tests answer with fakes.
import type { MediaTools } from "@tsukuri/encode-ffmpeg";
import type { FileSystem, Path } from "effect";
import { Context, Effect, Layer } from "effect";
import type { Digest } from "effect/crypto";

import { compareBuilds, runChecks } from "./verify.ts";
import type { Verdict, VerifyError } from "./verify.ts";

export class Verifier extends Context.Service<
  Verifier,
  {
    /** F6 over two build directories: one verdict. */
    readonly compare: (
      dirA: string,
      dirB: string
    ) => Effect.Effect<Verdict, VerifyError>;
    /** The output-side falsifiers over one build directory. */
    readonly check: (options: {
      readonly buildDir: string;
      readonly cacheDir?: string;
      readonly sourcePath: string;
    }) => Effect.Effect<readonly Verdict[], VerifyError>;
  }
>()("@tsukuri/cli/verifier/Verifier") {
  static readonly layer = Layer.effect(
    Verifier,
    Effect.gen(function* build() {
      const services = yield* Effect.context<
        Digest.Digest | FileSystem.FileSystem | MediaTools | Path.Path
      >();

      return Verifier.of({
        check: (options) => Effect.provideContext(runChecks(options), services),
        compare: (dirA, dirB) =>
          Effect.provideContext(compareBuilds(dirA, dirB), services),
      });
    })
  );
}
