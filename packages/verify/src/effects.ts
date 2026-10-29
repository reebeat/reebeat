// F1, effect timing (spec 0002; spec 0004): every effect INSTANCE of the Timeline is observed in the written files and
// compared with the frame the Timeline resolved for it, and the moments it is anchored to are observed too.
//
//   own      what the instance does: a `sound` is the start of the catalogue sound found in the decoded audio track near
//            its fire frame (every instance of an `each(...)` sound has its own window); a `show` or `focus` is the first
//            frame that differs in its target's cell (events.ts); a `focus` that ends by its own `until` also has the
//            frame its ring goes, seen in the same cell (`ring-end`)
//   anchor   the event expression the instance is timed against. Its sources (`leaves.ts`) are observed in the picture:
//            the slide change, an Element's enter, exit, move or update and the states between them, a Beat or a State of
//            the Scene, another effect's observed run; a word of the narration, and the first Scene's slide change, have
//            no picture and keep the Timeline's frame. The SAME expression is then evaluated over those observed frames
//            with core's evaluator (`last`, `first`, `each`, `within`, offsets, `let`), so a combinator is checked against
//            the picture with the one definition of the algebra
//
// An instance passes when its own observed frame is within one frame of its resolved frame, the expression evaluated over
// the observed sources is within one frame of it too, and a focus's ring end and `until` are within one frame of its
// resolved end (`judge.ts`). Each `let` of a Scene is checked the same way against its resolved frames. The offsets are
// reported, positive when the observed frame is late.
import {
  endsAfter,
  formatAnchor,
  formatEvent,
  lifecycleFrames,
} from "@reebeat/core";
import type {
  Evaluate,
  EventExpr,
  Scene,
  TimedEvent,
  TimedPlan,
} from "@reebeat/core";
import { decodeMonoPcm } from "@reebeat/encode-ffmpeg";
import { Array as Arr, Effect, Option, Result } from "effect";

import {
  effectFacts,
  effectKey,
  ownSubject,
  ringPlanOf,
} from "./effectFacts.ts";
import type { EffectFact, RingPlan } from "./effectFacts.ts";
import { observeEvent, subjectKey } from "./events.ts";
import type { Observed, Subject } from "./events.ts";
import { guarded } from "./guard.ts";
import { judge, labelOf } from "./judge.ts";
import type { Anchored, Ending, Finding } from "./judge.ts";
import {
  evaluateObserved,
  leafOf,
  leavesOf,
  subjectsOf,
  whenExpression,
} from "./leaves.ts";
import type { Build } from "./load.ts";
import { instancesOf, sceneWindowOf } from "./observedScene.ts";
import type { World } from "./observedScene.ts";
import { hearSounds, ownOf, ringOf } from "./own.ts";
import type { Own } from "./own.ts";
import { frameText, signedFrames, withinOneFrame } from "./units.ts";
import { fail, verdictOf } from "./verdict.ts";
import type { Measured } from "./verdict.ts";

/** The sources of an expression with the frames they were observed at, for the row. */
export const leavesText = (
  world: World,
  index: number,
  scene: Scene,
  expr: EventExpr
): string =>
  Arr.join(
    Arr.map(leavesOf(scene, expr), (anchor) =>
      Result.match(leafOf(world, index, anchor), {
        onFailure: () => `${formatAnchor(anchor)} not observed`,
        onSuccess: (leaf) =>
          `${formatAnchor(anchor)} ${Arr.join(
            Arr.map(leaf.event, ({ frame }) => frameText(frame)),
            "/"
          )}${leaf.basis === "observed" ? "" : ` (${leaf.basis})`}`,
      })
    ),
    ", "
  );

