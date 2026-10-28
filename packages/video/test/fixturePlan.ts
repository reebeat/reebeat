// A small scheduled Plan written by hand (not produced by the parser): three Scenes at 30 fps, about 7 s.
//
//   sc1  default, slide frame 0    "One two three four."  [[next]] after "two", [[sfx: pop]] after "four."
//   sc2  auto-animate, frame 81    "Five six seven."      [[focus: a]] after "Five"
//   sc3  cut, frame 156            "Done."
//
// Every frame below was worked out by hand with the core's rules: a Line starts `sceneLead` (1 s) after its slide
// frame; a Line ends its audio duration later; a Scene ends `sceneTail` (0.5 s) after its last Line; a Cue fires at
// `Line start + round(30 * word end)`; `commandFrame` is `fireFrame - 1` for next and focus, `fireFrame` for sfx.
import type { Line, PlanJson } from "@reebeat/core";
import { Array as Arr, Result } from "effect";

import { requireTimeline } from "../src/timedPlan.ts";
import type { TimedPlan } from "../src/timedPlan.ts";

/** Words of 300 ms starting at 0, each spoken for 280 ms, placed at `lineStartFrame`. */
const words = (texts: readonly string[], lineStartFrame: number) =>
  Arr.map(texts, (w, index) => ({
    endFrame: lineStartFrame + Math.round(((index * 300 + 280) * 30) / 1000),
    endMs: index * 300 + 280,
    startFrame: lineStartFrame + Math.round((index * 300 * 30) / 1000),
    startMs: index * 300,
    w,
  }));

/** A cache file name of the Plan contract: 64 hex digits and `.flac`; `n` picks the digits. */
export const audioFile = (n: number): string =>
  `${n.toString(16).repeat(64)}.flac`;

export const fixtureHash =
  "5ca1ab1e5ca1ab1e5ca1ab1e5ca1ab1e5ca1ab1e5ca1ab1e5ca1ab1e5ca1ab1e";

