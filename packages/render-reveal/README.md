# @reebeat/render-reveal

The reveal.js `Renderer` (spec 0001, design R3): a Plan in, a Deck out, all in memory: `deck.html`, the theme, the page
runtime and the binary assets read from the installed packages (reveal.js, Inter). It reads the Plan, never the
screenplay: its manifest depends on `@reebeat/core` (types only), `@reebeat/services`, `@reebeat/lint`, `effect`,
`reveal.js`, `@fontsource/inter` and `parse5`, and a test and a lint rule keep it that way (spec 0001, F11). Writing the
files of a `RenderedDeck` to a directory is the pipeline's file-system work, not this package's.
Spec: [`docs/specs/0001-release-1-screenplay-to-deck-and-video.md`](../../docs/specs/0001-release-1-screenplay-to-deck-and-video.md).

```text
PlanJson ──renderDeck──▶ DeckBundle { html, files }                       pure
DeckBundle + PlanJson + DeckAssets ──assembleDeck──▶ RenderedDeck          runs checkDeck on the page first (F4)
PlanJson ──revealRenderer.render──▶ RenderedDeck                           Layer over FileSystem, Path
deck.html text ──readDeck──▶ DeckModel                                     pure
PlanJson + deck.html text ──checkDeck──▶ void | DeckMismatch               F3, F4, F5 (deck side), Elements, slide marks
```

| Export | What it is |
| --- | --- |
| `revealRenderer` | `Layer<Renderer, never, FileSystem \| Path>`; `info.id` is `reveal.js@<installed version>`, `info.settings` holds the theme (palette, fonts, Inter version), the egress is local. The layer reads the packages' files once, when it is built; a package that cannot be read does not stop the layer, `render` then fails with `AdapterUnavailable` (and `info.id` is `reveal.js@unavailable`). `render(plan)` is `assembleDeck(plan, renderDeck(plan), assets)`; a Deck that disagrees with its Plan fails as `RenderFailed` carrying the `DeckMismatch` |
| `renderDeck(plan)` | `DeckBundle`: `html` is `deck.html`; `files` are `assets/theme.css` and `assets/deck.js`. Same Plan, same bytes |
| `readAssets()` | `Effect<DeckAssets, DeckAssetMissing, FileSystem \| Path>`: the bytes of the reveal.js and Inter files and the two package versions |
| `assembleDeck(plan, bundle, assets)` | `Effect<RenderedDeck, DeckMismatch>`: reads the page back with `checkDeck` and returns the files (`deck.html` is the entry) |
| `readDeck(html)` | `DeckModel`: per slide the scene id, chapter id, notes paragraphs, fragments, Elements and marks; the two source hashes. Total: it never fails |
| `checkDeck(plan, html)` | `Effect<void, DeckMismatch>`; the first difference, naming `check`, `slide` (scene id) and `index`. The Cue and fragment comparison is `@reebeat/lint`'s rule `cue-fragment-agreement`; the page's own checks (the Element a `next` reveals, the fragment index) stay here |

`DeckMismatch.check` is one of `F3 notes` (note $k$ is the narration of Line $k$), `F4 fragments` (fragments equal Cues in
kind, argument, revealed Element and order), `F5 source hash` (`<html data-source-sha256>` and the `reebeat:source-sha256`
meta both equal `plan.sourceSha256`), `elements` (every Plan Element is on its slide with the same cell, classes, hidden
flag and text, and nothing else is), `slides` (same scene ids and chapters in the same order) and `transitions`
(`data-auto-animate`, `data-auto-animate-id`, `data-transition`).

## The page

The page follows the Deck page contract of the spec. Where the contract left room, the choices are:

- **Cells.** reveal.js stacks nothing by itself, so each slide holds one `div.grid` (CSS grid, 3 x 3, columns
  `1fr 2fr 1fr`) with one `div.cell.cell-<cell>` per occupied cell; the Elements of a cell stack top to bottom in Plan
  order. The wrappers carry no `data-id`, so reveal.js matches only Elements. An entering Element is faded in through its
  wrapper.
- **Auto-Animate chains.** Scenes joined by `auto-animate` form a chain, and every slide of a chain carries the same
  `data-auto-animate-id` (`aa1`, `aa2`, ...). Without it an `auto-animate` Scene, a `default` one and another
  `auto-animate` Scene would animate into each other, because reveal.js pairs any two neighbours that both have
  `data-auto-animate`.
- **Flat slides, chapters as an attribute.** The spec's mapping table says a `# Section` becomes a slide group (a vertical
  stack); the page contract and this package use one flat `<section data-scene="scN" data-chapter="chN">` per Scene
  instead, so `Reveal.slide(index, 0, -1)` reaches Scene `index` and slide $k$ is Scene $k$ (F3, F4 and the capture index
  slides this way). Reasons: (1) the clock measurement of M0 (Auto-Animate, fade, fragments) was made on flat slides, so
  flat is the only layout whose frame offsets are measured; (2) Auto-Animate between the last Scene of one Section and the
  first of the next, which in a stack layout also changes the horizontal index, **was not tried**; (3) a stack needs a
  wrapper `section` per Section, which the Deck page contract does not have. The chapter is not lost: `data-chapter`
  carries it, `readDeck` reads it and `checkDeck` compares it with the Plan. A vertical-stack layout is a change to the
  page contract, to the capture's `goToScene` and to a new Auto-Animate measurement, not a styling choice.
