// The tier gate (spec 0001, design R3): every package belongs to one tier, and a package depends only on the tiers
// its own may use. The direction is library, then service, then integration (adapter); programs sit above the
// services; tools sit above everything. The check reads every `package.json` and every import specifier of a
// package's sources, so a dependency cannot hide in either. `checkTiers.ts` runs it on this repository.
import {
  Array as Arr,
  Effect,
  FileSystem,
  Option,
  Order,
  Path,
  Record,
  Schema,
} from "effect";
import type { PlatformError } from "effect";
import { parseSync } from "oxc-parser";

/** The packages of each tier, by directory name under `packages/`. */
export const tiers = {
  adapters: [
    "speech-kokoro",
    "align-whisper",
    "sounds-synth",
    "render-reveal",
    "capture-chromium",
    "encode-ffmpeg",
    "cache-fs",
  ],
  // The first release's packages, until the migration deletes them: they may use anything.
  legacy: ["speech", "deck", "video", "sfx"],
  libraries: ["core", "subtitles", "lint"],
  programs: ["pipeline"],
  services: ["services"],
  tools: ["verify", "cli"],
} as const;

export type Tier = keyof typeof tiers;

const allTiers: readonly Tier[] = Record.keys(tiers);

/** The tiers a package of each tier may depend on. A package may always use itself, never another of its tier. */
const allowedTargets: Readonly<Record<Tier, readonly Tier[]>> = {
  adapters: ["services", "libraries"],
  legacy: allTiers,
  libraries: ["libraries"],
  programs: ["services", "libraries"],
  services: ["libraries"],
  tools: allTiers,
};

const tierByPackage: Readonly<Record<string, Tier>> = Record.fromEntries(
  Arr.flatMap(Record.toEntries(tiers), ([tier, names]) =>
    Arr.map(names, (name): readonly [string, Tier] => [name, tier])
  )
);

/** The tier of the package in directory `name`, or none when the table does not list it. */
export const tierOf = (name: string): Option.Option<Tier> =>
  Record.get(tierByPackage, name);

/** Why a package in directory `from` may not depend on the one in `to`, or none when the edge is allowed. */
export const edgeViolation = (
  from: string,
  to: string
): Option.Option<string> => {
  if (from === to) {
    return Option.none();
  }

  const fromTier = tierOf(from);

  if (Option.isNone(fromTier)) {
    return Option.some(`${from} has no tier`);
  }

  const toTier = tierOf(to);

  if (Option.isNone(toTier)) {
    return Option.some(
      `${to} has no tier, so ${fromTier.value} cannot be shown to be allowed to use it`
    );
  }

  return Arr.contains(allowedTargets[fromTier.value], toTier.value)
    ? Option.none()
    : Option.some(
        `tier ${fromTier.value} must not depend on tier ${toTier.value}`
      );
};

export interface TierFinding {
  /** What was depended on: a package name or an import specifier. */
  readonly dependency: string;
  /** The file, relative to the root, when the finding is about a manifest or an import. */
  readonly file: string;
  readonly line: number | undefined;
  readonly package: string;
  readonly reason: string;
  readonly tier: string;
}

/** One line of a report: package, tier, the offending dependency and where it is. */
export const describeFinding = (finding: TierFinding): string =>
  `${finding.package} (${finding.tier}): ${finding.reason}: ${finding.dependency} at ${finding.file}${
    finding.line === undefined ? "" : `:${finding.line}`
  }`;

export interface Import {
  readonly line: number;
  readonly specifier: string;
}

const lineAt = (text: string, offset: number): number =>
  text.slice(0, offset).split("\n").length;

