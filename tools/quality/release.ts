// The npm release rules (spec 0009): which packages are published, the manifest each one ships, and the effect peer
// range rule. Pure functions over decoded manifests, so tests run them on fixtures and on the real repository;
// `stagePackages.ts` applies them to build the directory that is published.
import {
  Array as Arr,
  Effect,
  FileSystem,
  Option,
  Order,
  Path,
  Predicate,
  Record,
  Result,
  Schema,
  String as Str,
  pipe,
} from "effect";
import type { PlatformError, Scope } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
import { parseSync } from "oxc-parser";

import { sourceFiles } from "./tiers.ts";

const Ranges = Schema.Record(Schema.String, Schema.String);

const OptionalMeta = Schema.Record(
  Schema.String,
  Schema.Struct({ optional: Schema.optionalKey(Schema.Boolean) })
);

/** The fields of a workspace package's `package.json` that the release reads. */
const SourceManifestSchema = Schema.Struct({
  dependencies: Schema.optionalKey(Ranges),
  description: Schema.optionalKey(Schema.String),
  devDependencies: Schema.optionalKey(Ranges),
  exports: Schema.optionalKey(Ranges),
  license: Schema.optionalKey(Schema.String),
  name: Schema.String,
  peerDependencies: Schema.optionalKey(Ranges),
  peerDependenciesMeta: Schema.optionalKey(OptionalMeta),
  private: Schema.optionalKey(Schema.Boolean),
  publishConfig: Schema.optionalKey(
    Schema.Struct({
      access: Schema.optionalKey(Schema.String),
      directory: Schema.optionalKey(Schema.String),
    })
  ),
  version: Schema.String,
});

export type SourceManifest = typeof SourceManifestSchema.Type;

/** The fields of the root `package.json` that the published manifests inherit. */
const RootManifestSchema = Schema.Struct({
  bugs: Schema.Struct({ url: Schema.String }),
  catalog: Ranges,
  homepage: Schema.String,
  repository: Schema.Struct({ type: Schema.String, url: Schema.String }),
});

export type RootManifest = typeof RootManifestSchema.Type;

/** What goes into `<package>/dist/package.json`: the one file the published package's tooling reads. */
const PublishedManifestSchema = Schema.Struct({
  bugs: Schema.Struct({ url: Schema.String }),
  dependencies: Schema.optional(Ranges),
  description: Schema.optional(Schema.String),
  exports: Schema.Record(
    Schema.String,
    Schema.Record(Schema.String, Schema.String)
  ),
  homepage: Schema.String,
  license: Schema.String,
  name: Schema.String,
  peerDependencies: Schema.optional(Ranges),
  peerDependenciesMeta: Schema.optional(OptionalMeta),
  publishConfig: Schema.Struct({ access: Schema.Literal("public") }),
  repository: Schema.Struct({
    directory: Schema.String,
    type: Schema.String,
    url: Schema.String,
  }),
  type: Schema.Literal("module"),
  version: Schema.String,
});

type PublishedManifest = typeof PublishedManifestSchema.Type;

/** The root `package.json` text, decoded. */
export const decodeRoot = Schema.decodeUnknownEffect(
  Schema.fromJsonString(RootManifestSchema)
);

const decodeSource = Schema.decodeUnknownEffect(
  Schema.fromJsonString(SourceManifestSchema)
);

/** The text of a published `package.json`. */
export const encodePublished = Schema.encodeEffect(
  Schema.fromJsonString(PublishedManifestSchema, { space: 2 })
);

/** The directory (relative to the package) that holds what is published; `vp pack` writes it. */
export const publishDirectory = "dist";

export interface WorkspacePackage {
  /** The package's directory name under `packages/`. */
  readonly directory: string;
  readonly manifest: SourceManifest;
}

/** Every package under `packages/`, read and decoded, in directory order. */
export const readPackages = Effect.fnUntraced(function* readPackages(
  root: string
): Effect.fn.Return<
  readonly WorkspacePackage[],
  PlatformError.PlatformError | Schema.SchemaError,
  FileSystem.FileSystem | Path.Path
> {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const directories = yield* Effect.map(
    fs.readDirectory(path.join(root, "packages")),
    (names) => Arr.sort(names, Order.String)
  );

  return yield* Effect.forEach(directories, (directory) =>
    Effect.map(
      Effect.flatMap(
        fs.readFileString(
          path.join(root, "packages", directory, "package.json")
        ),
        decodeSource
      ),
      (manifest) => ({ directory, manifest })
    )
  );
});

