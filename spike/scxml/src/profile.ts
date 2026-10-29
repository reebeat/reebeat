// Throwaway spike (spec 0007): the reebeat SCXML profile as an Effect Schema over the element tree of `xml.ts`.
// Closed on purpose: an element, an attribute or a namespace that is not declared here is a decode error, so a
// forbidden SCXML element (`script`, `datamodel`, `assign`, `send`, ...) is rejected by the Schema, not by code.
import { Schema } from "effect";

export const scxmlNs = "http://www.w3.org/2005/07/scxml";
export const rbNs = "urn:reebeat:ir:1";
/** URI to canonical prefix; the root declares both. */
export const prefixes = { [rbNs]: "rb", [scxmlNs]: "" } as const;

const Str = Schema.String;
const opt = Schema.optionalKey(Str);

/** One element shape: its namespace, name, attributes (closed) and children. */
const element = <const N extends string, const A extends Schema.Struct.Fields, C extends Schema.Top>(
  uri: string,
  name: N,
  attrs: A,
  children: C
) =>
  Schema.Struct({
    attrs: Schema.Struct(attrs),
    children,
    name: Schema.Literal(name),
    uri: Schema.Literal(uri),
  });

const none = Schema.Tuple([]);
const text = Schema.Array(Str);

const rb = <const N extends string, const A extends Schema.Struct.Fields, C extends Schema.Top>(
  name: N,
  attrs: A,
  children: C
) => element(rbNs, name, attrs, children);

// ---- foreign: the event expression (spec 0004 EventExprSchema) -----------------------------------------------------
const Subject = Schema.Union([
  rb("subject", { id: Str, kind: Schema.Literals(["element", "effect"]) }, none),
  rb("subject", { kind: Schema.Literals(["scene"]) }, none),
  rb("subject", { kind: Schema.Literals(["state", "beat"]), n: Str }, none),
]);
const Point = rb("at", { percent: opt, edge: opt }, none);
const Anchor = Schema.Union([
  rb("anchor", { edge: Str, explicit: Str, kind: Schema.Literals(["word"]), occurrence: Str, phrase: Str }, none),
  rb("anchor", { kind: Schema.Literals(["edge"]), transition: Str }, Schema.Tuple([Subject, Point])),
  rb("anchor", { event: Str, kind: Schema.Literals(["occupancy"]), state: Str }, Schema.Tuple([Subject])),
]);
const Offset = rb("offset", { unit: Str, value: Str }, none);
const Duration = rb("duration", { unit: Str, value: Str }, none);

export type ExprTree =
  | Schema.Schema.Type<typeof Anchor>
  | { readonly attrs: { readonly name: string }; readonly children: readonly []; readonly name: "ref"; readonly uri: typeof rbNs }
  | {
      readonly attrs: { readonly "stagger-unit"?: string; readonly "stagger-value"?: string; readonly "throttle-unit"?: string; readonly "throttle-value"?: string };
      readonly children: readonly ExprTree[];
      readonly name: "all" | "first" | "each";
      readonly uri: typeof rbNs;
    }
  | { readonly attrs: { readonly state: string }; readonly children: readonly [ExprTree]; readonly name: "within"; readonly uri: typeof rbNs }
  | { readonly attrs: Record<string, never>; readonly children: readonly [ExprTree, Schema.Schema.Type<typeof Offset>]; readonly name: "shift"; readonly uri: typeof rbNs };

const lazyExpr: Schema.Codec<ExprTree> = Schema.suspend((): Schema.Codec<ExprTree> => Expr);
const Expr: Schema.Codec<ExprTree> = Schema.Union([
  Anchor,
  rb("ref", { name: Str }, none),
  rb("all", {}, Schema.Array(lazyExpr)),
  rb("first", {}, Schema.Array(lazyExpr)),
  rb(
    "each",
    { "stagger-unit": opt, "stagger-value": opt, "throttle-unit": opt, "throttle-value": opt },
    Schema.Array(lazyExpr)
  ),
  rb("within", { state: Str }, Schema.Tuple([lazyExpr])),
  rb("shift", {}, Schema.Tuple([lazyExpr, Offset])),
]) as unknown as Schema.Codec<ExprTree>;

// ---- foreign: scene content -------------------------------------------------------------------------------------------
const ElementEl = rb("element", { cell: Str, class: Str, id: Str, line: Str, text: Str, visible: Str }, none);
const Word = rb("w", { v: Str }, none);
const LineEl = element(rbNs, "line", { id: Str, line: Str, "pause-before": Str, speed: Str, text: Str }, Schema.Array(Word));
const Until = rb("until", { written: Str }, Schema.Tuple([lazyExpr]));
const When = Schema.Union([
  rb("when", {}, Schema.Tuple([lazyExpr])),
  rb("when", { "absolute-flicks": Str, reason: Str }, none),
]);
const Effect = rb(
  "effect",
  { id: Str, line: Str, name: opt, target: opt, verb: Str, written: Str },
  Schema.Array(Schema.Union([When, Until]))
);
const Derived = rb("event", { id: Str, line: Str, written: Str }, Schema.Tuple([lazyExpr]));


// ---- native: the statechart ---------------------------------------------------------------------------------------------
const Transition = element(scxmlNs, "transition", { event: Str, target: Str }, none);
const State = element(
  scxmlNs,
  "state",
  {
    "rb:chapter": Str,
    "rb:heading": Str,
    "rb:line": Str,
    "rb:transition": Schema.Literals(["auto-animate", "cut", "default"]),
    id: Str,
  },
  Schema.Array(Schema.Union([ElementEl, LineEl, Effect, Derived, Transition]))
);

const ChapterEl = rb(
  "chapter",
  { id: Str, line: Str, synopsis: opt, title: Str },
  Schema.Array(rb("scene", { ref: Str }, none))
);

export const ScxmlDocument = element(
  scxmlNs,
  "scxml",
  {
    initial: opt,
    "rb:author": opt,
    "rb:speed": Str,
    "rb:title": Str,
    "rb:ir": Schema.Literals(["1"]),
    version: Schema.Literals(["1.0"]),
  },
  Schema.Array(Schema.Union([ChapterEl, State]))
);

export type ScxmlDocumentTree = typeof ScxmlDocument.Type;
