// The Plan contract (`plan.json`) of spec 0001, section "The Plan contract", as changed by spec 0002 (Revisions,
// "plan contract for effects"). This file is the authority; the spec sections are its summary. A change here is a
// dated Revision in the spec. The closed vocabularies (cells, classes, sounds, verbs, edges, events, units) live
// here; `grammar.ts` derives the syntax of the source from them.
// The schemas are named `...Schema`; the types derived from them carry the contract's names.
import { Schema } from "effect";

import { maxSpeed, minSpeed } from "./speed.ts";

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

/** The classes of the fixed theme (`packages/render-reveal`). */
export const elementClasses = [
  "box",
  "title",
  "label",
  "accent",
  "muted",
] as const;

/** The built-in sound catalogue (synthesised in TypeScript by `@reebeat/sounds-synth`); the one list of sound names. */
export const sfxNames = ["pop", "whoosh", "ding"] as const;

export type SfxName = (typeof sfxNames)[number];

/** What an effect does (spec 0002, "Non-goals": more kinds are a later spec against the same grammar). */
export const verbs = ["sound", "show", "focus"] as const;

/** The two ends of a window. */
export const edges = ["start", "end"] as const;

/** The lifecycle events of an Element of a Scene (spec 0002, "plan contract for effects"). */
export const elementEvents = ["enter", "exit", "move", "update"] as const;

/** The units of an offset; `s` is accepted in the source and written as `ms`; `%` is stored as `percent`. */
export const offsetUnits = ["ms", "f", "percent"] as const;

/** The identifiers Scenes, Elements and effects share: a letter, then letters, digits, `_` and `-`. */
export const idPattern = /^[A-Za-z][A-Za-z0-9_-]*$/u;

const Id = Schema.NonEmptyString;

/** A 1-based line of the `.fountain` source. */
const SourceLine = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1));
const Frame = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const Milliseconds = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const Seconds = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0));

/** A speech rate: a multiple of the voice's natural speed (`packages/core/src/speed.ts`). */
const Speed = Schema.Finite.check(
  Schema.isBetween({ maximum: maxSpeed, minimum: minSpeed })
);

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
export const ElementChangeSchema = Schema.Literals(["cell", "class", "text"]);

export const SettingsSchema = Schema.Struct({
  fps: Schema.Literal(30),
  height: Schema.Literal(720),
  lineGap: Seconds,
  sceneLead: Seconds,
  sceneTail: Seconds,
  /** The story's default speech rate (`Speed:` of the title page, 1.1 when absent). */
  speed: Speed,
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
  class: ElementClassSchema,
  id: Id,
  line: SourceLine,
  text: Schema.String,
  /** False: the Element starts hidden and a `show` effect reveals it. */
  visible: Schema.Boolean,
});

export const EdgeSchema = Schema.Literals(edges);
export const VerbSchema = Schema.Literals(verbs);
export const ElementEventSchema = Schema.Literals(elementEvents);

const Percent = Schema.Finite.check(
  Schema.isBetween({ maximum: 100, minimum: 0 })
);

/** An edge of a window, or N percent of the way through it. */
export const PointSchema = Schema.Union([
  EdgeSchema,
  Schema.Struct({ percent: Percent }),
]);

/**
 * The moment an effect is timed against. Every kind resolves to a frame in `schedule`, and the kinds with a window
 * (see `RendererLifecycle`) also resolve to an end frame, which percent points and percent offsets use.
 */
