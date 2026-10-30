import type { Point } from "@tsukuri/core";
// F1, effect timing (spec 0002): every effect of the Timeline is observed in the written files and compared with the
// frame the Timeline resolved for it, and the frame it is anchored to is observed too.
//
//   own      what the effect does: a `sound` is the start of the catalogue sound found in the decoded audio track near
//            its fire frame; a `show` or `focus` is the first frame that differs in its target's cell (events.ts)
//   anchor   the moment the effect is timed against, observed in the picture (events.ts): the slide change, the start,
//            end or N% of an Element's enter, exit, move or update, or another effect's own observed start or end. A
//            word of the narration, and the end of the last Scene, have no picture: their frame is the Timeline's
//
// An effect passes when its own observed frame is within one frame of its fire frame, and the observed anchor plus the
// effect's offset is within one frame of it too, and a sound's onset is within one frame of that (so a Timeline that
// is consistent with itself but puts a sound somewhere else than the picture shows is caught: a renderer that declares
// the wrong lifecycle). The per-effect offsets are reported, positive when the observed frame is late.
import { decodeMonoPcm } from "@tsukuri/encode-ffmpeg";
import { synthClip } from "@tsukuri/sounds-synth";
import { Array as Arr, Effect, Option } from "effect";

import {
  anchorSource,
  effectFacts,
  effectKey,
  ownSubject,
} from "./effectFacts.ts";
import type { AnchorSource, EffectFact } from "./effectFacts.ts";
import { observeEvent } from "./events.ts";
import type { Observed, Subject } from "./events.ts";
import { guarded } from "./guard.ts";
import type { Build } from "./load.ts";
import {
  frameStartMs,
  msToFrames,
  signedFrames,
  withinOneFrame,
} from "./units.ts";
import { fail, verdictOf } from "./verdict.ts";
import type { Measured } from "./verdict.ts";
import { locateSounds, soundMatchFloor } from "./wav.ts";
import type { SoundFound } from "./wav.ts";

/** How far from the fire frame, in milliseconds, the catalogue sound is looked for. */
const soundWindowMs = 150;

/** What an effect did, observed: the frames at which it starts and ends, or why none was observed. */
interface Own {
  readonly end: number | undefined;
  readonly reason: string;
  readonly score: number | undefined;
  readonly start: number | undefined;
}

/** What a subject looks at, as a key to find its observation again and to look at it once. */
const subjectKey = (subject: Subject): string => {
  if (subject.kind === "transition") {
    return `transition ${subject.sceneIndex}`;
  }

  if (subject.kind === "element") {
    return `element ${subject.sceneIndex} ${subject.id} ${subject.event}`;
  }

  return `step ${subject.sceneIndex} ${subject.id} ${subject.fireFrame}`;
};

/** The sound found at `offsetMs` from `fireFrame` with `score`; none when it matches under the floor. */
export const heardAs = (
  found: SoundFound,
  fireFrame: number,
  fps: number
): Own => {
  if (found.score < soundMatchFloor) {
    return {
      end: undefined,
      reason: `the sound is not found within ${soundWindowMs} ms (best match ${found.score.toFixed(2)}, at least ${soundMatchFloor} needed)`,
      score: found.score,
      start: undefined,
    };
  }

  const start = fireFrame + msToFrames(found.offsetMs, fps);

  return { end: start, reason: "", score: found.score, start };
};

/** Where every `sound` effect of the Timeline starts in the mixed track, by the key of its effect. */
const hearSounds = (
  track: Float32Array,
  facts: readonly EffectFact[],
  fps: number
): ReadonlyMap<string, Own> => {
  const sounds = Arr.flatMap(facts, (fact) =>
    fact.effect.verb === "sound" && fact.effect.name !== undefined
      ? [{ fact, name: fact.effect.name }]
      : []
  );

  const found = locateSounds(
    track,
    Arr.map(sounds, ({ fact, name }) => ({
      expectedMs: frameStartMs(fact.timed.fireFrame, fps),
      reference: synthClip(name).samples,
    })),
    soundWindowMs
  );

  return new Map(
    Arr.map(Arr.zip(sounds, found), ([{ fact }, heard]): [string, Own] => [
      effectKey(fact),
      heardAs(heard, fact.timed.fireFrame, fps),
    ])
  );
};

const ownOf = (
  fact: EffectFact,
  seen: ReadonlyMap<string, Observed | undefined>,
  sound?: Own
): Own => {
  if (sound !== undefined) {
    return sound;
  }

  const subject = ownSubject(fact);

  const event =
    subject === undefined ? undefined : seen.get(subjectKey(subject));

  return event === undefined
    ? {
        end: undefined,
        reason: `no frame within ${fact.timed.fireFrame - 3} to ${fact.timed.fireFrame + 12} differs in the cell of ${fact.effect.target ?? "its target"}`,
        score: undefined,
        start: undefined,
      }
    : {
        end: fact.effect.verb === "show" ? event.end : event.start,
        reason: "",
        score: undefined,
        start: event.start,
      };
};

