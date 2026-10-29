// The JSON Schema of the IR (spec 0004, Revisions "the JSON Schema is generated"): `docs/schema/reebeat-ir.schema.json`
// is the text `graphJsonSchema()` writes (so an edit of the Effect Schema fails until `bun tools/quality/genJsonSchema.ts`
// is run), and every construct of the IR is a named definition that says where it comes from (`origin`) and where its
// meaning differs (`deviation`). A construct that loses its `origin` fails here.
import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Effect, Predicate, Record, Schema } from "effect";

import { graphJsonSchema, graphSchemaId, graphVersion } from "../src/graph.ts";
import { readLocal } from "./support.ts";

const checkedIn = readLocal("../../../docs/schema/reebeat-ir.schema.json");

const documentOf = Schema.decodeUnknownEffect(
  Schema.fromJsonString(Schema.Json)
);

/** Where each construct of the IR comes from: what its `origin` must name (the table the construct catalogue prints). */
const origins: Readonly<Record<string, string>> = {
  AbsoluteWhen: "SMIL 3.0 timing",
  Anchor: "SMIL 3.0 timing",
  AnchorEvent: "SMIL 3.0 timing",
  BeatSubject: "Harel 1987",
  Chapter: "Fountain 1.1",
  DerivedEvent: "Fran",
  Duration: "SMIL 3.0 timing",
  EachEvent: "SMIL 3.0 timing",
  EdgeAnchor: "SMIL 3.0 timing",
  Effect: "Mealy and Moore",
  EffectSubject: "SMIL 3.0 timing",
  Element: "Harel 1987",
  ElementSubject: "SMIL 3.0 timing",
  EventExpr: "Fran",
  EventWhen: "SMIL 3.0 timing",
  FirstEvent: "SMIL 3.0 timing",
  Graph: "SCXML 1.0",
  GraphScene: "Harel 1987",
  LastEvent: "SMIL 3.0 timing",
  Line: "Fountain 1.1",
  LineHints: "Fountain 1.1",
  OccupancyAnchor: "Harel 1987",
  Offset: "SMIL 3.0 timing",
  PercentOffset: "SMIL 3.0 timing",
  PercentPoint: "Fran",
  Point: "SMIL 3.0 timing",
  RefEvent: "Fran",
  SceneSubject: "SCXML",
  ShiftEvent: "SMIL 3.0 timing",
  StateSubject: "Harel 1987",
  Subject: "SMIL 3.0 timing",
  TimeOffset: "SMIL 3.0 timing",
  Until: "SMIL 3.0 timing",
  When: "SMIL 3.0 timing",
  WithinEvent: "Harel 1987",
  WordAnchor: "SMIL 3.0 timing",
};

/** Where reebeat's meaning differs from its origin, said in the definition: the words each `deviation` must contain. */
const deviations: Readonly<Record<string, string>> = {
  EachEvent: "stagger",
  Effect: 'restart="always"',
  LastEvent: "last occurrence",
  OccupancyAnchor: "slide change",
  TimeOffset: "floor(t x rate + 1/2)",
  Until: "Only on a focus",
};

const definitionsOf = (document: Schema.Json) =>
  Predicate.isObject(document) &&
  Predicate.isObject(document.$defs) &&
  !Arr.isArray(document.$defs)
    ? document.$defs
    : {};

/** The constructs of a JSON Schema document that have no non-empty `origin`. */
const withoutOrigin = (
  definitions: Readonly<Record<string, unknown>>
): readonly string[] =>
  Arr.filter(Record.keys(definitions), (name) => {
    const found = definitions[name];

    return !(
      Predicate.isObject(found) &&
      Predicate.isString(found.origin) &&
      found.origin !== ""
    );
  });

/** Asserts that each construct `expected` names has the words the table gives in its keyword (`origin`, `deviation`). */
const assertKeyword = (
  definitions: Readonly<Record<string, unknown>>,
  expected: Readonly<Record<string, string>>,
  keyword: string
): void => {
  for (const [name, words] of Record.toEntries(expected)) {
    const found = definitions[name];

    assert.isTrue(Predicate.isObject(found), name);

    if (Predicate.isObject(found)) {
      assert.include(String(found[keyword]), words, name);
    }
  }
};

