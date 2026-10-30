// The canonical intermediate representation (IR) of a Story: the state and beat graph, as a closed, versioned Effect
// Schema (spec 0004). A Story declares what the viewer sees (Elements, the sets of Elements that make a State),
// how the narration is cut into Lines, and which effects and derived events subscribe to the events the engine
// generates from the graph. The Plan is a function of it (`planOf`: identity diff, settings), and every format is one
// of three kinds, kept apart in the types:
//
//   IrCodec<Encoded>          encode and decode, with the law `decode(encode(ir))` equals `ir`; JSON is the canonical one
//   Importer<Foreign>         a foreign format into the IR, one way, may lose information, its output reviewed; the
//                             Fountain reader is one
//   ArtifactRenderer<Output>  the IR out to an artifact, never read back: the Video, the Deck, subtitles
//
// An artifact has no `decode` and an importer has no `encode`, so nothing can be read back that is not a codec. A change
// of the IR is a new `version`, and a migration is a codec between two versions. Plain data and plain functions.
import { Array as Arr, JsonSchema, Result, Schema, Struct } from "effect";

import type { PlanError } from "./errors.ts";
import { ChapterSchema, SceneSchema, SpeedSchema, construct } from "./plan.ts";
import { validateGraph } from "./structure.ts";

/** The version of the IR this build reads and writes. */
export const graphVersion = 1;

/** A Scene as declared: its Elements, Lines, effects and derived events. Its identity diff is derived, not declared. */
const GraphSceneSchema = SceneSchema.mapFields(
  Struct.omit(["identity"])
).annotate(
  construct(
    "GraphScene",
    "Harel 1987, depth (a Scene is a compound State, a superstate of its States); SCXML compound <state>; SMIL 3.0 timing, a time container whose end ends its children",
    "A Scene as declared: its Elements, Lines, effects and derived events.",
    "The States inside a Scene are not declared: the engine derives them from the step frames; the identity diff against the previous Scene is derived, not declared; a Scene is left at its last frame, which ends every effect running in it."
  )
);

/** The IR of a Story: closed (an unknown key is a decode error) and versioned. */
export const GraphSchema = Schema.Struct({
  author: Schema.optionalKey(Schema.String),
  chapters: Schema.Array(ChapterSchema),
  scenes: Schema.Array(GraphSceneSchema),
  /** The story's default speech rate (`Speed:` of the title page). */
  speed: SpeedSchema,
  title: Schema.String,
  version: Schema.Literal(graphVersion),
}).annotate(
  construct(
    "Graph",
    "SCXML 1.0, <scxml> root; Harel 1987, statecharts (a hierarchy of States with orthogonal regions)",
    "The IR of a Story: the state and beat graph, as a closed, versioned document.",
    "Closed (an excess key is a decode error) and versioned (an other version is a decode error); the machines are declared once in the engine, a Story declares only its Scenes, Elements, Lines and effects."
  )
);

export type Graph = typeof GraphSchema.Type;

export type GraphScene = typeof GraphSceneSchema.Type;

/** What a failed import carries: every error found, in document order. */
export type ImportErrors = Arr.NonEmptyReadonlyArray<PlanError>;

/** A codec: the IR to an encoded form and back, losing nothing. */
export interface IrCodec<Encoded> {
  readonly decode: (
    encoded: Encoded
  ) => Result.Result<Graph, Schema.SchemaError>;
  readonly encode: (graph: Graph) => Result.Result<Encoded, Schema.SchemaError>;
}

/** An importer: a foreign format into the IR. One way; what it cannot carry is lost, and its output is reviewed. */
export interface Importer<Foreign> {
  readonly import: (foreign: Foreign) => Result.Result<Graph, ImportErrors>;
}

/** An artifact renderer: the IR out to an artifact. It has no inverse. */
export interface ArtifactRenderer<Output> {
  readonly render: (graph: Graph) => Output;
}

/**
 * The shape of the IR and the rules of a Story: a Graph is a valid Story, not only a well-shaped document. The one
 * checker of the IR (`structure.ts`) runs on every decode and every encode of the codec, so a hand-written IR is held
 * to the rules of a screenplay and no invalid Graph is written. Each error is reported with its line, its tag and its
 * message. The JSON Schema is generated from `GraphSchema` alone: a rule of this kind has no JSON Schema form.
 */
const checkedGraph = GraphSchema.check(
  Schema.makeFilter((graph) =>
    Arr.map(
      validateGraph(graph),
      (found) => `line ${found.line}, ${found._tag}: ${found.message}`
    )
  )
);

const graphJson = Schema.fromJsonString(checkedGraph, { space: 2 });

/** The canonical codec: JSON text, two-space indent. An excess key, another version or a broken rule is a decode error. */
export const jsonCodec: IrCodec<string> = {
  decode: Schema.decodeUnknownResult(graphJson, { onExcessProperty: "error" }),
  encode: Schema.encodeResult(graphJson),
};

/** The `$id` of the JSON Schema of this version of the IR. */
export const graphSchemaId = `https://github.com/tsukuri-labs/tsukuri/schema/ir/${graphVersion}`;

const jsonText = Schema.encodeResult(
  Schema.fromJsonString(Schema.Unknown, { space: 2 })
);

/**
 * The JSON Schema (draft 2020-12) of the IR, as the text of `docs/schema/tsukuri-ir.schema.json`: a pure function of
 * `GraphSchema` (spec 0004). Every construct is a named definition; its provenance annotations `origin` and `deviation`
 * are emitted as extra keywords of its definition, beside `description`. The document is closed, as the decoder is.
 */
export const graphJsonSchema = (): Result.Result<
  string,
  Schema.SchemaError
> => {
  const document = Schema.toJsonSchemaDocument(GraphSchema, {
    includeAnnotationKey: (key) => key === "origin" || key === "deviation",
    onExcessProperty: "error",
  });

  return Result.map(
    jsonText({
      $id: graphSchemaId,
      $schema: JsonSchema.META_SCHEMA_URI_DRAFT_2020_12,
      ...document.schema,
      $defs: document.definitions,
    }),
    (text) => `${text}\n`
  );
};