/** Where the expression of `at` puts this instance, evaluated over the observed sources. */
export const anchoredOf = (
  world: World,
  evaluate: Evaluate<string>,
  fact: EffectFact
): Anchored => {
  const expr = whenExpression(fact.effect);
  const text = formatEvent(expr);

  return Result.match(evaluate(expr), {
    onFailure: (reason): Anchored => ({
      reason: `${text} cannot be evaluated over the observed frames: ${reason}`,
      tag: "missing",
    }),
    onSuccess: (event): Anchored =>
      Option.match(Arr.get(event, fact.timed.instance - 1), {
        onNone: (): Anchored => ({
          reason: `the observed sources give ${event.length} occurrence${event.length === 1 ? "" : "s"} of ${text}, instance ${fact.timed.instance} needs one more`,
          tag: "missing",
        }),
        onSome: ({ frame }): Anchored => ({
          count: event.length,
          expression: text,
          frame,
          instances: instancesOf(world.plan, fact.sceneIndex, fact.effect.id)
            .length,
          tag: "found",
        }),
      }),
  });
};

/** Where the observed sources end a focus with an `until`: the first occurrence after its observed start, else the Scene's last frame. */
export const endingOf = (
  world: World,
  evaluate: Evaluate<string>,
  fact: EffectFact,
  own: Own
): Ending => {
  const { until } = fact.effect;

  // A focus a later focus took the ring from ended at that focus's start, before its own `until` would have (a tie goes
  // to the takeover): the `until` is not what ended it, and the ring's end is judged by `ringFinding`.
  if (
    until === undefined ||
    own.start === undefined ||
    fact.timed.endedBy === "replaced"
  ) {
    return { tag: "none" };
  }

  const text = formatEvent(until.event);
  const { start } = own;

  return Result.match(
    Result.flatMap(sceneWindowOf(world, fact.sceneIndex), (bounds) =>
      Result.map(evaluate(until.event), (event) =>
        endsAfter(start, event, bounds.end)
      )
    ),
    {
      onFailure: (reason): Ending => ({
        reason: `until ${text} cannot be evaluated over the observed frames: ${reason}`,
        tag: "missing",
      }),
      onSuccess: (found): Ending => ({
        expression: text,
        frame: found.frame,
        tag: "until",
      }),
    }
  );
};

