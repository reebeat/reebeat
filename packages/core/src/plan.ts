// The Plan contract (`plan.json`) of spec 0001, section "The Plan contract", as changed by spec 0002 (Revisions,
// "plan contract for effects"). This file is the authority; the spec sections are its summary. A change here is a
// dated Revision in the spec. The closed vocabularies (cells, classes, sounds, verbs, edges, events, units) live
// here; `grammar.ts` derives the syntax of the source from them.
// The schemas are named `...Schema`; the types derived from them carry the contract's names.
import { Array as Arr, Schema } from "effect";

import {
  elementEvents,
  stateEventNames,
  stateNames,
  transitionNames,
} from "./machines.ts";
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

/**
 * The lifecycle events of an Element of a Scene: the transitions of its machines (`machines.ts`), which are the one
 * place that names them.
 */
export { elementEvents } from "./machines.ts";

/** The units of an offset; `s` and `ms` are accepted in the source and stored as `flicks`; `%` is stored as `percent`. */
export const offsetUnits = ["flicks", "f", "percent"] as const;

/** The identifiers Scenes, Elements and effects share: a letter, then letters, digits, `_` and `-`. */
export const idPattern = /^[A-Za-z][A-Za-z0-9_-]*$/u;

/**
 * What a construct of the IR says about itself in the generated JSON Schema (`docs/schema/reebeat-ir.schema.json`, spec
 * 0004): its `identifier` (the name of its definition), a `description`, where it comes from (`origin`: SMIL 3.0 timing,
 * Harel 1987, SCXML, Fran; RxJS only explains) and, where reebeat's meaning differs, how (`deviation`). A test fails when
 * a construct of the IR has no `origin`.
 */
export const construct = (
  identifier: string,
  origin: string,
  description: string,
  deviation?: string
) => ({ description, deviation, identifier, origin });

/**
 * An identifier: a Scene, an Element, an effect or a derived event. One definition, built from `idPattern`: the
 * grammar, the parser and the JSON Schema (`pattern`) all read it from here.
 */
export const IdSchema = Schema.String.check(Schema.isPattern(idPattern));

/** A 1-based line of the `.fountain` source. */
const SourceLine = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1));
const Frame = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const Milliseconds = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

/** An exact time: a whole number of flicks (1/705,600,000 s), never a float and never a frame. */
const Flicks = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const Seconds = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0));

