// Throwaway spike (spec 0007): the IR codec Graph <-> SCXML text, in the profile of `profile.ts`. States, the initial
// state, the Beat transitions and the document order are SCXML; everything else is the `rb:` namespace.
// The law is `decode(encode(ir)) = ir`; `Schema.toEquivalence` of the vendored `GraphSchema` is the judge.
import { Result, Schema } from "effect";

import type { Graph } from "../vendor/0004/graph.ts";
import { GraphSchema } from "../vendor/0004/graph.ts";
import { prefixes, rbNs, ScxmlDocument, scxmlNs } from "./profile.ts";
import type { XmlChild, XmlElement } from "./xml.ts";
import { parseXml, printXml } from "./xml.ts";

type Attrs = Record<string, string>;
type Json = any; // the spike walks plain JSON-shaped values of GraphSchema.Type
/** MUTATE=<name>: the mutation control of spec 0007 question 5 (a codec that loses one fact must fail the property). */
const mutation = process.env["MUTATE"];

const rb = (name: string, attrs: Attrs = {}, children: readonly XmlChild[] = []): XmlElement => ({
  attrs,
  children,
  name,
  uri: rbNs,
});
const sc = (name: string, attrs: Attrs, children: readonly XmlChild[]): XmlElement => ({
  attrs,
  children,
  name,
  uri: scxmlNs,
});
const txt = (s: string): readonly XmlChild[] => (s === "" ? [] : [s]);
const n = (v: number): string => String(v);
/** Optional attributes: a key that is absent in the IR is absent in the XML (`optionalKey`, not `undefined`). */
const withOpt = (attrs: Attrs, key: string, value: string | undefined): Attrs =>
  value === undefined ? attrs : { ...attrs, [key]: value };

// ---------------- IR -> tree -----------------------------------------------------------------------------------------
const subjectEl = (s: Json): XmlElement =>
  s.kind === "scene"
    ? rb("subject", { kind: "scene" })
    : s.kind === "element" || s.kind === "effect"
      ? rb("subject", { id: s.id, kind: s.kind })
      : rb("subject", { kind: s.kind, n: n(s.n) });

const anchorEl = (a: Json): XmlElement => {
  if (a.kind === "word")
    return rb("anchor", {
      edge: a.edge,
      explicit: String(a.explicit),
      kind: "word",
      occurrence: n(a.occurrence),
      phrase: a.phrase,
    });
  if (a.kind === "edge") {
    const at =
      typeof a.at === "string" ? rb("at", { edge: a.at }) : rb("at", { percent: n(a.at.percent) });
    return rb("anchor", { kind: "edge", transition: a.transition }, [subjectEl(a.subject), at]);
  }
  return rb("anchor", { event: a.event, kind: "occupancy", state: a.state }, [subjectEl(a.subject)]);
};

const durationAttrs = (prefix: string, d: Json): Attrs =>
  d === null ? {} : { [`${prefix}-unit`]: d.unit, [`${prefix}-value`]: n(d.value) };

const exprEl = (e: Json): XmlElement => {
  switch (e.kind) {
    case "anchor":
      return anchorEl(e.anchor);
    case "ref":
      return rb("ref", { name: e.name });
    case "all":
    case "first":
      return rb(e.kind, {}, e.of.map(exprEl));
    case "each":
      return rb(
        "each",
        { ...durationAttrs("throttle", e.throttle), ...durationAttrs("stagger", e.stagger) },
        e.of.map(exprEl)
      );
    case "within":
      return rb("within", { state: n(e.state) }, [exprEl(e.of)]);
    default:
      return rb("shift", {}, [exprEl(e.of), rb("offset", { unit: e.offset.unit, value: n(e.offset.value) })]);
  }
};

