#!/usr/bin/env bun
// Reads the two transcripts `scripts/journey.sh` writes and fails unless each session made the seven calls, Claude Code
// got an image from the last one, and both said they were done. Each kind of line is decoded with a schema of the parts
// read; a line that does not match is not that kind and is skipped.
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import {
  Array as Arr,
  Console,
  Effect,
  FileSystem,
  Option,
  Result,
  Schema,
  Stdio,
  String as Str,
} from "effect";

const expected = [
  "project_list",
  "project_get",
  "story_read",
  "story_lint",
  "plan_get",
  "build_get",
  "artifact_observe",
] as const;

const Assistant = Schema.Struct({
  message: Schema.Struct({
    content: Schema.Array(
      Schema.Struct({
        name: Schema.optionalKey(Schema.String),
        type: Schema.String,
      })
    ),
  }),
  type: Schema.Literal("assistant"),
});

const ToolResults = Schema.Struct({
  message: Schema.Struct({
    content: Schema.Array(
      Schema.Struct({
        content: Schema.optionalKey(
          Schema.Array(Schema.Struct({ type: Schema.String }))
        ),
        type: Schema.String,
      })
    ),
  }),
  type: Schema.Literal("user"),
});

const ClaudeResult = Schema.Struct({
  is_error: Schema.Boolean,
  result: Schema.String,
  type: Schema.Literal("result"),
});

const CodexItem = Schema.Struct({
  item: Schema.Struct({
    server: Schema.optionalKey(Schema.String),
    status: Schema.optionalKey(Schema.String),
    text: Schema.optionalKey(Schema.String),
    tool: Schema.optionalKey(Schema.String),
    type: Schema.String,
  }),
  type: Schema.Literal("item.completed"),
});

/** The lines of a transcript that decode with `schema`. */
const decodeAll = <S extends Schema.Top & { readonly DecodingServices: never }>(
  schema: S,
  text: string
) =>
  Effect.map(
    Effect.forEach(
      Arr.filter(Str.split("\n")(text), Str.startsWith("{")),
      (line) =>
        Effect.option(Schema.decodeEffect(Schema.fromJsonString(schema))(line))
    ),
    Arr.getSomes
  );

const said = (text: string): string => Str.replaceAll("\n", " | ")(text);

const main = Effect.gen(function* main() {
  const fs = yield* FileSystem.FileSystem;
  const [claudeFile = "", codexFile = ""] = yield* (yield* Stdio.Stdio).args;
  const claudeText = yield* fs.readFileString(claudeFile);
  const codexText = yield* fs.readFileString(codexFile);

  const calls = Arr.flatMap(yield* decodeAll(Assistant, claudeText), (line) =>
    Arr.filterMap(line.message.content, (block) =>
      block.type === "tool_use" && block.name !== undefined
        ? Result.succeed(Str.replace("mcp__tsukuri__", "")(block.name))
        : Result.failVoid
    )
  );

  const images = Arr.filter(
    Arr.flatMap(
      yield* decodeAll(ToolResults, claudeText),
      (line) => line.message.content
    ),
    (block) =>
      block.type === "tool_result" &&
      Arr.some(block.content ?? [], (part) => part.type === "image")
  );

  const final = Arr.last(yield* decodeAll(ClaudeResult, claudeText));

  const claudeSaid = Option.match(final, {
    onNone: () => "",
    onSome: (line) => line.result,
  });

  const claudeFailed = Option.match(final, {
    onNone: () => true,
    onSome: (line) => line.is_error,
  });

  const items = Arr.map(
    yield* decodeAll(CodexItem, codexText),
    (line) => line.item
  );

  const codexDone = Arr.filterMap(items, (item) =>
    item.type === "mcp_tool_call" &&
    item.server === "tsukuri" &&
    item.status === "completed" &&
    item.tool !== undefined
      ? Result.succeed(item.tool)
      : Result.failVoid
  );

  const codexSaid = Option.match(
    Arr.last(Arr.filter(items, (item) => item.type === "agent_message")),
    { onNone: () => "", onSome: (item) => item.text ?? "" }
  );

  yield* Console.log(
    `claude: calls ${Arr.join(
      Arr.filter(expected, (tool) => Arr.contains(calls, tool)),
      " "
    )}; image blocks ${images.length}`
  );
  yield* Console.log(`claude said: ${said(claudeSaid)}`);
  yield* Console.log(
    `codex: calls ${Arr.join(
      Arr.filter(expected, (tool) => Arr.contains(codexDone, tool)),
      " "
    )}`
  );
  yield* Console.log(`codex said: ${said(codexSaid)}`);

  const failures = [
    ...Arr.map(
      Arr.filter(expected, (tool) => !Arr.contains(calls, tool)),
      (tool) => `claude never called ${tool}`
    ),
    ...(images.length === 0
      ? ["claude got no image block from artifact_observe"]
      : []),
    ...(claudeFailed || !Str.includes("JOURNEY-DONE")(claudeSaid)
      ? ["claude did not finish"]
      : []),
    ...Arr.map(
      Arr.filter(expected, (tool) => !Arr.contains(codexDone, tool)),
      (tool) => `codex never completed ${tool}`
    ),
    ...(Str.includes("JOURNEY-DONE")(codexSaid)
      ? []
      : ["codex did not finish"]),
  ];

  return Arr.isReadonlyArrayNonEmpty(failures)
    ? yield* Effect.fail(`FAIL: ${Arr.join(failures, "; ")}`)
    : yield* Console.log(
        "ok: both sessions made the seven calls and Claude Code received the frame as an image block"
      );
});

NodeRuntime.runMain(Effect.provide(main, NodeServices.layer), {
  disableErrorReporting: false,
});
