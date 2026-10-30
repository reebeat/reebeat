// F6, protocol conformance (spec 0016): the MCP conformance suite, pinned, against the shared server core behind
// `McpServer.layerHttp` over a real socket, at each revision the server speaks. The fixture adds the diagnostic tools the
// suite looks for by name; the inspector's real tools are served beside them, so `tools-list` and the transport are
// checked over the same registrations the executable has. A scenario is allowed to fail only when it is in the
// baseline of its revision with a written reason (`packages/mcp/conformance/`). The suite is fetched with `npx`: the test
// needs the network the first time and fails, never skips, without it.
import { assert, describe, it } from "@effect/vitest";
import {
  Array as Arr,
  Effect,
  Fiber,
  Option,
  Path,
  Stream,
  String as Str,
} from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import { FixtureService, checkout, fixtureLayer, platform } from "./support.ts";

/** The pinned release of the suite (an alpha: pinned exactly, spec 0016 "Operator decisions"). */
export const conformanceVersion = "0.2.0-alpha.12";

const revisions = ["2026-07-28", "2025-11-25"] as const;

const ready = /^listening (?<port>\d+)$/u;

const runFixture = Effect.gen(function* fixture() {
  const fixtureService = yield* FixtureService;
  const path = yield* Path.Path;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const root = yield* checkout;

  const handle = yield* spawner.spawn(
    ChildProcess.make(
      "bun",
      [path.join(root, "packages", "mcp", "test", "conformanceFixture.ts")],
      {
        cwd: root,
        env: {
          TSUKURI_BUILDS: fixtureService.workspace.builds,
          TSUKURI_ROOT: fixtureService.workspace.root,
        },
        extendEnv: true,
      }
    )
  );

  const first = yield* handle.stdout.pipe(
    Stream.decodeText(),
    Stream.splitLines,
    Stream.filter((line) => ready.test(line)),
    Stream.take(1),
    Stream.runCollect,
    Effect.timeout("60 seconds")
  );

  const match = ready.exec(
    Option.getOrElse(Arr.head(Arr.fromIterable(first)), () => "")
  );

  return `http://127.0.0.1:${match?.groups?.port ?? "0"}/mcp`;
});

const suite = (url: string, revision: (typeof revisions)[number]) =>
  Effect.gen(function* run() {
    const fixtureService = yield* FixtureService;
    const path = yield* Path.Path;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const root = yield* checkout;

    const baseline = path.join(
      root,
      "packages",
      "mcp",
      "conformance",
      `baseline-${revision}.yml`
    );

    const handle = yield* spawner.spawn(
      ChildProcess.make(
        "npx",
        [
          "--yes",
          `@modelcontextprotocol/conformance@${conformanceVersion}`,
          "server",
          "--url",
          url,
          "--requirements",
          revision,
          "--expected-failures",
          baseline,
        ],
        // Not the repository: its `devEngines` (bun) refuses `npm`, and the suite needs no project.
        {
          cwd: path.dirname(fixtureService.workspace.root),
          extendEnv: true,
          stderr: "pipe",
          stdout: "pipe",
        }
      )
    );

    const output = yield* handle.all.pipe(
      Stream.decodeText(),
      Stream.runCollect,
      Effect.map(Arr.join("")),
      Effect.forkScoped
    );

    const code = yield* handle.exitCode;

    return { code, output: yield* Fiber.join(output) };
  });

describe("protocol conformance (F6)", () => {
  it.layer(fixtureLayer)(
    "against the shared server core over HTTP",
    (suiteLayer) => {
      suiteLayer.effect(
        "passes every scored scenario of each revision it speaks, but the baselined ones",
        () =>
          Effect.scoped(
            Effect.gen(function* all() {
              const url = yield* runFixture;

              for (const revision of revisions) {
                const { code, output } = yield* suite(url, revision);

                assert.strictEqual(
                  code,
                  0,
                  `${revision}: ${Str.slice(-2500)(output)}`
                );
                assert.include(
                  output,
                  "Baseline check passed: all failures are expected.",
                  revision
                );
              }
            })
          ).pipe(Effect.provide(platform)),
        { timeout: 300_000 }
      );
    }
  );
});
