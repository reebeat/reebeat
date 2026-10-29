// Page to model: `readDeck` reads back what a generated `deck.html` holds (spec 0001, F3 to F5). It parses with
// parse5, the HTML5 parser of jsdom, so the check reads the written file the way a browser would, not with a pattern
// that happens to match what the generator emits.
import { Array as Arr, Option, Record, String as Str } from "effect";
import { defaultTreeAdapter, parse } from "parse5";
import type { DefaultTreeAdapterMap } from "parse5";

type Node = DefaultTreeAdapterMap["node"];

type Element = DefaultTreeAdapterMap["element"];

/** One Element of a slide as written: `class="el box hidden"` reads as classes `["box"]` and `hidden: true`. */
export interface DeckElement {
  readonly cell: string;
  readonly classes: readonly string[];
  readonly hidden: boolean;
  readonly id: string;
  readonly text: string;
}

/** One fragment of a slide; an absent attribute reads as the empty string. */
export interface DeckFragment {
  readonly arg: string;
  readonly cueId: string;
  readonly index: string;
  readonly kind: string;
  readonly reveals: string;
}

/** One `<section data-scene>`. */
export interface DeckSlide {
  /** Null without `data-auto-animate`; else the value of `data-auto-animate-id` (empty when absent). */
  readonly autoAnimate: string | null;
  readonly chapterId: string;
  readonly elements: readonly DeckElement[];
  readonly fragments: readonly DeckFragment[];
  /** The text of each `<p>` of the slide's `<aside class="notes">`, in order. */
  readonly notes: readonly string[];
  readonly sceneId: string;
  /** The value of `data-transition`, or null. */
  readonly transition: string | null;
}

/** What a page says. The hashes are null when their attribute is absent. */
export interface DeckModel {
  /** `<html data-source-sha256>`. */
  readonly htmlSourceSha256: string | null;
  /** `<meta name="reebeat:source-sha256" content>`. */
  readonly metaSourceSha256: string | null;
  readonly slides: readonly DeckSlide[];
}

const childrenOf = (node: Node): readonly Node[] =>
  "childNodes" in node ? node.childNodes : [];

const descendantsOf = (node: Node): readonly Element[] =>
  Arr.flatMap(childrenOf(node), (child) =>
    defaultTreeAdapter.isElementNode(child)
      ? [child, ...descendantsOf(child)]
      : descendantsOf(child)
  );

/** The attributes of an element by name; the first of a repeated attribute wins, as in HTML. */
const attributesOf = (element: Element): Readonly<Record<string, string>> =>
  Record.fromEntries(
    Arr.map(Arr.reverse(element.attrs), ({ name, value }) => [name, value])
  );

const classesOf = (element: Element): readonly string[] =>
  Arr.filter(
    Str.split(attributesOf(element).class ?? "", /\s+/u),
    (name) => name !== ""
  );

const textOf = (node: Node): string =>
  defaultTreeAdapter.isTextNode(node)
    ? defaultTreeAdapter.getTextNodeContent(node)
    : Arr.join(Arr.map(childrenOf(node), textOf), "");

const withClass =
  (name: string) =>
  (element: Element): boolean =>
    classesOf(element).includes(name);

const readElement = (element: Element): DeckElement => {
  const attributes = attributesOf(element);
  const classes = classesOf(element);

  return {
    cell: attributes["data-cell"] ?? "",
    classes: Arr.filter(classes, (name) => name !== "el" && name !== "hidden"),
    hidden: classes.includes("hidden"),
    id: attributes["data-id"] ?? "",
    text: textOf(element),
  };
};

const readFragment = (element: Element): DeckFragment => {
  const attributes = attributesOf(element);

  return {
    arg: attributes["data-cue-arg"] ?? "",
    cueId: attributes["data-cue-id"] ?? "",
    index: attributes["data-fragment-index"] ?? "",
    kind: attributes["data-cue-kind"] ?? "",
    reveals: attributes["data-reveals"] ?? "",
  };
};

const readSlide = (section: Element): DeckSlide => {
  const attributes = attributesOf(section);
  const inside = descendantsOf(section);

  const notes = Arr.flatMap(
    Arr.filter(
      inside,
      (element) => element.tagName === "aside" && withClass("notes")(element)
    ),
    (aside: Element) =>
      Arr.map(
        Arr.filter(descendantsOf(aside), (element) => element.tagName === "p"),
        textOf
      )
  );

  return {
    autoAnimate:
      attributes["data-auto-animate"] === undefined
        ? null
        : (attributes["data-auto-animate-id"] ?? ""),
    chapterId: attributes["data-chapter"] ?? "",
    elements: Arr.map(Arr.filter(inside, withClass("el")), readElement),
    fragments: Arr.map(
      Arr.filter(
        inside,
        (element) => withClass("fragment")(element) && withClass("cue")(element)
      ),
      readFragment
    ),
    notes,
    sceneId: attributes["data-scene"] ?? "",
    transition: attributes["data-transition"] ?? null,
  };
};

/** The value of `attribute` on the first element of tag `tag` (matching `where`), or null. */
const firstAttribute = (
  everything: readonly Element[],
  tag: string,
  attribute: string,
  where: (attributes: Readonly<Record<string, string>>) => boolean = () => true
): string | null =>
  Option.getOrNull(
    Option.flatMap(
      Arr.findFirst(
        everything,
        (element) => element.tagName === tag && where(attributesOf(element))
      ),
      (element) => Option.fromNullishOr(attributesOf(element)[attribute])
    )
  );

/** Reads a `deck.html`. Total: any text parses as HTML, and what is missing reads as null or the empty string. */
export const readDeck = (html: string): DeckModel => {
  const everything = descendantsOf(parse(html));

  return {
    htmlSourceSha256: firstAttribute(everything, "html", "data-source-sha256"),
    metaSourceSha256: firstAttribute(
      everything,
      "meta",
      "content",
      (attributes) => attributes.name === "reebeat:source-sha256"
    ),
    slides: Arr.map(
      Arr.filter(
        everything,
        (element) =>
          element.tagName === "section" &&
          attributesOf(element)["data-scene"] !== undefined
      ),
      readSlide
    ),
  };
};
