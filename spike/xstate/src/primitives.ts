// Tiny tests of what XState decides for us. Each demo is a data-only MachineJSON, a script of events and time, and the
// observed marks compared with what the statechart semantics say. Pure (no actor, no Effect) except the last, which
// runs the same machine under createEffectActor + TestClock.
import {
  advanceSystemTime,
  initialSystemTransition,
  initialTransition,
  machineFromJSON,
  systemTransition,
  transition,
  type MachineJSON,
} from "xstate";
import { effectLog } from "./interpret.ts";

const mk = (event: string, id: string) => ({ type: "mark", params: { event, id } });
const noop = { actions: { mark: () => undefined }, guards: { ok: () => true } };

interface Action {
  readonly type?: string;
  readonly args?: readonly unknown[];
}
const marksOf = (actions: readonly Action[]): string[] =>
  actions
    .filter((a) => a.type === "mark")
    .map((a) => {
      const p = a.args?.[0] as { event: string; id: string };
      return `${p.event} ${p.id}`;
    });

/** Pure macrosteps: initial transition, then one `transition` per event. */
const pure = (json: MachineJSON, events: readonly string[]) => {
  const machine = machineFromJSON(json, noop);
  let [snapshot, actions] = initialTransition(machine);
  const marks = [...marksOf(actions as readonly Action[])];
  const values = [JSON.stringify(snapshot.value)];
  for (const type of events) {
    [snapshot, actions] = transition(machine, snapshot, { type });
    marks.push(`-- ${type}`, ...marksOf(actions as readonly Action[]));
    values.push(JSON.stringify(snapshot.value));
  }
  return { marks, values };
};

export interface Demo {
  readonly feature: string;
  readonly observed: readonly string[];
  readonly expected: readonly string[];
  readonly pass: boolean;
}

const demo = (feature: string, observed: readonly string[], expected: readonly string[]): Demo => ({
  feature,
  observed,
  expected,
  pass: JSON.stringify(observed) === JSON.stringify(expected),
});

export const demos = async (): Promise<readonly Demo[]> => {
  const out: Demo[] = [];

  // 1. Entry/exit order across a hierarchy: exit deepest first, the transition's actions, then enter outermost first.
  {
    const r = pure(
      {
        id: "t",
        initial: "p1",
        states: {
          p1: {
            initial: "c1",
            entry: [mk("enter", "p1")],
            exit: [mk("exit", "p1")],
            states: {
              c1: { entry: [mk("enter", "c1")], exit: [mk("exit", "c1")], on: { go: { target: "#t.p2.c2", actions: [mk("action", "go")] } } },
            },
          },
          p2: { initial: "c2", entry: [mk("enter", "p2")], exit: [mk("exit", "p2")], states: { c2: { entry: [mk("enter", "c2")] } } },
        },
      },
      ["go"],
    );
    out.push(demo("entry/exit order", r.marks, ["enter p1", "enter c1", "-- go", "exit c1", "exit p1", "action go", "enter p2", "enter c2"]));
  }

  // 2. Parallel regions: one event moves every region that handles it, in one macrostep.
  {
    const r = pure(
      {
        id: "t",
        type: "parallel",
        states: {
          a: { initial: "a1", states: { a1: { on: { go: { target: "a2" } } }, a2: { entry: [mk("enter", "a2")] } } },
          b: { initial: "b1", states: { b1: { on: { go: { target: "b2" } } }, b2: { entry: [mk("enter", "b2")] } } },
        },
      },
      ["go"],
    );
    out.push(demo("parallel regions", [...r.values, ...r.marks.filter((m) => m !== "-- go")], ['{"a":"a1","b":"b1"}', '{"a":"a2","b":"b2"}', "enter a2", "enter b2"]));
  }

  // 3. History: re-entering a compound state through its history state restores the last active child.
  {
    const r = pure(
      {
        id: "t",
        initial: "m",
        states: {
          m: {
            initial: "x",
            on: { leave: { target: "off" } },
            states: {
              x: { on: { next: { target: "y" } } },
              y: { entry: [mk("enter", "y")] },
              h: { type: "history", history: "shallow", target: "x" },
            },
          },
          off: { on: { back: { target: "#t.m.h" } } },
        },
      },
      ["next", "leave", "back"],
    );
    out.push(demo("history (shallow)", r.values, ['{"m":"x"}', '{"m":"y"}', '"off"', '{"m":"y"}']));
  }

  // 4. done.state: a final child completes its parent; `xstate.done.state` + `matches` is the data form of onDone.
  {
    const r = pure(
      {
        id: "t",
        initial: "scene",
        states: {
          scene: {
            initial: "s",
            on: { "xstate.done.state": { matches: { stateId: "t.scene" }, target: "next" } },
            states: { s: { on: { finish: { target: "end" } } }, end: { type: "final" } },
          },
          next: {},
        },
      },
      ["finish"],
    );
    out.push(demo("done.state", r.values, ['{"scene":"s"}', '"next"']));
  }

  // 5. Eventless transition: `always` runs inside the macrostep of the event that entered the state.
  {
    const r = pure(
      {
        id: "t",
        initial: "a",
        states: {
          a: { exit: [mk("exit", "a")], on: { go: { target: "b" } } },
          b: { entry: [mk("enter", "b")], exit: [mk("exit", "b")], always: { target: "c", guard: { type: "ok" } } },
          c: { entry: [mk("enter", "c")] },
        },
      },
      ["go"],
    );
    out.push(demo("eventless (always)", [...r.values, ...r.marks], ['"a"', '"c"', "-- go", "exit a", "enter b", "exit b", "enter c"]));
  }

  // 6. Delayed transition, cancelled by leaving its state (pure virtual time: advanceSystemTime).
  {
    const machine = machineFromJSON(
      {
        id: "t",
        initial: "a",
        states: {
          a: { after: { 1000: { target: "b" } }, on: { go: { target: "c" } } },
          b: { entry: [mk("enter", "b")] },
          c: { entry: [mk("enter", "c")] },
        },
      },
      noop,
    );
    const logic = { root: machine };
    let [s] = initialSystemTransition(logic, { time: 0 });
    [s] = advanceSystemTime(logic, s, { time: 500 });
    const timersBefore = s.timers.length;
    [s] = systemTransition(logic, s, s.root, { type: "go" });
    const timersAfter = s.timers.length;
    [s] = advanceSystemTime(logic, s, { time: 2000 });
    const value = JSON.stringify(s.actors[s.root]!.snapshot.value);
    out.push(demo("delayed transition + cancel on exit", [`timers ${timersBefore} -> ${timersAfter}`, value], ["timers 1 -> 0", '"c"']));
  }

  // 7. Two timers with the same deadline fire in a fixed (document) order: the same log from the Effect actor under TestClock.
  {
    const json: MachineJSON = {
      id: "t",
      type: "parallel",
      states: {
        a: { initial: "a1", states: { a1: { after: { 100: { target: "a2" } } }, a2: { entry: [mk("enter", "a2")] } } },
        b: { initial: "b1", states: { b1: { after: { 100: { target: "b2" } } }, b2: { entry: [mk("enter", "b2")] } } },
      },
    };
    const log = await effectLog(json, 200, 50);
    out.push(demo("same-deadline timers (TestClock)", log.map((e) => `${e.t} ${e.event} ${e.id}`), ["100 enter a2", "100 enter b2"]));
  }

  return out;
};