const effectEl = (f: Json): XmlElement => {
  let attrs: Attrs = { id: f.id, line: n(f.line), verb: f.verb, written: f.written };
  attrs = withOpt(withOpt(attrs, "name", f.name), "target", f.target);
  const when =
    "event" in f.when
      ? rb("when", {}, [exprEl(f.when.event)])
      : rb("when", { "absolute-flicks": n(f.when.absoluteFlicks), reason: f.when.reason });
  const until =
    f.until === undefined ? [] : [rb("until", { written: f.until.written }, [exprEl(f.until.event)])];
  return rb("effect", attrs, [when, ...until]);
};

const lineEl = (l: Json): XmlElement =>
  rb(
    "line",
    { id: l.id, line: n(l.line), "pause-before": n(l.hints.pauseBefore), speed: n(l.hints.speed), text: l.text },
    l.words.map((w: string) => rb("w", { v: w }))
  );

const stateEl = (s: Json, next: string | undefined): XmlElement =>
  sc(
    "state",
    {
      "rb:chapter": s.chapterId,
      "rb:heading": s.heading,
      "rb:line": n(s.line),
      "rb:transition": s.transition,
      id: s.id,
    },
    [
      ...s.elements.map((e: Json) =>
        rb("element", { cell: e.cell, class: e.class, id: e.id, line: n(e.line), text: e.text, visible: String(e.visible) })
      ),
      ...s.lines.map(lineEl),
      ...s.effects.map(effectEl),
      ...s.events.map((d: Json) =>
        rb("event", { id: d.name, line: n(d.line), written: d.written }, [exprEl(d.event)])
      ),
      ...(next === undefined ? [] : [sc("transition", { event: "rb.next", target: next }, [])]),
    ]
  );

export const graphToTree = (g: Graph): XmlElement => {
  const scenes = g.scenes as readonly Json[];
  const root = withOpt(
    {
      "rb:speed": n(g.speed),
      "rb:title": g.title,
      "rb:ir": String(g.version),
      version: "1.0",
    },
    "rb:author",
    g.author
  );
  return sc("scxml", scenes[0] === undefined ? root : { ...root, initial: scenes[0].id }, [
    ...g.chapters.map((c) =>
      rb(
        "chapter",
        withOpt({ id: c.id, line: n(c.line), title: c.title }, "synopsis", c.synopsis),
        c.sceneIds.map((ref) => rb("scene", { ref }))
      )
    ),
    ...scenes.map((s, i) => stateEl(s, scenes[i + 1]?.id)),
  ]);
};

// ---------------- tree -> IR ---------------------------------------------------------------------------------------
const els = (e: XmlElement): readonly XmlElement[] => e.children.filter((c): c is XmlElement => typeof c !== "string");
const text = (e: XmlElement): string => e.children.join("");
const only = (e: XmlElement, name: string): XmlElement => {
  const found = els(e).filter((c) => c.name === name);
  if (found.length !== 1 || found[0] === undefined) throw new Error(`${e.name}: expected one ${name}`);
  return found[0];
};
const fromOpt = (key: string, value: string | undefined, f: (s: string) => unknown = (s) => s): Json =>
  value === undefined ? {} : { [key]: f(value) };

const subjectOf = (e: XmlElement): Json => {
  const k = e.attrs["kind"];
  if (k === "scene") return { kind: k };
  if (k === "element" || k === "effect") return { id: e.attrs["id"], kind: k };
  return { kind: k, n: Number(e.attrs["n"]) };
};

const anchorOf = (e: XmlElement): Json => {
  const k = e.attrs["kind"];
  if (k === "word")
    return {
      edge: e.attrs["edge"],
      explicit: e.attrs["explicit"] === "true",
      kind: k,
      occurrence: Number(e.attrs["occurrence"]),
      phrase: e.attrs["phrase"],
    };
  if (k === "edge") {
    const at = only(e, "at");
    return {
      at: at.attrs["edge"] !== undefined ? at.attrs["edge"] : { percent: Number(at.attrs["percent"]) },
      kind: k,
      subject: subjectOf(only(e, "subject")),
      transition: e.attrs["transition"],
    };
  }
  return { event: e.attrs["event"], kind: k, state: e.attrs["state"], subject: subjectOf(only(e, "subject")) };
};