/** A package is published unless its manifest says `"private": true` (the Changesets rule). */
export const publicPackages = (
  packages: readonly WorkspacePackage[]
): readonly WorkspacePackage[] =>
  Arr.filter(packages, ({ manifest }) => manifest.private !== true);

const sourceExtension = /\.ts$/u;

/** The source files a package exports, which `vp pack` takes as its entries. */
export const entriesOf = (manifest: SourceManifest): readonly string[] =>
  Arr.sort(Record.values(manifest.exports ?? {}), Order.String);

interface Resolved {
  readonly problems: readonly string[];
  readonly ranges: Readonly<Record<string, string>> | undefined;
}

/**
 * The ranges a published manifest has: `workspace:*` is the exact version of that public package (the packages are
 * versioned in lockstep, spec 0009) and `catalog:` is the root catalog's version; any other range is kept. Any other
 * `workspace:` or `catalog:` form is a problem, never passed through.
 */
const resolveRanges = (
  owner: string,
  ranges: Readonly<Record<string, string>> | undefined,
  versions: Readonly<Record<string, string>>,
  catalog: Readonly<Record<string, string>>
): Resolved => {
  const entries = Arr.map(Record.toEntries(ranges ?? {}), ([name, range]) => {
    const found =
      range === "workspace:*"
        ? Record.get(versions, name)
        : Option.filter(Record.get(catalog, name), () => range === "catalog:");

    if (Option.isSome(found)) {
      return { name, problem: undefined, range: found.value };
    }

    return Str.startsWith("workspace:")(range) ||
      Str.startsWith("catalog:")(range)
      ? {
          name,
          problem: `${owner} depends on ${name} at ${range}, which names no public workspace package or catalog entry (only workspace:* and catalog: are rewritten)`,
          range,
        }
      : { name, problem: undefined, range };
  });

  return {
    problems: Arr.filterMap(entries, ({ problem }) =>
      problem === undefined ? Result.failVoid : Result.succeed(problem)
    ),
    ranges: Arr.isArrayEmpty(entries)
      ? undefined
      : Record.fromEntries(
          Arr.map(entries, ({ name, range }): readonly [string, string] => [
            name,
            range,
          ])
        ),
  };
};

/** A public package's manifest as published, and what stops it from being published. */
export interface StagedManifest {
  readonly manifest: PublishedManifest;
  readonly problems: readonly string[];
}

/**
 * The manifest a public package ships, with the problems that stop it from being published. The version, name,
 * description, licence, peer dependencies and exports come from the package; the repository, homepage and bugs URL
 * from the root, so they have one home.
 */
export const publishManifest = (
  { directory, manifest }: WorkspacePackage,
  root: RootManifest,
  versions: Readonly<Record<string, string>>
): StagedManifest => {
  const dependencies = resolveRanges(
    manifest.name,
    manifest.dependencies,
    versions,
    root.catalog
  );

  const peers = resolveRanges(
    manifest.name,
    manifest.peerDependencies,
    versions,
    root.catalog
  );

  const entries = Record.toEntries(manifest.exports ?? {});

  return {
    manifest: {
      bugs: root.bugs,
      dependencies: dependencies.ranges,
      description: manifest.description,
      // `types` before `default`: TypeScript takes the first condition that matches, and `default` matches anything.
      // Built from ordered entries, because the linter sorts object keys.
      exports: Record.map(manifest.exports ?? {}, (entry) =>
        Record.fromEntries([
          ["types", Str.replace(sourceExtension, ".d.mts")(entry)],
          ["default", Str.replace(sourceExtension, ".mjs")(entry)],
        ])
      ),
      homepage: root.homepage,
      license: manifest.license ?? "",
      name: manifest.name,
      peerDependencies: peers.ranges,
      peerDependenciesMeta: manifest.peerDependenciesMeta,
      publishConfig: { access: "public" },
      repository: { ...root.repository, directory: `packages/${directory}` },
      type: "module",
      version: manifest.version,
    },
    problems: [
      ...(Arr.isArrayEmpty(entries)
        ? [`${manifest.name} exports nothing`]
        : []),
      ...Arr.filterMap(entries, ([key, entry]) =>
        Str.endsWith(".ts")(entry)
          ? Result.failVoid
          : Result.succeed(
              `${manifest.name} exports ${key} as ${entry}, which is not a .ts source file`
            )
      ),
      ...dependencies.problems,
      ...peers.problems,
      ...(manifest.license === undefined
        ? [`${manifest.name} declares no license`]
        : []),
      ...(manifest.publishConfig?.access === "public"
        ? []
        : [`${manifest.name} must set publishConfig.access to "public"`]),
      ...(manifest.publishConfig?.directory === publishDirectory
        ? []
        : [
            `${manifest.name} must set publishConfig.directory to "${publishDirectory}", the directory the build writes`,
          ]),
    ],
  };
};