/** One derived event of a Scene against the frames the Timeline resolved for it. */
export const letFinding = (
  world: World,
  evaluate: Evaluate<string>,
  scene: Scene,
  index: number,
  timed: TimedEvent
): readonly [string, Finding] => {
  const written = Option.match(
    Arr.findFirst(scene.events, (derived) => derived.name === timed.name),
    { onNone: () => "", onSome: (derived) => formatEvent(derived.event) }
  );

  const label = `${scene.id}.${timed.name} let ${written}`;
  const expr: EventExpr = { kind: "ref", name: timed.name };

  return Result.match(evaluate(expr), {
    onFailure: (reason): readonly [string, Finding] => [
      label,
      {
        measured: [
          `resolved ${Arr.join(Arr.map(timed.frames, String), ", ")}; not observed`,
        ],
        problems: [
          `${label}: cannot be evaluated over the observed frames: ${reason}`,
        ],
      },
    ],
    onSuccess: (event): readonly [string, Finding] => {
      const frames = Arr.map(event, ({ frame }) => frame);

      const apart = Arr.flatMap(frames, (seen, at) => {
        const resolved = timed.frames[at];

        return resolved === undefined || withinOneFrame(seen - resolved)
          ? []
          : [
              `${label}: observed at frame ${frameText(seen)}, ${signedFrames(seen - resolved)} frames from its resolved frame ${resolved}`,
            ];
      });

      const counted =
        frames.length === timed.frames.length
          ? []
          : [
              `${label}: the observed sources give ${frames.length} occurrence${frames.length === 1 ? "" : "s"}, the Timeline resolved ${timed.frames.length}`,
            ];

      const leaves = leavesText(world, index, scene, expr);

      return [
        label,
        {
          measured: [
            `resolved ${Arr.join(Arr.map(timed.frames, String), ", ")}; observed ${Arr.join(Arr.map(frames, frameText), ", ")}${leaves === "" ? "" : `; leaves ${leaves}`}`,
          ],
          problems: [...apart, ...counted],
        },
      ];
    },
  });
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

/** What the picture is asked for: each effect's own change and ring end, and every source its expressions name. */
const subjectsToObserve = (
  plan: TimedPlan,
  facts: readonly EffectFact[],
  rings: ReadonlyMap<string, RingPlan>
): readonly Subject[] => [
  ...Arr.flatMap(facts, (fact) => {
    const ring = rings.get(effectKey(fact));

    return [
      ...Option.toArray(Option.fromNullishOr(ownSubject(fact))),
      ...(ring?.tag === "observe" ? [ring.subject] : []),
    ];
  }),
  ...Arr.flatMap(plan.scenes, (_, index) => subjectsOf(plan, index)),
];

/** F1 on the written video and audio. */
export const effectTiming = (build: Build) =>
  guarded(
    "F1",
    Effect.gen(function* observe() {
      const { plan } = build;
      const facts = effectFacts(plan);
      const { fps } = plan.settings;

      const rings = new Map(
        Arr.map(facts, (fact): [string, RingPlan] => [
          effectKey(fact),
          ringPlanOf(fact, facts),
        ])
      );

      const seen = yield* observeAll(
        build,
        subjectsToObserve(plan, facts, rings)
      );

      const hasSounds = Arr.some(facts, (fact) => fact.effect.verb === "sound");

      // A stand-in narrator silences the narration only: the sounds of an offline build are real and are observed.
      const track = hasSounds
        ? yield* decodeMonoPcm(build.mp4)
        : new Float32Array(0);

      const heard = hasSounds
        ? hearSounds(track, facts, fps)
        : new Map<string, Own>();

      const owns = new Map(
        Arr.map(facts, (fact): [string, Own] => {
          const key = effectKey(fact);
          const ring = ringOf(rings.get(key) ?? { tag: "none" }, seen, fact);

          return [key, ownOf(fact, seen, ring, heard.get(key))];
        })
      );

      const world: World = {
        declared: lifecycleFrames(plan.settings, build.lifecycle),
        owns,
        plan,
        seen,
      };

      const evaluators = Arr.map(plan.scenes, (_, index) =>
        evaluateObserved(world, index)
      );

      const rows = Arr.map(facts, (fact) => {
        const own = owns.get(effectKey(fact));
        const evaluate = evaluators[fact.sceneIndex];

        if (own === undefined || evaluate === undefined) {
          return [
            labelOf(fact),
            {
              measured: ["not observed"],
              problems: [`${labelOf(fact)}: not observed`],
            },
          ] as const;
        }

        const expr = whenExpression(fact.effect);

        return [
          labelOf(fact),
          judge(fact, {
            anchored: anchoredOf(world, evaluate, fact),
            ending: endingOf(world, evaluate, fact, own),
            leaves: leavesText(world, fact.sceneIndex, fact.scene, expr),
            own,
          }),
        ] as const;
      });

      const lets = Arr.flatMap(plan.timeline.scenes, (timedScene, index) => {
        const scene = plan.scenes[index];
        const evaluate = evaluators[index];

        return scene === undefined || evaluate === undefined
          ? []
          : Arr.map(timedScene.events, (timed) =>
              letFinding(world, evaluate, scene, index, timed)
            );
      });

      const measured: Measured = [
        ["effects checked", facts.length],
        ...(lets.length === 0
          ? []
          : [["derived events checked", lets.length] as const]),
        ...Arr.map(
          [...rows, ...lets],
          ([label, finding]): readonly [string, string] => [
            label,
            Arr.join(finding.measured, "; "),
          ]
        ),
      ];

      const problems = Arr.flatMap(
        [...rows, ...lets],
        ([, finding]) => finding.problems
      );

      if (facts.length === 0) {
        return fail("F1", "the Timeline has no effect to observe", measured);
      }

      return verdictOf(
        "F1",
        `all ${facts.length} effects${lets.length === 0 ? "" : ` and ${lets.length} derived events`} are observed within one frame of their resolved frame, and their expressions over the observed anchors give the resolved frame within one frame`,
        problems,
        measured
      );
    })
  );
