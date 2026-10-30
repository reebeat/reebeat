// `tsukuri plan`: the Plan of a story, for review. Needs no browser and no audio; `--timing` also reads the speech
// cache, read-only (a stage that never refreshes), to show frames.
import { buildPlan, encodePlan, reviewText, schedule } from "@tsukuri/core";
import type { PlanJson } from "@tsukuri/core";
import { readSource, speechStage } from "@tsukuri/pipeline";
import { Renderer } from "@tsukuri/services";
import type { Selection } from "@tsukuri/services";
import { Effect } from "effect";

import { Composition, speechServicesOf } from "./adapters.ts";
import type { RunOptions } from "./adapters.ts";

/** The source of a story and its Plan, which carries the hash of the source's bytes. */
const readPlan = Effect.fn("readPlan")(function* readPlan(story: string) {
  const source = yield* readSource(story);

  return { plan: yield* buildPlan(source.text, source.sha256), source };
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

/**
 * The Plan with its Timeline: the narration comes from the speech cache the selected adapters key into (read-only: a
 * miss is `SpeechCacheMiss`), and the effects resolve against the selected renderer's own declaration of its slide
 * change. `plan --timing`, and `lint` when the cache exists, both read it.
 */
export const scheduledPlan = Effect.fn("scheduledPlan")(function* scheduledPlan(
  plan: PlanJson,
  run: RunOptions,
  selection: Selection
) {
  const compose = yield* Composition;
  const parts = compose(selection, run);

  const aligned = yield* Effect.provide(
    speechStage(plan, { refresh: false }),
    speechServicesOf(parts)
  );

  const { info } = yield* Effect.provide(Renderer, parts.renderer);

  return yield* schedule(plan, aligned, info.lifecycle);
});

/** The same review (or `plan.json`) with the Timeline. */
export const timedPlanText = Effect.fn("timedPlanText")(
  function* timedPlanText(options: {
    readonly json: boolean;
    readonly run: RunOptions;
    readonly selection: Selection;
    readonly story: string;
  }) {
    const { plan } = yield* readPlan(options.story);

    return yield* present(
      yield* scheduledPlan(plan, options.run, options.selection),
      options.json,
      true
    );
  }
);
