// `artifact_observe` (spec 0016, G8): what a model can use from a build without opening media. One reading per kind: a
// frame (as an image block, by frame, time or the frame an effect fires at), the loudness and onsets of an audio window,
// the subtitle cues, the chapters, the streams. Every kind is bounded: a frame is at most `maxBytes`, an audio window at
// most `maxWindowMs`, a list is paged.
import {
  flicksOfMilliseconds,
  frameToMs,
  framesOfFlicks,
  rateOf,
} from "@tsukuri/core";
import {
  Invalid,
  Observer,
  Projects,
  artifactObserve,
  untrusted,
} from "@tsukuri/lifecycle";
import type { BuildRecord } from "@tsukuri/lifecycle";
import { Array as Arr, Effect, Option } from "effect";
import type { Schema } from "effect";

import { bind } from "./bind.ts";
import type { Outcome } from "./bind.ts";
import { present } from "./optional.ts";
import { clip, pageItems } from "./pages.ts";
import { count, requireBuild, timedPlanOf } from "./readers.ts";
import { parseVtt } from "./vtt.ts";

type Input = Schema.Schema.Type<typeof artifactObserve.input>;

type Value = Schema.Schema.Type<typeof artifactObserve.output>;

/** The largest audio window in one call: 200 buckets of 100 ms keep the result well under the budget. */
const maxWindowMs = 20_000;

const defaultMaxBytes = 65_536;

const invalid = (message: string) => Effect.fail(new Invalid({ message }));

/** The fields every kind of result starts from. */
const baseOf = (input: Input, record: BuildRecord) => ({
  build: record.id,
  kind: input.kind,
  project: input.project,
});

type Timed = Effect.Success<ReturnType<typeof timedPlanOf>>;

/** The frame an `at` names: a frame, a time, or the frame an effect of a scene fires at in the build's timeline. */
const frameAt = (
  plan: Timed,
  rate: ReturnType<typeof rateOf>,
  at: NonNullable<Input["at"]>
) => {
  if ("frame" in at) {
    return Effect.succeed(at.frame);
  }

  if ("ms" in at) {
    return Effect.succeed(framesOfFlicks(rate, flicksOfMilliseconds(at.ms)));
  }

  const instance = at.instance ?? 1;

  const fires = Arr.filter(
    Option.match(
      Arr.findFirst(
        plan.timeline.scenes,
        (candidate) => candidate.sceneId === at.scene
      ),
      { onNone: () => [], onSome: (found) => found.effects }
    ),
    (timed) => timed.effectId === at.effect
  );

  return Option.match(Arr.get(fires, instance - 1), {
    onNone: () =>
      invalid(
        `the timeline has no effect ${at.effect} (instance ${instance}) in scene ${at.scene}`
      ),
    onSome: (chosen) => Effect.succeed(chosen.fireFrame),
  });
};

const observeFrame = (input: Input, record: BuildRecord) =>
  Effect.gen(function* frameOf() {
    const { at } = input;

    if (at === undefined) {
      return yield* invalid(
        "kind frame needs `at`: {frame}, {ms} or {scene, effect}"
      );
    }

    const observer = yield* Observer;
    const plan = yield* timedPlanOf(input.project, record);
    const rate = rateOf(plan.settings);

    const frame = yield* frameAt(plan, rate, at);

    if (frame >= plan.timeline.totalFrames) {
      return yield* invalid(
        `frame ${frame} is past the last frame, ${plan.timeline.totalFrames - 1}`
      );
    }

    const image = yield* observer.frame(record.files, {
      frame,
      frameSeconds: rate.den / rate.num,
      maxBytes: input.maxBytes ?? defaultMaxBytes,
      seconds: (frame * rate.den) / rate.num,
    });

    const ms = frameToMs(frame, plan.settings.fps);

    return {
      frame: image,
      summary: `${input.project}: frame ${frame} (${ms} ms), ${image.width}x${image.height}, ${image.bytes.byteLength} bytes`,
      value: {
        ...baseOf(input, record),
        frame: {
          bytes: image.bytes.byteLength,
          frame,
          height: image.height,
          mimeType: image.mimeType,
          ms,
          width: image.width,
        },
      },
    } satisfies Outcome<Value>;
  });

const observeAudio = (input: Input, record: BuildRecord) =>
  Effect.gen(function* audioOf() {
    const { fromMs, toMs } = input;

    if (fromMs === undefined || toMs === undefined || toMs <= fromMs) {
      return yield* invalid(
        "kind audio needs fromMs and toMs with toMs after fromMs"
      );
    }

    if (toMs - fromMs > maxWindowMs) {
      return yield* invalid(
        `the audio window is at most ${maxWindowMs} ms; ask for it in pieces`
      );
    }

    const stats = yield* (yield* Observer).audio(record.files, {
      fromMs,
      toMs,
    });

    return {
      summary: `${input.project}: audio ${fromMs} to ${toMs} ms, ${count(stats.buckets.length, "bucket")}, ${count(stats.onsetsMs.length, "onset")}`,
      value: {
        ...baseOf(input, record),
        audio: {
          buckets: stats.buckets,
          fromMs,
          onsetsMs: stats.onsetsMs,
          toMs,
        },
      },
    } satisfies Outcome<Value>;
  });

const observeSubtitles = (input: Input, record: BuildRecord) =>
  Effect.gen(function* subtitlesOf() {
    const projects = yield* Projects;

    const text = yield* projects.buildText(
      input.project,
      record.id,
      "subtitles"
    );

    const cues = parseVtt(text);

    const page = pageItems(cues, input);

    return {
      summary: `${input.project}: ${count(cues.length, "subtitle cue")}, showing ${page.items.length}`,
      value: {
        ...baseOf(input, record),
        ...present("nextCursor", page.nextCursor),
        subtitles: {
          cues: Arr.map(page.items, (cue) => ({
            endMs: cue.endMs,
            startMs: cue.startMs,
            text: untrusted(cue.text),
          })),
          total: cues.length,
        },
      },
    } satisfies Outcome<Value>;
  });

const observeMedia = (input: Input, record: BuildRecord) =>
  Effect.gen(function* mediaOf() {
    const media = yield* (yield* Observer).media(record.files);
    const base = baseOf(input, record);

    if (input.kind === "chapters") {
      return {
        summary: `${input.project}: ${count(media.chapters.length, "chapter")}`,
        value: {
          ...base,
          chapters: Arr.map(media.chapters, (chapter) => ({
            endMs: chapter.endMs,
            startMs: chapter.startMs,
            ...present(
              "title",
              chapter.title === undefined
                ? undefined
                : untrusted(clip(chapter.title, 200))
            ),
          })),
        },
      } satisfies Outcome<Value>;
    }

    return {
      summary: `${input.project}: ${count(media.streams.length, "stream")}`,
      value: { ...base, streams: media.streams },
    } satisfies Outcome<Value>;
  });

export const observe = bind(artifactObserve, (input) =>
  Effect.gen(function* observed() {
    const record = yield* requireBuild(input.project, input.build);

    if (input.kind === "frame") {
      return yield* observeFrame(input, record);
    }

    if (input.kind === "audio") {
      return yield* observeAudio(input, record);
    }

    return input.kind === "subtitles"
      ? yield* observeSubtitles(input, record)
      : yield* observeMedia(input, record);
  })
);
