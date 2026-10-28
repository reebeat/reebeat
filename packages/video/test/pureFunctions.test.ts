// The pure functions of the video stage, against a Plan whose frames were worked out by hand (test/fixturePlan.ts).
import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Order, Predicate, Result } from "effect";

import { audioMixPlan } from "../src/audioMix.ts";
import { captureSchedule, sceneChangeLag } from "../src/captureSchedule.ts";
import { ffmetadata } from "../src/ffmetadata.ts";
import { muxArgs } from "../src/mux.ts";
import { frameToMs, vttTimestamp } from "../src/time.ts";
import { requireTimeline } from "../src/timedPlan.ts";
import type { TimedPlan } from "../src/timedPlan.ts";
import { vtt } from "../src/vtt.ts";
import {
  audioFile,
  fixtureHash,
  fixturePlan,
  withLineText,
  timedFixture,
} from "./fixturePlan.ts";

const timed = timedFixture;

/** The cues of a WebVTT text as [identifier, timing, text] rows. */
const cuesOf = (vttText: string): string[][] =>
  Arr.map(
    Arr.filter(vttText.split("\n\n"), (block) => block.includes("-->")),
    (block) => block.trim().split("\n")
  );

const narrationOf = (plan: TimedPlan): string[] =>
  Arr.flatMap(plan.scenes, (scene) =>
    Arr.map(scene.lines, (line) => line.text)
  );

const subtitleTextOf = (plan: TimedPlan): string[] =>
  Arr.map(cuesOf(vtt(plan)), (cue) => Arr.join(cue.slice(2), " "));

/** The audio mix of a Plan whose sounds are all in the catalogue. */
const mixOf = (plan: TimedPlan) => Result.getOrThrow(audioMixPlan(plan));

const firstOf = <A>(items: readonly A[]): A => {
  const [first] = items;

  assert.isDefined(first);

  return first;
};

describe("time", () => {
  it("frames become milliseconds by rounding 1000 * frame / fps", () => {
    assert.strictEqual(frameToMs(0, 30), 0);
    assert.strictEqual(frameToMs(1, 30), 33);
    assert.strictEqual(frameToMs(65, 30), 2167);
    assert.strictEqual(frameToMs(219, 30), 7300);
  });

  it("a WebVTT timestamp is HH:MM:SS.mmm", () => {
    assert.strictEqual(vttTimestamp(0), "00:00:00.000");
    assert.strictEqual(vttTimestamp(3_723_456), "01:02:03.456");
  });
});

describe("requireTimeline", () => {
  it("fails for a Plan without a Timeline", () => {
    const { timeline: _timeline, ...bare } = fixturePlan;

    assert.isTrue(Result.isFailure(requireTimeline(bare)));
  });

  it("fails when the Timeline names a Line the Plan does not have", () => {
    const plan = {
      ...fixturePlan,
      scenes: Arr.map(fixturePlan.scenes, (scene) => ({ ...scene, lines: [] })),
    };

    assert.isTrue(Result.isFailure(requireTimeline(plan)));
  });
});

describe("vtt", () => {
  it("starts with WEBVTT, the source hash note, then one cue per Line", () => {
    assert.strictEqual(
      vtt(timed()),
      Arr.join(
        [
          "WEBVTT",
          "",
          `NOTE source-sha256 ${fixtureHash}`,
          "",
          "sc1.l1",
          "00:00:01.000 --> 00:00:02.200",
          "One two three four.",
          "",
          "sc2.l1",
          "00:00:03.700 --> 00:00:04.700",
          "Five six seven.",
          "",
          "sc3.l1",
          "00:00:06.200 --> 00:00:06.800",
          "Done.",
          "",
        ],
        "\n"
      )
    );
  });

  it("a stale subtitle file no longer equals the narration after one Line is edited", () => {
    assert.deepStrictEqual(subtitleTextOf(timed()), narrationOf(timed()));

    const edited: TimedPlan = {
      ...timed(),
      scenes: Arr.map(timed().scenes, (scene) => ({
        ...scene,
        lines: Arr.map(scene.lines, (line) =>
          line.id === "sc2.l1" ? { ...line, text: "Five six eight." } : line
        ),
      })),
    };

    // The check compares the subtitles on disk with the narration of the Plan: the edit makes them differ.
    assert.notDeepEqual(subtitleTextOf(timed()), narrationOf(edited));
    assert.deepStrictEqual(subtitleTextOf(edited), narrationOf(edited));
  });
});

