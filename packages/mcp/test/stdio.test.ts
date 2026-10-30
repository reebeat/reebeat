// The executable over a real stdio pipe (spec 0016): `bin/tsukuri-mcp.ts` as a client starts it, in each protocol era.
// It is spawned with a canary in the environment (F11): the secret names an agent's shell often holds are set, the
// tools are called, and the canary must appear in nothing the server wrote, on stdout or on stderr.
import { assert, describe, it } from "@effect/vitest";
import {
  projectList,
  storyLint,
  tools as declarations,
} from "@tsukuri/lifecycle";
import {
  Array as Arr,
  Effect,
  Fiber,
  Formatter,
  Option,
  Record as Rec,
  Schema,
  Stream,
  String as Str,
} from "effect";
import { ChildProcessSpawner } from "effect/process";

import {
  FixtureService,
  checkout,
  fixtureLayer,
  platform,
  serverCommand,
} from "./support.ts";

const canary = "CANARY-9f3a1c7e-do-not-leak";

const secretNames = [
  "GH_TOKEN",
  "GITHUB_TOKEN",
  "NPM_TOKEN",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "CLOUDFLARE_API_TOKEN",
] as const;

type Request = object;

const meta = {
  "io.modelcontextprotocol/clientCapabilities": {},
  "io.modelcontextprotocol/clientInfo": { name: "stdio-test", version: "1" },
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
};

const legacy = (version: string) => [
  {
    id: 1,
    jsonrpc: "2.0",
    method: "initialize",
    params: {
      capabilities: {},
      clientInfo: { name: "stdio-test", version: "1" },
      protocolVersion: version,
    },
  },
  { jsonrpc: "2.0", method: "notifications/initialized" },
  { id: 2, jsonrpc: "2.0", method: "tools/list" },
  {
    id: 3,
    jsonrpc: "2.0",
    method: "tools/call",
    params: { arguments: {}, name: "project_list" },
  },
  {
    id: 4,
    jsonrpc: "2.0",
    method: "tools/call",
    params: { arguments: { project: "ghost" }, name: "project_get" },
  },
  {
    id: 5,
    jsonrpc: "2.0",
    method: "tools/call",
    params: { arguments: { project: "harbour" }, name: "story_lint" },
  },
  {
    id: 6,
    jsonrpc: "2.0",
    method: "tools/call",
    params: { arguments: { project: "badbuild" }, name: "build_get" },
  },
];

const modern = [
  { id: 1, jsonrpc: "2.0", method: "server/discover", params: { _meta: meta } },
  { id: 2, jsonrpc: "2.0", method: "tools/list", params: { _meta: meta } },
  {
    id: 3,
    jsonrpc: "2.0",
    method: "tools/call",
    params: { _meta: meta, arguments: {}, name: "project_list" },
  },
  {
    id: 4,
    jsonrpc: "2.0",
    method: "tools/call",
    params: {
      _meta: meta,
      arguments: { project: "ghost" },
      name: "project_get",
    },
  },
  {
    id: 5,
    jsonrpc: "2.0",
    method: "tools/call",
    params: {
      _meta: meta,
      arguments: { project: "harbour" },
      name: "story_lint",
    },
  },
  {
    id: 6,
    jsonrpc: "2.0",
    method: "tools/call",
    params: {
      _meta: meta,
      arguments: { project: "badbuild" },
      name: "build_get",
    },
  },
];

/** A JSON-RPC response: its id and the parts of its result the assertions read. */
const Frame = Schema.Struct({
  id: Schema.Finite,
  result: Schema.Struct({
    isError: Schema.optionalKey(Schema.Boolean),
    structuredContent: Schema.optionalKey(Schema.Unknown),
    tools: Schema.optionalKey(
      Schema.Array(Schema.Struct({ name: Schema.String }))
    ),
  }),
});

const decodeFrame = Schema.decodeEffect(Schema.fromJsonString(Frame));

