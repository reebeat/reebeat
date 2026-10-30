// ffmpeg and ffprobe as child processes. The service owns the processes: each one lives in the caller's Scope, its
// output is read while it runs (so a full pipe never blocks it), and a code other than 0 is a typed failure that
// carries the end of its error output.
import {
  Array as Arr,
  Context,
  Effect,
  Fiber,
  Layer,
  Stream,
  String as Str,
} from "effect";
import type { Scope } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import { MediaToolFailed } from "./errors.ts";

export type MediaTool = "ffmpeg" | "ffprobe";

/** A running tool: bytes go in through `stdin`, and `finish` waits for the exit and returns what it wrote to stdout. */
export interface ToolProcess {
  readonly finish: Effect.Effect<Uint8Array, MediaToolFailed>;
  /** Ends the process's stdin when the input stream ends. A write that fails is a `PlatformError`. */
  readonly stdin: ChildProcessSpawner.ChildProcessHandle["stdin"];
}

const stderrTailChars = 2000;

const failed = (
  tool: MediaTool,
  message: string,
  stderr: string,
  cause?: unknown
) => new MediaToolFailed({ cause, message, stderr, tool });

const concat = (chunks: readonly Uint8Array[]): Uint8Array => {
  const total = Arr.reduce(chunks, 0, (sum, chunk) => sum + chunk.byteLength);
  const bytes = new Uint8Array(total);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return bytes;
};

export class MediaTools extends Context.Service<
  MediaTools,
  {
    /** Runs a tool to completion with nothing on stdin and returns its stdout. */
    run: (
      tool: MediaTool,
      args: readonly string[]
    ) => Effect.Effect<Uint8Array, MediaToolFailed>;
    /** Starts a tool; it is killed when the Scope closes. */
    start: (
      tool: MediaTool,
      args: readonly string[]
    ) => Effect.Effect<ToolProcess, MediaToolFailed, Scope.Scope>;
  }
>()("@tsukuri/encode-ffmpeg/mediaTools/MediaTools") {
  static readonly layer = Layer.effect(
    MediaTools,
    Effect.gen(function* build() {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

      const start = Effect.fn("MediaTools.start")(function* startTool(
        tool: MediaTool,
        args: readonly string[]
      ) {
        const handle = yield* spawner
          .spawn(ChildProcess.make(tool, [...args]))
          .pipe(
            Effect.mapError((cause) =>
              failed(tool, `cannot start ${tool}: ${cause.message}`, "", cause)
            )
          );

        const stdout = yield* handle.stdout.pipe(
          Stream.runCollect,
          Effect.map(concat),
          Effect.mapError((cause) =>
            failed(tool, `reading ${tool} output failed`, "", cause)
          ),
          Effect.forkScoped
        );

        const stderr = yield* handle.stderr.pipe(
          Stream.decodeText(),
          Stream.runFold(
            () => "",
            (tail: string, chunk: string) =>
              Str.slice(-stderrTailChars)(`${tail}${chunk}`)
          ),
          Effect.orElseSucceed(() => ""),
          Effect.forkScoped
        );

        const finish = Effect.gen(function* wait() {
          const exitCode = yield* handle.exitCode.pipe(
            Effect.mapError((cause) =>
              failed(tool, `waiting for ${tool} failed`, "", cause)
            )
          );

          const text = yield* Fiber.join(stderr);

          if (exitCode !== 0) {
            return yield* failed(
              tool,
              `${tool} exited with code ${exitCode}`,
              text
            );
          }

          return yield* Fiber.join(stdout);
        });

        return {
          finish,
          stdin: handle.stdin,
        } satisfies ToolProcess;
      });

      return MediaTools.of({
        run: Effect.fn("MediaTools.run")(function* runTool(tool, args) {
          return yield* start(tool, args).pipe(
            Effect.flatMap((process) => process.finish),
            Effect.scoped
          );
        }),
        start,
      });
    })
  );
}