- **Settings.** The slide size (`width`, `height`) and the Auto-Animate duration (`transition`, seconds) of the reveal.js
  configuration come from `plan.settings`; the stylesheet scales every length with `height / 720`, so a taller slide has
  proportionally larger type and spacing. The Plan contract pins 1280 x 720 today (`SettingsSchema` literals), so the tests
  exercise other sizes by calling `themeCss` and `runtimeJs` with other `DeckSettings` and, through `renderDeck`, other
  durations. The fade between two non-matched slides is reveal.js's own 0.5 s and is not a setting.
- **Runtime.** `assets/deck.js` is plain JavaScript text generated by `src/runtime.ts`. `next` replaces `hidden` with
  `shown` (the CSS fades opacity in 0.2 s); `focus` puts `focused` (a ring and a scale of 1.04) on its target and takes it
  from the previous focus; stepping back restores the previous focus and hides the Element again; `sfx` plays
  `assets/sfx/<name>.wav` and ignores a rejection from a blocked autoplay. `reebeatDeck.ready` resolves when Reveal is
  ready **and both Inter faces are loaded**, so a capture never shows a fallback font. `goToScene` throws for an unknown
  id. reveal.js's notes plugin is loaded, so the arrow keys step through the Deck and `s` opens the speaker view.
  Known interplay: `focused` is not cleared when the slide changes, so an Element still focused when an Auto-Animate
  starts is measured with its scale of 1.04 and animates from that box.
- **Files.** `assets/reveal/{reveal.js,reveal.css,reset.css,plugin/notes.js,LICENSE}` and
  `assets/fonts/{inter-latin-400-normal.woff2,inter-latin-700-normal.woff2,LICENSE}` are read from the installed
  packages (found with `import.meta.resolve`); the licences travel with them. The Latin subset of Inter is bundled.
  The Deck loads only relative `file:` URLs: no CDN, no network. The sound files are written by the pipeline.

## HTML parser

`readDeck` needs a real HTML parser, so that a check reads the written file the way a browser would.

| Candidate | Version (last release) | Licence | Size | Why not |
| --- | --- | --- | --- | --- |
| **`parse5`** | 8.0.1 (2026-04-19) | MIT | 337 KB, one dependency (`entities`) | chosen: the WHATWG-conformant HTML5 parser under jsdom, a plain tree with no DOM emulation, typed |
| `linkedom` | 0.18.14 (2026-10-21) | ISC | 1.1 MB, five dependencies | a DOM emulation (CSS selectors, CSSOM) that the check does not use; not MIT or BSD |
| `node-html-parser` | 9.0.5 (2026-10-19) | MIT | 683 KB, two dependencies | a fast, forgiving parser that does not follow the HTML5 parsing algorithm, so it can read a broken page differently from a browser |

## Theme

One light palette in `src/theme.ts` (the stylesheet is generated from the same data the tests read; lengths scale with the
slide height, see Settings). The classes are `box`,
`title`, `label`, `accent` and `muted`; `test/theme.test.ts` asserts, through `@reebeat/lint`'s `contrast` rule, that each class keeps at least 4.5:1 (WCAG 2.x)
against the slide background and against the box background. Inter is bundled
(`@fontsource/inter`, OFL), so frames do not depend on system fonts.

## Tests

`bun run test` in this directory; the browser tests need `REEBEAT_CHROMIUM` (set by devenv) and add `--no-sandbox` when
`REEBEAT_CHROMIUM_NO_SANDBOX=1`.

| File | Proves |
| --- | --- |
| `render.test.ts` | the page structure, hash, escaping, chains of Auto-Animate scenes, cues (pure) |
| `check.test.ts` | F3, F4, F5 and Element controls on the written file; `assembleDeck` fails on a bad bundle (pure) |
| `renderer.test.ts` | the Renderer contract (`@reebeat/services/contract`) with two negative controls; the files of a Deck directory, byte-identical copies, relative URLs that exist, licences |
| `theme.test.ts` | contrast of every class |
| `boundaries.test.ts` | F11: the manifest and an import scan of `src` |
| `browser.test.ts` | Chromium: `reebeatDeck`, each Cue's effect, notes, Auto-Animate keeps the matched Element and moves it from its start box to its end box |

The browser tests use the real clock; the controlled clock belongs to `packages/capture-chromium`. The only suppression is the
Promise adapter of `test/browser.ts` (`EX-0030` in `tools/quality/effect-exceptions.json`).
