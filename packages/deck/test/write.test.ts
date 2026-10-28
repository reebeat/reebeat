// writeDeck: the files of a Deck directory (spec 0001, Deck page contract): generated text plus assets copied from
// the installed packages, relative URLs only, no network, licences kept.
import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Effect } from "effect";

import { fontFaces } from "../src/theme.ts";
import {
  existsIn,
  listFiles,
  readIn,
  readPackageText,
  storyPlan,
  writtenDeck,
} from "./support.ts";

const urlsIn = (text: string, pattern: RegExp): readonly string[] =>
  Arr.map([...text.matchAll(pattern)], ({ groups }) => groups?.url ?? "");

describe("writeDeck", () => {
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
