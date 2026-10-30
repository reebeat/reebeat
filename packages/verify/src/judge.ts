// The judgement of one effect instance (spec 0002, F1; spec 0004, F1 and F5), from what was observed and where the
// observed sources put it. Pure: the observations and the evaluation of the expression over them are made elsewhere
// (`effects.ts`, `leaves.ts`). A row of the report reads
//
//   resolved F; at <expression> observed A (+d); leaves <source frame>, ...; observed O (+d);
//   resolved end E; ring off R (+d); until <expression> observed U (+d)
//
// where F, E are the frames the Timeline resolved, A is the frame the observed sources give the instance with the same
// algebra the Timeline used, O is where the effect was seen or heard, R the frame its focus ring goes, U the frame the
// observed sources end it at; each (+d) is the signed distance in frames from the resolved frame. An instance passes when
// every observed frame is within one frame of the one it is compared with.
import { formatTiming } from "@tsukuri/core";
import { Array as Arr } from "effect";

import { effectKey } from "./effectFacts.ts";
import type { EffectFact } from "./effectFacts.ts";
import type { Own } from "./own.ts";
import { frameText, signedFrames, withinOneFrame } from "./units.ts";

/** Where the observed sources put one instance of an effect. */
export type Anchored =
  | {
      /** The occurrences the expression has over the observed sources. */
      readonly count: number;
      /** `formatEvent` of the expression. */
      readonly expression: string;
      readonly frame: number;
      /** The instances the Timeline resolved for the effect. */
      readonly instances: number;
      readonly tag: "found";
    }
  | { readonly reason: string; readonly tag: "missing" };

/** Where the observed sources end a focus that has an `until`: the first occurrence after its observed start. */
export type Ending =
  | { readonly tag: "none" }
  | {
      readonly expression: string;
      readonly frame: number;
      readonly tag: "until";
    }
  | { readonly reason: string; readonly tag: "missing" };

/** Everything the judgement reads about one instance. */
export interface Evidence {
  readonly anchored: Anchored;
  readonly ending: Ending;
  /** The sources of the expression with the frames they were observed at, as printed in the row. */
  readonly leaves: string;
  readonly own: Own;
}

/** One effect's findings: the parts of its row of the report and its problems. */
export interface Finding {
  readonly measured: readonly string[];
  readonly problems: readonly string[];
}

/** What an instance is called in the report: its key, what it does and what the author wrote (derived, canonical). */
export const labelOf = (fact: EffectFact): string =>
  Arr.join(
    Arr.filter(
      [
        effectKey(fact),
        fact.effect.verb,
        fact.effect.name ?? fact.effect.target ?? "",
        formatTiming(fact.effect),
      ],
      (part) => part !== ""
    ),
    " "
  );

/**
 * What the observed sources say of the instance: where they put it, and whether that is where the Timeline resolved it.
 *
 * There is deliberately NO comparison of the effect's own observed frame with the frame its observed anchor gives. The
 * two are independent observations, each judged against the resolved frame within one frame (`ownFinding` the effect,
 * this function the anchor: the expression over the observed leaves). A comparison of one with the other would have to
 * allow the SUM of the two tolerances, two frames, and the two verdicts already imply that (|own - anchor| <= |own -
 * resolved| + |resolved - anchor| <= 2), so such a check could never fail on its own. With the old one-frame tolerance
 * it failed valid stories, where the anchor is observed one frame late and the ring one frame early (+1 and -1).
 */
