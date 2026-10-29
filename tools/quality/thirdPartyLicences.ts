import {
  Array as Arr,
  Option,
  Order,
  Record,
  Result,
  String as Str,
  Struct,
} from "effect";

// A `bun.lock` entry is `"<key>": ["<name>@<version>", ...]`; a workspace package is `<name>@workspace:<path>` and is
// reebeat's own code, not a third-party package.
const entry = /^\s+"[^"]+": \["(?<id>[^"]+)", /gmu;

const workspace = "@workspace:";

/**
 * SPDX identifiers of licences that put no condition on reebeat's own code beyond keeping the notice
 * (docs/design/third-party.md). Anything else, GPL, AGPL, SSPL and an unknown or missing licence included, is a violation.
 */
const allowed: readonly string[] = [
  "0BSD",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "BlueOak-1.0.0",
  "CC0-1.0",
  "ISC",
  "MIT",
  "MPL-2.0",
  "OFL-1.1",
  "Python-2.0",
];

/**
 * The one weak-copyleft exception: `@img/sharp-*` packages carry the prebuilt libvips as LGPL-3.0-or-later shared
 * libraries. `@huggingface/transformers` (Kokoro) pulls them in; npm installs them, reebeat does not distribute them.
 */
const lgpl = "LGPL-3.0-or-later";
const lgplHost = "@img/sharp-";

const idName = /^(?<name>.+)@[^@]+$/u;

const nameOf = (id: string): string => idName.exec(id)?.groups?.name ?? id;

const termAllowed = (name: string, term: string): boolean =>
  Arr.contains(allowed, term) ||
  (term === lgpl && Str.startsWith(lgplHost)(name));

// `A AND B OR C`: AND binds tighter than OR. Parentheses are only accepted around the whole expression, so a
// group inside an expression (whose precedence this flat reading would get wrong) counts as not allowed.
const flat = /^\(?[^()]*\)?$/u;

const expressionAllowed = (name: string, expression: string): boolean =>
  flat.test(expression) &&
  Arr.some(
    Str.split(Str.replaceAll(/[()]/gu, "")(expression), " OR "),
    (choice) =>
      Arr.every(Str.split(choice, " AND "), (term) =>
        termAllowed(name, Str.trim(term))
      )
  );

const lockedIds = (lock: string): readonly string[] =>
  Arr.sort(
    Arr.dedupe(
      Arr.filterMap(
        Arr.fromIterable(Str.matchAll(entry)(lock)),
        ({ groups }) =>
          groups?.id === undefined || Str.includes(workspace)(groups.id)
            ? Result.failVoid
            : Result.succeed(groups.id)
      )
    ),
    Order.String
  );

/**
 * Sentences that describe how the third-party packages of a `bun.lock` text step out of the licence policy, given the
 * licence recorded for each `<name>@<version>`. Empty when every locked package has a recorded licence made only of
 * allowed identifiers and no recorded package is absent from the lock.
 */
export const licenceViolations = (
  lock: string,
  licences: Readonly<Record<string, string>>
): readonly string[] => {
  const ids = lockedIds(lock);

  const unlocked = Arr.difference(Struct.keys(licences), ids);

  const checked = Arr.filterMap(ids, (id) =>
    Option.match(Record.get(licences, id), {
      onNone: () => Result.succeed(`${id} has no recorded licence`),
      onSome: (licence) =>
        expressionAllowed(nameOf(id), licence)
          ? Result.failVoid
          : Result.succeed(`${id} is ${licence}, which the policy rejects`),
    })
  );

  return [
    ...checked,
    ...Arr.map(
      Arr.sort(unlocked, Order.String),
      (id) => `${id} has a recorded licence but is not in bun.lock`
    ),
  ];
};
