// The speech stage (spec 0001, design R3): one aligned Line for every Line of the Plan, in order, from the
// content-addressed `AssetCache` or, when asked to refresh, from the services that make it. A program over services
// only: no model, no binary, no directory is named here; the composition root chooses the adapters.
//
//   key = AssetCache.key({ adapter: synthesizer.info, input: narration text,
//                          extra: { aligner: aligner.info, pipeline, speed, voice } })
//   hit                  -> decode the asset (`flac`, `words.json`)
//   miss, !refresh       -> SpeechCacheMiss naming the Line and the key (F12)
//   miss, refresh        -> synthesize -> encodeAudio -> decodeAudio -> align -> put
//
// The aligner hears what the cache stores (the decoded FLAC), as the first release's whisper did.
import { matchThreshold } from "@reebeat/core";
import type { Line, PlanJson } from "@reebeat/core";
import {
  AssetCache,
  Encoder,
  SpeechSynthesizer,
  WordAligner,
  rejectSecretSettings,
} from "@reebeat/services";
import type { Asset, Egress, Provenance } from "@reebeat/services";
import type { Schema } from "effect";
import { Array as Arr, Effect, Option, String as Str } from "effect";

import {
  AlignmentBelowThreshold,
  SpeechAssetInvalid,
  SpeechCacheMiss,
} from "./errors.ts";
import { sha256Hex } from "./hash.ts";
import {
  audioName,
  decodeWords,
  encodeWords,
  toAlignedLine,
  wordsName,
} from "./speechAsset.ts";

/** The version of this stage's behaviour, part of every key: bump it when the stage changes what it caches. */
export const pipelineVersion = "speech-v2";

/** The narrator's voice of release 1. */
export const defaultVoice = "af_heart";

export interface SpeechStageOptions {
  /** Whether a miss is filled from the services (`true`) or is the typed `SpeechCacheMiss` (`false`). */
  readonly refresh: boolean;
  /** The voice to ask the synthesiser for; defaults to `defaultVoice`. */
  readonly voice?: string;
}

const excerpt = (text: string): string =>
  text.length <= 48 ? text : `${Str.slice(0, 45)(text)}...`;

/** What leaves the machine when both adapters run: the larger kind and every kind of data either sends. */
const mergedEgress = (left: Egress, right: Egress): Egress => ({
  kind:
    left.kind === "integration" || right.kind === "integration"
      ? "integration"
      : "local",
  sends: Arr.dedupe([...left.sends, ...right.sends]),
});

/** The key of a Line's asset and the extra JSON that went into it (the provenance records the latter). */
const keyOf = Effect.fnUntraced(function* keyOf(line: Line, voice: string) {
  const cache = yield* AssetCache;
  const synthesizer = yield* SpeechSynthesizer;
  const aligner = yield* WordAligner;

  // `cache.key` and `cache.put` read the names of the synthesiser's settings; the aligner's travel inside `extra`,
  // which they do not, so a secret-looking name is refused here, before a key or an asset exists.
  yield* rejectSecretSettings(aligner.info.id, aligner.info.settings);

  const extra = {
    aligner: aligner.info,
    pipeline: pipelineVersion,
    speed: line.hints.speed,
    voice,
  } satisfies Schema.Json;

  const key = yield* cache.key({
    adapter: synthesizer.info,
    extra,
    input: line.text,
  });

  return { extra, key };
});

/** The aligned Line of a cached asset: its `flac` hashed, its `words.json` decoded. */
const fromAsset = Effect.fnUntraced(function* fromAsset(
  line: Line,
  key: string,
  asset: Asset
) {
  const invalid = (message: string, cause: unknown) =>
    new SpeechAssetInvalid({ cause, key, lineId: line.id, message });

  const audio = Arr.findFirst(asset.files, (file) => file.name === audioName);
  const words = Arr.findFirst(asset.files, (file) => file.name === wordsName);

  if (Option.isNone(audio) || Option.isNone(words)) {
    return yield* invalid(
      `the asset ${key} of Line ${line.id} lacks ${audioName} or ${wordsName}`,
      Arr.map(asset.files, (file) => file.name)
    );
  }

  const decoded = yield* Effect.mapError(
    decodeWords(new TextDecoder().decode(words.value.bytes)),
    (cause) =>
      invalid(`${wordsName} of the asset ${key} is not a words file`, cause)
  );

  return toAlignedLine(line, key, yield* sha256Hex(audio.value.bytes), decoded);
});

