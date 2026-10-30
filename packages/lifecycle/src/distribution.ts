// The one source of every client install file (spec 0016, "Client integrations as derivations of one source"). A
// generator in `@tsukuri/mcp` turns this value into the Claude Code, Claude plugin, Agent Plugins and Codex files, and
// a test regenerates them and compares, so a hand-copied config cannot drift.

/** The contract version of the tool surface, reported in `serverInfo` (additive within a minor; a rename is a major). */
export const contractVersion = "0.1.0";

/** The placeholder every generated file holds where the checkout's absolute path goes; the install step fills it. */
export const checkoutToken = "__TSUKURI_CHECKOUT__";

export const distribution = {
  author: { name: "tsukuri-labs", url: "https://github.com/tsukuri-labs" },
  description:
    "Read a tsukuri project from an agent: its Screenplay, lint, Plan, build and a frame of the video. Read-only; release and publish are not tools.",
  homepage: "https://tsukuri.dev",
  license: "Apache-2.0",
  /** The server's name: tool names read `mcp__tsukuri__story_lint` in Claude Code (spec 0016, D8). */
  name: "tsukuri",
  repository: "https://github.com/tsukuri-labs/tsukuri",
  /**
   * How a client starts the server over stdio (spec 0016, D3 option A: a checkout run through devenv). `sh -c` changes
   * to the checkout first, so the command does not depend on the client's working directory; `devenv shell` writes its
   * status to stderr and the command's output alone to stdout (Verified: devenv-stdout.txt).
   */
  server: {
    args: [
      "-c",
      `cd '${checkoutToken}' && exec devenv shell -- bun packages/mcp/bin/tsukuri-mcp.ts`,
    ],
    command: "sh",
  },
  skillName: "tsukuri-lifecycle",
  title: "tsukuri",
} as const;