describe("vtt escaping", () => {
  const spoken = "Five < six and <b>bold</b> & ok.";

  it("writes & < > as entities, & first, so a reader gets the narration back", () => {
    const text = vtt(withLineText(timed(), "sc2.l1", spoken));

    assert.include(text, "Five &lt; six and &lt;b&gt;bold&lt;/b&gt; &amp; ok.");
    assert.notInclude(text, "<b>");
    assert.strictEqual(
      Arr.join(
        Arr.map(cuesOf(text), (cue) =>
          Arr.join(cue.slice(2), " ")
            .replaceAll("&lt;", "<")
            .replaceAll("&gt;", ">")
            .replaceAll("&amp;", "&")
        ),
        "|"
      ),
      Arr.join(narrationOf(withLineText(timed(), "sc2.l1", spoken)), "|")
    );
  });

  it("does not escape an ampersand twice", () => {
    assert.include(
      vtt(withLineText(timed(), "sc2.l1", "fish &amp; chips")),
      "fish &amp;amp; chips"
    );
  });
});

describe("ffmetadata", () => {
  it("writes one chapter per Section in milliseconds, each ending where the next starts", () => {
    assert.strictEqual(
      ffmetadata(timed()),
      Arr.join(
        [
          ";FFMETADATA1",
          "[CHAPTER]",
          "TIMEBASE=1/1000",
          "START=0",
          "END=5200",
          "title=Part one",
          "[CHAPTER]",
          "TIMEBASE=1/1000",
          "START=5200",
          "END=7300",
          "title=Part two\\; \\=\\#\\\\ marks",
          "",
        ],
        "\n"
      )
    );
  });
});

describe("audioMixPlan", () => {
  it("fails with UnknownSfx for a Cue whose sound the catalogue does not have", () => {
    const plan = timed();

    const broken: TimedPlan = {
      ...plan,
      scenes: Arr.map(plan.scenes, (scene) => ({
        ...scene,
        lines: Arr.map(scene.lines, (line) => ({
          ...line,
          cues: Arr.map(line.cues, (cue) =>
            cue.kind === "sfx" ? { ...cue, arg: "gong" } : cue
          ),
        })),
      })),
    };

    const failure = Result.getOrThrowWith(
      Result.flip(audioMixPlan(broken)),
      () => new Error("expected UnknownSfx")
    );

    assert.isTrue(Predicate.isTagged(failure, "UnknownSfx"));
    assert.strictEqual(failure.cueId, "sc1.l1.c2");
    assert.strictEqual(failure.sound, "gong");
  });

  it("lists the narration FLACs at their Line starts, then the sfx hits at their fire frames", () => {
    const { inputs } = mixOf(timed());

    assert.deepStrictEqual(inputs, [
      {
        file: audioFile(1),
        kind: "narration",
        lineId: "sc1.l1",
        startMs: 1000,
      },
      {
        file: audioFile(2),
        kind: "narration",
        lineId: "sc2.l1",
        startMs: 3700,
      },
      {
        file: audioFile(3),
        kind: "narration",
        lineId: "sc3.l1",
        startMs: 6200,
      },
      { cueId: "sc1.l1.c2", kind: "sfx", name: "pop", startMs: 2167 },
    ]);
  });

  it("delays each input, mixes without normalising and cuts the track to the Video length", () => {
    const { durationSeconds, filterComplex } = mixOf(timed());

    const prepare =
      "aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo";

    assert.strictEqual(durationSeconds, "7.300000");
    assert.strictEqual(
      filterComplex,
      Arr.join(
        [
          `[1:a]${prepare},adelay=1000:all=1[a0]`,
          `[2:a]${prepare},adelay=3700:all=1[a1]`,
          `[3:a]${prepare},adelay=6200:all=1[a2]`,
          `[4:a]${prepare},adelay=2167:all=1[a3]`,
          "[a0][a1][a2][a3]amix=inputs=4:normalize=0:duration=longest:dropout_transition=0,apad=whole_dur=7.300000,atrim=end=7.300000[aout]",
        ],
        ";"
      )
    );
  });
});