/** A speech rate: a multiple of the voice's natural speed (`packages/core/src/speed.ts`). */
export const SpeedSchema = Schema.Finite.check(
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

/**
 * The frame rates a render can be set to: the nominal rate, and whether it is the NTSC rate (nominal x 1000/1001).
 * 25 fps is refused until spec 0005 rounds once, at the end (media-time resolution): every quantity that makes an
 * anchor is rounded to a frame on its own today, and at 25 fps (half-frame quantities such as 0.5 s = 12.5 frames) an
 * effect lands up to 1.5 frames from its time at 60 fps.
 */
export const fpsPresets = [24, 30, 50, 60] as const;

/** What is said of a frame rate outside `fpsPresets`: it names 25 fps, the rates that are allowed and the spec that lifts the refusal. */
const refusedFpsMessage = `settings.fps must be ${Arr.join(Arr.map(fpsPresets, String), ", ")}; 25 fps is refused until spec 0005 rounds a time to a frame once, at the end (at 25 fps an effect lands up to 1.5 frames from its time at 60 fps)`;

export const SettingsSchema = Schema.Struct({
  /** The nominal output frame rate; the exact rate is `fps` x 1000/1001 when `ntsc` is true (24000/1001, 30000/1001). */
  fps: Schema.Literals(fpsPresets).annotate({ message: refusedFpsMessage }),
  height: Schema.Literal(720),
  lineGap: Seconds,
  /** True: the rate is the NTSC fraction of `fps`. */
  ntsc: Schema.Boolean,
  sceneLead: Seconds,
  sceneTail: Seconds,
  /** The story's default speech rate (`Speed:` of the title page, 1.1 when absent). */
  speed: SpeedSchema,
  transition: Seconds,
  voice: Schema.Literal("af_heart"),
  width: Schema.Literal(1280),
});

export const ChapterSchema = Schema.Struct({
  id: IdSchema,
  line: SourceLine,
  /** The text of the `= synopsis` lines under the Section, joined by a space; only `plan` shows it. */
  synopsis: Schema.optionalKey(Schema.String),
  title: Schema.String,
}).annotate(
  construct(
    "Chapter",
    "Fountain 1.1, Section (`# Title`); no statechart construct",
    "A group of Scenes under one heading: a chapter of the video.",
    "It organises the review and the video's chapters only; it has no machine and no events."
  )
);

export const ElementSchema = Schema.Struct({
  cell: CellSchema,
  class: ElementClassSchema,
  id: IdSchema,
  line: SourceLine,
  text: Schema.String,
  /** False: the Element starts hidden and a `show` effect reveals it. */
  visible: Schema.Boolean,
}).annotate(
  construct(
    "Element",
    "Harel 1987, orthogonality (presence, position and style are parallel regions of one Element); SCXML <parallel>",
    "A thing on the slide, with a cell, a class and a text; its id is its identity across Scenes.",
    "The regions are declared once as machines, and their transitions come from the identity diff between two Scenes (the same id is the same Element), not from authored events."
  )
);

export const EdgeSchema = Schema.Literals(edges);
export const VerbSchema = Schema.Literals(verbs);
export const ElementEventSchema = Schema.Literals(elementEvents);

const Percent = Schema.Finite.check(
  Schema.isBetween({ maximum: 100, minimum: 0 })
);

/** An edge of a window, or N percent of the way through it. */
export const PointSchema = Schema.Union([
  EdgeSchema,
  Schema.Struct({ percent: Percent }).annotate(
    construct(
      "PercentPoint",
      "Fran (Elliott and Hudak 1997), an event taken from a behaviour: when(progress >= N%)",
      "N percent of the way through a transition's window.",
      "N% is the threshold of a progress behaviour from 0 to 1 (eased for a move and an update, linear in time otherwise), not an offset in time; an instant has no percent."
    )
  ),
]).annotate(
  construct(
    "Point",
    "SMIL 3.0 timing, syncbase-value (id.begin, id.end); Fran (Elliott and Hudak 1997), progress threshold",
    "A point of a transition: its start, its end, or N percent of the way.",
    "A transition is a declared machine edge with a window, so a point is a frame of that window."
  )
);

/** Who an anchor is about: an Element or an effect by id, the Scene, or a Beat of the Scene by number. */
export const SubjectSchema = Schema.Union([
  Schema.Struct({ id: IdSchema, kind: Schema.Literal("element") }).annotate(
    construct(
      "ElementSubject",
      "SMIL 3.0 timing, the element id of a syncbase-value; SCXML state id",
      "An Element of the Scene, by id."
    )
  ),
  Schema.Struct({ id: IdSchema, kind: Schema.Literal("effect") }).annotate(
    construct(
      "EffectSubject",
      "SMIL 3.0 timing, the element id of a timed child",
      "An effect of the Scene, by id.",
      "Effect ids are local to their Scene."
    )
  ),
  Schema.Struct({ kind: Schema.Literal("scene") }).annotate(
    construct(
      "SceneSubject",
      "SCXML, the enclosing compound <state>; SMIL 3.0 timing, the time container",
      "The Scene itself: its slide change and its end."
    )
  ),
  Schema.Struct({
    kind: Schema.Literal("state"),
    n: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  }).annotate(
    construct(
      "StateSubject",
      "Harel 1987, State (a node that holds for a dwell interval)",
      "The n-th State of the Scene, counted from 1.",
      "States are not declared: the engine derives them from the step frames, one more State for each show or focus."
    )
  ),
  Schema.Struct({
    kind: Schema.Literal("beat"),
    n: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  }).annotate(
    construct(
      "BeatSubject",
      "Harel 1987, the transition between two States; Mealy machine outputs",
      "The n-th Beat of the Scene, counted from 1: the transition from State n to State n+1.",
      "A Beat is generated from each distinct fire frame of a show or focus after the Scene's first frame, and lasts as long as the slowest step that fires then."
    )
  ),
]).annotate(
  construct(
    "Subject",
    "SMIL 3.0 timing, the element id a syncbase-value refers to; SCXML state ids",
    "Who an anchor is about: an Element, an effect, the Scene, a State or a Beat."
  )
);

/**
 * The moment an anchor names. Three kinds, generated from the machines of `machines.ts` (spec 0004): a word of the
 * narration (the one source that is not a machine), an `edge` (a point of a transition of a machine: its start, its
 * end or N percent of the way, which is the threshold event of its progress behaviour) and a `state` event (the first
 * frame a machine enters or leaves a state). Every kind resolves to a frame, and the kinds with a window also resolve
 * to an end frame, which percent points and percent offsets use.
 */
export const AnchorSchema = Schema.Union([
  /**
   * A word or phrase of this Scene's narration; `occurrence` is 1-based; `explicit` is present when the author wrote
   * the occurrence (only then may a phrase that occurs more than once be named). `start` and `end` are word times.
   */
  Schema.Struct({
    edge: EdgeSchema,
    explicit: Schema.Boolean,
    kind: Schema.Literal("word"),
    occurrence: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
    phrase: Schema.NonEmptyString,
  }).annotate(
    construct(
      "WordAnchor",
      "SMIL 3.0 timing, event-value on a media marker (a word of the narration is a sync point)",
      "The start of a word, or of the first word of a phrase, or the end of its last word, in this Scene's narration.",
      "A word is a source, not a machine: its times come from the alignment of the speech, and a phrase must stay within one Line."
    )
  ),
  /** A point of a transition of a machine of the subject (`one.move.start`, `transition.50%`, `r1.end`). */
  Schema.Struct({
    at: PointSchema,
    kind: Schema.Literal("edge"),
    subject: SubjectSchema,
    transition: Schema.Literals(transitionNames),
  }).annotate(
    construct(
      "EdgeAnchor",
      "SMIL 3.0 timing, syncbase-value (id.begin, id.end); Harel 1987, the start and end of a transition; Fran (Elliott and Hudak 1997), progress",
      "A point of a transition of a machine of the subject.",
      "The spellings are generated from the declared machines; start and end are the first and last frame of the transition's window, N% by the declared easing for a move and an update."
    )
  ),
  /** The first frame a machine of the subject enters or leaves a state (`one.moving.leave`, `state(2).enter`). */
  Schema.Struct({
    event: Schema.Literals(stateEventNames),
    kind: Schema.Literal("occupancy"),
    state: Schema.Literals(stateNames),
    subject: SubjectSchema,
  }).annotate(
    construct(
      "OccupancyAnchor",
      "Harel 1987, entry and exit of a state (Moore machine outputs); SCXML onentry and onexit",
      "The first frame a machine of the subject enters or leaves a state.",
      "A state is left at the slide change at the latest, so a state still held leaves at the Scene's last frame; a state the Scene never reaches has no event."
    )
  ),
]).annotate(
  construct(
    "Anchor",
    "SMIL 3.0 timing, syncbase-value and event-value; Harel 1987, events of a statechart",
    "A moment of the story an effect can wait for: a word, a point of a transition, or a state entered or left."
  )
);

/**
 * A signed offset from the anchor: a time in `flicks` (exact; 1/705,600,000 s), `f` output frames at the Plan's rate,
 * or `percent` of the anchored window (only with an anchor that has a window). `schedule` turns flicks into frames
 * with one rule (`time.ts`) and rounds a percent of a window to a frame.
 */
export const OffsetSchema = Schema.Union([
  Schema.Struct({
    unit: Schema.Literals(["flicks", "f"]),
    value: Schema.Finite,
  }).annotate(
    construct(
      "TimeOffset",
      "SMIL 3.0 timing, offset-value (a clock value)",
      "A signed time added to every occurrence of an event.",
      "In exact flicks (1/705,600,000 s), never milliseconds; f is output frames at the Plan's rate; a time becomes the nearest frame, a half going to the later one (floor(t x rate + 1/2))."
    )
  ),
  Schema.Struct({
    unit: Schema.Literal("percent"),
    value: Schema.Finite,
  }).annotate(
    construct(
      "PercentOffset",
      "SMIL 3.0 timing, offset-value",
      "A signed share of the window of the event it is added to.",
      "It needs a window: an event that is an instant has none, and the percent is an error."
    )
  ),
]).annotate(
  construct(
    "Offset",
    "SMIL 3.0 timing, offset-value",
    "A signed offset from an event: a time or a share of its window."
  )
);

/** A length of time that is never a share of a window: `throttle=` and `stagger=`. */
export const DurationSchema = Schema.Struct({
  unit: Schema.Literals(["flicks", "f"]),
  value: Schema.Finite.check(Schema.isGreaterThan(0)),
}).annotate(
  construct(
    "Duration",
    "SMIL 3.0 timing, clock value (dur); RxJS throttleTime and delay (explanatory only)",
    "A length of time that is never a share of a window: the gap of throttle and of stagger.",
    "Strictly positive, in flicks or output frames."
  )
);

export type Duration = typeof DurationSchema.Type;

/**
 * An event of the Scene: a list of frames, built from sources and combinators (spec 0004). `ref` is a name a `let` line
 * declared. `last` happens when every operand has (SMIL `endsync=last`), `first` at the earliest of them, `each` at every
 * occurrence of every operand (a begin-value list) and may thin them with `throttle` or space them with `stagger`;
 * `within` keeps the occurrences inside a Beat; `shift` moves every occurrence by an offset.
 */
export type EventExpr =
  | { readonly anchor: typeof AnchorSchema.Type; readonly kind: "anchor" }
  | { readonly kind: "ref"; readonly name: string }
  | { readonly kind: "last"; readonly of: readonly EventExpr[] }
  | { readonly kind: "first"; readonly of: readonly EventExpr[] }
  | {
      readonly kind: "each";
      readonly of: readonly EventExpr[];
      readonly stagger: Duration | null;
      readonly throttle: Duration | null;
    }
  | { readonly kind: "within"; readonly of: EventExpr; readonly state: number }
  | {
      readonly kind: "shift";
      readonly of: EventExpr;
      readonly offset: typeof OffsetSchema.Type;
    };

export const EventExprSchema: Schema.Codec<EventExpr> = Schema.Union([
  Schema.Struct({
    anchor: AnchorSchema,
    kind: Schema.Literal("anchor"),
  }).annotate(
    construct(
      "AnchorEvent",
      "SMIL 3.0 timing, syncbase-value and event-value",
      "The occurrences of an anchor."
    )
  ),
  Schema.Struct({ kind: Schema.Literal("ref"), name: IdSchema }).annotate(
    construct(
      "RefEvent",
      "Fran (Elliott and Hudak 1997), a named event; RxJS share (explanatory only)",
      "The event of a `let` line, by name.",
      "Local to its Scene and evaluated once; a name that waits for itself is a lint error."
    )
  ),
  Schema.Struct({
    kind: Schema.Literal("last"),
    of: Schema.Array(
      Schema.suspend((): Schema.Codec<EventExpr> => EventExprSchema)
    ),
  }).annotate(
    construct(
      "LastEvent",
      'SMIL 3.0 timing, endsync="last"; RxJS forkJoin (explanatory only)',
      "Happens when every operand has happened.",
      "At the last occurrence of every operand; it never happens while one operand never does."
    )
  ),
  Schema.Struct({
    kind: Schema.Literal("first"),
    of: Schema.Array(
      Schema.suspend((): Schema.Codec<EventExpr> => EventExprSchema)
    ),
  }).annotate(
    construct(
      "FirstEvent",
      'SMIL 3.0 timing, endsync="first"; RxJS race (explanatory only)',
      "Happens at the earliest of the operands.",
      "The earliest first occurrence among the operands that have one."
    )
  ),
  Schema.Struct({
    kind: Schema.Literal("each"),
    of: Schema.Array(
      Schema.suspend((): Schema.Codec<EventExpr> => EventExprSchema)
    ),
    stagger: Schema.NullOr(DurationSchema),
    throttle: Schema.NullOr(DurationSchema),
  }).annotate(
    construct(
      "EachEvent",
      "SMIL 3.0 timing, begin-value list; RxJS merge, throttle (explanatory only)",
      "Happens at every occurrence of every operand, optionally thinned by throttle or spaced by stagger.",
      "Only an each can have several occurrences, and then a sound runs once for each; throttle keeps the leading occurrence and stagger pushes later ones apart, neither of which SMIL has."
    )
  ),
  Schema.Struct({
    kind: Schema.Literal("within"),
    of: Schema.suspend((): Schema.Codec<EventExpr> => EventExprSchema),
    state: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  }).annotate(
    construct(
      "WithinEvent",
      "Harel 1987, a State as scope (an event counts only while the State holds)",
      "The occurrences of an event that fall inside the dwell of State n.",
      "Both ends of the dwell interval count as inside."
    )
  ),
  Schema.Struct({
    kind: Schema.Literal("shift"),
    of: Schema.suspend((): Schema.Codec<EventExpr> => EventExprSchema),
    offset: OffsetSchema,
  }).annotate(
    construct(
      "ShiftEvent",
      "SMIL 3.0 timing, offset-value on a begin value",
      "Every occurrence of an event moved by an offset."
    )
  ),
]).annotate(
  construct(
    "EventExpr",
    "Fran (Elliott and Hudak 1997), the event algebra; SMIL 3.0 timing, begin-value list",
    "A finite list of moments, built from anchors and combinators; it resolves to frames at plan time.",
    "Every combinator is a total function from finite lists of frames to a list of frames; an empty result is an error only where an effect needs a moment."
  )
);

/** What the author wrote for the timing of an effect (intent); the Timeline holds the resolved frames. */
export const WhenSchema = Schema.Union([
  Schema.Struct({ event: EventExprSchema }).annotate(
    construct(
      "EventWhen",
      "SMIL 3.0 timing, begin-value list (event-value)",
      "The effect fires at each occurrence of an event."
    )
  ),
  /** Absolute and Scene-relative: flicks after the slide change; the reason is mandatory and listed by lint. */
  Schema.Struct({
    absoluteFlicks: Flicks,
    reason: Schema.NonEmptyString,
  }).annotate(
    construct(
      "AbsoluteWhen",
      "SMIL 3.0 timing, offset-value (a clock value from the begin of the parent)",
      "The effect fires a fixed time after the slide change of its Scene.",
      "Exact flicks, never milliseconds; it needs a reason, which lint lists."
    )
  ),
]).annotate(
  construct(
    "When",
    "SMIL 3.0 timing, begin value list",
    "What the author wrote for the timing of an effect: an event, or a fixed time with its reason."
  )
);

/** `until <event>`: the SMIL end value of an effect with a duration. */
export const UntilSchema = Schema.Struct({
  event: EventExprSchema,
}).annotate(
  construct(
    "Until",
    "SMIL 3.0 timing, end value; RxJS takeUntil (explanatory only)",
    "The event that ends an effect with a duration.",
    "Only on a focus (a show stays shown and a sound plays out); the end is the first occurrence strictly after the fire frame; an event that comes later than the Scene, or never, leaves the effect to the slide change."
  )
);

export const EffectSchema = Schema.Struct({
  id: IdSchema,
  line: SourceLine,
  /** `sound`: the catalogue name; absent for `show` and `focus`. */
  name: Schema.optionalKey(SfxNameSchema),
  /** `show` and `focus`: an Element id of this Scene; absent for `sound`. */
  target: Schema.optionalKey(IdSchema),
  /** `focus` only: the event that ends the ring. Without it the ring lasts to the end of the Scene. */
  until: Schema.optionalKey(UntilSchema),
  verb: VerbSchema,
  when: WhenSchema,
}).annotate(
  construct(
    "Effect",
    "Mealy and Moore machine outputs (an effect subscribes to a transition or to a state's enter or leave); SMIL 3.0 timing, a timed child with a begin and an end",
    "A sound, a show or a focus, and when it happens. SMIL attributes of each verb (declared once per verb in grammar.ts, not stored per effect): restart overlap for every verb; fill freeze for a show, remove for a focus and a sound.",
    'restart: overlap, which is not a SMIL value: an effect with several occurrences of its begin event runs once for each (only a sound may), and instances do not restart each other, unlike SMIL restart="always"; occurrences of one event at the same frame are one occurrence; the slide change ends every running effect.'
  )
);

/** A derived event: `let <name> = <event>`, local to its Scene and evaluated once. */
export const DerivedEventSchema = Schema.Struct({
  event: EventExprSchema,
  line: SourceLine,
  name: IdSchema,
}).annotate(
  construct(
    "DerivedEvent",
    "Fran (Elliott and Hudak 1997), a named event; RxJS share (explanatory only)",
    "A `let` line: a name for an event of the Scene, evaluated once and used wherever the name is written.",
    "Local to its Scene; a name that waits for itself is a lint error."
  )
);

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
    /** The frames, at `measuredFps`, from the slide change to the first frame the matched Element differs. */
    startLagFrames: Frame,
  }),
  /**
   * The frame rate the lags below were measured at. A lag is a TIME (lag frames over this rate) that `schedule` turns
   * into frames at the Plan's own rate, so one declaration serves every frame rate.
   */
  measuredFps: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
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
  hints: Schema.Struct({ pauseBefore: Seconds, speed: SpeedSchema }).annotate(
    construct(
      "LineHints",
      "Fountain 1.1, Parenthetical ((slowly), (pause 0.5)); SSML, prosody rate",
      "How the narrator says a Line: the pause before it and the speed.",
      "A speed is a multiple of the voice's natural rate between 0.5 and 2, not a percent."
    )
  ),
  line: SourceLine,
  /** The narration text: the dialogue, whitespace collapsed (dialogue has no notes). Its words are `wordsOf(text)`. */
  text: Schema.String,
}).annotate(
  construct(
    "Line",
    "Fountain 1.1, Dialogue of NARRATOR; SMIL 3.0 timing, a media element (its words are sync points)",
    "One thing the narrator says in a Scene: its text, spoken word by word.",
    "The text is byte-identical across revisions of a Story so the speech cache keeps hitting; the times of its words come from alignment, never from the author."
  )
);

