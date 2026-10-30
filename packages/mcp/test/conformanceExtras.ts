// What the MCP conformance suite looks for by name (spec 0016, F6), as a test-only registration beside the inspector's
// real tools: the diagnostic tools, resources, a template, prompts and a completion. None of it is shipped, and none of
// it touches a project: it exists so the suite can exercise the shared server core and both transports.
import { sha256Hex } from "@tsukuri/pipeline";
import {
  Array as Arr,
  Context,
  Effect,
  Layer,
  Option,
  Predicate,
  Record as Rec,
  Result,
  Schema,
  String as Str,
} from "effect";
import { McpSchema, McpServer } from "effect/ai";
import type { Digest } from "effect/crypto";

const png = Uint8Array.from([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0,
  0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 120,
  156, 99, 248, 207, 192, 240, 31, 0, 5, 0, 1, 255, 137, 153, 61, 29, 0, 0, 0,
  0, 73, 69, 78, 68, 174, 66, 96, 130,
]);

const wav = Uint8Array.from([
  82, 73, 70, 70, 36, 0, 0, 0, 87, 65, 86, 69, 102, 109, 116, 32, 16, 0, 0, 0,
  1, 0, 1, 0, 68, 172, 0, 0, 136, 88, 1, 0, 2, 0, 16, 0, 100, 97, 116, 97, 0, 0,
  0, 0,
]);

const noInput = { properties: {}, type: "object" } as const;

const text = (value: string) => ({ text: value, type: "text" as const });

const diagnostic = (
  name: string,
  description: string,
  handle: Effect.Effect<
    McpSchema.CallToolResult,
    never,
    McpSchema.McpRequestContext | McpServer.McpServer
  >
) =>
  Layer.effectDiscard(
    Effect.gen(function* register() {
      const server = yield* McpServer.McpServer;

      yield* server.addTool({
        annotations: Context.empty(),
        handle: () =>
          Effect.provideService(handle, McpServer.McpServer, server),
        tool: new McpSchema.Tool({
          annotations: { readOnlyHint: true },
          description,
          inputSchema: noInput,
          name,
        }),
      });
    })
  );

const embedded = (uri: string, body: string) => ({
  resource: { mimeType: "text/plain", text: body, uri },
  type: "resource" as const,
});

const progress = Effect.gen(function* progressing() {
  const server = yield* McpServer.McpServer;
  const context = yield* McpSchema.McpRequestContext;
  const token = context.requestMetadata?.progressToken;

  for (const step of [1, 2, 3]) {
    if (Predicate.isString(token) || Predicate.isNumber(token)) {
      yield* server.notifications["notifications/progress"]({
        progress: step,
        progressToken: token,
        total: 3,
      });
    }
  }

  return new McpSchema.CallToolResult({
    content: [text("Progress reported.")],
  });
}).pipe(Effect.orDie);

const logging = Effect.gen(function* logged() {
  const server = yield* McpServer.McpServer;

  yield* server.notifications["notifications/message"]({
    data: "log from the fixture",
    level: "info",
  });

  return new McpSchema.CallToolResult({ content: [text("Logged.")] });
}).pipe(Effect.orDie);

// ---------------------------------------------------------------------------------------------------------------------
// Multi round-trip requests (SEP-2322): a handler that cannot finish returns `InputRequired`; the client sends the
// answers back with the echoed `requestState`, which the server signs so a tampered one is refused.
// ---------------------------------------------------------------------------------------------------------------------

type Handle = Effect.Effect<
  McpSchema.CallToolResult | McpSchema.InputRequired,
  McpSchema.InvalidParams,
  McpSchema.McpRequestContext
>;

const secret = "fixture-signing-key";

const elicitation = (
  message: string,
  field: string,
  type: "boolean" | "string" = "string"
) => ({
  method: "elicitation/create" as const,
  params: {
    message,
    requestedSchema: {
      properties: { [field]: { type } },
      required: [field],
      type: "object",
    },
  },
});

const sampling = (prompt: string, maxTokens: number) => ({
  method: "sampling/createMessage" as const,
  params: {
    maxTokens,
    messages: [{ content: { text: prompt, type: "text" }, role: "user" }],
  },
});

const roots = { method: "roots/list" as const, params: {} };

/** What the client's answers look like: read with the schema of each, never by walking an unknown. */
const NameAnswer = Schema.Struct({
  content: Schema.Struct({ name: Schema.String }),
});

