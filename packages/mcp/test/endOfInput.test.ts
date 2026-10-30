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
  Option,
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
const inFlight = Effect.gen(function* started() {
  const fixture = yield* FixtureService;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const root = yield* checkout;
  const shims = yield* fs.makeTempDirectoryScoped({ prefix: "tsukuri-shims-" });
  const pidFile = path.join(shims, "pid");
  const searchPath = yield* Config.String("PATH");

  for (const tool of ["ffmpeg", "ffprobe"]) {
    yield* fs.writeFileString(
      path.join(shims, tool),
      `#!/bin/sh\necho $$ > "${pidFile}"\nexec sleep 120\n`
    );
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

  return { handle, input, pid };
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
    it.live(
      "closing stdin during a call exits 0 and leaves no ffmpeg behind",
      () =>
        Effect.scoped(
          Effect.gen(function* closed() {
            const { handle, input, pid } = yield* inFlight;

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

            const gone = yield* alive(pid).pipe(
              Effect.filterOrFail(
                (up) => !up,
                () => "still running"
              ),
              Effect.retry(Schedule.spaced("200 millis")),
              Effect.timeout("10 seconds"),
              Effect.option
            );

            assert.isTrue(
              Option.isSome(gone),
              "the in-flight ffmpeg is killed"
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
            const { handle, pid } = yield* inFlight;

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
  }
});
