// The client install files, derived from the one `distribution` value (spec 0016, "Client integrations as derivations
// of one source"). Every file here is a pure function of `@tsukuri/lifecycle`: the generator writes them, a test
// regenerates them and compares, and each carries a marker naming its source, so a hand-copied config cannot drift and
// a stale one cannot pass. The checkout path is the one thing a file cannot know: it holds `checkoutToken` where the
// path goes, and the install step (the card's commands) puts the real path there. No file holds a secret.
import {
  checkoutToken,
  contractVersion,
  distribution,
  gateSentence,
} from "@tsukuri/lifecycle";
import { Array as Arr, Formatter, String as Str } from "effect";
import type { Schema } from "effect";

/** The command that regenerates every file. */
const generateCommand = "bun run --cwd packages/mcp generate";

/** Said once in every file that can hold it: what it came from and how to change it. */
export const marker = `Generated from packages/lifecycle/src/distribution.ts by \`${generateCommand}\`; edit the source, never this file.`;

export interface ClientFile {
  readonly path: string;
  readonly text: string;
}

const json = (value: Schema.Json): string =>
  `${Formatter.formatJson(value, { space: 2 })}\n`;

/** The `args` of the server: the `sh -c` line, with the token where the checkout goes. */
const serverArgs = distribution.server.args;

const claudeServer = {
  args: serverArgs,
  command: distribution.server.command,
  type: "stdio",
} as const;

const agentSchema = (name: "mcp" | "plugin") =>
  `https://agent-plugins.org/schemas/1.0.0/${name}.schema.json`;

/** The description with the marker, for a manifest that has no other place for one (a strict, closed schema). */
const describedWithMarker = `${distribution.description} ${marker}`;

/** Puts `comment` as an HTML comment after the front matter of a skill (a skill must begin with its front matter). */
const withSkillMarker = (skill: string): string => {
  const parts = Str.split("\n---\n")(skill);
  const [head, ...rest] = parts;

  return `${head}\n---\n\n<!-- ${marker} -->\n${Arr.join(rest, "\n---\n")}`;
};

const skillPath = (...segments: readonly string[]): string =>
  Arr.join([...segments, "skills", distribution.skillName, "SKILL.md"], "/");

const tomlString = (value: string): string => JSON.stringify(value);

const codexConfig = `# ${marker}
# ${gateSentence}
[mcp_servers.${distribution.name}]
command = ${tomlString(distribution.server.command)}
args = [
${Arr.join(
  Arr.map(serverArgs, (arg) => `  ${tomlString(arg)},`),
  "\n"
)}
]
startup_timeout_sec = 60
`;

const card = `<!-- ${marker} -->
# ${distribution.title}: install the MCP server

${distribution.description}

${gateSentence}

Every file here holds \`${checkoutToken}\` where the absolute path of this checkout goes. Put it there with \`sed\`, then install. The server is started by the client through \`devenv shell\`, so \`devenv\` must be on the client's \`PATH\`; nothing is sent anywhere and no file holds a secret.

\`\`\`sh
# Claude Code, one command (user scope, available in every project)
claude mcp add --scope user --transport stdio ${distribution.name} -- sh -c "cd '$PWD' && exec devenv shell -- bun packages/mcp/bin/tsukuri-mcp.ts"

# Claude Code, this repository only: put the checkout path into the project file, then approve it in \`claude\`
sed "s#${checkoutToken}#$PWD#g" packages/mcp/clients/claude-code/.mcp.json > .mcp.json

# Claude Code, as a plugin (includes the skill): copy the marketplace to a directory that stays, fill in the path, install
here="\${XDG_DATA_HOME:-$HOME/.local/share}/tsukuri/claude-plugin"
mkdir -p "$here" && cp -R packages/mcp/clients/claude-plugin/. "$here"
sed -i "s#${checkoutToken}#$PWD#g" "$here/plugins/${distribution.name}/.mcp.json"
claude plugin validate --strict "$here"
claude plugin marketplace add "$here"
claude plugin install ${distribution.name}@${distribution.name}-local

# Codex, one command
codex mcp add ${distribution.name} -- sh -c "cd '$PWD' && exec devenv shell -- bun packages/mcp/bin/tsukuri-mcp.ts"

# Codex, as a plugin (includes the skill)
here="\${XDG_DATA_HOME:-$HOME/.local/share}/tsukuri/agent-plugin"
mkdir -p "$here" && cp -R packages/mcp/clients/agent-plugin/. "$here"
sed -i "s#${checkoutToken}#$PWD#g" "$here/plugins/${distribution.name}/mcp.json"
codex plugin marketplace add "$here"
codex plugin add ${distribution.name}@${distribution.name}-local
\`\`\`

\`codex/config.toml\` is the same server as a \`config.toml\` section for a Codex that does not install plugins. claude.ai and ChatGPT need a URL: no file here serves them yet.
`;