const anchorFinding = (
  fact: EffectFact,
  anchored: Anchored,
  leaves: string
): Finding => {
  const label = labelOf(fact);
  const { fireFrame } = fact.timed;

  if (anchored.tag === "missing") {
    return { measured: [], problems: [`${label}: ${anchored.reason}`] };
  }

  const early = anchored.frame - fireFrame;
  const shown = leaves === "" ? "" : `; leaves ${leaves}`;

  const part = `at ${anchored.expression} observed ${frameText(anchored.frame)} (${signedFrames(early)})${shown}`;

  const resolved = withinOneFrame(early)
    ? []
    : [
        `${label}: the observed anchor puts it at frame ${frameText(anchored.frame)}, ${signedFrames(early)} frames from its resolved frame ${fireFrame}`,
      ];

  const counted =
    fact.timed.instance === 1 && anchored.count !== anchored.instances
      ? [
          `${label}: the observed anchors give ${anchored.count} occurrence${anchored.count === 1 ? "" : "s"} of ${anchored.expression}, the Timeline resolved ${anchored.instances}`,
        ]
      : [];

  return { measured: [part], problems: [...resolved, ...counted] };
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

/** The ring of a focus as the cell shows it. */
const ringFinding = (fact: EffectFact, own: Own, endFrame: number): Finding => {
  const label = labelOf(fact);
  const { ring } = own;

  if (ring.tag === "slide-change") {
    return {
      measured: ["ends by the slide change (F7 observes it)"],
      problems: [],
    };
  }

  if (ring.tag === "retaken") {
    return {
      measured: [
        `ring kept: ${ring.by} rings the same Element again at frame ${ring.frame}, so the ring never leaves its cell (no end to observe)`,
      ],
      problems: [],
    };
  }

  if (ring.tag === "missing") {
    return {
      measured: ["ring end not observed"],
      problems: [`${label}: ${ring.reason}`],
    };
  }

  if (ring.tag === "none") {
    return { measured: [], problems: [] };
  }

  const early = ring.off - endFrame;

  return {
    measured: [`ring off ${frameText(ring.off)} (${signedFrames(early)})`],
    problems: withinOneFrame(early)
      ? []
      : [
          `${label}: its ring is observed to go at frame ${frameText(ring.off)}, ${signedFrames(early)} frames from its resolved end ${endFrame}`,
        ],
  };
};

/** Where the observed sources end the focus, against its resolved end. */
const untilFinding = (
  fact: EffectFact,
  ending: Ending,
  endFrame: number
): Finding => {
  const label = labelOf(fact);

  if (ending.tag === "none") {
    return { measured: [], problems: [] };
  }

  if (ending.tag === "missing") {
    return { measured: [], problems: [`${label}: ${ending.reason}`] };
  }

  const early = ending.frame - endFrame;

  return {
    measured: [
      `until ${ending.expression} observed ${frameText(ending.frame)} (${signedFrames(early)})`,
    ],
    problems: withinOneFrame(early)
      ? []
      : [
          `${label}: the observed sources end it at frame ${frameText(ending.frame)}, ${signedFrames(early)} frames from its resolved end ${endFrame}`,
        ],
  };
};

/** The end of a focus: its resolved end, where its ring is seen to go and where its `until` is observed to put it. */
const endFinding = (fact: EffectFact, evidence: Evidence): Finding => {
  const { endFrame } = fact.timed;

  if (endFrame === null || fact.effect.verb !== "focus") {
    return { measured: [], problems: [] };
  }

  const ring = ringFinding(fact, evidence.own, endFrame);
  const until = untilFinding(fact, evidence.ending, endFrame);

  return {
    measured: [`resolved end ${endFrame}`, ...ring.measured, ...until.measured],
    problems: [...ring.problems, ...until.problems],
  };
};

/** One instance's findings, printed as one row. */
export const judge = (fact: EffectFact, evidence: Evidence): Finding => {
  const found = anchorFinding(fact, evidence.anchored, evidence.leaves);

  const did = ownFinding(fact, evidence.own);
  const ended = endFinding(fact, evidence);

  return {
    measured: [
      `resolved ${fact.timed.fireFrame}`,
      ...found.measured,
      ...did.measured,
      ...ended.measured,
    ],
    problems: [...found.problems, ...did.problems, ...ended.problems],
  };
};