export const AnchorSchema = Schema.Union([
  /** A word or phrase of this Scene's narration; `occurrence` is 1-based. `start` and `end` are word times. */
  Schema.Struct({
    edge: EdgeSchema,
    kind: Schema.Literal("word"),
    occurrence: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
    phrase: Schema.NonEmptyString,
  }),
  /** `start` = the slide change frame; `end` = the Scene's last frame. No window. */
  Schema.Struct({ edge: EdgeSchema, kind: Schema.Literal("scene") }),
  /** The Scene's incoming slide transition: its window runs from the slide change frame. */
  Schema.Struct({ at: PointSchema, kind: Schema.Literal("transition") }),
  /** A lifecycle event of an Element of this Scene (`exit`: of the previous Scene, seen at the transition). */
  Schema.Struct({
    at: PointSchema,
    event: ElementEventSchema,
    id: Id,
    kind: Schema.Literal("element"),
  }),
  /** Another effect of this Scene: its own start or end. */
  Schema.Struct({
    edge: EdgeSchema,
    id: Id,
    kind: Schema.Literal("effect"),
  }),
]);

/**
 * A signed offset from the anchor: `ms` milliseconds, `f` frames, or `percent` of the anchored window (only with an
 * anchor that has a window). Milliseconds and percents are finite numbers; `schedule` rounds them to frames.
 */
export const OffsetSchema = Schema.Union([
  Schema.Struct({
    unit: Schema.Literals(["ms", "f"]),
    value: Schema.Finite,
  }),
  Schema.Struct({ unit: Schema.Literal("percent"), value: Schema.Finite }),
]);

/** What the author wrote for the timing of an effect (intent); the Timeline holds the resolved frames. */
export const WhenSchema = Schema.Union([
  Schema.Struct({
    anchor: AnchorSchema,
    offset: Schema.optionalKey(OffsetSchema),
  }),
  /** Absolute and Scene-relative: milliseconds after the slide change; the reason is mandatory and listed by lint. */
  Schema.Struct({
    absoluteMs: Milliseconds,
    reason: Schema.NonEmptyString,
  }),
]);

export const EffectSchema = Schema.Struct({
  id: Id,
  line: SourceLine,
  /** `sound`: the catalogue name; absent for `show` and `focus`. */
  name: Schema.optionalKey(SfxNameSchema),
  /** `show` and `focus`: an Element id of this Scene; absent for `sound`. */
  target: Schema.optionalKey(Id),
  verb: VerbSchema,
  when: WhenSchema,
});

/**
 * What a renderer declares about its slide change, in milliseconds and frames (plain data: the renderer's adapter
 * publishes it as `info.lifecycle`, `schedule` reads it, `verify` observes it). Windows, all from the Scene's
 * `slideFrame` s (`window end` = `s + round(fps * transitionMs[transition] / 1000)`; 0 ms is an instant):
 *
 * | Event | start | end |
 * | --- | --- | --- |
 * | `transition.*` | `s` | window end |
 * | matched Element `move` and `update` (Auto-Animate) | `s + matched.startLagFrames` | window end |
 * | unmatched `enter` (Auto-Animate) | `s + unmatched.enter.startLagFrames` | `s + unmatched.enter.endLagFrames` (equal: an instant) |
 * | `exit` (Auto-Animate) | `s` | = start (instant) |
 * | `enter` of every visible Element of a `default` or `cut` Scene | `s` | window end (instant for `cut`) |
 * | `enter` of an Element revealed by a `show` effect | the effect's fire frame | + `round(fps * showMs / 1000)` |
 *
 * Percent points of a matched Element's `move` and `update` are in PROGRESS: `N%` is the frame at which the eased
 * progress of the window reaches N percent, where `matched.easing` is the CSS cubic-bezier `[x1, y1, x2, y2]` of
 * the animation (reveal.js: `ease` = 0.25, 0.1, 0.25, 1). Every other percent point (`transition.N%`, a `show`
 * enter) and every percent OFFSET is linear in TIME between start and end. An event whose start equals its end has
 * no window, so a percent point or percent offset on it is an error. `transitionMs["auto-animate"]` must equal
 * `settings.transition * 1000` (the Plan's transition is the renderer's instruction; `schedule` rejects a
 * disagreement).
 */
