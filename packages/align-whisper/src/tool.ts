// Child processes of the aligner run through Effect's `ChildProcessSpawner`: one helper that collects the output,
// waits for the exit code and turns a failure to start into `AdapterUnavailable` (the binary is missing) and a
// non-zero exit into `AlignmentFailed`.
import { AdapterUnavailable, AlignmentFailed } from "@tsukuri/services";
import { Effect, Stream, String as Str, pipe } from "effect";
import { ChildProcess } from "effect/process";
import type { ChildProcessSpawner } from "effect/process";

export const adapterId = "whisper.cpp@1.9.5-dev+ggml-base.en";

/** The failure of the aligner with a message and the foreign cause. */
export const alignFailure = (message: string) => (cause: unknown) =>
  new AlignmentFailed({ adapter: adapterId, cause, message });

/** A requirement of the aligner that is not met: a binary, a model, an environment variable. */
export const unavailable = (requirement: string, message: string) =>
  new AdapterUnavailable({
    adapter: adapterId,
    message,
    requirement,
    service: "WordAligner",
  });

const tail = (output: string): string =>
  pipe(output, Str.trim, Str.slice(-400));

/** Runs `command` with `args`, returns its combined stdout and stderr; a non-zero exit code fails. */
export const runTool = Effect.fnUntraced(function* runTool(
  spawner: ChildProcessSpawner.ChildProcessSpawner["Service"],
  command: string,
  args: readonly string[]
): Effect.fn.Return<string, AdapterUnavailable | AlignmentFailed> {
  return yield* Effect.scoped(
    Effect.gen(function* collect() {
      const handle = yield* Effect.mapError(
        spawner.spawn(ChildProcess.make(command, args, { stdin: "ignore" })),
        () => unavailable(`binary ${command}`, `cannot start ${command}`)
      );

      const text = yield* Effect.mapError(
        Stream.mkString(Stream.decodeText(handle.all)),
        alignFailure(`cannot read the output of ${command}`)
      );

      const code = yield* Effect.mapError(
        handle.exitCode,
        alignFailure(`cannot wait for ${command}`)
      );

      if (code !== 0) {
        return yield* alignFailure(
          `${command} exited with code ${code}: ${tail(text)}`
        )(code);
      }

      return text;
    })
  );
});