const durationOf = (e: XmlElement, prefix: string): Json =>
  e.attrs[`${prefix}-unit`] === undefined
    ? null
    : { unit: e.attrs[`${prefix}-unit`], value: Number(e.attrs[`${prefix}-value`]) };

const exprOf = (e: XmlElement): Json => {
  switch (e.name) {
    case "anchor":
      return { anchor: anchorOf(e), kind: "anchor" };
    case "ref":
      return { kind: "ref", name: e.attrs["name"] };
    case "all":
    case "first":
      return { kind: e.name, of: els(e).map(exprOf) };
    case "each":
      return {
        kind: "each",
        of: els(e).map(exprOf),
        stagger: durationOf(e, mutation === "swap-stagger-throttle" ? "throttle" : "stagger"),
        throttle: durationOf(e, "throttle"),
      };
    case "within":
      return { kind: "within", of: exprOf(els(e)[0] as XmlElement), state: Number(e.attrs["state"]) };
    default: {
      const [of, offset] = els(e) as [XmlElement, XmlElement];
      return { kind: "shift", of: exprOf(of), offset: { unit: offset.attrs["unit"], value: Number(offset.attrs["value"]) } };
    }
  }
};

const effectOf = (e: XmlElement): Json => {
  const when = only(e, "when");
  const until = els(e).find((c) => c.name === "until");
  return {
    id: e.attrs["id"],
    line: Number(e.attrs["line"]),
    ...fromOpt("name", e.attrs["name"]),
    ...fromOpt("target", e.attrs["target"]),
    ...(until === undefined
      ? {}
      : { until: { event: exprOf(els(until)[0] as XmlElement), written: until.attrs["written"] } }),
    verb: e.attrs["verb"],
    when:
      when.attrs["absolute-flicks"] === undefined
        ? { event: exprOf(els(when)[0] as XmlElement) }
        : { absoluteFlicks: Number(when.attrs["absolute-flicks"]), reason: when.attrs["reason"] },
    written: e.attrs["written"],
  };
};

const stateOf = (s: XmlElement): Json => {
  const kids = els(s);
  const of = (name: string) => kids.filter((c) => c.name === name);
  return {
    chapterId: s.attrs["rb:chapter"],
    effects: of("effect").map(effectOf),
    elements: of("element").map((e) => ({
      cell: e.attrs["cell"],
      class: e.attrs["class"],
      id: e.attrs["id"],
      line: Number(e.attrs["line"]),
      text: e.attrs["text"],
      visible: mutation === "visible-always-true" ? true : e.attrs["visible"] === "true",
    })),
    events: of("event").map((d) => ({
      event: exprOf(els(d)[0] as XmlElement),
      line: Number(d.attrs["line"]),
      name: d.attrs["id"],
      written: d.attrs["written"],
    })),
    heading: s.attrs["rb:heading"],
    id: s.attrs["id"],
    line: Number(s.attrs["rb:line"]),
    lines: of("line").map((l) => ({
      hints: { pauseBefore: Number(l.attrs["pause-before"]), speed: Number(l.attrs["speed"]) },
      id: l.attrs["id"],
      line: Number(l.attrs["line"]),
      text: l.attrs["text"],
      words: els(l).filter((w) => w.name === "w").map((w) => w.attrs["v"]).slice(0, mutation === "drop-last-word" ? -1 : undefined),
    })),
    transition: s.attrs["rb:transition"],
  };
};

export const treeToGraph = (root: XmlElement): Graph => {
  const kids = els(root);
  const scenes = kids.filter((c) => c.name === "state").map(stateOf);
  // The profile's one rule an XSD cannot state: a Beat transition targets the next state in document order.
  kids
    .filter((c) => c.name === "state")
    .forEach((s, i, all) => {
      const t = els(s).find((c) => c.name === "transition");
      const target = all[i + 1]?.attrs["id"];
      if (t?.attrs["target"] !== target) throw new Error(`state ${s.attrs["id"]}: Beat target is not the next state`);
    });
  return {
    ...fromOpt("author", root.attrs["rb:author"]),
    chapters: kids
      .filter((c) => c.name === "chapter")
      .map((c) => ({
        id: c.attrs["id"],
        line: Number(c.attrs["line"]),
        sceneIds: els(c).map((r) => r.attrs["ref"]),
        ...fromOpt("synopsis", c.attrs["synopsis"]),
        title: c.attrs["title"],
      })),
    scenes,
    speed: Number(root.attrs["rb:speed"]),
    title: root.attrs["rb:title"],
    version: Number(root.attrs["rb:ir"]),
  } as Graph;
};

