// The composition root's registry: which Layer fills each of the seven services for each name of the selection
// (`@reebeat/services` `choices`), and the verification. This is the one place that imports adapters. A `Selection`
// picks one Layer per service; building a Layer loads no model and starts nothing, so a selected adapter whose model,
// binary or credential is missing fails `AdapterUnavailable` on first use, never by falling back to another adapter.
// Each table is typed over the choices of its key: adding a name to `choices` does not compile until it is wired here.
import { whisperAligner } from "@reebeat/align-whisper";
import { fsAssetCache } from "@reebeat/cache-fs";
import { chromiumCapturerWith } from "@reebeat/capture-chromium";
import { MediaTools, ffmpegEncoder } from "@reebeat/encode-ffmpeg";
import { revealRenderer } from "@reebeat/render-reveal";
import type {
  AssetCache,
  Encoder,
  FrameCapturer,
  Renderer,
  Selection,
  SoundLibrary,
  SpeechSynthesizer,
  WordAligner,
} from "@reebeat/services";
import { evenAligner, silentSynthesizer } from "@reebeat/services/standins";
import { synthSounds } from "@reebeat/sounds-synth";
import { kokoroSynthesizer } from "@reebeat/speech-kokoro";
import { Context, Layer } from "effect";
import type { FileSystem, Path } from "effect";
import type { Digest } from "effect/crypto";
import type { ChildProcessSpawner } from "effect/process";

import { Verifier } from "./verifier.ts";

/** What every adapter may need of the machine: the platform services the entry point provides. */
type Platform =
  | ChildProcessSpawner.ChildProcessSpawner
  | Digest.Digest
  | FileSystem.FileSystem
  | Path.Path;

/** The Layers a build runs on: one per service, plus the verification that `check` and `journey` ask. */
export interface Parts {
  readonly aligner: Layer.Layer<WordAligner, never, Platform>;
  readonly cache: Layer.Layer<AssetCache, never, Platform>;
  readonly capturer: Layer.Layer<FrameCapturer, never, Platform>;
  readonly encoder: Layer.Layer<Encoder, never, Platform>;
  readonly renderer: Layer.Layer<Renderer, never, Platform>;
  readonly sounds: Layer.Layer<SoundLibrary, never, Platform>;
  readonly speech: Layer.Layer<SpeechSynthesizer, never, Platform>;
  readonly verifier: Layer.Layer<Verifier, never, Platform>;
}

/** What a run needs besides the selection: where the cache is and how long the capture may take. */
export interface RunOptions {
  /** The directory of the `fs` cache. */
  readonly cacheDir: string;
  /** The capture's deadline in seconds; `undefined` is the capturer's own default. */
  readonly captureTimeoutSeconds?: number | undefined;
}

type Choice<Key extends keyof Selection> = Selection[Key];

const aligners = {
  even: evenAligner,
  whisper: whisperAligner,
} satisfies Record<Choice<"aligner">, Parts["aligner"]>;

const caches = { fs: fsAssetCache } satisfies Record<
  Choice<"cache">,
  (dir: string) => Parts["cache"]
>;

const capturers = { chromium: chromiumCapturerWith } satisfies Record<
  Choice<"capturer">,
  (options: {
    readonly timeoutSeconds?: number | undefined;
  }) => Parts["capturer"]
>;

const encoders = { ffmpeg: ffmpegEncoder } satisfies Record<
  Choice<"encoder">,
  Parts["encoder"]
>;

const renderers = { reveal: revealRenderer } satisfies Record<
  Choice<"renderer">,
  Parts["renderer"]
>;

const sounds = { synth: synthSounds } satisfies Record<
  Choice<"sounds">,
  Parts["sounds"]
>;

const speeches = {
  kokoro: kokoroSynthesizer,
  silent: silentSynthesizer,
} satisfies Record<Choice<"speech">, Parts["speech"]>;

/** The real adapters of `selection`: the local ones (design R3, release 1). */
export const realParts = (
  selection: Selection,
  options: RunOptions
): Parts => ({
  aligner: aligners[selection.aligner],
  cache: caches[selection.cache](options.cacheDir),
  capturer: capturers[selection.capturer]({
    timeoutSeconds: options.captureTimeoutSeconds,
  }),
  encoder: encoders[selection.encoder],
  renderer: renderers[selection.renderer],
  sounds: sounds[selection.sounds],
  speech: speeches[selection.speech],
  verifier: Verifier.layer.pipe(Layer.provide(MediaTools.layer)),
});

/**
 * How the selection becomes Layers. The default is `realParts`; a test replaces it through the context to put a
 * fake in place of an adapter that needs Chromium, a model or a credential. It is a `Context.Reference`, so no
 * caller provides it in a real run.
 */
export const Composition = Context.Reference<
  (selection: Selection, options: RunOptions) => Parts
>("@reebeat/cli/adapters/Composition", { defaultValue: () => realParts });

/** The seven services of `parts` as one Layer; the verification is left out (only `check` needs it). */
export const servicesOf = (parts: Parts) =>
  Layer.mergeAll(
    parts.speech,
    parts.aligner,
    parts.sounds,
    parts.renderer,
    parts.capturer,
    parts.encoder,
    parts.cache
  );

/** The four services the speech stage needs, for the commands that read the cache without building (`plan --timing`). */
export const speechServicesOf = (parts: Parts) =>
  Layer.mergeAll(parts.speech, parts.aligner, parts.encoder, parts.cache);
