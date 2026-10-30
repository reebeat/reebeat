// How a stdio session ends (spec 0018, Revision 23). A client closes the server's stdin: the process exits 0, not 130,
// and an ffmpeg that a tool call had started is killed with it (no orphan). A SIGINT is still an interruption (130).
// ffmpeg and ffprobe are shims that record their process id and sleep, so a call is in flight when stdin closes.
import { assert, describe, it } from "@effect/vitest";
import type { Cause } from "effect";
import {
  Array as Arr,
  Config,
  Effect,
  FileSystem,
  Formatter,
  Layer,
  Path,
  Queue,
  Ref,
  Schedule,
  Stream,
  String as Str,
} from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import {
  FixtureService,
  checkout,
  fixtureLayer,
  platform,
  serverCommand,
} from "./support.ts";

const encoder = new TextEncoder();

const requests = [
  {
    id: 1,
    jsonrpc: "2.0",
    method: "initialize",
    params: {
      capabilities: {},
      clientInfo: { name: "eof-test", version: "1" },
      protocolVersion: "2025-11-25",
    },
  },
  { jsonrpc: "2.0", method: "notifications/initialized" },
  {
    id: 2,
    jsonrpc: "2.0",
    method: "tools/call",
    params: {
      arguments: { at: { frame: 0 }, kind: "frame", project: "harbour" },
      name: "artifact_observe",
    },
  },
];

const line = (request: (typeof requests)[number]) =>
  encoder.encode(`${Formatter.formatJson(request)}\n`);

/** Starts the executable with ffmpeg and ffprobe replaced by sleeping shims; resolves once a shim is running. */
const inFlight = (mode: "sleep" | "drain" | "ignore" = "sleep") =>
  Effect.gen(function* started() {
    const fixture = yield* FixtureService;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const root = yield* checkout;

    const shims = yield* fs.makeTempDirectoryScoped({
      prefix: "tsukuri-shims-",
    });

    const pidFile = path.join(shims, "pid");
    const terminating = path.join(shims, "terminating");

    const scripts = {
      drain: `#!/bin/sh\ntrap 'echo term > "${terminating}"; exec sleep 2' TERM\necho $$ > "${pidFile}"\nsleep 120 &\nwait\n`,
      ignore: `#!/bin/sh\ntrap '' TERM\necho $$ > "${pidFile}"\nexec sleep 120\n`,
      sleep: `#!/bin/sh\necho $$ > "${pidFile}"\nexec sleep 120\n`,
    };

    const script = scripts[mode];

    const searchPath = yield* Config.String("PATH");

    for (const tool of ["ffmpeg", "ffprobe"]) {
      yield* fs.writeFileString(path.join(shims, tool), script);
      yield* fs.chmod(path.join(shims, tool), 0o755);
    }

    const input = yield* Queue.make<Uint8Array, Cause.Done>();

    for (const request of requests) {
      yield* Queue.offer(input, line(request));
    }

    const handle = yield* spawner.spawn(
      serverCommand(
        root,
        fixture.workspace,
        { PATH: `${shims}:${searchPath}` },
        { stream: Stream.fromQueue(input) }
      )
    );

    const seen = yield* Ref.make<readonly string[]>([]);

    for (const stream of [handle.stdout, handle.stderr]) {
      yield* Effect.forkScoped(
        stream.pipe(
          Stream.decodeText(),
          Stream.runForEach((text) =>
            Ref.update(seen, (all) => Arr.append(all, text))
          )
        )
      );
    }

    const pid = yield* fs.readFileString(pidFile).pipe(
      Effect.map((text) => Number(Str.trim(text))),
      Effect.filterOrFail(
        (n) => Number.isInteger(n) && n > 1,
        () => "no pid yet"
      ),
      Effect.retry(Schedule.spaced("200 millis")),
      Effect.timeoutOrElse({
        duration: "30 seconds",
        orElse: () =>
          Effect.flatMap(Ref.get(seen), (all) =>
            Effect.die(`no shim ran; the server wrote: ${Arr.join(all, "")}`)
          ),
      })
    );

    yield* Effect.addFinalizer(() =>
      spawner
        .exitCode(
          ChildProcess.make("kill", ["-KILL", String(pid)], {
            stderr: "ignore",
            stdout: "ignore",
          })
        )
        .pipe(Effect.ignore)
    );

    return { handle, input, pid, terminating };
  });

/** Whether process `pid` exists (`kill -0`). */
const alive = (pid: number) =>
  Effect.gen(function* check() {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

    const code = yield* spawner.exitCode(
      ChildProcess.make("kill", ["-0", String(pid)], {
        stderr: "ignore",
        stdout: "ignore",
      })
    );

    return code === 0;
  });

describe("the end of a stdio session", () => {
  {
    // `it.live`: the real clock, because the test waits for a real process; the fixture is built for each test.
    it.live.each(["sleep", "ignore"] as const)(
      "closing stdin during a call with a %s child exits 0 and reaps it",
      (mode) =>
        Effect.scoped(
          Effect.gen(function* closed() {
            const { handle, input, pid } = yield* inFlight(mode);

            assert.isTrue(yield* alive(pid), "the shim is running");
            yield* Queue.end(input);

            const code = yield* handle.exitCode.pipe(
              Effect.timeout("30 seconds")
            );

            assert.strictEqual(
              Number(code),
              0,
              "a closed stdin is a clean end"
            );

            assert.isFalse(
              yield* alive(pid),
              "the in-flight ffmpeg is reaped before exit"
            );
          })
        ).pipe(Effect.provide(Layer.merge(fixtureLayer, platform))),
      { timeout: 90_000 }
    );

    it.live(
      "a SIGINT during a call is still an interruption (130) and leaves no ffmpeg behind",
      () =>
        Effect.scoped(
          Effect.gen(function* interrupted() {
            const { handle, pid } = yield* inFlight();

            yield* handle.kill({ killSignal: "SIGINT" });

            const code = yield* handle.exitCode.pipe(
              Effect.timeout("30 seconds")
            );

            assert.strictEqual(Number(code), 130);
            assert.isFalse(
              Arr.some([yield* alive(pid)], (up) => up),
              "the in-flight ffmpeg is killed"
            );
          })
        ).pipe(Effect.provide(Layer.merge(fixtureLayer, platform))),
      { timeout: 90_000 }
    );

    it.live.each(["drain", "ignore"] as const)(
      "SIGINT after EOF with a %s child exits 130 and reaps it",
      (mode) =>
        Effect.scoped(
          Effect.gen(function* interruptedDrain() {
            const fs = yield* FileSystem.FileSystem;
            const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
            const { handle, input, pid, terminating } = yield* inFlight(mode);
            yield* Queue.end(input);

            if (mode === "drain") {
              // The observation deadline has begun cleanup: EOF was consumed while the request drained.
              yield* fs
                .readFileString(terminating)
                .pipe(
                  Effect.retry(Schedule.spaced("20 millis")),
                  Effect.timeout("30 seconds")
                );
            }

            yield* spawner.exitCode(
              ChildProcess.make("kill", ["-INT", String(handle.pid)])
            );

            const code = yield* handle.exitCode.pipe(
              Effect.timeout("5 seconds")
            );

            assert.strictEqual(Number(code), 130);
            assert.isFalse(
              yield* alive(pid),
              "the child is reaped before server exit"
            );
          })
        ).pipe(Effect.provide(Layer.merge(fixtureLayer, platform))),
      { timeout: 90_000 }
    );
  }
});
