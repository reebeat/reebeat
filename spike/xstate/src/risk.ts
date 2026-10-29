// Question 4: alpha cadence, breaking changes, licence, size, bundle, type-check. Needs the network for `npm view` and
// the changelog; everything else is local.
import { spawnSync } from "node:child_process";
import { readFileSync, mkdirSync } from "node:fs";
import { gzipSync } from "node:zlib";

const here = new URL(".", import.meta.url).pathname;
const root = `${here}..`;
const sh = (cmd: string, args: readonly string[], cwd = root): string => {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return `${r.stdout}${r.stderr}`;
};

export const today = "2026-10-29";
const dayMs = 86_400_000;
/** The start of the 90-day window that ends on `today`. */
export const windowStart = new Date(Date.parse(`${today}T23:59:59Z`) - 90 * dayMs).toISOString().slice(0, 10);

export interface Cadence {
  readonly pkg: string;
  readonly distTags: Readonly<Record<string, string>>;
  readonly published: number;
  readonly inWindow: number;
  readonly inWindowByLine: Readonly<Record<string, number>>;
  readonly firstInWindow: string;
  readonly versions: readonly string[];
  readonly lastRelease: string;
  readonly medianGapHours: number;
  readonly longestGapDays: number;
}

export const cadence = (pkg: string): Cadence => {
  const time = JSON.parse(sh("npm", ["view", pkg, "time", "--json"])) as Record<string, string>;
  const distTags = JSON.parse(sh("npm", ["view", pkg, "dist-tags", "--json"])) as Record<string, string>;
  const releases = Object.entries(time).filter(([v]) => v !== "created" && v !== "modified");
  const inWin = releases.filter(([, t]) => t.slice(0, 10) >= windowStart && t.slice(0, 10) <= today);
  const byLine: Record<string, number> = {};
  for (const [v] of inWin) {
    const line = v.includes("-alpha") ? v.split("-")[0] + "-alpha" : v.split(".").slice(0, 2).join(".") + ".x";
    byLine[line] = (byLine[line] ?? 0) + 1;
  }
  const times = inWin.map(([, t]) => Date.parse(t)).sort((a, b) => a - b);
  const gaps = times.slice(1).map((t, i) => t - (times[i] ?? t));
  const sorted = [...gaps].sort((a, b) => a - b);
  return {
    pkg,
    distTags,
    published: releases.length,
    inWindow: inWin.length,
    inWindowByLine: byLine,
    firstInWindow: inWin[0]?.[0] ?? "-",
    versions: inWin.map(([v]) => v),
    lastRelease: inWin[inWin.length - 1]?.join(" ") ?? "-",
    medianGapHours: Math.round(((sorted[Math.floor(sorted.length / 2)] ?? 0) / 3_600_000) * 10) / 10,
    longestGapDays: Math.round(((sorted[sorted.length - 1] ?? 0) / dayMs) * 10) / 10,
  };
};

export interface MajorChange {
  readonly version: string;
  readonly summary: string;
}
export interface BreakingChanges {
  readonly alphasInWindowWithMajor: number;
  readonly alphasInWindow: number;
  readonly majorChanges: readonly MajorChange[];
  readonly xstateEffectBreaking: readonly MajorChange[];
}

