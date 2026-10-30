// F14, installs derive from one source (spec 0016): every committed client file equals its regeneration from
// `@tsukuri/lifecycle`, carries the marker, states the gate sentence where a person reads it, and holds no secret.
// `scripts/check-clients.sh` is the other half of F14: it drives the real client CLIs on these files.
import { assert, describe, it } from "@effect/vitest";
import {
  checkoutToken,
  gateSentence,
  instructionsOf,
  tools as declarations,
} from "@tsukuri/lifecycle";
import {
  Array as Arr,
  Effect,
  FileSystem,
  Option,
  Path,
  Result,
  Schema,
  String as Str,
} from "effect";
import { Toml } from "effect/encoding";

import { clientFiles, marker } from "../src/clients.ts";
import { platform } from "./support.ts";

const CodexConfig = Schema.Struct({
  mcp_servers: Schema.Struct({
    tsukuri: Schema.Struct({ command: Schema.String }),
  }),
});

const serverCommand =
  "exec devenv shell -- bun packages/mcp/bin/tsukuri-mcp.ts";

const secretLooking =
  /(?:key|token|secret|password|credential)\s*[:=]\s*["']?[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|npm_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}/iu;

/** The one file with no room for a marker: the closed `mcp.json` schema of Agent Plugins admits no other field. */
const closedMcpJson = "agent-plugin/plugins/tsukuri/mcp.json";

const read = Effect.gen(function* readAll() {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = path.resolve(import.meta.dirname, "..");

  const skill = yield* fs.readFileString(
    path.join(
      root,
      "..",
      "lifecycle",
      "skills",
      "tsukuri-lifecycle",
      "SKILL.md"
    )
  );

  const committed = yield* Effect.forEach(clientFiles(skill), (file) =>
    Effect.map(
      fs.readFileString(path.join(root, "clients", file.path)),
      (text) => ({ ...file, committed: text })
    )
  );

  return { committed, root, skill };
}).pipe(Effect.provide(platform));

describe("the client files (F14)", () => {
  it.effect(
    "equal their regeneration, file for file, and nothing else is in the directory",
    () =>
      Effect.gen(function* drift() {
        const { committed, root } = yield* read;
        const fs = yield* FileSystem.FileSystem;

        const present = yield* fs.readDirectory(`${root}/clients`, {
          recursive: true,
        });

        const files = yield* Effect.filter(present, (name) =>
          Effect.map(
            fs.stat(`${root}/clients/${name}`),
            (info) => info.type === "File"
          )
        );

        for (const file of committed) {
          assert.strictEqual(
            file.committed,
            file.text,
            `${file.path} differs from its regeneration: run bun run --cwd packages/mcp generate`
          );
        }

        for (const name of files) {
          assert.isTrue(
            Arr.some(committed, (file) => file.path === name),
            `${name} is not generated`
          );
        }
      }).pipe(Effect.provide(platform))
  );

  it.effect("carry the marker, but the one closed schema", () =>
    Effect.gen(function* markers() {
      for (const file of (yield* read).committed) {
        assert.strictEqual(
          Str.includes(marker)(file.committed),
          file.path !== closedMcpJson,
          file.path
        );
      }
    })
  );

  it.effect(
    "hold no secret, and the checkout only as the token the install step replaces",
    () =>
      Effect.gen(function* secrets() {
        for (const file of (yield* read).committed) {
          assert.isFalse(
            secretLooking.test(file.committed),
            `${file.path} looks like it holds a secret`
          );
          assert.isFalse(
            Str.includes("/home/")(file.committed),
            `${file.path} holds a path of a machine`
          );
        }
      })
  );

  it.effect(
    "state the gate sentence in the card, the Codex section and the skill of each plugin",
    () =>
      Effect.gen(function* gate() {
        const { committed } = yield* read;

        for (const path of [
          "README.md",
          "codex/config.toml",
          "claude-plugin/plugins/tsukuri/skills/tsukuri-lifecycle/SKILL.md",
          "agent-plugin/plugins/tsukuri/skills/tsukuri-lifecycle/SKILL.md",
        ]) {
          const file = Option.getOrThrow(
            Arr.findFirst(committed, (candidate) => candidate.path === path)
          );

          assert.isTrue(
            Str.includes(gateSentence)(file.committed),
            `${path} lacks the gate sentence`
          );
        }

        assert.isTrue(Str.includes(gateSentence)(instructionsOf(declarations)));
      })
  );

  it.effect(
    "start the same server in every file, with the token where the checkout goes",
    () =>
      Effect.gen(function* servers() {
        const { committed } = yield* read;

        for (const file of Arr.filter(committed, (candidate) =>
          /mcp\.json$|config\.toml$/u.test(candidate.path)
        )) {
          assert.isTrue(Str.includes(checkoutToken)(file.committed), file.path);
          assert.isTrue(Str.includes(serverCommand)(file.committed), file.path);
        }
      })
  );

  it.effect(
    "the Codex snippet is TOML that names the server and its command",
    () =>
      Effect.gen(function* toml() {
        const file = Option.getOrThrow(
          Arr.findFirst(
            (yield* read).committed,
            (candidate) => candidate.path === "codex/config.toml"
          )
        );

        const parsed = Toml.parse(file.committed);

        assert.isTrue(Result.isSuccess(parsed));

        const server = Result.isSuccess(parsed)
          ? Schema.decodeUnknownOption(CodexConfig)(parsed.success)
          : Option.none();

        assert.deepStrictEqual(
          Option.map(server, (config) => config.mcp_servers.tsukuri.command),
          Option.some("sh")
        );
      })
  );
});
