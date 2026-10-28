// The adapters of the speech stage as the composition root chooses them for release 1: Kokoro (local), whisper.cpp
// (local), ffmpeg, and the filesystem cache in `directory`. Building the layer loads no model and needs no network;
// the models load on the first miss. `scripts/refillSpeech.ts`, the committed-cache test and the live test use it.
import { whisperAligner } from "@reebeat/align-whisper";
import { fsAssetCache } from "@reebeat/cache-fs";
import { ffmpegEncoder } from "@reebeat/encode-ffmpeg";
import { kokoroSynthesizer } from "@reebeat/speech-kokoro";
import { Layer } from "effect";

export const speechAdapters = (directory: string) =>
  Layer.mergeAll(
    kokoroSynthesizer,
    whisperAligner,
    ffmpegEncoder,
    fsAssetCache(directory)
  );
