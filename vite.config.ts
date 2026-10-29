// Provenance: adapted from phibkro/vektorprogrammet-reimagined @ 797e9e41d96194b9479ff224ac1c40bbc0545888 (vite.config.ts).
// Deviations: the lint, fmt and staged parts only. Dropped the donor's package paths, store-boundary imports,
// shadcn preset, per-file overrides and its three database and calendar anti-slop rules. See PROVENANCE.md.
import { effectNative, strict } from "@effect/tsgo/oxlint-presets";
import { effect } from "@phibkro/oxlint-effect-plugin";
import type { EffectConfigInput } from "@phibkro/oxlint-effect-plugin";
import ultraciteFmt from "ultracite/oxfmt";
import antiSlop from "ultracite/oxlint/anti-slop";
import core from "ultracite/oxlint/core";
import { defineConfig } from "vite-plus";

import { diagnosticRules } from "./tools/quality/diagnosticRules.ts";

export const tsgoRules = diagnosticRules.lint;

// Effect roles per path. A package adds its own group in the spec that creates it.
const effectConfig: EffectConfigInput = {
  groups: [
    {
      files: ["**/*.test.ts", "**/*.test.tsx"],
      platform: "node",
      role: "test",
      strictness: "strict",
    },
    {
      files: ["packages/cli/src/**"],
      platform: "node",
      role: "effect-library",
      strictness: "strict",
    },
    {
      // The composition root of the CLI: the executable, which provides the platform and runs the commands.
      files: ["packages/cli/bin/**"],
      platform: "node",
      role: "composition-root",
      strictness: "strict",
    },
    {
      files: ["packages/core/src/**"],
      platform: "portable",
      role: "effect-library",
      strictness: "strict",
    },
    {
      // Adapters (design R3): a Layer over a service, on an outside runtime. Each is its own package.
      files: [
        "packages/cache-fs/src/**",
        "packages/align-whisper/src/**",
        "packages/encode-ffmpeg/src/**",
      ],
      platform: "node",
      role: "runtime-adapter",
      strictness: "strict",
    },
    {
      // The one module that imports kokoro-js: a Promise-returning foreign ABI (see its header).
      adapterDependencies: ["@huggingface/transformers", "kokoro-js"],
      files: ["packages/speech-kokoro/src/**"],
      platform: "node",
      role: "runtime-adapter",
      strictness: "strict",
    },
    {
      // The build program over services only: no outside runtime.
      files: ["packages/pipeline/src/**"],
      platform: "portable",
      role: "effect-library",
      strictness: "strict",
    },
    {
      // The reveal.js Renderer reads the installed packages' files, so its platform is node.
      files: ["packages/render-reveal/src/**"],
      platform: "node",
      role: "effect-library",
      strictness: "strict",
    },
    {
      // The synthesised SoundLibrary: pure waveforms behind one Layer.
      files: ["packages/sounds-synth/src/**"],
      platform: "portable",
      role: "effect-library",
      strictness: "strict",
    },
    {
      // Libraries (design R3): pure functions over the Plan, no service and no runtime.
      files: ["packages/subtitles/src/**", "packages/lint/src/**"],
      platform: "portable",
      role: "pure-library",
      strictness: "strict",
    },
    {
      // The Chromium FrameCapturer: the Layer, the capture and the schedule; the one Playwright module is below.
      files: ["packages/capture-chromium/src/**"],
      platform: "node",
      role: "effect-library",
      strictness: "strict",
    },
    {
      // The one module that imports Playwright (spec 0001, "The controlled clock").
      adapterDependencies: ["playwright-core"],
      files: ["packages/capture-chromium/src/browser.ts"],
      platform: "node",
      role: "runtime-adapter",
      strictness: "strict",
    },
    {
      files: ["packages/verify/src/**"],
      platform: "portable",
      role: "effect-library",
      strictness: "strict",
    },
    {
      files: ["packages/services/src/**", "packages/services/standins/**"],
      platform: "portable",
      role: "effect-library",
      strictness: "strict",
    },
    {
      // The contract suites register vitest tests; every adapter package imports them.
      files: ["packages/services/contract/**"],
      platform: "node",
      role: "test",
      strictness: "strict",
    },
    {
      files: ["tools/quality/**"],
      platform: "node",
      role: "composition-root",
      strictness: "strict",
    },
  ],
};