/** The version of each public package, by name. */
export const versionsOf = (
  packages: readonly WorkspacePackage[]
): Readonly<Record<string, string>> =>
  Record.fromEntries(
    Arr.map(
      publicPackages(packages),
      ({ manifest }): readonly [string, string] => [
        manifest.name,
        manifest.version,
      ]
    )
  );

/** `effect` and every `@effect/*` runtime package: one version line, one peer-range rule. */
export const isEffectFamily = (name: string): boolean =>
  name === "effect" || Str.startsWith("@effect/")(name);

/** The package a specifier names: `effect/Cause` is `effect`, `@effect/vitest/utils` is `@effect/vitest`. */
export const packageOf = (specifier: string): string => {
  const [scopeOrName, second] = Str.split(specifier, "/");

  return Str.startsWith("@")(scopeOrName) && second !== undefined
    ? `${scopeOrName}/${second}`
    : scopeOrName;
};

export interface ImportUse {
  /** The names imported or re-exported from the specifier; none for a namespace or side-effect import. */
  readonly names: readonly string[];
  readonly specifier: string;
}

/** Every static import and re-export of a source text, and every dynamic import with a literal specifier. */
export const importUses = (text: string): readonly ImportUse[] => {
  const { module } = parseSync("scan.ts", text);

  const imported = Arr.map(
    module.staticImports,
    ({ entries, moduleRequest }): ImportUse => ({
      names: Arr.filter(
        Arr.map(entries, ({ importName }) => importName.name),
        Predicate.isString
      ),
      specifier: moduleRequest.value,
    })
  );

  const reexported = Arr.flatMap(module.staticExports, ({ entries }) =>
    Arr.filterMap(
      entries,
      ({ importName, moduleRequest }): Result.Result<ImportUse, void> =>
        Predicate.isNullish(moduleRequest)
          ? Result.failVoid
          : Result.succeed({
              names: Arr.filter([importName.name], Predicate.isString),
              specifier: moduleRequest.value,
            })
    )
  );

  const dynamic = Arr.filterMap(
    module.dynamicImports,
    ({ moduleRequest }): Result.Result<ImportUse, void> => {
      const literal = /^["'](?<name>[^"']+)["']$/u.exec(
        pipe(text, Str.slice(moduleRequest.start, moduleRequest.end), Str.trim)
      )?.groups?.name;

      return literal === undefined
        ? Result.failVoid
        : Result.succeed({ names: [], specifier: literal });
    }
  );

  return [...imported, ...reexported, ...dynamic];
};

/** The directories (relative to the package) that the exports are built from: `src`, `contract`, `standins`. */
const exportedDirectories = (manifest: SourceManifest): readonly string[] =>
  Arr.dedupe(
    Arr.filter(
      Arr.map(entriesOf(manifest), (entry) => Str.split(entry, "/")[1]),
      Predicate.isString
    )
  );

/** A source file a package publishes: its path relative to the repository root and its text. */
interface PublishedSource {
  readonly file: string;
  readonly text: string;
}

/** Every source file below a directory the package's exports are built from (`src`, `contract`, `standins`). */
export const publishedSources = Effect.fnUntraced(function* publishedSources(
  root: string,
  { directory, manifest }: WorkspacePackage
): Effect.fn.Return<
  readonly PublishedSource[],
  PlatformError.PlatformError,
  FileSystem.FileSystem | Path.Path
> {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const listings = yield* Effect.forEach(
    exportedDirectories(manifest),
    (name) => sourceFiles(path.join(root, "packages", directory, name))
  );

  return yield* Effect.forEach(
    Arr.flatMap(listings, (listing) => listing.files),
    (file) =>
      Effect.map(fs.readFileString(file), (text) => ({
        file: path.relative(root, file),
        text,
      }))
  );
});

/** The imports of the sources a package publishes. */
export const usesOf = (
  sources: readonly PublishedSource[]
): readonly ImportUse[] => Arr.flatMap(sources, ({ text }) => importUses(text));

const directive = /@effect-diagnostics/u;