/** Parse a changesets CHANGELOG.md: `## <version>`, `### Major Changes`, `- <hash>: <first line>`. */
const majors = (md: string, versionFilter: (v: string) => boolean): MajorChange[] => {
  const out: MajorChange[] = [];
  let version = "";
  let kind = "";
  for (const line of md.split("\n")) {
    const v = line.match(/^## (\S+)/);
    if (v) {
      version = v[1] ?? "";
      kind = "";
      continue;
    }
    const k = line.match(/^### (\w+) Changes/);
    if (k) {
      kind = k[1] ?? "";
      continue;
    }
    const b = line.match(/^- [0-9a-f]{7,}: (.*)/);
    if (b && kind === "Major" && versionFilter(version)) out.push({ version, summary: (b[1] ?? "").slice(0, 160) });
  }
  return out;
};


export const breakingChanges = (inWindowVersions: readonly string[]): BreakingChanges => {
  const url = "https://raw.githubusercontent.com/statelyai/xstate/next/packages";
  const core = sh("curl", ["-sL", `${url}/core/CHANGELOG.md`]);
  const effect = sh("curl", ["-sL", `${url}/xstate-effect/CHANGELOG.md`]);
  const inWindow = new Set(inWindowVersions);
  const majorChanges = majors(core, (v) => inWindow.has(v));
  const effectMajors = majors(effect, () => true);
  const withMajor = new Set(majorChanges.map((m) => m.version));
  return {
    alphasInWindowWithMajor: withMajor.size,
    alphasInWindow: inWindowVersions.length,
    majorChanges,
    xstateEffectBreaking: effectMajors,
  };
};

export interface Sizes {
  readonly licence: Readonly<Record<string, string>>;
  readonly duBytes: Readonly<Record<string, number>>;
  readonly unpackedSize: Readonly<Record<string, number>>;
  readonly bundles: readonly { readonly name: string; readonly bytes: number; readonly gzipBytes: number }[];
}

const du = (path: string): number => Number(sh("du", ["-sb", path]).split("\t")[0]);

export const sizes = (): Sizes => {
  const pkgJson = (p: string) => JSON.parse(readFileSync(`${root}/node_modules/${p}/package.json`, "utf8")) as { version: string; license: string };
  const unpacked = (spec: string) => Number(sh("npm", ["view", spec, "dist.unpackedSize"]).trim());
  mkdirSync(`${root}/out`, { recursive: true });
  const bundles = ["effect-only", "xstate-pure", "all"].map((name) => {
    sh("bun", ["build", `src/bundle/${name}.ts`, "--minify", "--outfile", `out/bundle-${name}.js`]);
    const code = readFileSync(`${root}/out/bundle-${name}.js`);
    return { name, bytes: code.length, gzipBytes: gzipSync(code).length };
  });
  return {
    licence: {
      xstate: pkgJson("xstate").license,
      "@xstate/effect": pkgJson("@xstate/effect").license,
      effect: pkgJson("effect").license,
    },
    duBytes: {
      xstate: du(`${root}/node_modules/xstate`),
      "@xstate/effect": du(`${root}/node_modules/@xstate/effect`),
      effect: du(`${root}/node_modules/effect`),
    },
    unpackedSize: {
      "xstate@6.0.0-alpha.70": unpacked("xstate@6.0.0-alpha.70"),
      "@xstate/effect@1.0.0-alpha.9": unpacked("@xstate/effect@1.0.0-alpha.9"),
      "xstate@6.0.0-alpha.71": unpacked("xstate@6.0.0-alpha.71"),
      "@xstate/effect@1.0.0-alpha.10": unpacked("@xstate/effect@1.0.0-alpha.10"),
    },
    bundles,
  };
};

export const tsc = (): { readonly version: string; readonly repoFlags: string; readonly exactFlags: string } => {
  const bin = `${here}../../../../0004/node_modules/.bun/typescript@7.0.2/node_modules/typescript/bin/tsc`;
  return {
    version: sh(bin, ["--version"]).trim(),
    repoFlags: sh(bin, ["-p", "tsconfig.json"]).trim(),
    exactFlags: sh(bin, ["-p", "tsconfig.exact.json"]).trim(),
  };
};

export const installed = (): Readonly<Record<string, string>> =>
  Object.fromEntries(
    ["xstate", "@xstate/effect", "effect", "@statelyai/inspect"].map((p) => [
      p,
      (JSON.parse(readFileSync(`${root}/node_modules/${p}/package.json`, "utf8")) as { version: string }).version,
    ]),
  );