const claudePlugin = (skill: string): readonly ClientFile[] => {
  const root = "claude-plugin";
  const plugin = `${root}/plugins/${distribution.name}`;

  return [
    {
      path: `${root}/.claude-plugin/marketplace.json`,
      text: json({
        description: describedWithMarker,
        name: `${distribution.name}-local`,
        owner: { name: distribution.author.name },
        plugins: [
          {
            description: distribution.description,
            name: distribution.name,
            source: `./plugins/${distribution.name}`,
          },
        ],
      }),
    },
    {
      path: `${plugin}/.claude-plugin/plugin.json`,
      text: json({
        author: distribution.author,
        description: describedWithMarker,
        homepage: distribution.homepage,
        license: distribution.license,
        name: distribution.name,
        repository: distribution.repository,
        version: contractVersion,
      }),
    },
    {
      path: `${plugin}/.mcp.json`,
      text: json({
        _generated: marker,
        mcpServers: { [distribution.name]: claudeServer },
      }),
    },
    {
      path: skillPath(root, "plugins", distribution.name),
      text: withSkillMarker(skill),
    },
  ];
};

const agentPlugin = (): readonly ClientFile[] => {
  const root = "agent-plugin";
  const plugin = `${root}/plugins/${distribution.name}`;

  return [
    {
      path: `${root}/.agents/plugins/marketplace.json`,
      text: json({
        _generated: marker,
        name: `${distribution.name}-local`,
        plugins: [
          {
            category: "Productivity",
            name: distribution.name,
            policy: { authentication: "ON_INSTALL", installation: "AVAILABLE" },
            source: { path: `./plugins/${distribution.name}`, source: "local" },
          },
        ],
      }),
    },
    {
      path: `${plugin}/plugin.json`,
      text: json({
        $schema: agentSchema("plugin"),
        author: distribution.author,
        description: distribution.description,
        extensions: { "dev.tsukuri": { generatedBy: marker } },
        homepage: distribution.homepage,
        license: distribution.license,
        name: distribution.name,
        repository: distribution.repository,
        version: contractVersion,
      }),
    },
    {
      path: `${plugin}/mcp.json`,
      text: json({
        $schema: agentSchema("mcp"),
        mcpServers: { [distribution.name]: claudeServer },
      }),
    },
  ];
};

/** Every generated client file for `skill`, the text of the lifecycle skill (its single source). */
export const clientFiles = (skill: string): readonly ClientFile[] => [
  { path: "README.md", text: card },
  {
    path: "claude-code/.mcp.json",
    text: json({
      _generated: marker,
      mcpServers: { [distribution.name]: claudeServer },
    }),
  },
  ...claudePlugin(skill),
  ...agentPlugin(),
  {
    path: skillPath("agent-plugin", "plugins", distribution.name),
    text: withSkillMarker(skill),
  },
  { path: "codex/config.toml", text: codexConfig },
];