/**
 * The anchor as observed: its frame and the length of its window (for a percent offset); `timeline` for an anchor that
 * has no picture (a word, the end of the video); or why a picture that should show it does not.
 */
type AnchorSeen =
  | {
      readonly frame: number;
      readonly length: number | undefined;
      readonly tag: "found";
    }
  | { readonly reason: string; readonly tag: "missing" }
  | { readonly tag: "timeline" };

const missing = (reason: string): AnchorSeen => ({ reason, tag: "missing" });

/** The frame of a point of an observed event: an edge, or N percent of the way. */
const pointFrame = (event: Observed, point: Point): number | undefined => {
  if (point === "start") {
    return event.start;
  }

  return point === "end" ? event.end : event.percent(point.percent);
};

const readEvent = (
  source: Extract<AnchorSource, { readonly kind: "event" }>,
  event: Observed | undefined
): AnchorSeen => {
  if (event === undefined) {
    return missing("the event is not observed in the picture");
  }

  const frame = pointFrame(event, source.point);

  return frame === undefined
    ? missing("the event is not observed at that point")
    : {
        frame: frame + source.shift,
        length: event.end - event.start,
        tag: "found",
      };
};

const readEffect = (
  source: Extract<AnchorSource, { readonly kind: "effect" }>,
  own: Own | undefined
): AnchorSeen => {
  const frame = source.edge === "start" ? own?.start : own?.end;

  return frame === undefined || own?.start === undefined
    ? missing(`effect ${source.id} is not observed`)
    : {
        frame,
        length: (own.end ?? own.start) - own.start,
        tag: "found",
      };
};

const anchorSeen = (
  source: AnchorSource,
  seen: ReadonlyMap<string, Observed | undefined>,
  owns: ReadonlyMap<string, Own>,
  scene: string
): AnchorSeen => {
  if (source.kind === "event") {
    return readEvent(source, seen.get(subjectKey(source.subject)));
  }

  if (source.kind === "effect") {
    return readEffect(source, owns.get(`${scene}.${source.id}`));
  }

  return source.kind === "video-start"
    ? { frame: 0, length: undefined, tag: "found" }
    : { tag: "timeline" };
};

/** The effect's offset in frames, from what it was written as and the observed window of its anchor. */
const offsetFrames = (
  fact: EffectFact,
  length: number | undefined,
  fps: number
): number | undefined => {
  const { when } = fact.effect;

  if ("absoluteMs" in when) {
    return msToFrames(when.absoluteMs, fps);
  }

  const { offset } = when;

  if (offset === undefined) {
    return 0;
  }

  if (offset.unit === "percent") {
    return length === undefined ? undefined : (offset.value / 100) * length;
  }

  return offset.unit === "f" ? offset.value : msToFrames(offset.value, fps);
};

/** One effect's findings: the parts of its row of the report and its problems. */
interface Finding {
  readonly measured: readonly string[];
  readonly problems: readonly string[];
}

const frameText = (frame: number): string =>
  String(Math.round(frame * 100) / 100);

const labelOf = (fact: EffectFact): string =>
  Arr.join(
    Arr.filter(
      [
        effectKey(fact),
        fact.effect.verb,
        fact.effect.name ?? fact.effect.target ?? "",
        fact.timed.intent,
      ],
      (part) => part !== ""
    ),
    " "
  );

/** What the observed anchor says of the effect: where it puts it, and whether that is where the effect is. */
const anchorFinding = (
  fact: EffectFact,
  own: Own,
  anchor: AnchorSeen,
  fps: number
): Finding => {
  const label = labelOf(fact);
  const { fireFrame } = fact.timed;

  if (anchor.tag === "timeline") {
    return { measured: [], problems: [] };
  }

  if (anchor.tag === "missing") {
    return { measured: [], problems: [`${label}: ${anchor.reason}`] };
  }

  const offset = offsetFrames(fact, anchor.length, fps);

  if (offset === undefined) {
    return {
      measured: [],
      problems: [
        `${label}: a percent offset needs the anchor's window, which is not observed`,
      ],
    };
  }

  const expected = anchor.frame + offset;
  const early = expected - fireFrame;

  const part = `anchor observed ${frameText(anchor.frame)}, so ${frameText(expected)} (${signedFrames(early)})`;

  const resolved = withinOneFrame(early)
    ? []
    : [
        `${label}: the observed anchor puts it at frame ${frameText(expected)}, ${signedFrames(early)} frames from its resolved frame ${fireFrame}`,
      ];

  const placed =
    own.start === undefined || withinOneFrame(own.start - expected)
      ? []
      : [
          `${label}: it is observed at frame ${frameText(own.start)}, ${signedFrames(own.start - expected)} frames from where its observed anchor puts it`,
        ];

  return { measured: [part], problems: [...resolved, ...placed] };
};