export const RendererLifecycleSchema = Schema.Struct({
  matched: Schema.Struct({
    easing: Schema.Tuple([
      Schema.Finite.check(Schema.isBetween({ maximum: 1, minimum: 0 })),
      Schema.Finite,
      Schema.Finite.check(Schema.isBetween({ maximum: 1, minimum: 0 })),
      Schema.Finite,
    ]),
    startLagFrames: Frame,
  }),
  showMs: Milliseconds,
  transitionMs: Schema.Struct({
    "auto-animate": Milliseconds,
    cut: Milliseconds,
    default: Milliseconds,
  }),
  unmatched: Schema.Struct({
    enter: Schema.Struct({ endLagFrames: Frame, startLagFrames: Frame }),
  }),
});

export const LineSchema = Schema.Struct({
  hints: Schema.Struct({ pauseBefore: Seconds, speed: Speed }),
  id: Id,
  line: SourceLine,
  /** The narration text: the dialogue, whitespace collapsed (dialogue has no notes). */
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
  /** The Scene's `[[effects]]` block in source order (empty without a block). */
  effects: Schema.Array(EffectSchema),
  elements: Schema.Array(ElementSchema),
  heading: Schema.String,
  /** The author's `#id#` of the scene heading, unique in the story. */
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

export const TimedEffectSchema = Schema.Struct({
  /**
   * The frame at which the capture (the `FrameCapturer` service) issues the effect's command: `fireFrame - 1` for
   * `show` and `focus`, `fireFrame` for `sound` (an anchor at the transition start has command = fire = the Scene's
   * `slideFrame`). Scene changes are not effects: the capture commands them itself from the Scene's `slideFrame`, an
   * Auto-Animate or cut at `slideFrame` (lag 0) and a default fade one frame earlier.
   */
  commandFrame: Frame,
  effectId: Id,
  /** The resolved frame of the effect: anchor frame plus offset, always inside the Scene. It is not when the capture commands it: see `commandFrame`. */
  fireFrame: Frame,
  /** What the author wrote for the timing, as the review text prints it, e.g. `word("matches").end +100ms`. */
  intent: Schema.String,
});

export const TimedLineSchema = Schema.Struct({
  audio: Schema.Struct({ file: AudioFileSchema, sha256: Schema.String }),
  endFrame: Frame,
  lineId: Id,
  startFrame: Frame,
  words: Schema.Array(TimedWordSchema),
});

export const TimedSceneSchema = Schema.Struct({
  /** The Scene's effects in resolved time order (ties keep source order). */
  effects: Schema.Array(TimedEffectSchema),
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

export type Effect = typeof EffectSchema.Type;

export type Verb = typeof VerbSchema.Type;

export type Edge = typeof EdgeSchema.Type;

export type ElementEvent = typeof ElementEventSchema.Type;

export type Point = typeof PointSchema.Type;

export type Anchor = typeof AnchorSchema.Type;

export type Offset = typeof OffsetSchema.Type;

export type When = typeof WhenSchema.Type;

export type RendererLifecycle = typeof RendererLifecycleSchema.Type;

/**
 * A sane declaration for tests and examples, not any adapter's measurement: Auto-Animate 800 ms (24 frames at 30 fps),
 * a default fade 400 ms, a cut instant, matched Elements start 2 frames in and ease like CSS `ease`, an unmatched
 * Element fades in over frames 8 to 22, and a `show` lasts 133 ms (4 frames).
 */
export const referenceLifecycle: RendererLifecycle = {
  matched: { easing: [0.25, 0.1, 0.25, 1], startLagFrames: 2 },
  showMs: 133,
  transitionMs: { "auto-animate": 800, cut: 0, default: 400 },
  unmatched: { enter: { endLagFrames: 22, startLagFrames: 8 } },
};

export type Line = typeof LineSchema.Type;

export type Identity = typeof IdentitySchema.Type;

export type Scene = typeof SceneSchema.Type;

export type TimedWord = typeof TimedWordSchema.Type;

export type TimedEffect = typeof TimedEffectSchema.Type;

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
