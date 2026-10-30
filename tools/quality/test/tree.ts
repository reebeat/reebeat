// A file tree in a fresh temporary directory, for the tests of the quality tools.
import { Effect, FileSystem, Path, Record } from "effect";

/** Files of a tree in a fresh temporary directory (removed with the scope): path relative to it, then the text. */
export const tree = Effect.fn("tree")(function* tree(
  files: Readonly<Record<string, string>>
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.makeTempDirectoryScoped();

  yield* Effect.forEach(Record.toEntries(files), ([name, text]) =>
    Effect.gen(function* write() {
      const file = path.join(root, name);

      yield* fs.makeDirectory(path.dirname(file), { recursive: true });
      yield* fs.writeFileString(file, text);
    })
  );

  return root;
});
