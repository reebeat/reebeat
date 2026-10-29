// Throwaway: the zero-mapping alternative for spec 0007 question 4. The XML form is a pure function of the VALUE
// (a Parker/BadgerFish-style structural encoding), so nothing is written per field and nothing can drift from
// GraphSchema; the Schema validates on decode. It is a valid SCXML document with ONE state and the whole IR in the
// `rb:` namespace: derived, and 100% foreign.
import { Result, Schema } from "effect";

import type { Graph } from "../vendor/0004/graph.ts";
import { GraphSchema } from "../vendor/0004/graph.ts";
import { escapeXmlString, unescapeXmlString } from "./codec.ts";
import { prefixes, rbNs, scxmlNs } from "./profile.ts";
import type { XmlElement } from "./xml.ts";
import { parseXml, printXml } from "./xml.ts";

const rb = (name: string, attrs: Record<string, string>, children: XmlElement["children"] = []): XmlElement => ({
  attrs,
  children,
  name,
  uri: rbNs,
});

const valueEl = (v: unknown): XmlElement => {
  if (v === null) return rb("null", {});
  if (Array.isArray(v)) return rb("a", {}, v.map(valueEl));
  if (typeof v === "object") {
    return rb(
      "o",
      {},
      Object.entries(v as Record<string, unknown>).map(([k, x]) => rb("f", { k: escapeXmlString(k) }, [valueEl(x)]))
    );
  }
  if (typeof v === "string") return rb("s", {}, v === "" ? [] : [escapeXmlString(v)]);
  return rb(typeof v === "number" ? "n" : "b", { v: String(v) });
};

const valueOf = (e: XmlElement): unknown => {
  const kids = e.children.filter((c): c is XmlElement => typeof c !== "string");
  switch (e.name) {
    case "null":
      return null;
    case "a":
      return kids.map(valueOf);
    case "o":
      return Object.fromEntries(kids.map((f) => [unescapeXmlString(f.attrs["k"] ?? ""), valueOf(f.children[0] as XmlElement)]));
    case "s":
      return unescapeXmlString(e.children.join(""));
    case "n":
      return Number(e.attrs["v"]);
    default:
      return e.attrs["v"] === "true";
  }
};

const doc = (g: Graph): XmlElement => ({
  attrs: { "rb:ir": "1", version: "1.0" },
  children: [{ attrs: { id: "story" }, children: [valueEl(g)], name: "state", uri: scxmlNs }],
  name: "scxml",
  uri: scxmlNs,
});

const decodeGraph = Schema.decodeUnknownResult(GraphSchema, { onExcessProperty: "error" });

export const encodeGeneric = (g: Graph): Result.Result<string, Error> => {
  try {
    return Result.succeed(printXml(doc(g), prefixes));
  } catch (error) {
    return Result.fail(error instanceof Error ? error : new Error(String(error)));
  }
};

export const decodeGeneric = (xml: string): Result.Result<Graph, unknown> => {
  try {
    const root = parseXml(xml, prefixes);
    const state = root.children[0] as XmlElement;
    return decodeGraph(valueOf(state.children[0] as XmlElement));
  } catch (error) {
    return Result.fail(error);
  }
};
