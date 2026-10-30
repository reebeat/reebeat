// The documents `docs_get` serves (spec 0016): the grammar generated from the core, the glossary and the lifecycle
// skill read from the checkout's own files, so there is one copy of each and a document cannot drift from its source.
import { grammarDocument } from "@tsukuri/core";
import { Unreadable } from "@tsukuri/lifecycle";
import { Context, Effect, FileSystem, Layer, Path } from "effect";

/** The largest document served: the glossary and the skill are far below it. */
const maxDocumentBytes = 1024 * 1024;

export type DocTopic = "glossary" | "grammar" | "lifecycle";

export class Docs extends Context.Service<
  Docs,
  {
    readonly read: (topic: DocTopic) => Effect.Effect<string, Unreadable>;
  }
>()("@tsukuri/mcp/Docs") {}

const sources: Readonly<
  Record<Exclude<DocTopic, "grammar">, readonly string[]>
> = {
  glossary: ["GLOSSARY.md"],
  lifecycle: [
    "packages",
    "lifecycle",
    "skills",
    "tsukuri-lifecycle",
    "SKILL.md",
  ],
};

/** The documents of the checkout at `checkout`. */
export const fileDocs = (
  checkout: string
): Layer.Layer<Docs, never, FileSystem.FileSystem | Path.Path> =>
  Layer.effect(
    Docs,
    Effect.gen(function* build() {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;

      /** A document of the checkout: a regular file, not a link, under the size cap; the topic is a fixed word. */
      const readDocument = (file: string, topic: DocTopic) =>
        Effect.gen(function* documentRead() {
          const info = yield* fs.lstat(file);

          if (info.type !== "File" || Number(info.size) > maxDocumentBytes) {
            return yield* new Unreadable({
              message: `the ${topic} document is not a regular file under ${maxDocumentBytes} bytes`,
              project: "docs",
            });
          }

          return yield* fs.readFileString(file);
        }).pipe(
          Effect.catchTag("PlatformError", (cause) =>
            Effect.logWarning(
              `reading the ${topic} document failed`,
              cause
            ).pipe(
              Effect.andThen(
                Effect.fail(
                  new Unreadable({
                    message: `cannot read the ${topic} document`,
                    project: "docs",
                  })
                )
              )
            )
          )
        );

      return Docs.of({
        read: (topic) =>
          topic === "grammar"
            ? Effect.succeed(grammarDocument())
            : readDocument(path.join(checkout, ...sources[topic]), topic),
      });
    })
  );
