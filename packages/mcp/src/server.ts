// The MCP server over the lifecycle declarations (spec 0016): every tool of `@tsukuri/lifecycle` is registered with
// `McpServer.addTool`, from its declaration alone, so there is one derivation for the list, the schemas, the hints and the
// result shape. The Toolkit path is not used because a result here carries more than one text block: a frame is an image
// block and a build's files are resource links (see `bind.ts`).
import {
  contractVersion,
  distribution,
  instructionsOf,
  tools as declarations,
} from "@tsukuri/lifecycle";
import type { ToolDeclaration } from "@tsukuri/lifecycle";
import { Context, Effect, Layer, Record as Rec, Schema } from "effect";
import { McpProtocol, McpSchema, McpServer } from "effect/ai";

import type { Env, Registered } from "./bind.ts";
import { handlers } from "./handlers.ts";

/** The protocol eras the server speaks, newest first. Clients negotiate one per connection (spec 0016, D4). */
export const protocols = [
  McpProtocol.v2026_07_28,
  McpProtocol.v2025_11_25,
  McpProtocol.v2025_06_18,
] as const;

/** The JSON Schema of `schema` as a tool definition carries it: an object root, definitions inline. */
const jsonSchemaOf = (schema: Schema.Top, strict: boolean) => {
  const document = Schema.toJsonSchemaDocument(schema, {
    onExcessProperty: strict ? "error" : "ignore",
  });

  return Rec.isEmptyRecord(document.definitions)
    ? { ...document.schema }
    : { ...document.schema, $defs: document.definitions };
};

/** The definition `tools/list` returns for a declaration: the one place a declaration becomes a wire tool. */
export const toolOf = (declaration: ToolDeclaration): McpSchema.Tool =>
  new McpSchema.Tool({
    annotations: {
      destructiveHint: declaration.annotations.destructive,
      idempotentHint: declaration.annotations.idempotent,
      openWorldHint: declaration.annotations.openWorld,
      readOnlyHint: declaration.annotations.readOnly,
      title: declaration.title,
    },
    description: declaration.description,
    inputSchema: { ...jsonSchemaOf(declaration.input, true), type: "object" },
    name: declaration.name,
    outputSchema: jsonSchemaOf(declaration.output, false),
    title: declaration.title,
  });

const register = (tool: Registered) =>
  Effect.gen(function* registerOne() {
    const server = yield* McpServer.McpServer;
    const context = yield* Effect.context<Env>();

    yield* server.addTool({
      annotations: Context.empty(),
      handle: (payload: Schema.Json | undefined) =>
        Effect.provideContext(tool.call(payload ?? {}), context),
      tool: toolOf(tool.declaration),
    });
  });

/** Registers every handler: the one derivation of `tools/list` and `tools/call`. */
export const registrations: Layer.Layer<
  never,
  never,
  McpServer.McpServer | Env
> = Layer.effectDiscard(Effect.forEach(handlers, register, { discard: true }));

export const serverInfo = {
  instructions: instructionsOf(declarations),
  name: distribution.name,
  version: contractVersion,
} as const;