const effectConfigResult = effect(effectConfig);

// Ultracite's `anti-slop` preset already enables the 18 generic rules, so only the Effect rules are added here.
const effectAntiSlopRuleNames = [
  "no-manual-effect-error-tag",
  "no-manual-tag-comparison",
  "no-manual-tagged-construction",
  "no-service-constructor-imports",
  "prefer-effect-match",
];

const localAntiSlopRules: Record<string, "error"> = {};

for (const name of effectAntiSlopRuleNames) {
  localAntiSlopRules[`anti-slop-effect/${name}`] = "error";
}

const restrictedSourcePatterns = [
  {
    message:
      "Import another workspace package through its export map, not its source path.",
    regex: "^@reebeat/[^/]+/src(?:/|$)",
  },
  {
    message:
      "Import another workspace package through its export map, not its source path.",
    regex: "^(?:\\./|(?:\\.\\./)+)(?:packages|tools)/[^/]+/src(?:/|$)",
  },
];

export default defineConfig({
  // Prose is written by hand: Oxfmt re-wraps Markdown and joins hard line breaks (GLOSSARY.md entries), which changes meaning.
  fmt: {
    ...ultraciteFmt,
    // Golden fixtures are compared byte for byte with generated output; a formatter must not rewrite them.
    ignorePatterns: [
      ...(ultraciteFmt.ignorePatterns ?? []),
      "**/*.md",
      "packages/*/test/fixtures/**",
      // The speech cache is written by `@reebeat/cache-fs` in its own JSON layout.
      "stories/*/speech-cache/**",
    ],
  },
  lint: {
    extends: [core, antiSlop, strict, effectNative],
    // The vendored anti-slop rules keep their upstream style; they are checked by their own provenance, not ours.
    ignorePatterns: [
      ...(core.ignorePatterns ?? []),
      "tools/oxlint/anti-slop/**",
      // Skill scripts run under Bun outside every workspace: no tsconfig gives them types. They are exercised by the verify run, not linted.
      ".agents/skills/*/scripts/**",
    ],
    jsPlugins: [
      { name: "vite-plus", specifier: "vite-plus/oxlint-plugin" },
      ...effectConfigResult.jsPlugins,
      {
        name: "anti-slop-effect",
        specifier: "./tools/oxlint/anti-slop/effect/index.ts",
      },
      { name: "complexity", specifier: "oxlint-plugin-complexity" },
    ],
    options: { typeAware: true, typeCheck: true },
    overrides: [
      ...effectConfigResult.overrides,
      {
        // unicorn/throw-new-error treats Schema.TaggedError class definitions as throw sites; they contain no throw.
        files: [
          "tools/quality/checkTiers.ts",
          "tools/quality/effectExceptions.ts",
          "tools/quality/stagePackages.ts",
        ],
        rules: { "unicorn/throw-new-error": "off" },
      },
      {
        // unicorn/throw-new-error treats Schema.TaggedError class definitions as throw sites; they contain no throw.
        // One file holds every tagged error of a stage (a closed set that reads as one table).
        files: [
          "packages/cli/src/errors.ts",
          "packages/core/src/errors.ts",
          "packages/capture-chromium/src/errors.ts",
          "packages/encode-ffmpeg/src/errors.ts",
          "packages/pipeline/src/errors.ts",
          "packages/render-reveal/src/errors.ts",
          "packages/services/src/errors.ts",
          "packages/verify/src/errors.ts",
        ],
        rules: {
          "eslint/max-classes-per-file": "off",
          "unicorn/throw-new-error": "off",
        },
      },
      {
        // The public entry of a package re-exports its modules; that is the file's only job.
        files: [
          "packages/*/src/index.ts",
          "packages/services/contract/index.ts",
          "packages/services/standins/index.ts",
        ],
        rules: { "oxc/no-barrel-file": "off" },
      },
      {
        // F11 (spec 0001): the core is pure. It imports no browser, Playwright, ffmpeg, reveal.js, UI runtime or Node
        // built-in. Bare Node built-ins are flagged by effecttsgo/node-builtin-import; `node:` specifiers are here.
        files: ["packages/core/src/**"],
        rules: {
          "no-restricted-imports": [
            "error",
            {
              patterns: [
                ...restrictedSourcePatterns,
                {
                  message:
                    "packages/core is pure (spec 0001, F11): no browser, Playwright, ffmpeg, reveal.js, React, Remotion or Node built-in.",
                  regex:
                    "^(?:node:|playwright|reveal\\.js|react(?:-dom)?(?:/|$)|remotion|@remotion/|fluent-ffmpeg|@ffmpeg/)",
                },
              ],
            },
          ],
        },
      },
      {
        // Tier rule (design R3): a service imports libraries only, never an adapter or another tier.
        files: [
          "packages/services/src/**",
          "packages/services/contract/**",
          "packages/services/standins/**",
        ],
        rules: {
          "no-restricted-imports": [
            "error",
            {
              patterns: [
                ...restrictedSourcePatterns,
                {
                  message:
                    "packages/services imports libraries only (design R3): core, subtitles and lint.",
                  regex:
                    "^@reebeat/(?!(?:core|subtitles|lint|services)(?:/|$))",
                },
              ],
            },
          ],
        },
      },
      {
        // F11 (spec 0001): the Deck reads the Plan, never the screenplay. It takes the core's types only and imports
        // no parser, Playwright or ffmpeg wrapper.
        files: ["packages/render-reveal/src/**"],
        rules: {
          "no-restricted-imports": [
            "error",
            {
              paths: [
                {
                  allowTypeImports: true,
                  message:
                    "packages/render-reveal takes types from @reebeat/core only (spec 0001, F11): it must not reach the parser.",
                  name: "@reebeat/core",
                },
              ],
              patterns: [
                ...restrictedSourcePatterns,
                {
                  message:
                    "packages/render-reveal imports no parser, Playwright or ffmpeg wrapper (spec 0001, F11).",
                  regex:
                    "^(?:node:|fountain-js|playwright|fluent-ffmpeg|@ffmpeg/)",
                },
              ],
            },
          ],
        },
      },
      {
        // The verify package reads the Plan through the core's `buildPlan`: it never imports the parser itself, and it
        // drives no browser (spec 0001).
        files: ["packages/verify/src/**"],
        rules: {
          "no-restricted-imports": [
            "error",
            {
              patterns: [
                ...restrictedSourcePatterns,
                {
                  message:
                    "packages/verify uses the core's buildPlan, never the parser, and drives no browser or ffmpeg wrapper.",
                  regex:
                    "^(?:node:|fountain-js|playwright|fluent-ffmpeg|@ffmpeg/)",
                },
              ],
            },
          ],
        },
      },
    ],
    rules: {
      ...effectConfigResult.rules,
      ...tsgoRules,
      ...localAntiSlopRules,
      "complexity/complexity": ["error", { cognitive: 15 }],
      "no-restricted-imports": [
        "error",
        { patterns: [...restrictedSourcePatterns] },
      ],
      // Workspace modules use lower camelCase filenames.
      "unicorn/filename-case": ["error", { case: "camelCase" }],
      // Preset contradiction: effecttsgo(prefer-effect-array) requires Effect's data-first Array module
      // (`Arr.map(xs, fn)`), which unicorn/no-array-method-this-argument misreads as a native
      // `.map(fn, thisArg)` call. Native array methods are already steered to Effect Array, so the rule
      // adds only false positives here. One global switch instead of a per-file list that drifts.
      "unicorn/no-array-method-this-argument": "off",
      "vite-plus/prefer-vite-plus-imports": "error",
    },
  },
  run: { cache: true },
  staged: { "*": "vp check --fix" },
});