const TextAnswer = Schema.Struct({
  content: Schema.Struct({ text: Schema.String }),
});

const RootsAnswer = Schema.Struct({
  roots: Schema.Array(Schema.Struct({ uri: Schema.String })),
});

const nameOf = Schema.decodeUnknownOption(NameAnswer);
const textOf = Schema.decodeUnknownOption(TextAnswer);
const rootsOf = Schema.decodeUnknownOption(RootsAnswer);

interface Signer {
  readonly sign: (value: string) => Effect.Effect<string>;
  readonly verify: (
    state: string | undefined
  ) => Effect.Effect<Option.Option<string>>;
}

const signer = (digest: Context.Context<Digest.Digest>): Signer => {
  const mac = (value: string) =>
    Effect.provideContext(
      sha256Hex(new TextEncoder().encode(`${secret}:${value}`)),
      digest
    ).pipe(Effect.orDie);

  return {
    sign: (value) => Effect.map(mac(value), (hash) => `${value}.${hash}`),
    verify: (state) =>
      Effect.gen(function* verified() {
        const parts = state === undefined ? [] : Str.split(".")(state);
        const hash = parts.at(-1);
        const value = Arr.join(Arr.take(parts, parts.length - 1), ".");

        return parts.length > 1 && (yield* mac(value)) === hash
          ? Option.some(value)
          : Option.none<string>();
      }),
  };
};

/** A tool that has no arguments and may ask the client for input; `handle` sees the current request's answers. */
const input = (
  name: string,
  description: string,
  handle: (signed: Signer) => Handle
) =>
  Layer.effectDiscard(
    Effect.gen(function* register() {
      const server = yield* McpServer.McpServer;
      const digest = yield* Effect.context<Digest.Digest>();

      yield* server.addTool({
        annotations: Context.empty(),
        handle: () => handle(signer(digest)),
        tool: new McpSchema.Tool({
          annotations: { readOnlyHint: true },
          description,
          inputSchema: noInput,
          name,
        }),
      });
    })
  );

const answered = Effect.map(
  McpSchema.McpRequestContext,
  (context) => context.inputResponses ?? {}
);

const complete = (message: string) =>
  new McpSchema.CallToolResult({ content: [text(message)] });

const requestedState = Effect.map(
  McpSchema.McpRequestContext,
  (context) => context.requestState
);

const tampered = Effect.fail(
  new McpSchema.InvalidParams({
    message: "requestState failed its integrity check",
  })
);

