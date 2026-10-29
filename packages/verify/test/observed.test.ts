// F1 over the machines (spec 0004): every source of an event expression is read from the frames that were OBSERVED, the
// same expression is evaluated over them with core's algebra, and the result is compared with the resolved frame. The
// observations here are fabricated: a picture that shows exactly what the Timeline resolved, and the same picture with
// one observed frame moved by three. Literal frames come from the Timeline of the story below (300 ms a word, the
// reference lifecycle: a 24-frame Auto-Animate from frame 81, a move from frame 83 to 105).
import { assert, describe, it } from "@effect/vitest";
import {
  formatAnchor,
  lifecycleFrames,
  referenceLifecycle,
} from "@reebeat/core";
import type { Anchor, Event, EventExpr, TimedPlan } from "@reebeat/core";
import {
  Array as Arr,
  Effect,
  Option,
  Order,
  Result,
  String as Str,
} from "effect";

import { effectFacts, ringPlanOf } from "../src/effectFacts.ts";
import type { EffectFact } from "../src/effectFacts.ts";
import {
  anchoredOf,
  endingOf,
  leavesText,
  letFinding,
} from "../src/effects.ts";
import { subjectKey } from "../src/events.ts";
import type { Observed, Subject } from "../src/events.ts";
import { judge } from "../src/judge.ts";
import type { Anchored, Evidence } from "../src/judge.ts";
import {
  evaluateObserved,
  leafOf,
  leavesOf,
  subjectsOf,
  whenExpression,
} from "../src/leaves.ts";
import { beatOf, beatsOf, dwellOf } from "../src/observedScene.ts";
import type { World } from "../src/observedScene.ts";
import type { Own } from "../src/own.ts";
import { timedWith } from "./timed.ts";

const story = `Title: Machines
Author: reebeat tests

# Part one

INT. ONE - DAY #sc1#

Box {id=a cell=tl class=box}
Later {id=b cell=bc class=label}

NARRATOR
One two three four.

# Part two

> AUTO-ANIMATE

INT. TWO - DAY #sc2#

Box {id=a cell=tr class=accent}
Entering {id=d cell=mc class=label}
Hidden {id=h cell=br class=muted visible=false}

[[effects
  let settled = last(a.move.end, a.update.end)
  s1: sound whoosh at transition.start
  s2: sound ding at settled +2f
  s3: sound pop at when(a.move.progress >= 50%)
  s4: sound pop at a.moving.leave +1f
  s5: sound pop at each(word("six").end, word("seven").end, stagger=0.5s)
  f1: focus a at word("six").end until word("eight").end
  r1: show h at word("seven").end
  s6: sound pop at beat(1).end
  s7: sound ding at state(2).enter
  s8: sound pop at within(word("seven").end, state(2))
]]

NARRATOR
Five six seven eight nine.
`;

/** The Scene `sc2` is index 1: it opens at frame 81 and its last frame is 170. */
const sceneIndex = 1;

/** An observed event that is linear in time between two frames. */
const span = (start: number, end: number): Observed => ({
  end,
  percent: (percent) => start + ((end - start) * percent) / 100,
  start,
});

/** The box's move: from frame 83 to 105, halfway (by the eased progress) at frame 89. */
const moveSeen = (end: number, half: number): Observed => ({
  end,
  percent: (percent) =>
    percent === 50 ? half : 83 + ((end - 83) * percent) / 100,
  start: 83,
});

const moveKey = subjectKey({
  event: "move",
  id: "a",
  kind: "element",
  sceneIndex,
});

const updateKey = subjectKey({
  event: "update",
  id: "a",
  kind: "element",
  sceneIndex,
});

const slideKey = subjectKey({ kind: "transition", sceneIndex });

/** What the written files show of an effect instance when they show exactly what the Timeline resolved. */
const ownAsResolved = (fact: EffectFact): Own => {
  const { endFrame, endedBy, fireFrame } = fact.timed;
  const end = endFrame ?? fireFrame;

  if (fact.effect.verb === "focus" && endedBy === "until") {
    return {
      end: fireFrame,
      reason: "",
      ring: { gone: end + 3, off: end, tag: "seen" },
      score: undefined,
      start: fireFrame,
    };
  }

  return {
    end: fact.effect.verb === "show" ? end : fireFrame,
    reason: "",
    ring: { tag: "none" },
    score: undefined,
    start: fireFrame,
  };
};