export const IdentitySchema = Schema.Struct({
  enter: Schema.Array(IdSchema),
  exit: Schema.Array(IdSchema),
  same: Schema.Array(IdSchema),
  update: Schema.Array(
    Schema.Struct({ changes: Schema.Array(ElementChangeSchema), id: IdSchema })
  ),
});

export const SceneSchema = Schema.Struct({
  chapterId: IdSchema,
  /** The Scene's `[[effects]]` block in source order (empty without a block). */
  effects: Schema.Array(EffectSchema),
  elements: Schema.Array(ElementSchema),
  /** The Scene's `let` lines in source order: the derived events its effects and its other lets may name. */
  events: Schema.Array(DerivedEventSchema),
  heading: Schema.String,
  /** The author's `#id#` of the scene heading, unique in the story. */
  id: IdSchema,
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
  effectId: IdSchema,
  /**
   * Only a `focus` that ends by its own `until` before the Scene does: the frame at which the capture commands the ring
   * off (an end step of the Deck, `stepsOf`).
   */
  endCommandFrame: Schema.NullOr(Frame),
  /** The last frame of the effect's window: a `show`'s fade, a `focus`'s ring. Absent for a `sound`. */
  endFrame: Schema.NullOr(Frame),
  /**
   * How the effect's window ended: `until` (its own end event), `replaced` (a LATER `focus` took the one ring over: its
   * start moves the ring, so a replaced focus has no end step of its own), `slide-change` (the Scene ended while it ran:
   * the slide change interrupts every running effect) or `window` (a `show` runs its declared fade). Absent for a
   * `sound`, which has no window. `endFrame` is the earliest of them.
   */
  endedBy: Schema.NullOr(
    Schema.Literals(["until", "replaced", "slide-change", "window"])
  ),
  /** The resolved frame of the effect: anchor frame plus offset, always inside the Scene. It is not when the capture commands it: see `commandFrame`. */
  fireFrame: Frame,
  /** 1-based: an effect whose `at` event has several occurrences (`each`) runs once per occurrence, in time order. */
  instance: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
});

