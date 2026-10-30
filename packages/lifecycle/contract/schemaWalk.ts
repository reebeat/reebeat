// A typed reading of the JSON Schema of a tool's output (spec 0016, F9): which string fields are plain text and which
// carry `x-tsukuri-untrusted`. The JSON Schema a client sees is decoded once into a small recursive schema, so the walk
// is over typed nodes, not over `unknown`. Plain functions; the contract and the server's tests share them.
import {
  Array as Arr,
  Predicate,
  Record as Rec,
  Schema,
  String as Str,
} from "effect";

import { untrustedKeyword } from "../src/ids.ts";

interface Node {
  readonly $ref?: string;
  readonly allOf?: readonly Node[];
  readonly anyOf?: readonly Node[];
  readonly items?: Node;
  readonly properties?: Readonly<Record<string, Node>>;
  readonly type?: string;
  readonly [untrustedKeyword]?: boolean;
}

const NodeSchema: Schema.Codec<Node> = Schema.Struct({
  $ref: Schema.optionalKey(Schema.String),
  allOf: Schema.optionalKey(Schema.Array(Schema.suspend(() => NodeSchema))),
  anyOf: Schema.optionalKey(Schema.Array(Schema.suspend(() => NodeSchema))),
  items: Schema.optionalKey(Schema.suspend(() => NodeSchema)),
  properties: Schema.optionalKey(
    Schema.Record(
      Schema.String,
      Schema.suspend(() => NodeSchema)
    )
  ),
  type: Schema.optionalKey(Schema.String),
  [untrustedKeyword]: Schema.optionalKey(Schema.Boolean),
});

const DocumentSchema = Schema.Struct({
  definitions: Schema.Record(Schema.String, NodeSchema),
  schema: NodeSchema,
});

export type SchemaDocument = typeof DocumentSchema.Type;

/** The JSON Schema document of `schema`, typed. */
export const documentOf = (schema: Schema.Top) =>
  Schema.decodeEffect(DocumentSchema)(Schema.toJsonSchemaDocument(schema));

const resolve = (document: SchemaDocument, node: Node): Node =>
  node.$ref === undefined
    ? node
    : resolve(
        document,
        document.definitions[Str.replace("#/$defs/", "")(node.$ref)] ?? {}
      );

const branches = (node: Node): readonly Node[] => [
  ...(node.allOf ?? []),
  ...(node.anyOf ?? []),
];

const marked = (document: SchemaDocument, node: Node): boolean => {
  const here = resolve(document, node);

  return (
    here[untrustedKeyword] === true ||
    Arr.some(branches(here), (branch) => marked(document, branch))
  );
};

const plainIn = (
  document: SchemaDocument,
  node: Node,
  path: string
): readonly string[] => {
  const here = resolve(document, node);
  const own = here.type === "string" && !marked(document, here) ? [path] : [];

  const properties = Arr.flatMap(
    Rec.toEntries(here.properties ?? {}),
    ([name, child]) => plainIn(document, child, `${path}.${name}`)
  );

  const items =
    here.items === undefined ? [] : plainIn(document, here.items, path);

  const nested = Arr.flatMap(branches(here), (branch) =>
    plainIn(document, branch, path)
  );

  return [...own, ...properties, ...items, ...nested];
};

/** Every string field of the document that is plain text (no `x-tsukuri-untrusted`), as `.a.b` paths, arrays collapsed. */
export const plainStringPaths = (document: SchemaDocument): readonly string[] =>
  Arr.dedupe(plainIn(document, document.schema, ""));

const untrustedIn = (
  document: SchemaDocument,
  node: Node,
  path: readonly string[]
): boolean => {
  const here = resolve(document, node);
  const [head, ...tail] = path;

  if (head === undefined) {
    return marked(document, here);
  }

  const child = head === "*" ? here.items : here.properties?.[head];

  return child === undefined
    ? Arr.some(branches(here), (branch) => untrustedIn(document, branch, path))
    : untrustedIn(document, child, tail);
};

/** Whether the field at `path` (names, `*` for an array's items) is typed untrusted. */
export const untrustedAt = (
  document: SchemaDocument,
  path: readonly string[]
): boolean => untrustedIn(document, document.schema, path);

/** A string of a JSON value and where it is. */
export interface Leaf {
  readonly path: readonly string[];
  readonly text: string;
}

const isJsonArray = (value: Schema.Json): value is Schema.JsonArray =>
  Arr.isArray(value);

const isJsonObject = (value: Schema.Json): value is Schema.JsonObject =>
  Predicate.isObject(value) && !isJsonArray(value);

/** Every string in `value`, with its path (names, `*` for an array's items). */
export const leavesOf = (
  value: Schema.Json,
  path: readonly string[] = []
): readonly Leaf[] => {
  if (Predicate.isString(value)) {
    return [{ path, text: value }];
  }

  if (isJsonArray(value)) {
    return Arr.flatMap(value, (item) => leavesOf(item, [...path, "*"]));
  }

  return isJsonObject(value)
    ? Arr.flatMap(Rec.toEntries(value), ([name, child]) =>
        leavesOf(child, [...path, name])
      )
    : [];
};

/** The names of the properties at the root of the document: what an input accepts by name. */
export const rootProperties = (document: SchemaDocument): readonly string[] =>
  Rec.keys(resolve(document, document.schema).properties ?? {});