const mrtrTools = Layer.mergeAll(
  input("test_input_required_result_elicitation", "Asks for a name.", () =>
    Effect.gen(function* run() {
      const response = (yield* answered).user_name;

      return response === undefined
        ? new McpSchema.InputRequired({
            inputRequests: {
              user_name: elicitation("What is your name?", "name"),
            },
          })
        : complete(
            `Hello, ${Option.match(nameOf(response), { onNone: () => "", onSome: (answer) => answer.content.name })}!`
          );
    })
  ),
  input("test_input_required_result_sampling", "Asks the client's model.", () =>
    Effect.gen(function* run() {
      const response = (yield* answered).capital_question;

      return response === undefined
        ? new McpSchema.InputRequired({
            inputRequests: {
              capital_question: sampling("What is the capital of France?", 100),
            },
          })
        : complete(
            `Sampling response: ${Option.match(textOf(response), { onNone: () => "", onSome: (answer) => answer.content.text })}`
          );
    })
  ),
  input(
    "test_input_required_result_list_roots",
    "Asks for the client's roots.",
    () =>
      Effect.gen(function* run() {
        const response = (yield* answered).client_roots;

        return response === undefined
          ? new McpSchema.InputRequired({
              inputRequests: { client_roots: roots },
            })
          : complete(
              `Roots: ${Option.match(rootsOf(response), {
                onNone: () => "",
                onSome: (answer) =>
                  Arr.join(
                    Arr.map(answer.roots, (root) => root.uri),
                    ", "
                  ),
              })}`
            );
      })
  ),
  input(
    "test_input_required_result_request_state",
    "Round-trips a signed state.",
    (signed) =>
      Effect.gen(function* run() {
        const responses = yield* answered;
        const state = yield* requestedState;

        if (responses.confirm === undefined) {
          return new McpSchema.InputRequired({
            inputRequests: {
              confirm: elicitation("Please confirm", "ok", "boolean"),
            },
            requestState: yield* signed.sign("round-1"),
          });
        }

        return Option.isSome(yield* signed.verify(state))
          ? complete("state-ok: the state was validated")
          : yield* tampered;
      })
  ),
  input(
    "test_input_required_result_multiple_inputs",
    "Asks for three kinds of input at once.",
    (signed) =>
      Effect.gen(function* run() {
        const responses = yield* answered;

        if (
          responses.user_name === undefined ||
          responses.greeting === undefined ||
          responses.client_roots === undefined
        ) {
          return new McpSchema.InputRequired({
            inputRequests: {
              client_roots: roots,
              greeting: sampling("Generate a greeting", 50),
              user_name: elicitation("What is your name?", "name"),
            },
            requestState: yield* signed.sign("multiple"),
          });
        }

        return Option.isSome(yield* signed.verify(yield* requestedState))
          ? complete("All three inputs received.")
          : yield* tampered;
      })
  ),
  input(
    "test_input_required_result_multi_round",
    "Asks in two rounds.",
    (signed) =>
      Effect.gen(function* run() {
        const responses = yield* answered;
        const given = yield* requestedState;
        const state = Option.getOrUndefined(yield* signed.verify(given));

        if (given === undefined) {
          return new McpSchema.InputRequired({
            inputRequests: {
              step1: elicitation("Step 1: What is your name?", "name"),
            },
            requestState: yield* signed.sign("round-1"),
          });
        }

        if (state === "round-1" && responses.step1 !== undefined) {
          return new McpSchema.InputRequired({
            inputRequests: {
              step2: elicitation(
                "Step 2: What is your favorite color?",
                "color"
              ),
            },
            requestState: yield* signed.sign("round-2"),
          });
        }

        return state === "round-2" && responses.step2 !== undefined
          ? complete("Both steps completed.")
          : yield* tampered;
      })
  ),
  input(
    "test_input_required_result_tampered_state",
    "Signs its state.",
    (signed) =>
      Effect.gen(function* run() {
        const state = yield* requestedState;

        if (state === undefined) {
          return new McpSchema.InputRequired({
            inputRequests: {
              confirm: elicitation("Please confirm", "ok", "boolean"),
            },
            requestState: yield* signed.sign("untouched"),
          });
        }

        return Option.isSome(yield* signed.verify(state))
          ? complete("state-ok")
          : yield* tampered;
      })
  ),
  input(
    "test_input_required_result_capabilities",
    "Asks only what the client declared.",
    () =>
      Effect.gen(function* run() {
        const declared = (yield* McpSchema.McpRequestContext)
          .clientCapabilities;

        const candidates = [
          [
            "user_name",
            declared.elicitation,
            () => elicitation("What is your name?", "name"),
          ],
          [
            "greeting",
            declared.sampling,
            () => sampling("Generate a greeting", 50),
          ],
          ["client_roots", declared.roots, () => roots],
        ] as const;

        const wanted: Readonly<Record<string, McpSchema.McpInputRequest>> =
          Rec.fromEntries(
            Arr.filterMap(candidates, ([key, capability, request]) =>
              capability === undefined
                ? Result.failVoid
                : Result.succeed([key, request()] as const)
            )
          );

        return Rec.isEmptyRecord(wanted)
          ? complete("The client declared no input capability.")
          : new McpSchema.InputRequired({ inputRequests: wanted });
      })
  ),
  Layer.effectDiscard(
    Effect.gen(function* prompt() {
      const server = yield* McpServer.McpServer;

      yield* server.addPrompt({
        annotations: Context.empty(),
        completions: {},
        handle: () =>
          Effect.map(answered, (responses) =>
            responses.user_context === undefined
              ? new McpSchema.InputRequired({
                  inputRequests: {
                    user_context: elicitation(
                      "What context should the prompt use?",
                      "context"
                    ),
                  },
                })
              : new McpSchema.GetPromptResult({
                  description: "A prompt that asked first.",
                  messages: [
                    { content: text("Context received."), role: "user" },
                  ],
                })
          ),
        prompt: new McpSchema.Prompt({
          arguments: [],
          description: "A prompt that needs input.",
          name: "test_input_required_result_prompt",
        }),
      });
    })
  )
);

const loggingThrice = Effect.gen(function* logged() {
  const server = yield* McpServer.McpServer;

  for (const step of [
    "Tool execution started",
    "Tool processing data",
    "Tool execution completed",
  ]) {
    yield* server.notifications["notifications/message"]({
      data: step,
      level: "info",
    });
  }

  return new McpSchema.CallToolResult({
    content: [text("Logged three times.")],
  });
}).pipe(Effect.orDie);

