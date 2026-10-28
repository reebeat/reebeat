// `reebeat plan`: the Plan of a story, for review. Needs no browser and no audio; `--timing` also reads the speech
// cache, read-only (`speechCacheOnly`), to show frames.
import { buildPlan, encodePlan, reviewText, schedule } from "@reebeat/core";
import type { PlanJson } from "@reebeat/core";
import { Speech } from "@reebeat/speech";
import { Effect } from "effect";

import { readSource } from "./source.ts";

/** The source of a story and its Plan, which carries the hash of the source's bytes. */
export const readPlan = Effect.fn("readPlan")(function* readPlan(
  story: string
) {
  const source = yield* readSource(story);

  return { plan: yield* buildPlan(source.text, source.sha256), source };
});

/** The Plan scheduled onto the narration the `Speech` service provides. */
export const scheduledPlan = Effect.fn("scheduledPlan")(function* scheduledPlan(
  plan: PlanJson
) {
  const speech = yield* Speech;

  return yield* schedule(plan, yield* speech.alignLines(plan));
});

const present = (plan: PlanJson, json: boolean, timing: boolean) =>
  json ? encodePlan(plan) : Effect.succeed(reviewText(plan, { timing }));

/** The review text (or `plan.json` text) of a story without a Timeline. */
export const planText = Effect.fn("planText")(function* planText(options: {
  readonly json: boolean;
  readonly story: string;
}) {
  const { plan } = yield* readPlan(options.story);

  return yield* present(plan, options.json, false);
});

/** The same with the Timeline: the narration comes from the speech cache the `Speech` service reads. */
export const timedPlanText = Effect.fn("timedPlanText")(
  function* timedPlanText(options: {
    readonly json: boolean;
    readonly story: string;
  }) {
    const { plan } = yield* readPlan(options.story);

    return yield* present(yield* scheduledPlan(plan), options.json, true);
  }
);
