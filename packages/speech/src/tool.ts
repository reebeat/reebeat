// Child processes of the speech stage run through Effect's `ChildProcessSpawner`: one helper that collects the
// output, waits for the exit code and turns a failure to start or a non-zero exit into `SpeechToolFailed`.
import { Effect, Stream } from "effect";
import { ChildProcess } from "effect/process";
import type { ChildProcessSpawner } from "effect/process";

import { SpeechToolFailed } from "./errors.ts";

type Tool = SpeechToolFailed["tool"];

/** The failure of `tool` with a message and the foreign cause. */
export const toolFailure = (tool: Tool, message: string) => (cause: unknown) =>
  new SpeechToolFailed({ cause, message, tool });

const tail = (output: string): string => output.trim().slice(-400);

/** Runs `command` with `args`, returns its combined stdout and stderr; a non-zero exit code fails. */
export const runTool = Effect.fnUntraced(function* runTool(
  spawner: ChildProcessSpawner.ChildProcessSpawner["Service"],
  tool: Tool,
  command: string,
  args: readonly string[]
): Effect.fn.Return<string, SpeechToolFailed> {
  const { code, output } = yield* Effect.mapError(
    Effect.scoped(
      Effect.gen(function* collect() {
        const handle = yield* spawner.spawn(
          ChildProcess.make(command, args, { stdin: "ignore" })
        );

        const text = yield* Stream.mkString(Stream.decodeText(handle.all));

        return { code: yield* handle.exitCode, output: text };
      })
    ),
    toolFailure(tool, `cannot run ${command}`)
  );

  if (code !== 0) {
    return yield* new SpeechToolFailed({
      cause: code,
      message: `${command} exited with code ${code}: ${tail(output)}`,
      tool,
    });
  }

  return output;
});
