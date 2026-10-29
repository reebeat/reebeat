import { NodeServices } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import {
  Array as Arr,
  Effect,
  FileSystem,
  Path,
  Schema,
  String as Str,
} from "effect";

import { licenceViolations } from "../thirdPartyLicences.ts";

const read = (relative: string) =>
  Effect.gen(function* readText() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    return yield* fs.readFileString(
      yield* path.fromFileUrl(new URL(relative, import.meta.url))
    );
  });

const Licences = Schema.fromJsonString(
  Schema.Record(Schema.String, Schema.String)
);

const realLicences = Effect.gen(function* realLicences() {
  return yield* Schema.decodeEffect(Licences)(
    yield* read("../third-party-licences.json")
  );
});

const entry = (id: string) => `    "${id}": ["${id}", "", {}, "sha512-x"],\n`;

describe("third-party licences", () => {
  it.effect(
    "every package of the real bun.lock has a recorded licence the policy allows",
    () =>
      Effect.gen(function* aligned() {
        assert.deepStrictEqual(
          licenceViolations(
            yield* read("../../../bun.lock"),
            yield* realLicences
          ),
          []
        );
      }).pipe(Effect.provide(NodeServices.layer))
  );

  it.effect(
    "negative control: a GPL package added to the real bun.lock is rejected by name",
    () =>
      Effect.gen(function* gpl() {
        const lock = `${yield* read("../../../bun.lock")}${entry("probe@1.0.0")}`;

        const licences = {
          ...(yield* realLicences),
          "probe@1.0.0": "GPL-3.0-only",
        };

        assert.deepStrictEqual(licenceViolations(lock, licences), [
          "probe@1.0.0 is GPL-3.0-only, which the policy rejects",
        ]);
      }).pipe(Effect.provide(NodeServices.layer))
  );

  it("rejects AGPL, SSPL and a licence that is not an SPDX identifier", () => {
    const lock = `${entry("a@1.0.0")}${entry("b@1.0.0")}${entry("c@1.0.0")}`;

    assert.lengthOf(
      licenceViolations(lock, {
        "a@1.0.0": "AGPL-3.0-or-later",
        "b@1.0.0": "SSPL-1.0",
        "c@1.0.0": "SEE LICENSE IN LICENSE.md",
      }),
      3
    );
  });

  it("names a locked package with no recorded licence, and a recorded one that left the lock", () => {
    assert.deepStrictEqual(
      licenceViolations(entry("new@1.0.0"), { "old@1.0.0": "MIT" }),
      [
        "new@1.0.0 has no recorded licence",
        "old@1.0.0 has a recorded licence but is not in bun.lock",
      ]
    );
  });

  it("ignores the workspace packages, which are reebeat's own code", () => {
    assert.deepStrictEqual(
      licenceViolations(entry("@reebeat/core@workspace:packages/core"), {}),
      []
    );
  });

  it("allows an OR expression when one alternative is allowed, and an AND expression only when all are", () => {
    const lock = `${entry("a@1.0.0")}${entry("b@1.0.0")}`;

    assert.deepStrictEqual(
      licenceViolations(lock, {
        "a@1.0.0": "(MIT OR GPL-3.0-only)",
        "b@1.0.0": "MIT AND GPL-3.0-only",
      }),
      ["b@1.0.0 is MIT AND GPL-3.0-only, which the policy rejects"]
    );
  });

  it("allows LGPL-3.0-or-later for the libvips binaries of sharp and for no other package", () => {
    const lock = `${entry("@img/sharp-libvips-linux-x64@1.2.4")}${entry("other@1.0.0")}`;

    assert.deepStrictEqual(
      licenceViolations(lock, {
        "@img/sharp-libvips-linux-x64@1.2.4": "LGPL-3.0-or-later",
        "other@1.0.0": "LGPL-3.0-or-later",
      }),
      ["other@1.0.0 is LGPL-3.0-or-later, which the policy rejects"]
    );
  });

  it("rejects a parenthesised group inside an expression instead of guessing its precedence", () => {
    assert.lengthOf(
      licenceViolations(entry("a@1.0.0"), {
        "a@1.0.0": "MIT AND (ISC OR GPL-3.0-only)",
      }),
      1
    );
  });
});

const Manifest = Schema.fromJsonString(
  Schema.Struct({ license: Schema.optional(Schema.String) })
);

// The root manifest and the manifest of every directory under the workspaces `packages/*` and `tools/*`.
const manifestPaths = Effect.gen(function* manifestPaths() {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* path.fromFileUrl(new URL("../../../", import.meta.url));

  const children = yield* Effect.forEach(["packages", "tools"], (parent) =>
    Effect.map(fs.readDirectory(path.join(root, parent)), (names) =>
      Arr.map(names, (name) => path.join(root, parent, name, "package.json"))
    )
  );

  return yield* Effect.filter(
    [path.join(root, "package.json"), ...Arr.flatten(children)],
    fs.exists
  );
});

describe("licence declared by every manifest", () => {
  it.effect("the root and every workspace package.json says Apache-2.0", () =>
    Effect.gen(function* declared() {
      const fs = yield* FileSystem.FileSystem;
      const paths = yield* manifestPaths;

      const licences = yield* Effect.forEach(paths, (file) =>
        Effect.map(
          Effect.flatMap(
            fs.readFileString(file),
            Schema.decodeEffect(Manifest)
          ),
          ({ license }) => `${file} ${license}`
        )
      );

      assert.isAbove(paths.length, 1);
      assert.deepStrictEqual(
        Arr.filter(licences, (line) => !Str.endsWith(" Apache-2.0")(line)),
        []
      );
    }).pipe(Effect.provide(NodeServices.layer))
  );
});