export const fixturePlan: PlanJson = {
  author: "Fixture",
  chapters: [
    { id: "ch1", line: 3, sceneIds: ["sc1", "sc2"], title: "Part one" },
    { id: "ch2", line: 20, sceneIds: ["sc3"], title: "Part two; =#\\ marks" },
  ],
  scenes: [
    {
      chapterId: "ch1",
      elements: [
        {
          cell: "tl",
          classes: ["box"],
          hidden: false,
          id: "a",
          line: 6,
          text: "Box",
        },
        {
          cell: "br",
          classes: ["label"],
          hidden: true,
          id: "b",
          line: 7,
          text: "Later",
        },
      ],
      heading: "INT. ONE",
      id: "sc1",
      identity: null,
      line: 5,
      lines: [
        {
          cues: [
            {
              afterWord: 1,
              arg: null,
              id: "sc1.l1.c1",
              kind: "next",
              line: 10,
            },
            {
              afterWord: 3,
              arg: "pop",
              id: "sc1.l1.c2",
              kind: "sfx",
              line: 10,
            },
          ],
          hints: { pauseBefore: 0, speed: 1 },
          id: "sc1.l1",
          line: 10,
          text: "One two three four.",
          words: ["One", "two", "three", "four."],
        },
      ],
      transition: "default",
    },
    {
      chapterId: "ch1",
      elements: [
        {
          cell: "br",
          classes: ["box", "accent"],
          hidden: false,
          id: "a",
          line: 14,
          text: "Box",
        },
        {
          cell: "tl",
          classes: ["label"],
          hidden: false,
          id: "d",
          line: 15,
          text: "Entering",
        },
      ],
      heading: "INT. TWO",
      id: "sc2",
      identity: {
        enter: ["d"],
        exit: ["b"],
        same: [],
        update: [{ changes: ["cell", "classes"], id: "a" }],
      },
      line: 13,
      lines: [
        {
          cues: [
            {
              afterWord: 0,
              arg: "a",
              id: "sc2.l1.c1",
              kind: "focus",
              line: 18,
            },
          ],
          hints: { pauseBefore: 0, speed: 1 },
          id: "sc2.l1",
          line: 18,
          text: "Five six seven.",
          words: ["Five", "six", "seven."],
        },
      ],
      transition: "auto-animate",
    },
    {
      chapterId: "ch2",
      elements: [
        {
          cell: "mc",
          classes: ["title"],
          hidden: false,
          id: "c",
          line: 23,
          text: "Done",
        },
      ],
      heading: "INT. THREE",
      id: "sc3",
      identity: null,
      line: 21,
      lines: [
        {
          cues: [],
          hints: { pauseBefore: 0, speed: 1 },
          id: "sc3.l1",
          line: 25,
          text: "Done.",
          words: ["Done."],
        },
      ],
      transition: "cut",
    },
  ],
  schema: 1,
  settings: {
    fps: 30,
    height: 720,
    lineGap: 0.5,
    sceneLead: 1,
    sceneTail: 0.5,
    transition: 0.8,
    voice: "af_heart",
    width: 1280,
  },
  sourceSha256: fixtureHash,
  timeline: {
    chapters: [
      { chapterId: "ch1", startFrame: 0 },
      { chapterId: "ch2", startFrame: 156 },
    ],
    scenes: [
      {
        endFrame: 81,
        lines: [
          {
            audio: { file: audioFile(1), sha256: "00" },
            cues: [
              { commandFrame: 46, cueId: "sc1.l1.c1", fireFrame: 47 },
              { commandFrame: 65, cueId: "sc1.l1.c2", fireFrame: 65 },
            ],
            endFrame: 66,
            lineId: "sc1.l1",
            startFrame: 30,
            words: words(["One", "two", "three", "four."], 30),
          },
        ],
        sceneId: "sc1",
        slideFrame: 0,
      },
      {
        endFrame: 156,
        lines: [
          {
            audio: { file: audioFile(2), sha256: "01" },
            cues: [{ commandFrame: 118, cueId: "sc2.l1.c1", fireFrame: 119 }],
            endFrame: 141,
            lineId: "sc2.l1",
            startFrame: 111,
            words: words(["Five", "six", "seven."], 111),
          },
        ],
        sceneId: "sc2",
        slideFrame: 81,
      },
      {
        endFrame: 219,
        lines: [
          {
            audio: { file: audioFile(3), sha256: "02" },
            cues: [],
            endFrame: 204,
            lineId: "sc3.l1",
            startFrame: 186,
            words: [
              {
                endFrame: 204,
                endMs: 580,
                startFrame: 186,
                startMs: 0,
                w: "Done.",
              },
            ],
          },
        ],
        sceneId: "sc3",
        slideFrame: 156,
      },
    ],
    totalFrames: 219,
  },
  title: "Fixture: a small story",
};

/** The fixture Plan with its Timeline checked against its Scenes. */
export const timedFixture = (): TimedPlan => {
  const result = requireTimeline(fixturePlan);

  if (Result.isFailure(result)) {
    throw result.failure;
  }

  return result.success;
};

/** The Plan with every Line of every Scene changed by `change`. */
const mapLines = (
  plan: TimedPlan,
  change: (line: Line) => Line
): TimedPlan => ({
  ...plan,
  scenes: Arr.map(plan.scenes, (scene) => ({
    ...scene,
    lines: Arr.map(scene.lines, change),
  })),
});

/** The Plan with the narration text of one Line replaced. */
export const withLineText = (
  plan: TimedPlan,
  lineId: string,
  text: string
): TimedPlan =>
  mapLines(plan, (line) => (line.id === lineId ? { ...line, text } : line));

/** The Plan with the sound every `sfx` Cue asks for replaced. */
export const withSfxArg = (plan: TimedPlan, arg: string): TimedPlan =>
  mapLines(plan, (line) => ({
    ...line,
    cues: Arr.map(line.cues, (cue) =>
      cue.kind === "sfx" ? { ...cue, arg } : cue
    ),
  }));
