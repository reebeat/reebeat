// What turns a tool declaration and its program into a registered MCP tool (spec 0016). `bind` is generic in the
// declaration, so the arguments, the value and the failure are typed by the declaration's own schemas and nothing is
// cast: it decodes the arguments strictly (an excess property is refused), runs the program, and encodes the value, or the
// declared failure, as JSON. A result is a summary line, the JSON of the value (what a client that reads only `content`
// sees), any extra blocks (a frame as an image, files as resource links), and `structuredContent` for a client that
// validates against `outputSchema`. A declared failure is a result with `isError`, never a protocol error.
import type {
  FrameImage,
  Observer,
  Projects,
  ToolDeclaration,
} from "@tsukuri/lifecycle";
import { Array as Arr, Effect, Formatter, Schema } from "effect";
import { McpSchema } from "effect/ai";

import type { Docs } from "./docs.ts";

/** What a program returns: the value as its output schema types it, a summary line, and extra content blocks. */
export interface Outcome<A> {
  readonly frame?: FrameImage;
  readonly links?: readonly {
    readonly bytes: number;
    readonly mimeType: string;
    readonly name: string;
    readonly uri: string;
  }[];
  readonly summary: string;
  readonly value: A;
}

/** The services every program reads, and nothing else: no path to a publisher, an approval or a write. */
export type Env = Docs | Observer | Projects;

/** A tool bound to its program, ready for `McpServer.addTool`. */
export interface Registered {
  readonly call: (
    payload: Schema.Json
  ) => Effect.Effect<
    McpSchema.CallToolResult,
    McpSchema.InternalError | McpSchema.InvalidParams,
    Env
  >;
  readonly declaration: ToolDeclaration;
}

const textBlock = (text: string) => ({ text, type: "text" as const });

const parseOptions = { errors: "all", onExcessProperty: "error" } as const;

export const bind = <D extends ToolDeclaration>(
  declaration: D,
  run: (
    input: D["input"]["Type"]
  ) => Effect.Effect<Outcome<D["output"]["Type"]>, D["errors"]["Type"], Env>
): Registered => {
  type Output = D["output"]["Type"];

  type Failure = D["errors"]["Type"];

  const decode = (
    payload: Schema.Json
  ): Effect.Effect<D["input"]["Type"], Schema.SchemaError> =>
    Schema.decodeEffect(Schema.toCodecJson(declaration.input))(
      payload,
      parseOptions
    );

  const encodeOutput = (
    value: Output
  ): Effect.Effect<Schema.Json, Schema.SchemaError> =>
    Schema.encodeUnknownEffect(Schema.toCodecJson(declaration.output))(value);

  const encodeFailure = (
    failure: Failure
  ): Effect.Effect<Schema.Json, Schema.SchemaError> =>
    Schema.encodeUnknownEffect(Schema.toCodecJson(declaration.errors))(failure);

  const succeeded = (outcome: Outcome<Output>) =>
    Effect.map(encodeOutput(outcome.value), (structured) => {
      const frame =
        outcome.frame === undefined
          ? []
          : [
              {
                data: outcome.frame.bytes,
                mimeType: outcome.frame.mimeType,
                type: "image" as const,
              },
            ];

      const links = Arr.map(outcome.links ?? [], (link) => ({
        mimeType: link.mimeType,
        name: link.name,
        size: link.bytes,
        type: "resource_link" as const,
        uri: link.uri,
      }));

      return new McpSchema.CallToolResult({
        content: [
          textBlock(outcome.summary),
          textBlock(Formatter.formatJson(structured)),
          ...frame,
          ...links,
        ],
        structuredContent: structured,
      });
    });

  const failed = (failure: Failure) =>
    Effect.map(
      encodeFailure(failure),
      (encoded) =>
        new McpSchema.CallToolResult({
          content: [textBlock(Formatter.formatJson(encoded))],
          isError: true,
        })
    );

  return {
    call: (payload) =>
      decode(payload).pipe(
        Effect.mapError(
          (issue) => new McpSchema.InvalidParams({ message: issue.message })
        ),
        Effect.flatMap((input) =>
          run(input).pipe(
            Effect.matchEffect({ onFailure: failed, onSuccess: succeeded }),
            Effect.mapError(
              (issue) => new McpSchema.InternalError({ message: issue.message })
            )
          )
        )
      ),
    declaration,
  };
};