/** A derived event with the frames it resolved to. */
export const TimedEventSchema = Schema.Struct({
  frames: Schema.Array(Frame),
  name: IdSchema,
});

export const TimedLineSchema = Schema.Struct({
  audio: Schema.Struct({ file: AudioFileSchema, sha256: Schema.String }),
  endFrame: Frame,
  startFrame: Frame,
  words: Schema.Array(TimedWordSchema),
});

export const TimedSceneSchema = Schema.Struct({
  /** The Scene's effects, one entry per instance, in resolved time order (ties keep source order). */
  effects: Schema.Array(TimedEffectSchema),
  endFrame: Frame,
  /** The Scene's derived events (`let`) in source order, with their frames. */
  events: Schema.Array(TimedEventSchema),
  lines: Schema.Array(TimedLineSchema),
  sceneId: IdSchema,
  /** The frame at which the slide change is shown. */
  slideFrame: Frame,
});

export const TimelineSchema = Schema.Struct({
  chapters: Schema.Array(
    Schema.Struct({ chapterId: IdSchema, startFrame: Frame })
  ),
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
  measuredFps: 30,
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

const decodeJson = Schema.decodeUnknownEffect(planJson, {
  onExcessProperty: "error",
});

const encodeJson = Schema.encodeEffect(planJson);

/**
 * Decodes the text of a `plan.json`. Every deck, video and check reads the Plan through this function. The schema is
 * closed: a key the Plan does not have (a Line's `id`, which a Plan no longer stores) is an error.
 */
export const decodePlan = (json: string) => decodeJson(json);

/**
 * Encodes a Plan as JSON text (two-space indent, keys in alphabetical order, no trailing newline), so equal
 * Plans serialise to equal bytes.
 */
export const encodePlan = (plan: PlanJson) => encodeJson(plan);

export type Subject = typeof SubjectSchema.Type;

export type Until = typeof UntilSchema.Type;

export type DerivedEvent = typeof DerivedEventSchema.Type;

export type TimedEvent = typeof TimedEventSchema.Type;
