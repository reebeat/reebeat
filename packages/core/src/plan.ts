// The Plan contract (`plan.json`) of spec 0001, section "The Plan contract". This file is the authority;
// the spec section is its summary. A change here is a dated Revision in the spec.
// The schemas are named `...Schema`; the types derived from them carry the contract's names.
import { Schema } from "effect";

/** The nine cells of the Element grid, in reading order. */
export const cells = [
  "tl",
  "tc",
  "tr",
  "ml",
  "mc",
  "mr",
  "bl",
  "bc",
  "br",
] as const;

/** The classes of the fixed theme (`packages/deck`). */
export const elementClasses = [
  "box",
  "title",
  "label",
  "accent",
  "muted",
] as const;

/** The built-in sound catalogue (synthesised in TypeScript by `@reebeat/sfx`); the one list of sound names. */
export const sfxNames = ["pop", "whoosh", "ding"] as const;

export type SfxName = (typeof sfxNames)[number];

const Id = Schema.NonEmptyString;

/** A 1-based line of the `.fountain` source. */
const SourceLine = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1));
const Frame = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const Milliseconds = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const Seconds = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0));

export const CellSchema = Schema.Literals(cells);
export const ElementClassSchema = Schema.Literals(elementClasses);
export const SfxNameSchema = Schema.Literals(sfxNames);

/**
 * The name of a cached narration file: a SHA-256 cache key and `.flac`, as the speech cache writes it. A plain
 * file name, never a path: no separator, no `..`, nothing absolute, so a Plan cannot point a reader elsewhere.
 */
export const AudioFileSchema = Schema.String.check(
  Schema.isPattern(/^[0-9a-f]{64}\.flac$/u)
);

/** The properties an identity diff compares. */
export const ElementChangeSchema = Schema.Literals(["cell", "classes", "text"]);

export const SettingsSchema = Schema.Struct({
  fps: Schema.Literal(30),
  height: Schema.Literal(720),
  lineGap: Seconds,
  sceneLead: Seconds,
  sceneTail: Seconds,
  transition: Seconds,
  voice: Schema.Literal("af_heart"),
  width: Schema.Literal(1280),
});

export const ChapterSchema = Schema.Struct({
  id: Id,
  line: SourceLine,
  sceneIds: Schema.Array(Id),
  /** The text of the `= synopsis` lines under the Section, joined by a space; only `plan` shows it. */
  synopsis: Schema.optionalKey(Schema.String),
  title: Schema.String,
});

export const ElementSchema = Schema.Struct({
  cell: CellSchema,
  classes: Schema.Array(ElementClassSchema),
  hidden: Schema.Boolean,
  id: Id,
  line: SourceLine,
  text: Schema.String,
});

export const CueSchema = Schema.Struct({
  /** Index into `Line.words` of the word the Cue follows; -1 fires at the start of the Line. */
  afterWord: Schema.Int.check(Schema.isGreaterThanOrEqualTo(-1)),
  arg: Schema.NullOr(Schema.String),
  id: Id,
  kind: Schema.Literals(["next", "focus", "sfx"]),
  line: SourceLine,
});

export const LineSchema = Schema.Struct({
  cues: Schema.Array(CueSchema),
  hints: Schema.Struct({ pauseBefore: Seconds, speed: Seconds }),
  id: Id,
  line: SourceLine,
  /** The narration text: the dialogue without its Cues, whitespace collapsed. */
  text: Schema.String,
  /** `text` split on single spaces. */
  words: Schema.Array(Schema.String),
});

export const IdentitySchema = Schema.Struct({
  enter: Schema.Array(Id),
  exit: Schema.Array(Id),
  same: Schema.Array(Id),
  update: Schema.Array(
    Schema.Struct({ changes: Schema.Array(ElementChangeSchema), id: Id })
  ),
});

export const SceneSchema = Schema.Struct({
  chapterId: Id,
  elements: Schema.Array(ElementSchema),
  heading: Schema.String,
  id: Id,
  /** Versus the previous Scene; only when `transition` is `auto-animate`. */
  identity: Schema.NullOr(IdentitySchema),
  line: SourceLine,
  lines: Schema.Array(LineSchema),
  /** The transition INTO this Scene. */
  transition: Schema.Literals(["auto-animate", "cut", "default"]),
});

export const TimedWordSchema = Schema.Struct({
  endFrame: Frame,
  endMs: Milliseconds,
  startFrame: Frame,
  startMs: Milliseconds,
  w: Schema.String,
});

export const TimedCueSchema = Schema.Struct({
  /**
   * The frame at which the capture issues the cue's command: `fireFrame - 1` for `next` and `focus`, `fireFrame`
   * for `sfx`. Scene changes are not cues: the video package commands them itself, an Auto-Animate or cut at the
   * Scene's `slideFrame` (lag 0) and a default fade one frame earlier.
   */
  commandFrame: Frame,
  cueId: Id,
  /** `round(fps * aligned word end)`; the start of the Line for `afterWord = -1`. */
  fireFrame: Frame,
});

export const TimedLineSchema = Schema.Struct({
  audio: Schema.Struct({ file: AudioFileSchema, sha256: Schema.String }),
  cues: Schema.Array(TimedCueSchema),
  endFrame: Frame,
  lineId: Id,
  startFrame: Frame,
  words: Schema.Array(TimedWordSchema),
});

export const TimedSceneSchema = Schema.Struct({
  endFrame: Frame,
  lines: Schema.Array(TimedLineSchema),
  sceneId: Id,
  /** The frame at which the slide change is shown. */
  slideFrame: Frame,
});

export const TimelineSchema = Schema.Struct({
  chapters: Schema.Array(Schema.Struct({ chapterId: Id, startFrame: Frame })),
  scenes: Schema.Array(TimedSceneSchema),
  totalFrames: Frame,
});

export const PlanJsonSchema = Schema.Struct({
  author: Schema.optionalKey(Schema.String),
  chapters: Schema.Array(ChapterSchema),
  scenes: Schema.Array(SceneSchema),
  schema: Schema.Literal(1),
  settings: SettingsSchema,
  /** SHA-256 of the UTF-8 bytes of the `.fountain` source; every output embeds it. */
  sourceSha256: Schema.String,
  /** Added by `schedule` once speech exists; absent in `plan` output. */
  timeline: Schema.optionalKey(TimelineSchema),
  title: Schema.String,
});

export type Settings = typeof SettingsSchema.Type;

export type Chapter = typeof ChapterSchema.Type;

export type Element = typeof ElementSchema.Type;

export type Cue = typeof CueSchema.Type;

export type Line = typeof LineSchema.Type;

export type Identity = typeof IdentitySchema.Type;

export type Scene = typeof SceneSchema.Type;

export type TimedWord = typeof TimedWordSchema.Type;

export type TimedCue = typeof TimedCueSchema.Type;

export type TimedLine = typeof TimedLineSchema.Type;

export type TimedScene = typeof TimedSceneSchema.Type;

export type Timeline = typeof TimelineSchema.Type;

export type PlanJson = typeof PlanJsonSchema.Type;

const planJson = Schema.fromJsonString(PlanJsonSchema, { space: 2 });
const decodeJson = Schema.decodeUnknownEffect(planJson);
const encodeJson = Schema.encodeEffect(planJson);

/** Decodes the text of a `plan.json`. Every deck, video and check reads the Plan through this function. */
export const decodePlan = (json: string) => decodeJson(json);

/**
 * Encodes a Plan as JSON text (two-space indent, keys in alphabetical order, no trailing newline), so equal
 * Plans serialise to equal bytes.
 */
export const encodePlan = (plan: PlanJson) => encodeJson(plan);
