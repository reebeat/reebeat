// `buildPlan`: Fountain source in, Plan out (spec 0001, "The source" and "The Plan contract").
import { Array as Arr, Effect, Order, Result } from "effect";

import { resolveCues } from "./cues.ts";
import { planError } from "./errors.ts";
import type { PlanError } from "./errors.ts";
import { identityDiff } from "./identity.ts";
import { parseFountain } from "./parse.ts";
import type { Chapter, Cue, Line, PlanJson, Scene, Settings } from "./plan.ts";
import { adaptTokens } from "./story.ts";
import type { LineDraft, SceneDraft, Story } from "./story.ts";

/** The pacing and canvas defaults of release 1 (spec 0001, "Time"). */
const defaultSettings: Settings = {
  fps: 30,
  height: 720,
  lineGap: 0.5,
  sceneLead: 1,
  sceneTail: 0.5,
  transition: 0.8,
  voice: "af_heart",
  width: 1280,
};

const untitled = "Untitled";

const buildLine = (draft: LineDraft, sceneId: string, index: number): Line => {
  const id = `${sceneId}.l${index + 1}`;

  return {
    cues: Arr.map(draft.cues, (cue, cueIndex): Cue => ({
      afterWord: cue.afterWord,
      arg: cue.arg,
      id: `${id}.c${cueIndex + 1}`,
      kind: cue.kind,
      line: cue.line,
    })),
    hints: draft.hints,
    id,
    line: draft.line,
    text: draft.text,
    words: draft.words,
  };
};

const buildScenes = (story: Story): readonly Scene[] =>
  Arr.map(story.scenes, (draft: SceneDraft, index): Scene => {
    const id = `sc${index + 1}`;
    const previous = story.scenes[index - 1];

    return {
      chapterId: `ch${draft.chapterIndex + 1}`,
      elements: draft.elements,
      heading: draft.heading,
      id,
      identity:
        draft.transition === "auto-animate" && previous !== undefined
          ? identityDiff(previous.elements, draft.elements)
          : null,
      line: draft.line,
      lines: Arr.map(draft.lines, (line, lineIndex) =>
        buildLine(line, id, lineIndex)
      ),
      transition: draft.transition,
    };
  });

const buildChapters = (story: Story): readonly Chapter[] =>
  Arr.map(story.chapters, (draft, index): Chapter => {
    const chapter: Chapter = {
      id: `ch${index + 1}`,
      line: draft.line,
      sceneIds: Arr.flatMap(story.scenes, (scene, sceneIndex) =>
        scene.chapterIndex === index ? [`sc${sceneIndex + 1}`] : []
      ),
      title: draft.title,
    };

    return draft.synopsis.length === 0
      ? chapter
      : { ...chapter, synopsis: Arr.join(draft.synopsis, " ") };
  });

const byLine = Order.mapInput(Order.Number, (found: PlanError) => found.line);

/** Every error of the source, in document order (ties keep the order they were found in). */
const errorsOf = (story: Story): readonly PlanError[] =>
  Arr.sort(
    [
      ...story.errors,
      ...Arr.flatMap(story.scenes, (scene) => resolveCues(scene)),
      ...(story.scenes.length === 0
        ? [
            planError(
              "EmptyStory",
              1,
              "the source has no Scene: write a scene heading"
            ),
          ]
        : []),
    ],
    byLine
  );

/**
 * Reads one Fountain source into the checked Story. A failure carries every error found, in document order.
 */
const analyzeSource = (
  source: string
): Result.Result<Story, Arr.NonEmptyReadonlyArray<PlanError>> => {
  const story = adaptTokens(parseFountain(source));
  const errors = errorsOf(story);

  return Arr.isReadonlyArrayNonEmpty(errors)
    ? Result.fail(errors)
    : Result.succeed(story);
};

/** Assembles the Plan (without a `timeline`) of a checked Story. */
const assemblePlan = (story: Story, sourceSha256: string): PlanJson => {
  const plan: PlanJson = {
    chapters: buildChapters(story),
    scenes: buildScenes(story),
    schema: 1,
    settings: defaultSettings,
    sourceSha256,
    title: story.title ?? untitled,
  };

  return story.author === undefined ? plan : { ...plan, author: story.author };
};

/** Every error `buildPlan` could report for `source`, in document order; empty when the source is valid. */
export const collectErrors = (source: string): readonly PlanError[] =>
  Result.match(analyzeSource(source), {
    onFailure: (errors) => errors,
    onSuccess: () => [],
  });

/**
 * Builds the Plan of a Fountain source, or fails with the first error in document order. Deterministic: the
 * same source and hash give the same Plan. `sourceSha256` is the SHA-256 of the `.fountain` bytes, computed by the
 * caller (the CLI, with Effect's Crypto service) and copied verbatim into `plan.sourceSha256`: the core stays pure.
 */
export const buildPlan = Effect.fn("buildPlan")(
  (source: string, sourceSha256: string) =>
    Effect.fromResult(
      Result.map(
        Result.mapError(analyzeSource(source), Arr.headNonEmpty),
        (story) => assemblePlan(story, sourceSha256)
      )
    )
);