/** Every module a source text imports, re-exports or imports dynamically, with its 1-based line. */
export const importsOf = (text: string): readonly Import[] => {
  const { module } = parseSync("scan.ts", text);

  const located = (start: number, specifier: string): Import => ({
    line: lineAt(text, start),
    specifier,
  });

  const dynamic = Arr.map(module.dynamicImports, ({ moduleRequest }) =>
    located(
      moduleRequest.start,
      /^["'](?<name>[^"']+)["']$/u.exec(
        text.slice(moduleRequest.start, moduleRequest.end).trim()
      )?.groups?.name ?? "<computed>"
    )
  );

  const reexported = Arr.flatMap(module.staticExports, ({ entries }) =>
    Arr.flatMap(entries, ({ moduleRequest }) =>
      moduleRequest ? [located(moduleRequest.start, moduleRequest.value)] : []
    )
  );

  return [
    ...Arr.map(module.staticImports, ({ moduleRequest }) =>
      located(moduleRequest.start, moduleRequest.value)
    ),
    ...reexported,
    ...dynamic,
  ];
};

const scope = "@reebeat/";

/** The directory name a `@reebeat/<name>[/subpath]` specifier or dependency names, or none for anything else. */
const workspaceTarget = (specifier: string): Option.Option<string> =>
  specifier.startsWith(scope)
    ? Option.fromNullishOr(specifier.slice(scope.length).split("/")[0])
    : Option.none();

const Manifest = Schema.Struct({
  dependencies: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  devDependencies: Schema.optionalKey(
    Schema.Record(Schema.String, Schema.String)
  ),
  optionalDependencies: Schema.optionalKey(
    Schema.Record(Schema.String, Schema.String)
  ),
  peerDependencies: Schema.optionalKey(
    Schema.Record(Schema.String, Schema.String)
  ),
});

const decodeManifest = Schema.decodeUnknownEffect(
  Schema.fromJsonString(Manifest)
);

const ignoredDirectories: readonly string[] = [
  "node_modules",
  "test",
  "live",
  "fixtures",
  "dist",
  ".git",
];

const sourcePattern = /\.[cm]?tsx?$/u;

type Failure = PlatformError.PlatformError | Schema.SchemaError;

/** The source files of a package directory (relative paths), without dependencies, tests and fixtures. */
const sourceFiles = (
  directory: string
): Effect.Effect<
  readonly string[],
  PlatformError.PlatformError,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* walk() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const names = Arr.sort(yield* fs.readDirectory(directory), Order.String);

    const found = yield* Effect.forEach(names, (name) =>
      Effect.gen(function* entry() {
        const full = path.join(directory, name);
        const info = yield* fs.stat(full);

        if (info.type === "Directory") {
          return Arr.contains(ignoredDirectories, name)
            ? []
            : yield* sourceFiles(full);
        }

        return info.type === "File" &&
          sourcePattern.test(name) &&
          !name.endsWith(".d.ts")
          ? [full]
          : [];
      })
    );

    return Arr.flatten(found);
  });

/**
 * The package directory a specifier from `file` (relative to `packages/`) reaches: a workspace specifier names it,
 * a relative one is resolved. `"<outside>"` is a relative path that leaves `packages/`; an external package is none.
 */
const reachedPackage = (
  path: Path.Path,
  file: string,
  specifier: string
): Option.Option<string> => {
  if (specifier.startsWith(".")) {
    const resolved = path.normalize(path.join(path.dirname(file), specifier));

    return resolved.startsWith("..")
      ? Option.some("<outside>")
      : Option.fromNullishOr(resolved.split(path.sep)[0]);
  }

  return workspaceTarget(specifier);
};

interface Checked {
  readonly dir: string;
  readonly path: Path.Path;
  readonly root: string;
}

const finding = (
  checked: Checked,
  dependency: string,
  file: string,
  line: number | undefined,
  reason: string
): TierFinding => ({
  dependency,
  file,
  line,
  package: `@reebeat/${checked.dir}`,
  reason,
  tier: Option.getOrElse(tierOf(checked.dir), () => "no tier"),
});

