import { Schema } from "effect";

// The expected failures of the seven services (spec 0001, design R3). One file holds the closed set. Each error
// names the adapter or the input it concerns; a foreign cause goes in `cause` for the human, never for branching.
// `AdapterUnavailable` is the error of a Layer: an adapter checks its requirement when it is built, so a missing
// model, binary or credential stops the composition root and no operation runs on a half-available adapter.

/** The names of the seven services, as errors report them. */
export const serviceNames = [
  "SpeechSynthesizer",
  "WordAligner",
  "SoundLibrary",
  "Renderer",
  "FrameCapturer",
  "Encoder",
  "AssetCache",
] as const;

/** A selected adapter lacks a model, a binary or a credential. There is never a fallback to another adapter. */
export class AdapterUnavailable extends Schema.TaggedError<
  AdapterUnavailable,
  { readonly brand: unique symbol }
>()("AdapterUnavailable", {
  adapter: Schema.String,
  message: Schema.String,
  /** What is missing, named, never its value: `model ggml-base.en.bin`, `binary ffmpeg`, `env ELEVENLABS_API_KEY`. */
  requirement: Schema.String,
  service: Schema.Literals(serviceNames),
}) {}

/** A selection names a key or a value outside the registry. */
export class UnknownSelection extends Schema.TaggedError<
  UnknownSelection,
  { readonly brand: unique symbol }
>()("UnknownSelection", {
  choices: Schema.Array(Schema.String),
  key: Schema.String,
  message: Schema.String,
  value: Schema.String,
}) {}

/** `SpeechSynthesizer.synthesize` was asked for no words. */
export class EmptyText extends Schema.TaggedError<
  EmptyText,
  { readonly brand: unique symbol }
>()("EmptyText", { message: Schema.String }) {}

/** A synthesiser failed on a request it accepts. */
export class SynthesisFailed extends Schema.TaggedError<
  SynthesisFailed,
  { readonly brand: unique symbol }
>()("SynthesisFailed", {
  adapter: Schema.String,
  cause: Schema.Defect(),
  message: Schema.String,
}) {}

/** A word aligner failed on audio and words it accepts. */
export class AlignmentFailed extends Schema.TaggedError<
  AlignmentFailed,
  { readonly brand: unique symbol }
>()("AlignmentFailed", {
  adapter: Schema.String,
  cause: Schema.Defect(),
  message: Schema.String,
}) {}

/** `SoundLibrary.sound` was asked for a name that is not in `names`. */
export class UnknownSound extends Schema.TaggedError<
  UnknownSound,
  { readonly brand: unique symbol }
>()("UnknownSound", {
  choices: Schema.Array(Schema.String),
  message: Schema.String,
  sound: Schema.String,
}) {}

/** A renderer failed on a Plan it accepts. */
export class RenderFailed extends Schema.TaggedError<
  RenderFailed,
  { readonly brand: unique symbol }
>()("RenderFailed", {
  adapter: Schema.String,
  cause: Schema.Defect(),
  message: Schema.String,
}) {}

/** A frame capture failed, stalled or timed out. */
export class CaptureError extends Schema.TaggedError<
  CaptureError,
  { readonly brand: unique symbol }
>()("CaptureError", {
  adapter: Schema.String,
  cause: Schema.Defect(),
  message: Schema.String,
}) {}

/** An audio codec or the mux failed. */
export class EncodeFailed extends Schema.TaggedError<
  EncodeFailed,
  { readonly brand: unique symbol }
>()("EncodeFailed", {
  adapter: Schema.String,
  cause: Schema.Defect(),
  message: Schema.String,
  operation: Schema.Literals(["encodeAudio", "decodeAudio", "mux"]),
}) {}

/** A cache read or write failed (the store, not the key). */
export class CacheFailed extends Schema.TaggedError<
  CacheFailed,
  { readonly brand: unique symbol }
>()("CacheFailed", {
  adapter: Schema.String,
  cause: Schema.Defect(),
  key: Schema.String,
  message: Schema.String,
  operation: Schema.Literals(["get", "put", "list"]),
}) {}

/** A settings key looks like a secret (`key`, `token`, `secret`, `password`, `credential`); the value is never named. */
export class SecretLikeSetting extends Schema.TaggedError<
  SecretLikeSetting,
  { readonly brand: unique symbol }
>()("SecretLikeSetting", {
  adapter: Schema.String,
  message: Schema.String,
  setting: Schema.String,
}) {}

/** Everything `SpeechSynthesizer.synthesize` can fail with. */
export type SpeechError = EmptyText | SynthesisFailed;

/** Everything `WordAligner.align` can fail with. */
export type AlignError = AlignmentFailed;

/** Everything `Renderer.render` can fail with. */
export type RenderError = RenderFailed;

/** Everything `Encoder` operations can fail with; `mux` also carries the frame stream's `CaptureError`. */
export type EncodeError = EncodeFailed;

/** Everything `AssetCache.key` can fail with. */
export type KeyError = SecretLikeSetting;

/** Everything `AssetCache.get`, `put` and `list` can fail with. */
export type CacheError = CacheFailed | SecretLikeSetting;
