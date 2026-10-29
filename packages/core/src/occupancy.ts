// What a machine does in one Scene (spec 0004): the intervals during which it is in each of its states, from the
// transitions that happen and the windows they have. The initial state holds from the Scene's first frame to the start
// of the first transition; a transition's `during` state for its window; the state it reaches until the next
// transition or the end of the Scene. The slide change at the end of the Scene leaves every state, so the last interval
// ends at the Scene's last frame (SMIL: the parent ends its children). `enter` is the first frame of the first interval
// of a state and `leave` the FIRST FRAME OUT of it: the start of what follows (a Beat's start, a transition's window
// start), and for the interval still held at the end of the Scene the frame after its last frame, which is the next
// slide change (`lastFrameLeave`). Plain functions; the windows are frames when a Scene is scheduled and any increasing
// numbers when the question is only which states a Scene reaches.
import { Array as Arr, Option, Order } from "effect";

import { once } from "./combinators.ts";
import type { Event, Window } from "./combinators.ts";
import type { Machine } from "./machines.ts";

/** A transition that happens in the Scene, with its window. */
export interface Happening {
  readonly name: string;
  readonly window: Window;
}

/** The machine is in `state` over `window`; `open`: the Scene ended while it was there. */
export interface Interval {
  readonly open: boolean;
  readonly state: string;
  readonly window: Window;
}

const noIntervals: readonly Interval[] = [];

const byStart = Order.mapInput(
  Order.Number,
  ({ window }: Happening) => window.start
);

/** The intervals of the machine in a Scene `scene` frames long, in time order. */
export const occupancies = (
  machine: Machine,
  initial: string,
  happenings: readonly Happening[],
  scene: Window
): readonly Interval[] => {
  const ordered = Arr.sort(happenings, byStart);

  const cursor = Arr.reduce(
    ordered,
    {
      from: scene.start,
      intervals: noIntervals,
      state: initial,
    },
    (found, happening) =>
      Option.match(
        Arr.findFirst(
          machine.transitions,
          ({ name }) => name === happening.name
        ),
        {
          onNone: () => found,
          onSome: (transition) => ({
            from: happening.window.end,
            intervals: [
              ...found.intervals,
              {
                open: false,
                state: found.state,
                window: { end: happening.window.start, start: found.from },
              },
              {
                open: false,
                state: transition.during,
                window: happening.window,
              },
            ],
            state: transition.to,
          }),
        }
      )
  );

  return [
    ...cursor.intervals,
    {
      open: true,
      state: cursor.state,
      window: { end: scene.end, start: cursor.from },
    },
  ];
};

/** The frame after the Scene's last frame: the first frame out of a state still held when the Scene ends. */
export const lastFrameLeave = (lastFrame: number): number => lastFrame + 1;

/**
 * The event of a state: the first frame of its first interval (`enter`) or the first frame out of it (`leave`); never
 * when the state is not reached. The interval held to the end of the Scene is left at the frame after the Scene's last.
 */
export const stateEvent = (
  intervals: readonly Interval[],
  state: string,
  event: "enter" | "leave"
): Event =>
  Option.match(
    Arr.findFirst(intervals, (interval) => interval.state === state),
    {
      onNone: () => [],
      onSome: ({ open, window }) => {
        if (event === "enter") {
          return once(window.start, window);
        }

        return once(open ? lastFrameLeave(window.end) : window.end, window);
      },
    }
  );

/** Whether the machine reaches `state` at all. */
export const reaches = (
  intervals: readonly Interval[],
  state: string
): boolean => Arr.some(intervals, (interval) => interval.state === state);

/**
 * The first frame of State `n` (1-based): the later of the Scene's slide frame and the ends of Beats 1 to n-1, so a
 * State is never entered before the one it follows even when Beats overlap. `beatEnds` are the ends of the Beats in
 * time order. The one definition the schedule and the verifier share.
 */
export const stateStart = (
  slideFrame: number,
  beatEnds: readonly number[],
  n: number
): number =>
  Arr.reduce(Arr.take(beatEnds, n - 1), slideFrame, (earliest, end) =>
    Math.max(earliest, end)
  );