/** Makes the asset of a Line from the services, stores it and returns its aligned Line. */
const narrate = Effect.fn("speechStage.narrate")(function* narrate(
  line: Line,
  voice: string,
  made: { readonly extra: Schema.Json; readonly key: string }
) {
  const cache = yield* AssetCache;
  const synthesizer = yield* SpeechSynthesizer;
  const aligner = yield* WordAligner;
  const encoder = yield* Encoder;

  yield* Effect.logInfo(`narrating ${line.id}: ${excerpt(line.text)}`);

  const { clip, words: hint } = yield* synthesizer.synthesize({
    speed: line.hints.speed,
    text: line.text,
    voice,
  });

  const audio = yield* encoder.encodeAudio(clip);

  const heard = { clip: yield* encoder.decodeAudio(audio), words: line.words };

  const { match, spans } = yield* aligner.align(
    hint === undefined ? heard : { ...heard, hint }
  );

  if (match < matchThreshold) {
    return yield* new AlignmentBelowThreshold({
      lineId: line.id,
      match,
      message: `the aligner matched ${match.toFixed(3)} of the words of Line ${line.id} ("${line.text}"), below ${matchThreshold}`,
      threshold: matchThreshold,
    });
  }

  const words = {
    durationMs: Math.round((clip.samples.length * 1000) / clip.sampleRate),
    match,
    words: Arr.map(spans, (span, index) => ({
      endMs: span.endMs,
      startMs: span.startMs,
      w: line.words[index] ?? "",
    })),
  };

  const provenance: Provenance = {
    adapter: synthesizer.info.id,
    createdBy: `${pipelineVersion}: ${synthesizer.info.id}, ${aligner.info.id}, ${encoder.info.id}`,
    egress: mergedEgress(synthesizer.info.egress, aligner.info.egress),
    keyParts: { extra: made.extra, input: line.text, key: made.key },
    settings: synthesizer.info.settings,
  };

  const wordsText = yield* Effect.orDie(encodeWords(words));

  yield* cache.put(made.key, {
    files: [
      { bytes: audio, name: audioName },
      { bytes: new TextEncoder().encode(wordsText), name: wordsName },
    ],
    provenance,
  });

  return toAlignedLine(line, made.key, yield* sha256Hex(audio), words);
});

const alignLine = Effect.fn("speechStage.alignLine")(function* alignLine(
  line: Line,
  options: SpeechStageOptions
) {
  const cache = yield* AssetCache;
  const voice = options.voice ?? defaultVoice;
  const made = yield* keyOf(line, voice);
  const cached = yield* cache.get(made.key);

  if (Option.isSome(cached)) {
    return yield* fromAsset(line, made.key, cached.value);
  }

  if (!options.refresh) {
    return yield* new SpeechCacheMiss({
      key: made.key,
      lineId: line.id,
      message: `the speech cache has no asset ${made.key} for Line ${line.id} ("${excerpt(line.text)}"); build with refresh and the speech models present`,
      textExcerpt: excerpt(line.text),
    });
  }

  return yield* narrate(line, voice, made);
});

/**
 * The narration of a Plan: one aligned Line for every Line of every Scene, in order, one at a time. With
 * `refresh: false` the services that make speech are never called.
 */
export const speechStage = Effect.fn("speechStage")(function* speechStage(
  plan: PlanJson,
  options: SpeechStageOptions
) {
  return yield* Effect.forEach(
    Arr.flatMap(plan.scenes, (scene) => scene.lines),
    (line) => alignLine(line, options)
  );
});