const manifestFindings = Effect.fnUntraced(function* manifestFindings(
  checked: Checked
) {
  const fs = yield* FileSystem.FileSystem;

  const manifestPath = checked.path.join(
    checked.root,
    "packages",
    checked.dir,
    "package.json"
  );

  if (!(yield* fs.exists(manifestPath))) {
    return [];
  }

  const manifest = yield* decodeManifest(
    yield* fs.readFileString(manifestPath)
  );

  const names = Arr.flatMap(
    [
      manifest.dependencies,
      manifest.devDependencies,
      manifest.optionalDependencies,
      manifest.peerDependencies,
    ],
    (group) => Record.keys(group ?? {})
  );

  return Arr.flatMap(Arr.dedupe(names), (name) =>
    Option.match(
      Option.flatMap(workspaceTarget(name), (target) =>
        edgeViolation(checked.dir, target)
      ),
      {
        onNone: () => [],
        onSome: (reason) => [
          finding(
            checked,
            name,
            `packages/${checked.dir}/package.json`,
            undefined,
            reason
          ),
        ],
      }
    )
  );
});

/** Tools and the legacy packages may use anything, so nothing about their imports is checked. */
const unrestricted = (dir: string): boolean =>
  Option.exists(tierOf(dir), (tier) => tier === "tools" || tier === "legacy");

const outside = "<outside>";

/** Why `specifier`, imported from `file` (relative to `packages/`) of package `dir`, is not allowed, or none. */
const importViolation = (
  dir: string,
  path: Path.Path,
  file: string,
  specifier: string
): Option.Option<string> => {
  if (specifier === "<computed>") {
    return unrestricted(dir)
      ? Option.none()
      : Option.some(
          "a dynamic import with a computed specifier cannot be checked"
        );
  }

  return Option.flatMap(reachedPackage(path, file, specifier), (target) => {
    if (target === outside) {
      return unrestricted(dir)
        ? Option.none()
        : Option.some("reaches outside packages/");
    }

    return edgeViolation(dir, target);
  });
};

const importFindings = Effect.fnUntraced(function* importFindings(
  checked: Checked,
  file: string
) {
  const fs = yield* FileSystem.FileSystem;
  const text = yield* fs.readFileString(file);

  const relative = checked.path.relative(
    checked.path.join(checked.root, "packages"),
    file
  );

  const shown = checked.path.join("packages", relative);

  return Arr.flatMap(importsOf(text), ({ line, specifier }) =>
    Option.match(
      importViolation(checked.dir, checked.path, relative, specifier),
      {
        onNone: () => [],
        onSome: (reason) => [finding(checked, specifier, shown, line, reason)],
      }
    )
  );
});

const packageFindings = Effect.fnUntraced(function* packageFindings(
  root: string,
  dir: string
) {
  const path = yield* Path.Path;
  const checked: Checked = { dir, path, root };

  if (Option.isNone(tierOf(dir))) {
    return [
      finding(
        checked,
        `packages/${dir}`,
        `packages/${dir}`,
        undefined,
        "has no tier: add it to the table in tools/quality/tiers.ts"
      ),
    ];
  }

  const files = yield* sourceFiles(path.join(root, "packages", dir));

  const fromImports = yield* Effect.forEach(files, (file) =>
    importFindings(checked, file)
  );

  return [...(yield* manifestFindings(checked)), ...Arr.flatten(fromImports)];
});

/**
 * The tier violations of the packages under `<root>/packages`: a directory in no tier, a manifest dependency on a
 * package the tier may not use, an import specifier of a source file that does the same. Empty when clean.
 */
export const checkTiers = Effect.fn("checkTiers")(function* checkTiers(
  root: string
): Effect.fn.Return<
  readonly TierFinding[],
  Failure,
  FileSystem.FileSystem | Path.Path
> {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const packages = path.join(root, "packages");

  const directories = yield* Effect.filter(
    Arr.sort(yield* fs.readDirectory(packages), Order.String),
    (name) =>
      Effect.map(
        fs.stat(path.join(packages, name)),
        (info) => info.type === "Directory"
      )
  );

  return Arr.flatten(
    yield* Effect.forEach(directories, (dir) => packageFindings(root, dir))
  );
});
