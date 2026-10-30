import {
  AssetCache,
  CacheFailed,
  ProvenanceSchema,
  assetKey,
  localEgress,
  rejectSecretSettings,
} from "@tsukuri/services";
import type { Asset, CacheError, Provenance } from "@tsukuri/services";
// AssetCache on a directory (spec 0001, design R3). An asset is `<dir>/<key>.<name>` for each of its files and
// `<dir>/<key>.provenance.json` last, so a reader that finds the provenance finds every file: a put removes an old
// provenance first, writes the files, and renames the new provenance into place only when all of them are down.
// The provenance file also records the size and SHA-256 of every file; a read verifies each one, so a truncated,
// swapped or hand-edited file is `CacheFailed`, never a silent hit. Foreign ABI: the platform `FileSystem`.
import {
  Array as Arr,
  Effect,
  FileSystem,
  Layer,
  Option,
  Order,
  Path,
  Schema,
  String as Str,
} from "effect";
import { Digest } from "effect/crypto";

const provenanceSuffix = ".provenance.json";

/** A key or file name that is one plain path segment: it cannot leave the directory. */
const plainName = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;

const FileRecord = Schema.Struct({
  bytes: Schema.Int,
  name: Schema.String,
  sha256: Schema.String,
});

/** The provenance file: the provenance of the asset and what each of its files must hold. */
const RecordSchema = Schema.Struct({
  files: Schema.Array(FileRecord),
  provenance: ProvenanceSchema,
});

const recordJson = Schema.fromJsonString(RecordSchema, { space: 2 });
const decodeRecord = Schema.decodeUnknownEffect(recordJson);
const encodeRecord = Schema.encodeEffect(recordJson);

const failure =
  (key: string, operation: CacheFailed["operation"], message: string) =>
  (cause: unknown) =>
    new CacheFailed({ adapter: "fs-cache@1", cause, key, message, operation });

const requireName = (
  key: string,
  operation: CacheFailed["operation"],
  what: string,
  name: string
) =>
  plainName.test(name) && !Str.includes("..")(name)
    ? Effect.void
    : Effect.fail(
        failure(
          key,
          operation,
          `${what} ${JSON.stringify(name)} is not a plain file name`
        )(name)
      );

/** The file names of an asset: plain, each once, and none the provenance file's own name. */
const requireFileNames = Effect.fnUntraced(function* requireFileNames(
  key: string,
  names: readonly string[]
) {
  yield* Effect.forEach(
    names,
    (name) => requireName(key, "put", "the file name", name),
    { discard: true }
  );

  const distinct =
    new Set(names).size === names.length && !names.includes("provenance.json");

  return yield* distinct
    ? Effect.void
    : Effect.fail(
        failure(
          key,
          "put",
          "an asset holds each file name once, and none is provenance.json"
        )(names)
      );
});

/** The cache of the directory `dir`, created on the first put. Every file is named `<key>.<name>`. */
export const fsAssetCache = (dir: string) =>
  Layer.effect(
    AssetCache,
    Effect.gen(function* fsAssetCacheLayer() {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const digest = yield* Digest.Digest;

      const recordPath = (key: string) =>
        path.join(dir, `${key}${provenanceSuffix}`);

      const filePath = (key: string, name: string) =>
        path.join(dir, `${key}.${name}`);

      const readRecord = Effect.fnUntraced(function* readRecord(
        key: string,
        file: string,
        operation: CacheFailed["operation"]
      ) {
        const text = yield* Effect.mapError(
          fs.readFileString(file),
          failure(key, operation, `cannot read ${file}`)
        );

        return yield* Effect.mapError(
          decodeRecord(text),
          failure(key, operation, `${file} is not a provenance file`)
        );
      });

      const get = Effect.fn("AssetCache.get")(function* get(
        key: string
      ): Effect.fn.Return<Option.Option<Asset>, CacheError> {
        yield* requireName(key, "get", "the key", key);

        const file = recordPath(key);

        const present = yield* Effect.mapError(
          fs.exists(file),
          failure(key, "get", `cannot look for ${file}`)
        );

        if (!present) {
          return Option.none();
        }

        const record = yield* readRecord(key, file, "get");

        const files = yield* Effect.forEach(record.files, (expected) =>
          Effect.gen(function* verifyFile() {
            const where = filePath(key, expected.name);

            const bytes = yield* Effect.mapError(
              fs.readFile(where),
              failure(key, "get", `cannot read ${where}`)
            );

            const actual = yield* digest.digestHex(Digest.sha256, bytes);

            if (
              actual !== expected.sha256 ||
              bytes.byteLength !== expected.bytes
            ) {
              return yield* failure(
                key,
                "get",
                `${where} has SHA-256 ${actual} but ${file} says ${expected.sha256}`
              )(actual);
            }

            return { bytes, name: expected.name };
          })
        );

        return Option.some({ files, provenance: record.provenance });
      });

      const put = Effect.fn("AssetCache.put")(function* put(
        key: string,
        asset: Asset
      ): Effect.fn.Return<void, CacheError> {
        const fail = failure(key, "put", `cannot write ${key} to the cache`);

        yield* requireName(key, "put", "the key", key);
        yield* rejectSecretSettings(
          asset.provenance.adapter,
          asset.provenance.settings
        );
        yield* requireFileNames(
          key,
          Arr.map(asset.files, ({ name }) => name)
        );

        const record = yield* Effect.forEach(asset.files, ({ bytes, name }) =>
          Effect.map(digest.digestHex(Digest.sha256, bytes), (sha256) => ({
            bytes: bytes.byteLength,
            name,
            sha256,
          }))
        );

        const text = yield* Effect.mapError(
          encodeRecord({ files: record, provenance: asset.provenance }),
          fail
        );

        const pending = `${recordPath(key)}.partial`;

        yield* Effect.mapError(
          fs.makeDirectory(dir, { recursive: true }),
          fail
        );
        yield* Effect.mapError(
          fs.remove(recordPath(key), { force: true }),
          fail
        );
        yield* Effect.forEach(
          asset.files,
          ({ bytes, name }) =>
            Effect.mapError(fs.writeFile(filePath(key, name), bytes), fail),
          { discard: true }
        );
        yield* Effect.mapError(fs.writeFileString(pending, text), fail);
        yield* Effect.mapError(fs.rename(pending, recordPath(key)), fail);
      });

      const list = Effect.fn("AssetCache.list")(
        function* list(): Effect.fn.Return<readonly Provenance[], CacheError> {
          const present = yield* Effect.mapError(
            fs.exists(dir),
            failure("", "list", `cannot look for ${dir}`)
          );

          if (!present) {
            return [];
          }

          const names = yield* Effect.mapError(
            fs.readDirectory(dir),
            failure("", "list", `cannot read ${dir}`)
          );

          const records = Arr.sort(
            Arr.filter(names, (name) => Str.endsWith(provenanceSuffix)(name)),
            Order.String
          );

          return yield* Effect.forEach(records, (name) =>
            Effect.map(
              readRecord(name, path.join(dir, name), "list"),
              (record) => record.provenance
            )
          );
        }
      );

      return AssetCache.of({
        get,
        info: {
          egress: localEgress,
          id: "fs-cache@1",
          settings: { layout: "key.name" },
        },
        key: (request) =>
          Effect.provideService(assetKey(request), Digest.Digest, digest),
        list: list(),
        put,
      });
    })
  );
