// The one rule for the base name of the files a build writes (`<name>.mp4`, `<name>.vtt`): a plain file stem, so the
// files cannot land outside the output directory (`--name ../../escaped`). The CLI, the build program and the
// encoder each check it at their own boundary; the rule lives here once.
import { Effect } from "effect";

import { InvalidOutputName } from "./errors.ts";

/** A plain file name: it starts with a letter or digit and holds letters, digits, `.`, `_` and `-` only. */
const stemPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;

/** The name as a plain file stem, or why it is not one. `..` inside a name is refused too. */
export const requireOutputName = (
  name: string
): Effect.Effect<string, InvalidOutputName> =>
  stemPattern.test(name) && !name.includes("..")
    ? Effect.succeed(name)
    : Effect.fail(
        new InvalidOutputName({
          message: `the output name ${JSON.stringify(name)} is not a plain file name (letters, digits, ".", "_" and "-", starting with a letter or digit, no "..")`,
          stem: name,
        })
      );
