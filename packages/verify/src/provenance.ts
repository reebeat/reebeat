// What `build.json` (v2) must say beyond its file list (spec 0001, F5 and F16): every adapter of the seven services
// is listed once with its egress declaration, every Line's audio has the provenance of its cache asset, and no
// `settings` anywhere in the manifest has a secret-looking name. Pure: the manifest and the Plan in, problems out.
import type { TimedLine, TimedPlan } from "@reebeat/core";
import type { BuildManifest } from "@reebeat/pipeline";
import {
  SettingsSchema,
  secretLikeNames,
  serviceNames,
} from "@reebeat/services";
import type { Settings } from "@reebeat/services";
import { Array as Arr, Predicate, Record, Schema } from "effect";

/** The cache key of a Line's audio file `<key>.<name>`: the part before the first dot. */
const keyOfAudio = (file: string): string => file.split(".")[0] ?? file;

const isSettings = Schema.is(SettingsSchema);

// Type guards over `Schema.Json` that narrow in both branches (the plain guards leave `JsonArray` behind in the
// false branch of `Predicate.isObject`).
const isJsonArray = (value: Schema.Json): value is Schema.JsonArray =>
  Arr.isArray(value);

const isJsonObject = (value: Schema.Json): value is Schema.JsonObject =>
  Predicate.isObject(value);

/** Every value stored under a property named `settings`, at any depth of `value`. */
const settingsIn = (value: Schema.Json): readonly Settings[] => {
  if (isJsonArray(value)) {
    return Arr.flatMap(value, settingsIn);
  }

  if (!isJsonObject(value)) {
    return [];
  }

  return Arr.flatMap(Record.toEntries(value), ([name, inner]) =>
    name === "settings" && isSettings(inner) ? [inner] : settingsIn(inner)
  );
};

const adapterProblems = (manifest: BuildManifest): readonly string[] =>
  Arr.flatMap(serviceNames, (service) => {
    const listed = Arr.filter(
      manifest.adapters,
      (adapter) => adapter.service === service
    );

    if (listed.length !== 1) {
      return [
        `build.json lists ${listed.length} adapters for ${service}, it must list exactly one`,
      ];
    }

    return Arr.flatMap(listed, (adapter) =>
      adapter.egress.kind === "local" && adapter.egress.sends.length > 0
        ? [
            `${service} adapter ${adapter.id} is declared local but sends ${Arr.join(adapter.egress.sends, ", ")}`,
          ]
        : []
    );
  });

const assetProblems = (
  manifest: BuildManifest,
  plan: TimedPlan
): readonly string[] => {
  const keys = Arr.map(manifest.assets, (asset) => asset.keyParts.key);

  const lines: readonly TimedLine[] = Arr.flatMap(
    plan.timeline.scenes,
    (scene) => scene.lines
  );

  return Arr.flatMap(lines, (line) =>
    Arr.contains(keys, keyOfAudio(line.audio.file))
      ? []
      : [
          `Line ${line.lineId}: build.json has no provenance for its audio ${line.audio.file}`,
        ]
  );
};

const secretProblems = (manifest: BuildManifest): readonly string[] => {
  const everySettings: readonly Settings[] = [
    ...Arr.map(manifest.adapters, (adapter) => adapter.settings),
    ...Arr.map(manifest.assets, (asset) => asset.settings),
    ...Arr.flatMap(manifest.assets, (asset) =>
      asset.keyParts.extra === undefined ? [] : settingsIn(asset.keyParts.extra)
    ),
  ];

  return Arr.flatMap(everySettings, (settings) =>
    Arr.map(
      secretLikeNames(settings),
      (name) =>
        `build.json holds a setting named "${name}", which looks like a secret: secrets never enter the manifest`
    )
  );
};

/** Every way `build.json` fails to say what the build used and kept out of it; empty when it holds. */
export const manifestProblems = (
  manifest: BuildManifest,
  plan: TimedPlan
): readonly string[] => [
  ...adapterProblems(manifest),
  ...assetProblems(manifest, plan),
  ...secretProblems(manifest),
];
