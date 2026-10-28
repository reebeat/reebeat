// The speech cache on a directory: `<cacheDir>/<key>.flac` and `<cacheDir>/<key>.json`. A read verifies the
// audio against the hash in the words file, so a truncated or swapped FLAC is an error, never a silent hit.
import { Crypto, Effect, FileSystem, Layer, Option, Path } from "effect";

import { audioFile, decodeEntry, encodeEntry, entryFile } from "./entry.ts";
import type { CacheEntry } from "./entry.ts";
import { SpeechCacheFailed } from "./errors.ts";
import { sha256Hex } from "./key.ts";
import { SpeechCache } from "./services.ts";

const failure =
  (key: string, operation: SpeechCacheFailed["operation"], message: string) =>
  (cause: unknown) =>
    new SpeechCacheFailed({ cause, key, message, operation });

/** The cache of a directory; the directory is created on the first write. */
export const speechCacheFiles = (cacheDir: string) =>
  Layer.effect(
    SpeechCache,
    Effect.gen(function* speechCacheFilesLayer() {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const crypto = yield* Crypto.Crypto;

      const hash = (bytes: Uint8Array) =>
        Effect.provideService(sha256Hex(bytes), Crypto.Crypto, crypto);

      const get = Effect.fn("SpeechCache.get")(function* get(
        key: string
      ): Effect.fn.Return<Option.Option<CacheEntry>, SpeechCacheFailed> {
        const words = path.join(cacheDir, entryFile(key));

        const present = yield* Effect.mapError(
          fs.exists(words),
          failure(key, "read", `cannot look for ${words}`)
        );

        if (!present) {
          return Option.none();
        }

        const text = yield* Effect.mapError(
          fs.readFileString(words),
          failure(key, "read", `cannot read ${words}`)
        );

        const entry = yield* Effect.mapError(
          decodeEntry(text),
          failure(key, "read", `${words} is not a cache entry`)
        );

        if (entry.key !== key) {
          return yield* new SpeechCacheFailed({
            cause: entry.key,
            key,
            message: `${words} holds the entry of ${entry.key}`,
            operation: "verify",
          });
        }

        const flac = path.join(cacheDir, audioFile(key));

        const bytes = yield* Effect.mapError(
          fs.readFile(flac),
          failure(key, "verify", `cannot read ${flac}`)
        );

        const sha256 = yield* Effect.mapError(
          hash(bytes),
          failure(key, "verify", `cannot hash ${flac}`)
        );

        if (sha256 !== entry.audioSha256) {
          return yield* new SpeechCacheFailed({
            cause: sha256,
            key,
            message: `${flac} has SHA-256 ${sha256} but ${words} says ${entry.audioSha256}`,
            operation: "verify",
          });
        }

        return Option.some(entry);
      });

      const put = Effect.fn("SpeechCache.put")(function* put(
        entry: CacheEntry,
        flac: Uint8Array
      ): Effect.fn.Return<void, SpeechCacheFailed> {
        const fail = failure(entry.key, "write", `cannot write ${cacheDir}`);
        const words = path.join(cacheDir, entryFile(entry.key));
        const pending = `${words}.partial`;

        yield* Effect.mapError(
          fs.makeDirectory(cacheDir, { recursive: true }),
          fail
        );
        yield* Effect.mapError(
          fs.writeFile(path.join(cacheDir, audioFile(entry.key)), flac),
          fail
        );
        yield* Effect.mapError(
          Effect.flatMap(encodeEntry(entry), (text) =>
            fs.writeFileString(pending, text)
          ),
          fail
        );
        yield* Effect.mapError(fs.rename(pending, words), fail);
      });

      return SpeechCache.of({ get, put });
    })
  );
