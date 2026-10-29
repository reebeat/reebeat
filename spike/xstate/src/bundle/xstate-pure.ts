// Bundle-size probe: the pure interpreter only (xstate; no Effect, no @xstate/effect).
import { advanceSystemTime, initialSystemTransition, machineFromJSON, type MachineJSON } from "xstate";

export const run = (json: MachineJSON, totalMs: number) => {
  const logic = { root: machineFromJSON(json, { actions: { mark: () => undefined } }) };
  const [snapshot] = initialSystemTransition(logic, { time: 0 });
  return advanceSystemTime(logic, snapshot, { time: totalMs });
};