describe("captureSchedule", () => {
  it("commands each slide change `lag` frames before its slide frame and each fragment at its Cue's command frame", () => {
    const { commands } = captureSchedule(timed());

    assert.deepStrictEqual(
      Arr.map(commands, ({ frame, source }) => [frame, source]),
      [
        [46, "sc1.l1.c1"],
        [65, "sc1.l1.c2"],
        [81 - sceneChangeLag["auto-animate"], "sc2"],
        [118, "sc2.l1.c1"],
        [156 - sceneChangeLag.cut, "sc3"],
      ]
    );
  });

  it("takes the viewport and the frame rate from the Plan's settings", () => {
    const plan = timed();

    const wide: TimedPlan = {
      ...plan,
      settings: { ...plan.settings, height: 720, width: 1280 },
    };

    const schedule = captureSchedule(wide);

    assert.strictEqual(schedule.width, wide.settings.width);
    assert.strictEqual(schedule.height, wide.settings.height);
    assert.strictEqual(schedule.fps, wide.settings.fps);
  });

  it("is sorted, inside the Video, and has no command for the first Scene", () => {
    const schedule = captureSchedule(timed());
    const frames = Arr.map(schedule.commands, (step) => step.frame);

    assert.deepStrictEqual(frames, Arr.sort(frames, Order.Number));
    assert.isTrue(
      Arr.every(frames, (frame) => frame >= 0 && frame < schedule.totalFrames)
    );
    assert.isFalse(
      Arr.some(schedule.commands, (step) => step.source === "sc1")
    );
  });

  it("each next or focus command precedes its fire frame by one frame, and each slide change its slide frame by the measured lag (a fade 1 frame, a cut and an Auto-Animate 0)", () => {
    const plan = timed();
    const { commands } = captureSchedule(plan);

    const fires = new Map(
      Arr.map(
        Arr.flatMap(plan.timeline.scenes, (scene) =>
          Arr.flatMap(scene.lines, (line) => line.cues)
        ),
        (cue): [string, number] => [cue.cueId, cue.fireFrame]
      )
    );

    const slides = new Map(
      Arr.map(plan.timeline.scenes, (scene): [string, number] => [
        scene.sceneId,
        scene.slideFrame,
      ])
    );

    const transitions = new Map(
      Arr.map(plan.scenes, (scene): [string, string] => [
        scene.id,
        scene.transition,
      ])
    );

    for (const step of commands) {
      const slide = slides.get(step.source);

      if (slide === undefined && step.source !== "sc1.l1.c2") {
        assert.strictEqual((fires.get(step.source) ?? 0) - step.frame, 1);
      } else if (slide !== undefined) {
        assert.strictEqual(
          slide - step.frame,
          transitions.get(step.source) === "default" ? 1 : 0
        );
      }
    }
  });

  it("keeps fragment steps in Cue order: an sfx before a next is commanded no later than the next", () => {
    const plan = timed();
    const first = firstOf(plan.timeline.scenes);
    const line = firstOf(first.lines);

    const swapped: TimedPlan = {
      ...plan,
      timeline: {
        ...plan.timeline,
        scenes: [
          {
            ...first,
            lines: [
              {
                ...line,
                cues: [
                  { commandFrame: 47, cueId: "sc1.l1.c2", fireFrame: 47 },
                  { commandFrame: 46, cueId: "sc1.l1.c1", fireFrame: 47 },
                ],
              },
            ],
          },
          ...Arr.drop(plan.timeline.scenes, 1),
        ],
      },
    };

    const steps = Arr.filter(
      captureSchedule(swapped).commands,
      (step) => step.command.kind === "stepFragment"
    );

    assert.deepStrictEqual(
      Arr.map(Arr.take(steps, 2), ({ frame, source }) => [frame, source]),
      [
        [46, "sc1.l1.c2"],
        [46, "sc1.l1.c1"],
      ]
    );
  });
});

describe("muxArgs", () => {
  const plan = timed();

  const args = muxArgs(plan, mixOf(plan), {
    ffmetadata: "/s/chapters.ffmetadata",
    narrationDir: "/cache",
    output: "/s/out.mp4",
    sfxDir: "/s/sfx",
    vtt: "/s/out.vtt",
  });

  /** Whether `sequence` occurs in `args` as consecutive arguments. */
  const has = (sequence: readonly string[]): boolean =>
    Arr.some(args, (_, index) =>
      Arr.every(sequence, (value, offset) => args[index + offset] === value)
    );

  it("encodes the video, audio and subtitles as specified", () => {
    assert.isTrue(
      has([
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "18",
        "-pix_fmt",
        "yuv420p",
      ])
    );
    assert.isTrue(has(["-r", "30", "-threads", "4"]));
    assert.isTrue(
      has(["-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2"])
    );
    assert.isTrue(has(["-c:s", "mov_text"]));
    assert.isTrue(has(["-movflags", "+faststart"]));
  });

  it("carries the determinism flags, the title and the source hash", () => {
    assert.isTrue(
      has([
        "-fflags",
        "+bitexact",
        "-flags:v",
        "+bitexact",
        "-flags:a",
        "+bitexact",
      ])
    );
    assert.isTrue(has(["-map_metadata:g", "-1"]));
    assert.isTrue(has(["-metadata", "title=Fixture: a small story"]));
    assert.isTrue(
      has(["-metadata", `comment=reebeat source-sha256 ${fixtureHash}`])
    );
  });

  it("reads the frames from stdin first, then the audio, the subtitles and the chapters", () => {
    assert.isTrue(
      has([
        "-f",
        "image2pipe",
        "-framerate",
        "30",
        "-c:v",
        "png",
        "-i",
        "pipe:0",
      ])
    );
    assert.isTrue(
      has([
        "-i",
        `/cache/${audioFile(1)}`,
        "-i",
        `/cache/${audioFile(2)}`,
        "-i",
        `/cache/${audioFile(3)}`,
        "-i",
        "/s/sfx/pop.wav",
        "-i",
        "/s/out.vtt",
        "-i",
        "/s/chapters.ffmetadata",
      ])
    );
    assert.isTrue(has(["-map", "5:s", "-map_chapters", "6"]));
  });
});
