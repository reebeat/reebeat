// `reebeat plan`: the Plan of a story, for review. Needs no browser and no audio; `--timing` also reads the speech
// cache, read-only (a stage that never refreshes), to show frames.
import { buildPlan, encodePlan, reviewText, schedule } from "@reebeat/core";
import type { PlanJson } from "@reebeat/core";
import { readSource, speechStage } from "@reebeat/pipeline";
import { Renderer } from "@reebeat/services";
import type { Selection } from "@reebeat/services";
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

/** The same with the Timeline: the narration comes from the speech cache the selected adapters key into. */
export const timedPlanText = Effect.fn("timedPlanText")(
  function* timedPlanText(options: {
    readonly json: boolean;
    readonly run: RunOptions;
    readonly selection: Selection;
    readonly story: string;
  }) {
    const compose = yield* Composition;
    const { plan } = yield* readPlan(options.story);
    const parts = compose(options.selection, options.run);

    const aligned = yield* Effect.provide(
      speechStage(plan, { refresh: false }),
      speechServicesOf(parts)
    );

    // The effects resolve against the selected renderer's own declaration of its slide change.
    const { info } = yield* Effect.provide(Renderer, parts.renderer);

    return yield* present(
      yield* schedule(plan, aligned, info.lifecycle),
      options.json,
      true
    );
  }
);