/** Starts the executable over the fixture workspace, sends `requests`, and reads `count` responses. */
const exchange = (
  requests: readonly Request[],
  count: number,
  endInput: boolean
) =>
  Effect.scoped(
    Effect.gen(function* run() {
      const fixture = yield* FixtureService;
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const root = yield* checkout;
      const encoder = new TextEncoder();

      const sent = Stream.fromIterable(
        Arr.map(requests, (request) =>
          encoder.encode(`${Formatter.formatJson(request)}\n`)
        )
      );

      const input = endInput ? sent : Stream.concat(sent, Stream.never);

      const handle = yield* spawner.spawn(
        serverCommand(
          root,
          fixture.workspace,
          Rec.fromEntries(
            Arr.map(secretNames, (name) => [name, canary] as const)
          ),
          { endOnDone: endInput, stream: input }
        )
      );

      const stderr = yield* handle.stderr.pipe(
        Stream.decodeText(),
        Stream.runCollect,
        Effect.map(Arr.join("")),
        Effect.forkScoped
      );

      // Every line of stdout must be a JSON-RPC frame: a log line here would fail the decode below.
      const lines = yield* handle.stdout.pipe(
        Stream.decodeText(),
        Stream.splitLines,
        Stream.take(count),
        Stream.runCollect,
        Effect.timeout("90 seconds")
      );

      const frames = yield* Effect.forEach(lines, (line) => decodeFrame(line));

      if (endInput) {
        assert.strictEqual(
          Number(yield* handle.exitCode),
          0,
          "EOF drains every reply and exits cleanly"
        );
      } else {
        yield* handle.kill();
      }

      return {
        frames,
        lines,
        stderr: yield* Fiber.join(stderr).pipe(
          Effect.timeout("5 seconds"),
          Effect.orElseSucceed(() => "")
        ),
      };
    })
  ).pipe(Effect.provide(platform));

describe.each([
  ["2025-11-25", legacy("2025-11-25"), false],
  ["2025-06-18", legacy("2025-06-18"), false],
  ["2026-07-28", modern, false],
  ["2025-11-25", legacy("2025-11-25"), true],
  ["2025-06-18", legacy("2025-06-18"), true],
  ["2026-07-28", modern, true],
] as const)(
  "tsukuri-mcp over stdio in the %s era (EOF=%s)",
  (era, requests, endInput) => {
    it.layer(fixtureLayer)("on a real process", (suite) => {
      suite.effect(
        "answers list, call and declared failures, keeps stdout to frames, logs to stderr and leaks no secret",
        () =>
          Effect.gen(function* session() {
            const { frames, lines, stderr } = yield* exchange(
              requests,
              6,
              endInput
            );

            const byId = (id: number) =>
              Arr.findFirst(frames, (frame) => frame.id === id).pipe(
                Option.map((frame) => frame.result)
              );

            const listed = Option.flatMap(byId(2), (result) =>
              Option.fromNullishOr(result.tools)
            );

            assert.deepStrictEqual(
              Option.map(listed, (tools) =>
                Arr.map(tools, (tool) => tool.name)
              ),
              Option.some(Arr.map(declarations, (tool) => tool.name)),
              era
            );

            const projects = yield* Effect.flatMap(
              Effect.fromOption(byId(3)),
              (result) =>
                Schema.decodeUnknownEffect(projectList.output)(
                  result.structuredContent
                )
            );

            const lint = yield* Effect.flatMap(
              Effect.fromOption(byId(5)),
              (result) =>
                Schema.decodeUnknownEffect(storyLint.output)(
                  result.structuredContent
                )
            );

            assert.isTrue(
              Arr.some(
                projects.projects,
                (project) => project.project === "harbour"
              )
            );
            assert.strictEqual(lint.errors, 0);
            assert.deepStrictEqual(
              Arr.map([byId(4), byId(6)], (result) =>
                Option.map(result, (found) => found.isError)
              ),
              [Option.some(true), Option.some(true)]
            );
            assert.include(
              stderr,
              "does not decode",
              "the refused manifest is logged to stderr"
            );

            for (const text of [...lines, stderr]) {
              assert.isFalse(Str.includes(canary)(text), "the canary leaked");
            }
          })
      );
    });
  }
);
