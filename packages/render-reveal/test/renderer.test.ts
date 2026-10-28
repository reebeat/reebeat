// The Renderer contract for reveal.js, and the files of a Deck (spec 0001, Deck page contract): generated text plus
// assets read from the installed packages, relative URLs only, no network, licences kept.
import { assert, describe, it } from "@effect/vitest";
import { AdapterUnavailable, Renderer } from "@reebeat/services";
import type { RenderedDeck } from "@reebeat/services";
import {
  failingClauses,
  rendererClauses,
  rendererContract,
} from "@reebeat/services/contract";
import {
  Array as Arr,
  Effect,
  FileSystem,
  Layer,
  Path,
  Predicate,
} from "effect";

import { revealRenderer } from "../src/index.ts";
import { fontFaces } from "../src/theme.ts";
import {
  existsIn,
  listFiles,
  readIn,
  readPackageText,
  revealLayer,
  storyPlan,
  writtenDeck,
} from "./support.ts";

const urlsIn = (text: string, pattern: RegExp): readonly string[] =>
  Arr.map([...text.matchAll(pattern)], ({ groups }) => groups?.url ?? "");

const adapter = revealLayer;

rendererContract("revealRenderer", adapter);

describe("revealRenderer", () => {
  it.effect(
    "declares reveal.js at the installed version, a local adapter with the theme in its settings",
    () =>
      Effect.gen(function* info() {
        const { info: declared } = yield* Renderer;

        const installed = yield* readPackageText(
          "node_modules/reveal.js/package.json"
        );

        assert.strictEqual(declared.id, "reveal.js@6.0.2");
        assert.include(installed, '"version": "6.0.2"');
        assert.deepStrictEqual(declared.egress, { kind: "local", sends: [] });
        assert.strictEqual(declared.settings.theme, "light");
        assert.strictEqual(declared.settings["palette.accent"], "#1a3fa8");
      }).pipe(Effect.provide(adapter))
  );
});

/** The reveal.js renderer over a file system that holds nothing: the packages' files cannot be read. */
const withoutPackages = revealRenderer.pipe(
  Layer.provide(Layer.merge(FileSystem.layerNoop({}), Path.layer))
);

describe("requirements", () => {
  it.effect(
    "control: packages that cannot be read do not stop the layer; the first render is AdapterUnavailable naming the package, and nothing falls back",
    () =>
      Effect.gen(function* missing() {
        const renderer = yield* Renderer;
        const error = yield* Effect.flip(renderer.render(yield* storyPlan));

        assert.strictEqual(renderer.info.id, "reveal.js@unavailable");
        assert.instanceOf(error, AdapterUnavailable);
        assert.strictEqual(error.service, "Renderer");
        assert.strictEqual(error.adapter, "reveal.js");
        assert.strictEqual(error.requirement, "package reveal.js/reveal.css");
      }).pipe(Effect.provide(withoutPackages))
  );
});

/** The reveal.js renderer with its output changed by `change`: a copy that breaks one clause of the contract. */
const broken = (change: (deck: RenderedDeck, calls: number) => RenderedDeck) =>
  Layer.effect(
    Renderer,
    Effect.gen(function* build() {
      const real = yield* Renderer;
      let calls = 0;

      return Renderer.of({
        ...real,
        render: (plan) =>
          Effect.map(real.render(plan), (deck) => {
            calls += 1;

            return change(deck, calls);
          }),
      });
    })
  ).pipe(Layer.provide(adapter));

/** `change` applied to the text of every text file of the deck. */
const editText =
  (change: (text: string, calls: number) => string) =>
  (deck: RenderedDeck, calls: number): RenderedDeck => ({
    ...deck,
    files: Arr.map(deck.files, ({ content, path }) => ({
      content: Predicate.isString(content) ? change(content, calls) : content,
      path,
    })),
  });

describe("control", () => {
  it.effect(
    "a deck that hides the Element ids fails C4 only; one that changes between calls fails C3 only",
    () =>
      Effect.gen(function* control() {
        const clauses = rendererClauses();

        assert.deepStrictEqual(yield* failingClauses(adapter, clauses), []);
        assert.deepStrictEqual(
          yield* failingClauses(
            broken(
              editText((text) =>
                text.replaceAll(/data-id="[^"]*"/gu, 'data-id=""')
              )
            ),
            clauses
          ),
          ["C4"]
        );
        assert.deepStrictEqual(
          yield* failingClauses(
            broken(editText((text, calls) => `${text}<!-- ${calls} -->`)),
            clauses
          ),
          ["C3"]
        );
      })
  );
});

describe("the files of a Deck", () => {
  it.effect("writes the page, the generated files and the copied assets", () =>
    Effect.gen(function* files() {
      const directory = yield* writtenDeck(yield* storyPlan);

      assert.deepStrictEqual(yield* listFiles(directory), [
        "assets/deck.js",
        "assets/fonts/LICENSE",
        ...Arr.map(fontFaces, ({ file }) => `assets/fonts/${file}`),
        "assets/reveal/LICENSE",
        "assets/reveal/plugin/notes.js",
        "assets/reveal/reset.css",
        "assets/reveal/reveal.css",
        "assets/reveal/reveal.js",
        "assets/theme.css",
        "deck.html",
      ]);

      // The copies are the installed files, byte for byte.
      assert.strictEqual(
        yield* readIn(directory, "assets/reveal/reveal.js"),
        yield* readPackageText("node_modules/reveal.js/dist/reveal.js")
      );
    })
  );

  it.effect(
    "loads only relative files that exist, and none of them from the network",
    () =>
      Effect.gen(function* relative() {
        const directory = yield* writtenDeck(yield* storyPlan);
        const html = yield* readIn(directory, "deck.html");
        const css = yield* readIn(directory, "assets/theme.css");
        const script = yield* readIn(directory, "assets/deck.js");

        const fromPage = [
          ...urlsIn(html, /\b(?:src|href)="(?<url>[^"]+)"/gu),
          ...Arr.map(
            urlsIn(css, /url\("(?<url>[^"]+)"\)/gu),
            (url) => `assets/${url}`
          ),
        ];

        assert.isAbove(fromPage.length, 6);

        for (const url of fromPage) {
          assert.notMatch(url, /^(?:[a-z]+:)?\/\//u, `${url} is relative`);
          assert.isTrue(yield* existsIn(directory, url), `${url} exists`);
        }

        assert.notMatch(html + css + script, /https?:\/\//u);
      })
  );

  it.effect(
    "keeps the licences of what it copies, and writes no sound (the CLI does)",
    () =>
      Effect.gen(function* licences() {
        const directory = yield* writtenDeck(yield* storyPlan);

        assert.include(
          yield* readIn(directory, "assets/reveal/LICENSE"),
          "Hakim El Hattab"
        );
        assert.include(
          yield* readIn(directory, "assets/fonts/LICENSE"),
          "SIL Open Font License"
        );
        assert.isFalse(yield* existsIn(directory, "assets/sfx"));
      })
  );
});
