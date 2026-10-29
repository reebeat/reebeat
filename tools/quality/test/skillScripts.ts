// What the tests of the skills' shell scripts share: a temporary directory (removed with the scope), the services that run a
// child process, and the path of a script under `.agents/skills/`.
import { Effect, FileSystem, Path } from "effect";
import { ChildProcessSpawner } from "effect/process";

/** A fresh temporary directory and the services a script test needs. */
export const scratch = Effect.gen(function* scratch() {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const dir = yield* fs.makeTempDirectoryScoped();

  return { dir, fs, path, spawner };
});

/** The absolute path of `.agents/skills/<skill>/<...segments>`. */
export const skillScript = (
  path: Path.Path,
  skill: string,
  ...segments: readonly string[]
): string =>
  path.resolve(
    import.meta.dirname,
    "..",
    "..",
    "..",
    ".agents",
    "skills",
    skill,
    ...segments
  );