/**
 * Sentences about `@effect-diagnostics` directives in published sources. The unstable-API scan runs the Effect language
 * service, which honours those comments, so one (any form, any rule, registered or not) could hide a use from it and let
 * a `^` range through. The scan fails closed: a published source has none. (A suppression directive of the lint kind is
 * `check:exceptions`' business, issue #14.)
 */
export const directiveFindings = (
  sources: readonly PublishedSource[]
): readonly string[] =>
  Arr.filterMap(sources, ({ file, text }) =>
    directive.test(text)
      ? Result.succeed(
          `${file} has an @effect-diagnostics directive, which could hide an unstable API from the range check`
        )
      : Result.failVoid
  );

/**
 * Sentences about imports of the published sources that the built package could not resolve or would inline: a
 * package imported from outside `dependencies` and `peerDependencies` (the bundler inlines a development dependency
 * and cannot resolve an undeclared one). Relative paths and `node:` built-ins are not packages.
 */
export const undeclaredImports = (
  manifest: SourceManifest,
  uses: readonly ImportUse[]
): readonly string[] => {
  const declared = {
    ...manifest.dependencies,
    ...manifest.peerDependencies,
  };

  return Arr.filterMap(
    Arr.dedupe(Arr.map(uses, ({ specifier }) => specifier)),
    (specifier) =>
      Str.startsWith(".")(specifier) ||
      Str.startsWith("node:")(specifier) ||
      Record.has(declared, packageOf(specifier))
        ? Result.failVoid
        : Result.succeed(
            `${manifest.name} imports ${specifier}, which is in neither dependencies nor peerDependencies`
          )
  );
};

const unstableLine =
  /`(?<module>[^`#]+)#[^`]+` is an? (?:unstable|experimental) API/gu;

/**
 * The modules of the unstable or experimental Effect APIs a `tsc` run reports (`effect/FileSystem#FileSystem is an
 * unstable API` names `effect/FileSystem`, `@effect/vitest#it` names `@effect/vitest`).
 */
export const unstableModules = (diagnostics: string): readonly string[] =>
  Arr.dedupe(
    Arr.filterMap(
      Arr.fromIterable(Str.matchAll(unstableLine)(diagnostics)),
      ({ groups }) =>
        groups?.module === undefined
          ? Result.failVoid
          : Result.succeed(groups.module)
    )
  );

const ScanConfig = Schema.fromJsonString(
  Schema.Struct({
    compilerOptions: Schema.Struct({
      noEmit: Schema.Boolean,
      plugins: Schema.Array(
        Schema.Struct({
          allowedUnstableApis: Schema.Array(Schema.String),
          diagnosticSeverity: Schema.Record(Schema.String, Schema.String),
          diagnostics: Schema.Boolean,
          name: Schema.String,
        })
      ),
    }),
    extends: Schema.String,
    include: Schema.Array(Schema.String),
  })
);

const encodeScanConfig = Schema.encodeEffect(ScanConfig);

/**
 * The unstable or experimental Effect APIs the published sources of a package use: `tsc` (patched with the Effect
 * language service by `effect-tsgo patch`) checks the exported directories with an EMPTY `allowedUnstableApis`, so
 * each use is reported where the repository's own check allows it, whichever way it is imported (a module, a binding
 * of `effect`'s root barrel, a namespace). Any finding is a use.
 */
export const scanUnstable = Effect.fnUntraced(function* scanUnstable(
  tsc: string,
  root: string,
  { directory, manifest }: WorkspacePackage
): Effect.fn.Return<
  readonly string[],
  PlatformError.PlatformError | Schema.SchemaError,
  | FileSystem.FileSystem
  | Path.Path
  | ChildProcessSpawner.ChildProcessSpawner
  | Scope.Scope
> {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const cwd = path.join(root, "packages", directory);

  // A directory below the package, so `types`, `effect` and the language service resolve as they do for the package.
  const scratch = yield* fs.makeTempDirectoryScoped({
    directory: cwd,
    prefix: ".unstable-scan-",
  });

  yield* fs.writeFileString(
    path.join(scratch, "tsconfig.json"),
    yield* encodeScanConfig({
      compilerOptions: {
        noEmit: true,
        plugins: [
          {
            allowedUnstableApis: [],
            diagnosticSeverity: {
              experimentalApiUsage: "error",
              unstableApiUsage: "error",
            },
            diagnostics: true,
            name: "@effect/language-service",
          },
        ],
      },
      extends: "../tsconfig.json",
      include: Arr.map(exportedDirectories(manifest), (name) => `../${name}`),
    })
  );

  return unstableModules(
    yield* spawner.string(ChildProcess.make(tsc, ["-p", scratch], { cwd }))
  );
}, Effect.scoped);

