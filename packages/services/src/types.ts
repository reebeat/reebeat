// The value types the seven services exchange (spec 0001, design R3). Plain shapes stay interfaces; whatever
// crosses a JSON boundary (the build manifest, the cache's metadata file, the selection) has a Schema.
import { Schema } from "effect";

/** Mono PCM: `samples` in [-1, 1] at `sampleRate` Hz. */
export interface AudioClip {
  readonly sampleRate: number;
  readonly samples: Float32Array;
}

/** The time one word is spoken, in milliseconds from the start of its clip. */
export const WordSpanSchema = Schema.Struct({
  endMs: Schema.Finite,
  startMs: Schema.Finite,
});

export type WordSpan = typeof WordSpanSchema.Type;

/**
 * What leaves the machine when an adapter runs. `local` adapters send nothing (`sends` is empty); an `integration`
 * lists each kind of data it sends out, for example `["narration text"]` for a hosted speech provider.
 */
export const EgressSchema = Schema.Struct({
  kind: Schema.Literals(["local", "integration"]),
  sends: Schema.Array(Schema.String),
});

export type Egress = typeof EgressSchema.Type;

/** The egress of every local adapter: nothing leaves the machine. */
export const localEgress: Egress = { kind: "local", sends: [] };

/**
 * Everything that changes an adapter's output and so belongs in a cache key: its voice, model, speed and the like.
 * Never a secret: `assetKey` and `AssetCache.put` reject a setting whose name looks like one.
 */
export const SettingsSchema = Schema.Record(
  Schema.String,
  Schema.Union([Schema.String, Schema.Finite, Schema.Boolean])
);

export type Settings = typeof SettingsSchema.Type;

/** `id` is `name@version` (for example `kokoro@1.2.1`); stand-ins end their name in `-standin`. */
export const AdapterInfoSchema = Schema.Struct({
  egress: EgressSchema,
  id: Schema.String,
  settings: SettingsSchema,
});

export type AdapterInfo = typeof AdapterInfoSchema.Type;

/** The parts of a cache key besides the adapter: the content address, the input text and any extra JSON. */
export const KeyPartsSchema = Schema.Struct({
  extra: Schema.optionalKey(Schema.Json),
  input: Schema.String,
  key: Schema.String,
});

export type KeyParts = typeof KeyPartsSchema.Type;

/** Where an asset came from; the build manifest lists one per asset. */
export const ProvenanceSchema = Schema.Struct({
  adapter: Schema.String,
  createdBy: Schema.String,
  egress: EgressSchema,
  keyParts: KeyPartsSchema,
  settings: SettingsSchema,
});

export type Provenance = typeof ProvenanceSchema.Type;

/** A cached output: named files and the provenance recorded with them. */
export interface Asset {
  readonly files: readonly {
    readonly bytes: Uint8Array;
    readonly name: string;
  }[];
  readonly provenance: Provenance;
}
