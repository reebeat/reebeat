// Bundle-size probe: what the Effect interpreter imports (effect + xstate + @xstate/effect).
import { Clock, Effect } from "effect";
import { TestClock } from "effect/testing";
import { createEffectActor, join, send, waitFor } from "@xstate/effect";
import { machineFromJSON, type MachineJSON } from "xstate";

export const run = (json: MachineJSON, totalMs: number) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const clock = yield* Clock.Clock;
      const actor = yield* createEffectActor(machineFromJSON(json, { actions: { mark: () => clock.currentTimeMillisUnsafe() } }));
      yield* send(actor, { type: "go" });
      yield* TestClock.adjust(`${totalMs} millis`);
      yield* waitFor(actor, () => true);
      return yield* join(actor);
    }).pipe(Effect.scoped, Effect.provide(TestClock.layer())),
  );