// ---------------- the codec: text <-> Graph, through the profile Schema and GraphSchema -------------------------------
const decodeProfile = Schema.decodeUnknownResult(ScxmlDocument, { onExcessProperty: "error" });
const decodeGraph = Schema.decodeUnknownResult(GraphSchema, { onExcessProperty: "error" });
const encodeGraph = Schema.encodeUnknownResult(GraphSchema);

const attempt = <A>(f: () => A): Result.Result<A, Error> => {
  try {
    return Result.succeed(f());
  } catch (error) {
    return Result.fail(error instanceof Error ? error : new Error(String(error)));
  }
};

// XML 1.0 cannot carry U+0000 to U+001F (but tab, LF, CR), lone surrogates, U+FFFE or U+FFFF, even as a character
// reference, and JSON can. A Graph is a closed Schema over `String`, so the codec escapes them: `\` is `\\`, an
// unrepresentable code point is `\u{hex}`. `escape: false` is the control that shows the failure.
const isXmlChar = (c: number): boolean =>
  c === 0x9 || c === 0xa || c === 0xd || (c >= 0x20 && c <= 0xd7ff) || (c >= 0xe000 && c <= 0xfffd) || (c >= 0x10000 && c <= 0x10ffff);

export const escapeXmlString = (s: string): string => {
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    out += ch === "\\" ? "\\\\" : isXmlChar(c) ? ch : `\\u{${c.toString(16)}}`;
  }
  return out;
};

export const unescapeXmlString = (s: string): string =>
  s.replace(/\\(?:(\\)|u\{([0-9a-f]+)\})/gu, (_m, slash: string | undefined, hex: string | undefined) =>
    slash === undefined ? String.fromCodePoint(Number.parseInt(hex ?? "0", 16)) : "\\"
  );

const mapStrings = (e: XmlElement, f: (s: string) => string): XmlElement => ({
  attrs: Object.fromEntries(Object.entries(e.attrs).map(([k, v]) => [k, f(v)])),
  children: e.children.map((c) => (typeof c === "string" ? f(c) : mapStrings(c, f))),
  name: e.name,
  uri: e.uri,
});

export interface CodecOptions {
  readonly escape: boolean;
}
const defaults: CodecOptions = { escape: true };
const identity = (s: string): string => s;

/** IR to SCXML text; the IR is validated first (an invalid Graph has no document). */
export const encodeScxml = (g: Graph, options: CodecOptions = defaults): Result.Result<string, unknown> =>
  Result.flatMap(encodeGraph(g), () =>
    attempt(() => printXml(mapStrings(graphToTree(g), options.escape ? escapeXmlString : identity), prefixes))
  );

/** SCXML text to the IR: parse, validate the document against the profile (closed), map, validate the Graph. */
export const decodeScxml = (xml: string, options: CodecOptions = defaults): Result.Result<Graph, unknown> =>
  Result.flatMap(
    attempt(() => mapStrings(parseXml(xml, prefixes), options.escape ? unescapeXmlString : identity)),
    (tree) =>
      Result.flatMap(decodeProfile(tree), () =>
        Result.flatMap(
          attempt(() => treeToGraph(tree)),
          (g) => decodeGraph(g)
        )
      )
  );

/** What decode of the profile alone says (used to show that a forbidden element is rejected by the Schema). */
export const checkProfile = (xml: string): Result.Result<unknown, unknown> =>
  Result.flatMap(
    attempt(() => parseXml(xml, prefixes)),
    (tree) => decodeProfile(tree)
  );
