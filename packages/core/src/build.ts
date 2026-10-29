// `buildPlan`: Fountain source in, Plan out (spec 0001, "The source" and "The Plan contract"; spec 0002 for the
// effects; spec 0004 for the IR). The Fountain reader is an IMPORTER: it reads the source into the IR (`graph.ts`),
// checking it, and the Plan is a function of the IR (`planOf`). Plain functions.
import { Array as Arr, Effect, Order, Result } from "effect";

import type { PlanError } from "./errors.ts";
import { graphVersion } from "./graph.ts";
import type { Graph, GraphScene, ImportErrors, Importer } from "./graph.ts";
import { withIdentity } from "./identity.ts";
import { parseFountain } from "./parse.ts";
import type { Chapter, PlanJson, Settings } from "./plan.ts";
import { adaptTokens } from "./story.ts";
import type { SceneDraft, Story } from "./story.ts";
import { validateGraph } from "./structure.ts";

/** The pacing and canvas defaults of release 1 (spec 0001, "Time"); the speech rate comes from the Story. */
const defaultSettings: Omit<Settings, "fps" | "ntsc" | "speed"> = {
  height: 720,
  lineGap: 0.5,
  sceneLead: 1,
  sceneTail: 0.5,
  transition: 0.8,
  voice: "af_heart",
  width: 1280,
};

/** The render setting that is not in the IR: the output frame rate. The default is 30 fps. */
export type RenderRate = Pick<Settings, "fps" | "ntsc">;

const defaultRate: RenderRate = { fps: 30, ntsc: false };

const untitled = "Untitled";

const graphScenes = (story: Story): readonly GraphScene[] =>
  Arr.map(story.scenes, (draft: SceneDraft): GraphScene => {
    const { id } = draft;

    return {
      chapterId: `ch${draft.chapterIndex + 1}`,
      effects: draft.effects,
      elements: draft.elements,
      events: draft.events,
      heading: draft.heading,
      id,
      line: draft.line,
      lines: draft.lines,
      transition: draft.transition,
    };
  });

const buildChapters = (story: Story): readonly Chapter[] =>
  Arr.map(story.chapters, (draft, index): Chapter => {
    const chapter: Chapter = {
      id: `ch${index + 1}`,
      line: draft.line,
      title: draft.title,
    };

    return draft.synopsis.length === 0
      ? chapter
      : { ...chapter, synopsis: Arr.join(draft.synopsis, " ") };
  });

/** The Story as the IR: what the source declared. */
const graphOf = (story: Story): Graph => {
  const graph: Graph = {
    chapters: buildChapters(story),
    scenes: graphScenes(story),
    speed: story.speed,
    title: story.title ?? untitled,
    version: graphVersion,
  };

  return story.author === undefined
    ? graph
    : { ...graph, author: story.author };
};

/**
 * The Plan (without a `timeline`) of the IR: a function of it, of the hash of the source it came from and of the
 * render's frame rate (30 fps unless a preset is given). Time in the IR is exact; frames appear only in the Timeline.
 */
export const planOf = (
  graph: Graph,
  sourceSha256: string,
  rate: RenderRate = defaultRate
): PlanJson => {
  const plan: PlanJson = {
    chapters: graph.chapters,
    scenes: withIdentity(graph.scenes),
    schema: 1,
    settings: { ...defaultSettings, ...rate, speed: graph.speed },
    sourceSha256,
    title: graph.title,
  };

  return graph.author === undefined ? plan : { ...plan, author: graph.author };
};

const byLine = Order.mapInput(Order.Number, (found: PlanError) => found.line);

/** Every error of the source, in document order (ties keep the order they were found in). */
const errorsOf = (story: Story): readonly PlanError[] =>
  Arr.sort(
    [
      ...story.errors,
      // The one check of the IR (`structure.ts`), the same the JSON codec runs. A Scene with an error on one of its lines,
      // or that no Section holds, is not cross-checked: its references would only echo it.
      ...validateGraph(graphOf(story), {
        invalid: (index) => {
          const draft = story.scenes[index];

          return (
            draft === undefined || draft.invalid || draft.chapterIndex === -1
          );
        },
      }),
    ],
    byLine
  );

/**
 * The Fountain importer: reads one Fountain source into the IR and checks it. A failure carries every error found, in
 * document order. One way: nothing writes Fountain, and what Fountain cannot say is not in the IR.
 */
export const fountainImporter: Importer<string> = {
  import: (source: string): Result.Result<Graph, ImportErrors> => {
    const story = adaptTokens(parseFountain(source));
    const errors = errorsOf(story);

    return Arr.isReadonlyArrayNonEmpty(errors)
      ? Result.fail(errors)
      : Result.succeed(graphOf(story));
  },
};

/** Every error `buildPlan` could report for `source`, in document order; empty when the source is valid. */
export const collectErrors = (source: string): readonly PlanError[] =>
  Result.match(fountainImporter.import(source), {
    onFailure: (errors) => errors,
    onSuccess: () => [],
  });

/**
 * Builds the Plan of a Fountain source, or fails with the first error in document order. Deterministic: the
 * same source and hash give the same Plan. `sourceSha256` is the SHA-256 of the `.fountain` bytes, computed by the
 * caller (the CLI, with Effect's Digest service) and copied verbatim into `plan.sourceSha256`: the core stays pure.
 */
export const buildPlan = Effect.fn("buildPlan")(
  (source: string, sourceSha256: string) =>
    Effect.fromResult(
      Result.map(
        Result.mapError(fountainImporter.import(source), Arr.headNonEmpty),
        (graph) => planOf(graph, sourceSha256)
      )
    )
);
