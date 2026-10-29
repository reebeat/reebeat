// Three build-time interpreters of the same MachineJSON, producing the same ordered event log:
//   runEffect     createEffectActor (@xstate/effect) under Effect's TestClock: a live actor, timers are Effect.sleep fibers
//   runSimulated  createActor (xstate) on a SimulatedClock: a live actor, no Effect
//   runPure       initialSystemTransition / advanceSystemTime (xstate, experimental): no actor, no clock, virtual time as data
import { Clock, Effect } from "effect";
import { TestClock } from "effect/testing";
import { createEffectActor } from "@xstate/effect";
import {
  advanceSystemTime,
  createActor,
  initialSystemTransition,
  machineFromJSON,
  SimulatedClock,
  type MachineJSON,
} from "xstate";

export interface LogEntry {
  readonly t: number;
  readonly event: string;
  readonly id: string;
}

type MarkParams = { readonly event: string; readonly id: string };

/** The only implementation the generated machine needs: `mark` records an event with the virtual time. */
const markWith = (now: () => number, log: LogEntry[]) => (params: MarkParams) => {
  log.push({ t: now(), event: params.event, id: params.id });
};

export const runEffect = (json: MachineJSON, totalMs: number, stepMs: number): Effect.Effect<readonly LogEntry[]> =>
  Effect.gen(function* () {
    const clock = yield* Clock.Clock;
    const log: LogEntry[] = [];
    const machine = machineFromJSON(json, { actions: { mark: markWith(() => clock.currentTimeMillisUnsafe(), log) } });
    yield* createEffectActor(machine);
    for (let at = 0; at < totalMs + stepMs; at += stepMs) yield* TestClock.adjust(`${stepMs} millis`);
    return log;
  }).pipe(Effect.scoped, Effect.provide(TestClock.layer()));

export const effectLog = (json: MachineJSON, totalMs: number, stepMs: number): Promise<readonly LogEntry[]> =>
  Effect.runPromise(runEffect(json, totalMs, stepMs));

interface EffectDescriptor {
  readonly type?: string;
  readonly args?: readonly unknown[];
}

/**
 * The pure interpreter: advance the system snapshot from one timer deadline to the next. The `mark` effects come back
 * as data descriptors (`externalEffects`: `type` is the action's address, `args` its parameters), stamped by the
 * deadline we advanced to.
 */
export const runPure = (json: MachineJSON, totalMs: number): readonly LogEntry[] => {
  const machine = machineFromJSON(json, { actions: { mark: () => undefined } });
  const logic = { root: machine };
  const log: LogEntry[] = [];
  const collect = (t: number, effects: readonly EffectDescriptor[]) => {
    for (const e of effects) {
      if (e.type !== "root/actions/mark") continue;
      const p = e.args?.[0] as MarkParams;
      log.push({ t, event: p.event, id: p.id });
    }
  };
  let [snapshot, effects] = initialSystemTransition(logic, { time: 0 });
  collect(0, effects as readonly EffectDescriptor[]);
  for (let guard = 0; guard < 100_000; guard++) {
    const due = snapshot.timers.map((x: { dueAt: number }) => x.dueAt).filter((d: number) => d <= totalMs);
    if (due.length === 0) break;
    const t = Math.min(...due);
    [snapshot, effects] = advanceSystemTime(logic, snapshot, { time: t });
    collect(t, effects as readonly EffectDescriptor[]);
  }
  return log;
};

export const formatLog = (log: readonly LogEntry[]): string => log.map((e) => `${e.t}\t${e.event}\t${e.id}`).join("\n");

export const runSimulated = (json: MachineJSON, totalMs: number): readonly LogEntry[] => {
  const clock = new SimulatedClock();
  const log: LogEntry[] = [];
  const machine = machineFromJSON(json, { actions: { mark: markWith(() => clock.now(), log) } });
  createActor(machine, { clock }).start();
  clock.increment(totalMs);
  return log;
};
