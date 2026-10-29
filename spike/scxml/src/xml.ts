// Throwaway spike (spec 0007): the boundary to XML. One element tree type, a namespace-aware parser (saxes, ISC) and a
// spec-correct printer (the printer is ours: 30 lines; see the report for why).
import { SaxesParser } from "saxes";

/** An element: `uri` is the namespace URI (the profile is checked by URI, never by prefix), `name` the local name. */
export interface XmlElement {
  readonly attrs: Readonly<Record<string, string>>;
  readonly children: readonly XmlChild[];
  readonly name: string;
  readonly uri: string;
}

export type XmlChild = XmlElement | string;

/** A namespace plan: URI to canonical prefix (`""` is the default namespace). The parser reports a namespaced attribute
 * as `prefix:local` of THIS plan (so the author's own prefix never matters) and `{uri}local` for an unknown namespace. */
export type Prefixes = Readonly<Record<string, string>>;

const isElement = (c: XmlChild): c is XmlElement => typeof c !== "string";

/** Parse with saxes (`xmlns: true`): namespace resolution, XML 1.0 line-end normalisation and char-ref decoding. */
export const parseXml = (source: string, prefixes: Prefixes): XmlElement => {
  const parser = new SaxesParser({ xmlns: true, position: false });
  const stack: { name: string; uri: string; attrs: Record<string, string>; children: XmlChild[] }[] = [];
  let root: XmlElement | undefined;
  let failure: Error | undefined;
  parser.on("error", (error) => {
    failure ??= error;
  });
  parser.on("opentag", (tag) => {
    const attrs: Record<string, string> = {};
    for (const attribute of Object.values(tag.attributes)) {
      if (attribute.uri === "http://www.w3.org/2000/xmlns/") continue;
      const prefix = prefixes[attribute.uri];
      const key = attribute.uri === "" ? attribute.local : prefix === undefined ? `{${attribute.uri}}${attribute.local}` : `${prefix}:${attribute.local}`;
      attrs[key] = attribute.value;
    }
    stack.push({ attrs, children: [], name: tag.local, uri: tag.uri });
  });
  parser.on("text", (text) => {
    const top = stack.at(-1);
    if (top === undefined) return;
    const last = top.children.at(-1);
    if (typeof last === "string") top.children[top.children.length - 1] = last + text;
    else top.children.push(text);
  });
  parser.on("closetag", () => {
    const done = stack.pop();
    if (done === undefined) return;
    // Whitespace between child elements is layout; a leaf keeps its text verbatim.
    const hasElement = done.children.some(isElement);
    const children = hasElement
      ? done.children.filter((c) => isElement(c) || c.trim() !== "")
      : done.children;
    const element: XmlElement = { attrs: done.attrs, children, name: done.name, uri: done.uri };
    const parent = stack.at(-1);
    if (parent === undefined) root = element;
    else parent.children.push(element);
  });
  parser.write(source).close();
  if (failure !== undefined) throw failure;
  if (root === undefined) throw new Error("no root element");
  return root;
};

const escapeText = (s: string): string =>
  s.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/\r/gu, "&#13;");

const escapeAttr = (s: string): string =>
  s
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/"/gu, "&quot;")
    .replace(/\t/gu, "&#9;")
    .replace(/\n/gu, "&#10;")
    .replace(/\r/gu, "&#13;");

const qname = (prefixes: Prefixes, uri: string, local: string): string => {
  const prefix = prefixes[uri];
  if (prefix === undefined) throw new Error(`no prefix for ${uri}`);
  return prefix === "" ? local : `${prefix}:${local}`;
};

const printElement = (e: XmlElement, prefixes: Prefixes, depth: number, root: boolean): string => {
  const pad = "  ".repeat(depth);
  const decl = root
    ? Object.entries(prefixes).map(([uri, prefix]) => ` ${prefix === "" ? "xmlns" : `xmlns:${prefix}`}="${escapeAttr(uri)}"`)
    : [];
  const attrs = Object.entries(e.attrs).map(([k, v]) => ` ${k}="${escapeAttr(v)}"`);
  const open = `${qname(prefixes, e.uri, e.name)}${decl.join("")}${attrs.join("")}`;
  if (e.children.length === 0) return `${pad}<${open}/>\n`;
  if (!e.children.some(isElement)) return `${pad}<${open}>${e.children.map((c) => escapeText(c as string)).join("")}</${qname(prefixes, e.uri, e.name)}>\n`;
  const inner = e.children.map((c) => (isElement(c) ? printElement(c, prefixes, depth + 1, false) : "")).join("");
  return `${pad}<${open}>\n${inner}${pad}</${qname(prefixes, e.uri, e.name)}>\n`;
};

/** Print with two-space indent. Mixed content (text beside elements) is outside the profile and is rejected. */
export const printXml = (root: XmlElement, prefixes: Prefixes): string => {
  const mixed = (e: XmlElement): boolean =>
    (e.children.some(isElement) && e.children.some((c) => !isElement(c))) || e.children.filter(isElement).some(mixed);
  if (mixed(root)) throw new Error("mixed content is outside the profile");
  return `<?xml version="1.0" encoding="UTF-8"?>\n${printElement(root, prefixes, 0, true)}`;
};
