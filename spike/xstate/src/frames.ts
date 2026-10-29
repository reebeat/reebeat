// Question 5, the conflict with "the Video is a pure function of the frame number": the pure system API
// (`advanceSystemTime`) is a pure function of (initial snapshot, time), so a frame number n can be sampled as
// state(n * 1000 / fps) without a clock, a fiber or a replay log. Measured here: is it right, and what does it cost?
import { advanceSystemTime, initialSystemTransition, machineFromJSON, type MachineJSON } from "xstate";
import type { Declared } from "./generate.ts";

export interface FrameReport {
  readonly fps: number;
  readonly frames: number;
  readonly randomAccessSamples: number;
  readonly mismatches: number;
  readonly randomAccessMedianUs: number;
  readonly randomAccessMaxUs: number;
  readonly sequentialMedianUs: number;
  readonly firstMismatch: string;
}

const randomEvery = 8;
const median = (xs: readonly number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? NaN;

/** What the generator says is active at `t` ms in the scenes region: the State `enter <= t < leave`, or the Beat `start <= t < end`. */
const expected = (declared: Declared, t: number): string => {
  const state = declared.states.find((s) => s.enterMs <= t && t < s.leaveMs);
  if (state !== undefined) return state.id;
  const beat = declared.beats.find((b) => b.startMs <= t && t < b.endMs);
  if (beat !== undefined) return beat.id;
  return "end";
};

/** `{"sc2":"s1"}` -> `sc2.s1`; `"end"` -> `end`. */
const flatten = (value: unknown): string => {
  if (typeof value === "string") return value;
  const [[key, child]] = Object.entries(value as Record<string, unknown>) as [[string, unknown]];
  return `${key}.${flatten(child)}`;
};

export const sampleFrames = (json: MachineJSON, declared: Declared, fps: number): FrameReport => {
  const logic = { root: machineFromJSON(json, { actions: { mark: () => undefined } }) };
  const [initial] = initialSystemTransition(logic, { time: 0 });
  const frames = Math.ceil((declared.totalMs * fps) / 1000);
  const random: number[] = [];
  const sequential: number[] = [];
  let mismatches = 0;
  let firstMismatch = "-";
  let rolling = initial;
  const check = (n: number, t: number, snapshot: typeof initial, how: string): void => {
    const seen = flatten((snapshot.actors[snapshot.root]?.snapshot.value as { scenes: unknown }).scenes);
    const want = expected(declared, t);
    if (seen !== want) {
      mismatches += 1;
      if (firstMismatch === "-") firstMismatch = `${how}, frame ${n} (${t} ms): saw ${seen}, expected ${want}`;
    }
  };
  for (let n = 0; n < frames; n++) {
    const t = (n * 1000) / fps;
    const b = performance.now();
    [rolling] = advanceSystemTime(logic, rolling, { time: t });
    sequential.push((performance.now() - b) * 1000);
    check(n, t, rolling, "sequential");
    if (n % randomEvery === 0) {
      const a = performance.now();
      const [s] = advanceSystemTime(logic, initial, { time: t });
      random.push((performance.now() - a) * 1000);
      check(n, t, s, "random access");
    }
  }
  return {
    fps,
    frames,
    randomAccessSamples: random.length,
    mismatches,
    randomAccessMedianUs: Math.round(median(random)),
    randomAccessMaxUs: Math.round(Math.max(...random)),
    sequentialMedianUs: Math.round(median(sequential)),
    firstMismatch,
  };
};