const keyOf = (fact: EffectFact): string =>
  `${fact.scene.id}.${fact.effect.id}#${fact.timed.instance}`;

/** A written video that shows what the Timeline resolved: the world the evaluation reads. */
const worldOf = (plan: TimedPlan): World => ({
  declared: lifecycleFrames(plan.settings, referenceLifecycle),
  owns: new Map(
    Arr.map(effectFacts(plan), (fact): [string, Own] => [
      keyOf(fact),
      ownAsResolved(fact),
    ])
  ),
  plan,
  seen: new Map<string, Observed | undefined>([
    [slideKey, span(81, 105)],
    [moveKey, moveSeen(105, 89)],
    [updateKey, span(83, 105)],
  ]),
});

const withSeen = (world: World, key: string, event: Observed): World => ({
  ...world,
  seen: new Map([...world.seen, [key, event]]),
});

const withOwn = (world: World, key: string, patch: Partial<Own>): World => ({
  ...world,
  owns: new Map(
    Arr.map([...world.owns], ([name, own]): [string, Own] => [
      name,
      name === key ? { ...own, ...patch } : own,
    ])
  ),
});

const factOf = (plan: TimedPlan, key: string): EffectFact =>
  Option.getOrThrow(
    Arr.findFirst(effectFacts(plan), (fact) => keyOf(fact) === key)
  );

const framesOf = (found: Result.Result<Event, string>): readonly number[] =>
  Result.match(found, {
    onFailure: (reason) => assert.fail(reason),
    onSuccess: (event) => Arr.map(event, ({ frame }) => frame),
  });

const edge = (
  id: string,
  transition: "move" | "update",
  at: "end" | "start"
): Anchor => ({
  at,
  kind: "edge",
  subject: { id, kind: "element" },
  transition,
});

const occupancy = (
  subject: Extract<Anchor, { kind: "occupancy" }>["subject"],
  state: Extract<Anchor, { kind: "occupancy" }>["state"],
  event: "enter" | "leave"
): Anchor => ({ event, kind: "occupancy", state, subject });

/** The evidence F1 collects for one instance, as `effectTiming` collects it. */
const evidenceOf = (world: World, fact: EffectFact): Evidence => {
  const evaluate = evaluateObserved(world, fact.sceneIndex);

  const own = Option.getOrThrow(
    Option.fromNullishOr(world.owns.get(keyOf(fact)))
  );

  return {
    anchored: anchoredOf(world, evaluate, fact),
    ending: endingOf(world, evaluate, fact, own),
    leaves: leavesText(
      world,
      fact.sceneIndex,
      fact.scene,
      whenExpression(fact.effect)
    ),
    own,
  };
};

const problemsOf = (world: World, key: string): readonly string[] =>
  judge(factOf(world.plan, key), evidenceOf(world, factOf(world.plan, key)))
    .problems;