/** What the effect itself did: the sound's onset, or the step in its target's cell, against its resolved frame. */
const ownFinding = (fact: EffectFact, own: Own): Finding => {
  const label = labelOf(fact);
  const { fireFrame } = fact.timed;
  const sound = fact.effect.verb === "sound";

  if (own.start === undefined) {
    return {
      measured: ["not observed"],
      problems: [`${label}: ${own.reason}`],
    };
  }

  const late = own.start - fireFrame;

  return {
    measured: [
      `${sound ? "sound onset" : "observed"} ${frameText(own.start)} (${signedFrames(late)})${own.score === undefined ? "" : `, match score ${own.score.toFixed(3)}`}`,
    ],
    problems: withinOneFrame(late)
      ? []
      : [
          `${label}: it is observed ${signedFrames(late)} frames from its resolved frame ${fireFrame}`,
        ],
  };
};

/** One effect's findings, printed as one row: `resolved F; anchor observed A, so B (+d); observed O (+d)`. */
export const judge = (
  fact: EffectFact,
  own: Own,
  anchor: AnchorSeen,
  fps: number
): Finding => {
  const found = anchorFinding(fact, own, anchor, fps);
  const did = ownFinding(fact, own);

  return {
    measured: [
      `resolved ${fact.timed.fireFrame}`,
      ...found.measured,
      ...did.measured,
    ],
    problems: [...found.problems, ...did.problems],
  };
};

/** The decoded subjects of the build, each once. */
const observeAll = (build: Build, subjects: readonly Subject[]) =>
  Effect.map(
    Effect.forEach(
      Arr.dedupeWith(subjects, (a, b) => subjectKey(a) === subjectKey(b)),
      (subject) =>
        Effect.map(
          observeEvent(build, subject),
          (event): [string, Observed | undefined] => [
            subjectKey(subject),
            Option.getOrUndefined(event),
          ]
        )
    ),
    (entries) => new Map(entries)
  );

/** F1 on the written video and audio. */
export const effectTiming = (build: Build) =>
  guarded(
    "F1",
    Effect.gen(function* observe() {
      const facts = effectFacts(build.plan);
      const { fps } = build.plan.settings;
      const sceneCount = build.plan.scenes.length;
      const sources = Arr.map(facts, (fact) => anchorSource(fact, sceneCount));

      const subjects = [
        ...Arr.flatMap(facts, (fact) =>
          Option.toArray(Option.fromNullishOr(ownSubject(fact)))
        ),
        ...Arr.flatMap(sources, (source) =>
          source.kind === "event" ? [source.subject] : []
        ),
      ];

      const seen = yield* observeAll(build, subjects);

      const hasSounds = Arr.some(facts, (fact) => fact.effect.verb === "sound");

      // A stand-in narrator silences the narration only: the sounds of an offline build are real and are observed.
      const track = hasSounds
        ? yield* decodeMonoPcm(build.mp4)
        : new Float32Array(0);

      const heard = hasSounds
        ? hearSounds(track, facts, fps)
        : new Map<string, Own>();

      const owns = new Map(
        Arr.map(facts, (fact): [string, Own] => [
          effectKey(fact),
          ownOf(fact, seen, heard.get(effectKey(fact))),
        ])
      );

      const findings = Arr.map(Arr.zip(facts, sources), ([fact, source]) => ({
        fact,
        finding: judge(
          fact,
          owns.get(effectKey(fact)) ?? ownOf(fact, seen),
          anchorSeen(source, seen, owns, fact.scene.id),
          fps
        ),
      }));

      const measured: Measured = [
        ["effects checked", facts.length],
        ...Arr.map(findings, ({ fact, finding }): readonly [string, string] => [
          labelOf(fact),
          Arr.join(finding.measured, "; "),
        ]),
      ];

      const problems = Arr.flatMap(findings, ({ finding }) => finding.problems);

      if (facts.length === 0) {
        return fail("F1", "the Timeline has no effect to observe", measured);
      }

      return verdictOf(
        "F1",
        `all ${facts.length} effects are observed within one frame of their resolved frame and of their observed anchor`,
        problems,
        measured
      );
    })
  );