interface Version {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

const versionPattern =
  /^(?<operator>[~^]?)(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)$/u;

const parseVersion = (
  text: string
): Option.Option<{ readonly operator: string } & Version> =>
  Option.map(
    Option.fromNullishOr(versionPattern.exec(text)?.groups),
    ({ major, minor, operator, patch }) => ({
      major: Number(major),
      minor: Number(minor),
      operator: operator ?? "",
      patch: Number(patch),
    })
  );

/** Whether `pin` is inside `~floor` (same minor) or `^floor` (same major) and not below the floor. */
const admits = (operator: string, floor: Version, pin: Version): boolean =>
  pin.major === floor.major &&
  (operator === "^" || pin.minor === floor.minor) &&
  (pin.minor > floor.minor ||
    (pin.minor === floor.minor && pin.patch >= floor.patch));

/**
 * Sentences about how a public package's effect-family dependencies break the peer rule (spec 0009): every `effect`
 * and `@effect/*` package is a peer, never a dependency (two copies would be two runtimes); its range is `~floor`
 * when the published sources reach an unstable API of that package (the next minor may break it) and `^floor`
 * otherwise; the version the repository pins is inside the range, so an upgrade past it fails until the range is
 * re-examined; and every such package the sources import is declared.
 */
export const peerFindings = (
  manifest: SourceManifest,
  uses: readonly ImportUse[],
  unstable: readonly string[],
  catalog: Readonly<Record<string, string>>
): readonly string[] => {
  const peers = manifest.peerDependencies ?? {};

  const asDependencies = Arr.filterMap(
    Record.keys(manifest.dependencies ?? {}),
    (name) =>
      isEffectFamily(name)
        ? Result.succeed(
            `${manifest.name} lists ${name} in dependencies; it must be a peer dependency`
          )
        : Result.failVoid
  );

  const undeclared = Arr.filterMap(
    Arr.dedupe(
      Arr.filter(
        Arr.map(uses, ({ specifier }) => packageOf(specifier)),
        isEffectFamily
      )
    ),
    (name) =>
      Record.has(peers, name)
        ? Result.failVoid
        : Result.succeed(
            `${manifest.name} imports ${name} but does not declare it as a peer dependency`
          )
  );

  const ranges = Arr.flatMap(Record.toEntries(peers), ([name, range]) => {
    if (!isEffectFamily(name)) {
      return [];
    }

    const reachesUnstable = Arr.some(
      unstable,
      (entry) => packageOf(entry) === name
    );

    const expected = reachesUnstable ? "~" : "^";
    const parsed = parseVersion(range);
    const pin = Option.getOrElse(Record.get(catalog, name), () => "none");

    if (Option.isNone(parsed)) {
      return [
        `${manifest.name} peers ${name} at ${range}, which is not ~x.y.z or ^x.y.z`,
      ];
    }

    return [
      ...(parsed.value.operator === expected
        ? []
        : [
            `${manifest.name} peers ${name} at ${range}; its published sources ${reachesUnstable ? "reach an unstable API, so the range must be ~" : "reach only stable APIs, so the range must be ^"}`,
          ]),
      ...(Option.exists(parseVersion(pin), (pinned) =>
        admits(parsed.value.operator, parsed.value, pinned)
      )
        ? []
        : [
            `${manifest.name} peers ${name} at ${range}, which does not admit the version the repository pins (${pin})`,
          ]),
    ];
  });

  return [...asDependencies, ...undeclared, ...ranges];
};

/** The files a published package may contain: built ESM and declarations, its manifest, README, CHANGELOG, licence and notice. */
const shippedFile =
  /^(?:(?:[^/]+\/)*[^/]+\.(?:mjs|d\.mts)|package\.json|README\.md|CHANGELOG\.md|LICENSE|NOTICE)$/u;

/** The paths of a tarball that are not built output or one of the named files (sources, tests, maps, build info). */
export const unexpectedFiles = (paths: readonly string[]): readonly string[] =>
  Arr.filter(paths, (path) => !shippedFile.test(path));

/** The text `npm pack --dry-run --json` prints: one entry per package, each with the files of its tarball. */
export const decodePackListing = Schema.decodeUnknownEffect(
  Schema.fromJsonString(
    Schema.NonEmptyArray(
      Schema.Struct({
        files: Schema.Array(Schema.Struct({ path: Schema.String })),
      })
    )
  )
);
