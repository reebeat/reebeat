// Plan to page: `renderDeck` is a pure function of the Plan (spec 0001, "Module layout" and the Deck page
// contract). The same Plan gives the same bytes. Nothing here reads a file; `assembleDeck` adds the binary assets.
import type { Element, PlanJson, Scene } from "@reebeat/core";
import { Array as Arr } from "effect";

import { expectedMarks, expectedSlide } from "./expected.ts";
import type { ExpectedFragment, ExpectedMarks } from "./expected.ts";
import { runtimeJs } from "./runtime.ts";
import { cellOrder, themeCss } from "./theme.ts";

/** A generated text file of the Deck, with its path relative to the build directory. */
export interface DeckFile {
  readonly path: string;
  readonly text: string;
}

/** What `renderDeck` produces: the page and the generated text files it loads. */
export interface DeckBundle {
  readonly files: readonly DeckFile[];
  readonly html: string;
}

/** Escapes text for element content and for double-quoted attribute values. */
const escapeHtml = (text: string): string =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const attribute = (name: string, value: string): string =>
  ` ${name}="${escapeHtml(value)}"`;

const elementHtml = (element: Element): string => {
  const classes = Arr.join(
    ["el", element.class, ...(element.visible ? [] : ["hidden"])],
    " "
  );

  return `<div${attribute("class", classes)}${attribute("data-id", element.id)}${attribute("data-cell", element.cell)}>${escapeHtml(element.text)}</div>`;
};

/** The Elements grouped by cell in grid order; Elements of one cell stack in Plan order. */
const gridHtml = (scene: Scene): string => {
  const cells = Arr.flatMap(cellOrder, (name) => {
    const members = Arr.filter(
      scene.elements,
      (element) => element.cell === name
    );

    return members.length === 0
      ? []
      : [
          `<div class="cell cell-${name}">\n${Arr.join(
            Arr.map(members, (member) => `        ${elementHtml(member)}`),
            "\n"
          )}\n      </div>`,
        ];
  });

  return `<div class="grid">\n      ${Arr.join(cells, "\n      ")}\n    </div>`;
};

/** `data-sounds="whoosh ding"`; nothing when no sound rides along. */
const soundsAttribute = (sounds: readonly string[]): string =>
  sounds.length === 0 ? "" : attribute("data-sounds", Arr.join(sounds, " "));

const fragmentHtml = (fragment: ExpectedFragment): string =>
  `<span class="fragment effect"${attribute("data-fragment-index", String(fragment.index))}${attribute("data-effect-id", fragment.effectId)}${attribute("data-effect-verb", fragment.verb)}${attribute("data-target", fragment.target)}${soundsAttribute(fragment.sounds)}></span>`;

const notesHtml = (scene: Scene): string =>
  `<aside class="notes">${Arr.join(
    Arr.map(scene.lines, (line) => `<p>${escapeHtml(line.text)}</p>`),
    ""
  )}</aside>`;

const sectionHtml = (
  plan: PlanJson,
  scene: Scene,
  marks: ExpectedMarks
): string => {
  const slide = expectedSlide(plan, scene);

  const autoAnimate =
    marks.autoAnimate === null
      ? ""
      : `${attribute("data-auto-animate", "")}${attribute("data-auto-animate-id", marks.autoAnimate)}`;

  const transition =
    marks.transition === null
      ? ""
      : attribute("data-transition", marks.transition);

  const cutAfter = marks.cutAfter ? attribute("data-cut-after", "") : "";

  const fragments = Arr.map(
    slide.fragments,
    (fragment) => `    ${fragmentHtml(fragment)}\n`
  );

  return `  <section${attribute("data-scene", scene.id)}${attribute("data-chapter", scene.chapterId)}${autoAnimate}${transition}${cutAfter}${soundsAttribute(slide.sounds)}>
    ${gridHtml(scene)}
${Arr.join(fragments, "")}    ${notesHtml(scene)}
  </section>`;
};

const pageHtml = (plan: PlanJson): string => {
  const marks = expectedMarks(plan);

  const sections = Arr.join(
    Arr.map(plan.scenes, (scene, index) =>
      sectionHtml(
        plan,
        scene,
        marks[index] ?? { autoAnimate: null, cutAfter: false, transition: null }
      )
    ),
    "\n"
  );

  const author =
    plan.author === undefined
      ? ""
      : `\n  <meta${attribute("name", "author")}${attribute("content", plan.author)}>`;

  return `<!doctype html>
<html lang="en"${attribute("data-source-sha256", plan.sourceSha256)}>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="reebeat:source-sha256"${attribute("content", plan.sourceSha256)}>${author}
  <title>${escapeHtml(plan.title)}</title>
  <link rel="stylesheet" href="assets/reveal/reset.css">
  <link rel="stylesheet" href="assets/reveal/reveal.css">
  <link rel="stylesheet" href="assets/theme.css">
</head>
<body>
<div class="reveal">
<div class="slides">
${sections}
</div>
</div>
<script src="assets/reveal/reveal.js"></script>
<script src="assets/reveal/plugin/notes.js"></script>
<script src="assets/deck.js"></script>
</body>
</html>
`;
};

/**
 * The Deck of a Plan: `html` is `deck.html`; `files` are the generated text files it loads (the theme and the
 * runtime). The binary assets (reveal.js, Inter) are added by `assembleDeck`; the sound files `assets/sfx/<name>.wav`
 * are written by the build program (`@reebeat/pipeline`).
 */
export const renderDeck = (plan: PlanJson): DeckBundle => ({
  files: [
    { path: "assets/theme.css", text: themeCss(plan.settings) },
    { path: "assets/deck.js", text: runtimeJs(plan.settings) },
  ],
  html: pageHtml(plan),
});