export const conformanceExtras = Layer.mergeAll(
  mrtrTools,
  diagnostic(
    "test_simple_text",
    "Returns simple text.",
    Effect.succeed(
      new McpSchema.CallToolResult({
        content: [text("This is a simple text response for testing.")],
      })
    )
  ),
  diagnostic(
    "test_image_content",
    "Returns an image.",
    Effect.succeed(
      new McpSchema.CallToolResult({
        content: [{ data: png, mimeType: "image/png", type: "image" }],
      })
    )
  ),
  diagnostic(
    "test_audio_content",
    "Returns audio.",
    Effect.succeed(
      new McpSchema.CallToolResult({
        content: [{ data: wav, mimeType: "audio/wav", type: "audio" }],
      })
    )
  ),
  diagnostic(
    "test_embedded_resource",
    "Returns an embedded resource.",
    Effect.succeed(
      new McpSchema.CallToolResult({
        content: [
          embedded(
            "test://embedded-resource",
            "This is an embedded resource content."
          ),
        ],
      })
    )
  ),
  diagnostic(
    "test_multiple_content_types",
    "Returns text, an image and a resource.",
    Effect.succeed(
      new McpSchema.CallToolResult({
        content: [
          text("Multiple content types test:"),
          { data: png, mimeType: "image/png", type: "image" },
          embedded(
            "test://mixed-content-resource",
            '{"test":"data","value":123}'
          ),
        ],
      })
    )
  ),
  diagnostic(
    "test_error_handling",
    "Always fails.",
    Effect.succeed(
      new McpSchema.CallToolResult({
        content: [text("This tool intentionally returns an error for testing")],
        isError: true,
      })
    )
  ),
  diagnostic("test_tool_with_progress", "Reports progress.", progress),
  diagnostic("test_logging_tool", "Logs once.", logging),
  diagnostic("test_tool_with_logging", "Logs three times.", loggingThrice),
  McpServer.resource({
    content: Effect.succeed({
      contents: [
        {
          mimeType: "text/plain",
          text: "This is the content of the static text resource.",
          uri: "test://static-text",
        },
      ],
    }),
    mimeType: "text/plain",
    name: "static-text",
    uri: "test://static-text",
  }),
  McpServer.resource({
    content: Effect.succeed({
      contents: [
        { blob: png, mimeType: "image/png", uri: "test://static-binary" },
      ],
    }),
    mimeType: "image/png",
    name: "static-binary",
    uri: "test://static-binary",
  }),
  McpServer.resource`test://template/${Schema.String}/data`({
    content: (_uri, id) =>
      Effect.succeed({
        contents: [
          {
            mimeType: "application/json",
            text: JSON.stringify({
              data: `Data for ID: ${id}`,
              id,
              templateTest: true,
            }),
            uri: `test://template/${id}/data`,
          },
        ],
      }),
    mimeType: "application/json",
    name: "template",
  }),
  McpServer.prompt({
    content: () => Effect.succeed("This is a simple prompt for testing."),
    description: "A prompt with no arguments.",
    name: "test_simple_prompt",
  }),
  McpServer.prompt({
    completion: { arg1: () => Effect.succeed(["paris", "park", "party"]) },
    content: ({ arg1, arg2 }) =>
      Effect.succeed(`Prompt with arguments: arg1='${arg1}', arg2='${arg2}'`),
    description: "A prompt with two arguments.",
    name: "test_prompt_with_arguments",
    parameters: { arg1: Schema.String, arg2: Schema.String },
  }),
  McpServer.prompt({
    content: ({ resourceUri }) =>
      Effect.succeed([
        {
          content: embedded(
            resourceUri,
            "Embedded resource content for testing."
          ),
          role: "user" as const,
        },
        {
          content: text("Please process the embedded resource above."),
          role: "user" as const,
        },
      ]),
    description: "A prompt that embeds a resource.",
    name: "test_prompt_with_embedded_resource",
    parameters: { resourceUri: Schema.String },
  }),
  McpServer.prompt({
    content: () =>
      Effect.succeed([
        {
          content: { data: png, mimeType: "image/png", type: "image" as const },
          role: "user" as const,
        },
        {
          content: text("Please analyze the image above."),
          role: "user" as const,
        },
      ]),
    description: "A prompt with an image.",
    name: "test_prompt_with_image",
  })
);
