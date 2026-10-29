// What the CLI knows about a story's place on disk: the default name of its build and the default place of its speech
// cache. Reading the screenplay itself (its text and the SHA-256 of its bytes) is the build program's `readSource`.
import { Effect, Path } from "effect";

/** The default name of a story's build and of its files: the name of the directory the story lives in. */
export const storyName = Effect.fnUntraced(function* storyName(story: string) {
  const path = yield* Path.Path;

  return path.basename(path.dirname(path.resolve(story)));
});

/** The default speech cache of a story: `speech-cache` beside it. */
export const defaultCache = Effect.fnUntraced(function* defaultCache(
  story: string
) {
  const path = yield* Path.Path;

  return path.join(path.dirname(path.resolve(story)), "speech-cache");
});