describe("an event expression evaluated over the observed frames", () => {
  it.effect(
    "gives each effect instance the frame the Timeline resolved, for every kind of source and combinator",
    () =>
      Effect.gen(function* evaluated() {
        const plan = yield* timedWith(referenceLifecycle, story);
        const world = worldOf(plan);
        const evaluate = evaluateObserved(world, sceneIndex);

        // Literal frames of the Timeline: a leaf, a let, an offset, a threshold, a state event, an each with stagger
        // (two instances), a Beat edge, a State enter, a within.
        for (const [key, effectId, expected] of [
          ["s1", "sc2.s1#1", [81]],
          ["s2", "sc2.s2#1", [107]],
          ["s3", "sc2.s3#1", [89]],
          ["s4", "sc2.s4#1", [106]],
          ["s5", "sc2.s5#1", [129, 144]],
          ["f1", "sc2.f1#1", [129]],
          ["r1", "sc2.r1#1", [138]],
          ["s6", "sc2.s6#1", [129]],
          ["s7", "sc2.s7#1", [129]],
          ["s8", "sc2.s8#1", [138]],
        ] as const) {
          const fact = factOf(plan, effectId);

          assert.deepStrictEqual(
            framesOf(evaluate(whenExpression(fact.effect))),
            expected,
            key
          );
          assert.strictEqual(fact.timed.fireFrame, expected[0], key);
          assert.deepStrictEqual(problemsOf(world, effectId), [], key);
        }

        // The second instance of the each: its own frame, its own window in the audio.
        assert.strictEqual(factOf(plan, "sc2.s5#2").timed.fireFrame, 144);
        assert.deepStrictEqual(problemsOf(world, "sc2.s5#2"), []);
      })
  );

  it.effect(
    "maps the state events of the Element machines to the edges of the observed transitions, and says which are not picture events",
    () =>
      Effect.gen(function* states() {
        const world = worldOf(yield* timedWith(referenceLifecycle, story));
        const element = { id: "a", kind: "element" } as const;

        const leaf = (anchor: Anchor) =>
          Result.getOrThrow(leafOf(world, sceneIndex, anchor));

        // moving.enter = move.start, moving.leave = move.end: the same observed event.
        assert.deepStrictEqual(
          [
            framesOf(
              Result.map(
                leafOf(
                  world,
                  sceneIndex,
                  occupancy(element, "moving", "enter")
                ),
                (found) => found.event
              )
            ),
            framesOf(
              Result.map(
                leafOf(
                  world,
                  sceneIndex,
                  occupancy(element, "moving", "leave")
                ),
                (found) => found.event
              )
            ),
          ],
          [[83], [105]]
        );
        assert.deepStrictEqual(
          framesOf(
            leafOf(world, sceneIndex, edge("a", "move", "start")).pipe(
              Result.map((found) => found.event)
            )
          ),
          [83]
        );

        // still.leave is the start of the move; still.enter is the Scene's first frame, not an event of the picture.
        assert.deepStrictEqual(
          leaf(occupancy(element, "still", "leave")).basis,
          "observed"
        );
        assert.deepStrictEqual(
          Arr.map(
            leaf(occupancy(element, "still", "leave")).event,
            ({ frame }) => frame
          ),
          [83]
        );
        assert.strictEqual(
          leaf(occupancy(element, "still", "enter")).basis,
          "first frame of the Scene"
        );
        assert.deepStrictEqual(
          Arr.map(
            leaf(occupancy(element, "still", "enter")).event,
            ({ frame }) => frame
          ),
          [81]
        );

        // The style machine: updating is the window of the update.
        assert.deepStrictEqual(
          Arr.map(
            leaf(occupancy(element, "updating", "leave")).event,
            ({ frame }) => frame
          ),
          [105]
        );

        // The Scene: scene.end is the last frame (no picture); the slide change's leave of `before` is its start.
        const scene = { kind: "scene" } as const;

        assert.strictEqual(
          leaf(occupancy(scene, "shown", "leave")).basis,
          "last frame of the Scene"
        );
        assert.deepStrictEqual(
          Arr.map(
            leaf(occupancy(scene, "shown", "leave")).event,
            ({ frame }) => frame
          ),
          [170]
        );
        assert.deepStrictEqual(
          Arr.map(
            leaf(occupancy(scene, "before", "leave")).event,
            ({ frame }) => frame
          ),
          [81]
        );

        // An effect: active from its observed start to its observed ring end.
        const ring = { id: "f1", kind: "effect" } as const;

        assert.deepStrictEqual(
          [
            Arr.map(
              leaf(occupancy(ring, "active", "enter")).event,
              ({ frame }) => frame
            ),
            Arr.map(
              leaf(occupancy(ring, "active", "leave")).event,
              ({ frame }) => frame
            ),
          ],
          [[129], [147]]
        );

        // A state the Element never reaches is not an event.
        const unmoved = leafOf(
          world,
          sceneIndex,
          occupancy({ id: "d", kind: "element" }, "moving", "enter")
        );

        assert.isTrue(Result.isFailure(unmoved));
      })
  );

  it.effect(
    "negative control: a leaf observed three frames late moves the evaluated frame by three and the row of its effect fails, naming the observed and the resolved frame",
    () =>
      Effect.gen(function* shifted() {
        const plan = yield* timedWith(referenceLifecycle, story);
        const late = withSeen(worldOf(plan), moveKey, moveSeen(108, 92));

        // settled = last(move.end, update.end) is now 108: ding at settled +2f is observed at 110, resolved at 107.
        const ding = Arr.join(problemsOf(late, "sc2.s2#1"), "\n");

        assert.include(ding, "sc2.s2#1 sound ding");
        assert.include(ding, "the observed anchor puts it at frame 110");
        assert.include(ding, "+3 frames from its resolved frame 107");

        // The threshold, the state event and the let read the same moved edge.
        assert.include(
          Arr.join(problemsOf(late, "sc2.s3#1"), "\n"),
          "puts it at frame 92, +3 frames from its resolved frame 89"
        );
        assert.include(
          Arr.join(problemsOf(late, "sc2.s4#1"), "\n"),
          "puts it at frame 109, +3 frames from its resolved frame 106"
        );

        // An effect that does not read the moved edge still passes.
        assert.deepStrictEqual(problemsOf(late, "sc2.s1#1"), []);
        assert.deepStrictEqual(problemsOf(late, "sc2.s6#1"), []);

        // The row names the observed and the resolved frames and the sources it was evaluated from.
        const row = judge(
          factOf(plan, "sc2.s2#1"),
          evidenceOf(late, factOf(plan, "sc2.s2#1"))
        ).measured;

        assert.deepStrictEqual(Arr.take(row, 2), [
          "resolved 107",
          "at settled +2f observed 110 (+3); leaves a.move.end 108, a.update.end 105",
        ]);

        // A derived event is a row of its own: observed 108 against 105 resolved.
        const letRow = letFinding(
          late,
          evaluateObserved(late, sceneIndex),
          factOf(plan, "sc2.s2#1").scene,
          sceneIndex,
          {
            frames: [105],
            name: "settled",
          }
        );

        assert.include(
          Arr.join(letRow[1].problems, "\n"),
          "+3 frames from its resolved frame 105"
        );
        assert.deepStrictEqual(
          letFinding(
            worldOf(plan),
            evaluateObserved(worldOf(plan), sceneIndex),
            factOf(plan, "sc2.s2#1").scene,
            sceneIndex,
            {
              frames: [105],
              name: "settled",
            }
          )[1].problems,
          []
        );
      })
  );

  it.effect(
    "derives the Beats and States of a Scene from the observed start of its steps, grouped as the Timeline fires them",
    () =>
      Effect.gen(function* beats() {
        const plan = yield* timedWith(referenceLifecycle, story);
        const world = worldOf(plan);

        // As resolved: Beat 1 is the instant focus at 129, Beat 2 the show from 138 to 142.
        assert.deepStrictEqual(Result.getOrThrow(beatsOf(world, sceneIndex)), [
          { end: 129, start: 129 },
          { end: 142, start: 138 },
        ]);

        // The show is observed two frames late and its fade two frames longer: Beat 2 and State 2 follow the picture.
        const late = withOwn(world, "sc2.r1#1", { end: 144, start: 140 });

        assert.deepStrictEqual(Result.getOrThrow(beatsOf(late, sceneIndex)), [
          { end: 129, start: 129 },
          { end: 144, start: 140 },
        ]);
        assert.deepStrictEqual(Result.getOrThrow(beatOf(late, sceneIndex, 2)), {
          end: 144,
          start: 140,
        });
        assert.deepStrictEqual(
          Result.getOrThrow(dwellOf(late, sceneIndex, 1)),
          { end: 129, start: 81 }
        );
        assert.deepStrictEqual(
          Result.getOrThrow(dwellOf(late, sceneIndex, 2)),
          { end: 140, start: 129 }
        );
        assert.deepStrictEqual(
          Result.getOrThrow(dwellOf(late, sceneIndex, 3)),
          { end: 170, start: 144 }
        );

        const absent = beatOf(late, sceneIndex, 3);

        assert.isTrue(Result.isFailure(absent));
        assert.include(
          Result.isFailure(absent) ? absent.failure : "",
          "beat(3) is not observed: 2 Beats observed"
        );
        assert.include(
          Result.match(dwellOf(late, sceneIndex, 4), {
            onFailure: (reason) => reason,
            onSuccess: () => "",
          }),
          "state(4) is not observed"
        );

        // A step that was not observed leaves the Beats unobserved: the leaf says which.
        const unseen = withOwn(world, "sc2.r1#1", { start: undefined });
        const gone = beatsOf(unseen, sceneIndex);

        assert.isTrue(Result.isFailure(gone));
        assert.include(
          Result.isFailure(gone) ? gone.failure : "",
          "step sc2.r1#1 is not observed"
        );
      })
  );

  it.effect(
    "negative control: a show observed three frames early takes beat(2) and the State it opens with it, and within(...) loses the occurrence it no longer holds",
    () =>
      Effect.gen(function* within() {
        const plan = yield* timedWith(referenceLifecycle, story);

        // The show is seen at 135 instead of 138: State 2 ends at 135, before the word it scopes (138): s8 has no occurrence.
        const early = withOwn(worldOf(plan), "sc2.r1#1", {
          end: 139,
          start: 135,
        });

        const problems = Arr.join(problemsOf(early, "sc2.s8#1"), "\n");

        assert.include(problems, "the observed sources give 0 occurrences of");
        assert.include(problems, "within(");
        // beat(1).end and state(2).enter did not move: the focus is the first Beat.
        assert.deepStrictEqual(problemsOf(early, "sc2.s6#1"), []);
        assert.deepStrictEqual(problemsOf(early, "sc2.s7#1"), []);
      })
  );

  it.effect(
    "judges the end of a focus: its ring against the resolved end and its until against the observed sources, and reports a ring that another focus replaces",
    () =>
      Effect.gen(function* ends() {
        const plan = yield* timedWith(referenceLifecycle, story);
        const world = worldOf(plan);
        const fact = factOf(plan, "sc2.f1#1");
        const evidence = evidenceOf(world, fact);

        // The until is a word, so it ends the ring where the Timeline did.
        assert.deepStrictEqual(evidence.ending, {
          expression: 'word("eight").end',
          frame: 147,
          tag: "until",
        });

        const held = judge(fact, evidence);

        assert.deepStrictEqual(held.problems, []);
        assert.include(
          Arr.join(held.measured, "; "),
          'resolved end 147; ring off 147 (0); until word("eight").end observed 147 (0)'
        );

        const ringAt = (off: number): Evidence => ({
          ...evidence,
          own: { ...evidence.own, ring: { gone: off + 3, off, tag: "seen" } },
        });

        // Within a frame passes; three frames late fails and names both frames.
        assert.deepStrictEqual(judge(fact, ringAt(148)).problems, []);

        const late = Arr.join(judge(fact, ringAt(150)).problems, "\n");

        assert.include(
          late,
          "its ring is observed to go at frame 150, +3 frames from its resolved end 147"
        );

        // The observed sources end it three frames late: the same message about the until.
        const until = Arr.join(
          judge(fact, {
            ...evidence,
            ending: { expression: "x", frame: 150, tag: "until" },
          }).problems,
          "\n"
        );

        assert.include(
          until,
          "the observed sources end it at frame 150, +3 frames from its resolved end 147"
        );

        // A ring that was not seen is a problem; one that ends by the slide change, or is replaced, is reported, not judged.
        const missing = judge(fact, {
          ...evidence,
          own: {
            ...evidence.own,
            ring: { reason: "nothing differs", tag: "missing" },
          },
        });

        assert.include(Arr.join(missing.problems, "\n"), "nothing differs");

        const replaced = judge(fact, {
          ...evidence,
          own: {
            ...evidence.own,
            ring: { by: "sc2.f2#1", frame: 138, tag: "replaced" },
          },
        });

        assert.deepStrictEqual(replaced.problems, []);
        assert.include(
          Arr.join(replaced.measured, "; "),
          "ring replaced by sc2.f2#1 at frame 138: its end is not observed"
        );

        const lasting = judge(fact, {
          ...evidence,
          own: { ...evidence.own, ring: { tag: "slide-change" } },
        });

        assert.deepStrictEqual(lasting.problems, []);
        assert.include(
          Arr.join(lasting.measured, "; "),
          "ends by the slide change"
        );
      })
  );

  it.effect(
    "plans the ring end: observed for a focus that ends by its own until, replaced when a later focus takes the ring first, the slide change otherwise",
    () =>
      Effect.gen(function* plans() {
        const plan = yield* timedWith(referenceLifecycle, story);
        const facts = effectFacts(plan);
        const ring = ringPlanOf(factOf(plan, "sc2.f1#1"), facts);

        assert.deepStrictEqual(ring, {
          subject: { endFrame: 147, id: "a", kind: "ring-end", sceneIndex },
          tag: "observe",
        });
        assert.deepStrictEqual(ringPlanOf(factOf(plan, "sc2.s1#1"), facts), {
          tag: "none",
        });
        assert.deepStrictEqual(ringPlanOf(factOf(plan, "sc2.r1#1"), facts), {
          tag: "none",
        });

        // A second focus at 138 takes the Deck's one ring before f1's until (147).
        const crowded = yield* timedWith(
          referenceLifecycle,
          Str.replace(
            "  r1: show h",
            '  f2: focus d at word("seven").end\n  r1: show h'
          )(story)
        );

        assert.deepStrictEqual(
          ringPlanOf(factOf(crowded, "sc2.f1#1"), effectFacts(crowded)),
          {
            by: "sc2.f2#1",
            frame: 138,
            tag: "replaced",
          }
        );
        assert.deepStrictEqual(
          ringPlanOf(factOf(crowded, "sc2.f2#1"), effectFacts(crowded)),
          {
            tag: "slide-change",
          }
        );
      })
  );

  it.effect(
    "judges the number of occurrences an expression has over the observed sources against the instances the Timeline resolved",
    () =>
      Effect.gen(function* counted() {
        const plan = yield* timedWith(referenceLifecycle, story);
        const world = worldOf(plan);
        const fact = factOf(plan, "sc2.s5#1");
        const evidence = evidenceOf(world, fact);

        assert.deepStrictEqual(judge(fact, evidence).problems, []);

        const anchored: Anchored =
          evidence.anchored.tag === "found"
            ? { ...evidence.anchored, count: 3 }
            : evidence.anchored;

        const three: Evidence = { ...evidence, anchored };

        assert.include(
          Arr.join(judge(fact, three).problems, "\n"),
          "the observed anchors give 3 occurrences of each("
        );
        // Only the first instance reports it.
        const second = factOf(plan, "sc2.s5#2");
        const secondEvidence = evidenceOf(world, second);

        assert.deepStrictEqual(
          judge(second, {
            ...secondEvidence,
            anchored:
              secondEvidence.anchored.tag === "found"
                ? { ...secondEvidence.anchored, count: 3 }
                : secondEvidence.anchored,
          }).problems,
          []
        );
      })
  );

  it.effect(
    "asks the picture for exactly the events the expressions of a Scene name, and follows a let to its own sources",
    () =>
      Effect.gen(function* asks() {
        const plan = yield* timedWith(referenceLifecycle, story);

        assert.deepStrictEqual(
          Arr.sort(
            Arr.dedupe(
              Arr.map(subjectsOf(plan, sceneIndex), (subject: Subject) =>
                subjectKey(subject)
              )
            ),
            Order.String
          ),
          Arr.sort([moveKey, updateKey, slideKey], Order.String)
        );
        // The first Scene names no source.
        assert.deepStrictEqual(subjectsOf(plan, 0), []);

        const scene = Option.getOrThrow(
          Option.fromNullishOr(plan.scenes[sceneIndex])
        );

        const ding: EventExpr = whenExpression(factOf(plan, "sc2.s2#1").effect);

        assert.deepStrictEqual(
          Arr.map(leavesOf(scene, ding), (anchor) => formatAnchor(anchor)),
          ["a.move.end", "a.update.end"]
        );
      })
  );
});
