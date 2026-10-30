// The tier gate (spec 0001, design R3; spec 0017): every package belongs to one kind, and a package depends only on
// the kinds its own may use. The direction is library, then service, then program and adapter; tools sit above
// everything. `bun run check:tiers` runs the ox-dep-lint CLI over the workspace with this file (`--config`), and `vite.config.ts`
// loads it into the ox-dep-lint oxlint plugin, so `vp check` and the editor report the per-file findings too.
//
// The table and its edges are lifted from `tools/quality/tiers.ts` (this repository, commit 56a2155), which this file
// replaces: the five tiers keep their packages and allowed targets, renamed to singular kinds (`adapters` is
// `adapter`). Deviations, each recorded in spec 0017: `tools/quality` joins the tool kind (the old gate read
// `packages/` only), the skipped directories are the unchecked file class below, and one baseline entry.
import { defineConfig } from "ox-dep-lint";

export default defineConfig({
  baseline: [
    {
      file: "tools/quality/diagnosticRules.ts",
      reason:
        "@effect/tsgo exports no subpath for schema.json, the source of its diagnostic defaults; a tool reads it in place",
      rule: "relative-import-leaves-package",
      target: "../../node_modules/@effect/tsgo/schema.json",
    },
  ],
  // What the old walk skipped, at any depth: tests, live suites, fixtures and declaration files are never read.
  // `dist/**` (build output) and `node_modules` are skipped by ox-dep-lint's defaults. Setting this list replaces
  // ox-dep-lint's default file classes, so every other file (package-root `vite.config.ts` included) is shipped code,
  // as it was for the old gate.
  fileClasses: [
    {
      files: [
        "test/**",
        "live/**",
        "fixtures/**",
        "**/test/**",
        "**/live/**",
        "**/fixtures/**",
        "**/*.d.ts",
      ],
      policy: "unchecked",
    },
  ],
  // Vendored oxlint rules with their own licence and provenance (tools/oxlint/anti-slop/UPSTREAM.txt): sources, not a
  // workspace package. `vite.config.ts` and `knip.json` leave them out for the same reason.
  // The release rules' scratch trees (`release.ts` `.unstable-scan-*` under a package, `release.test.ts` `.scan-*`
  // under tools/quality) live and vanish while other gates and tests walk the tree: generated, never sources.
  ignore: [
    "tools/oxlint/**",
    "packages/*/.unstable-scan-*/**",
    "tools/quality/.scan-*/**",
  ],
  // knip (`bun run knip`) owns declared and unlisted dependencies; this gate owns the direction between packages.
  imports: { requireDeclared: false },
  kinds: {
    adapter: {
      mayUse: ["service", "library"],
      packages: [
        "packages/speech-kokoro",
        "packages/align-whisper",
        "packages/sounds-synth",
        "packages/render-reveal",
        "packages/capture-chromium",
        "packages/encode-ffmpeg",
        "packages/cache-fs",
      ],
    },
    library: {
      mayUse: ["library"],
      packages: ["packages/core", "packages/subtitles", "packages/lint"],
    },
    program: {
      mayUse: ["service", "library"],
      packages: ["packages/pipeline"],
    },
    service: {
      mayUse: ["library"],
      packages: ["packages/services", "packages/lifecycle"],
    },
    tool: {
      mayUse: "any",
      packages: [
        "packages/verify",
        "packages/cli",
        "packages/mcp",
        "tools/quality",
      ],
    },
  },
  workspaceScopes: ["@tsukuri/"],
});