const isJson = Schema.is(Schema.Json);

/** The paths of every schema of type object below `node`. */
const objectPaths = (
  node: Schema.Json,
  path: readonly string[]
): readonly (readonly string[])[] => {
  if (Arr.isArray(node)) {
    return Arr.flatMap(node, (child, index) =>
      isJson(child) ? objectPaths(child, [...path, String(index)]) : []
    );
  }

  if (!Predicate.isObject(node)) {
    return [];
  }

  return [
    ...(node.type === "object" ? [path] : []),
    ...Arr.flatMap(Record.toEntries(node), ([key, child]) =>
      isJson(child) ? objectPaths(child, [...path, key]) : []
    ),
  ];
};

describe("the JSON Schema of the IR", () => {
  it.effect("is the text its generator writes", () =>
    Effect.gen(function* generated() {
      assert.strictEqual(
        yield* checkedIn,
        yield* Effect.fromResult(graphJsonSchema())
      );
    })
  );

  it.effect(
    "is a draft 2020-12 document with an id, for the version of the IR it reads",
    () =>
      Effect.gen(function* header() {
        const document = yield* Effect.flatMap(checkedIn, documentOf);

        assert.isTrue(Predicate.isObject(document));
        assert.include(graphSchemaId, `/schema/ir/${graphVersion}`);

        if (Predicate.isObject(document)) {
          assert.strictEqual(document.$id, graphSchemaId);
          assert.strictEqual(
            document.$schema,
            "https://json-schema.org/draft/2020-12/schema"
          );
          assert.strictEqual(document.$ref, "#/$defs/Graph");
        }

        const graph = definitionsOf(document).Graph;

        assert.isTrue(Predicate.isObject(graph));

        if (Predicate.isObject(graph) && Predicate.isObject(graph.properties)) {
          assert.deepStrictEqual(graph.properties.version, {
            enum: [graphVersion],
            type: "number",
          });
          assert.deepStrictEqual(graph.required, [
            "chapters",
            "scenes",
            "speed",
            "title",
            "version",
          ]);
          assert.strictEqual(graph.additionalProperties, false);
        }
      })
  );

  it.effect(
    "names every construct of the IR, each with a description and the origin it must name",
    () =>
      Effect.gen(function* named() {
        const definitions = definitionsOf(
          yield* Effect.flatMap(checkedIn, documentOf)
        );

        assert.sameMembers(Record.keys(definitions), Record.keys(origins));
        assertKeyword(definitions, origins, "origin");

        for (const [name, found] of Record.toEntries(definitions)) {
          assert.isTrue(
            Predicate.isObject(found) &&
              Predicate.isString(found.description) &&
              found.description !== "",
            name
          );
        }
      })
  );

  it.effect(
    "says where the meaning differs, for the constructs that differ",
    () =>
      Effect.gen(function* differs() {
        assertKeyword(
          definitionsOf(yield* Effect.flatMap(checkedIn, documentOf)),
          deviations,
          "deviation"
        );
      })
  );

  it.effect(
    "has no construct without an origin, and the check sees one that loses it",
    () =>
      Effect.gen(function* control() {
        assert.deepStrictEqual(
          withoutOrigin(
            definitionsOf(yield* Effect.flatMap(checkedIn, documentOf))
          ),
          []
        );

        const bare = Schema.toJsonSchemaDocument(
          Schema.Struct({ a: Schema.String }).annotate({ identifier: "Bare" }),
          { includeAnnotationKey: (key) => key === "origin" }
        );

        assert.deepStrictEqual(withoutOrigin(bare.definitions), ["Bare"]);
      })
  );

  it.effect(
    "names every object schema (none is anonymous, so none can lack an origin) and closes it",
    () =>
      Effect.gen(function* closed() {
        const document = yield* Effect.flatMap(checkedIn, documentOf);

        const nested = Arr.filter(
          objectPaths(document, []),
          (path) => path.length !== 2 || path[0] !== "$defs"
        );

        assert.deepStrictEqual(nested, []);

        for (const [name, found] of Record.toEntries(definitionsOf(document))) {
          if (Predicate.isObject(found) && found.type === "object") {
            assert.strictEqual(found.additionalProperties, false, name);
          }
        }
      })
  );
});
