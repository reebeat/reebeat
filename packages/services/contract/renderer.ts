// The contract of Renderer: what every deck renderer (reveal.js, a later motion engine) promises.
import { assert } from "@effect/vitest";
import { Array as Arr, Effect, Predicate, String as Str } from "effect";
import type { Layer } from "effect";

import type { RenderError } from "../src/errors.ts";
import { Renderer } from "../src/renderer.ts";
import type { RenderedDeck } from "../src/renderer.ts";
import { registerClauses } from "./clause.ts";
import type { Clause } from "./clause.ts";
import { contractPlan } from "./fixture.ts";
import type { FixtureError, PlanOptions } from "./fixture.ts";
import { assertInfoDeclared, sameBytes } from "./support.ts";

const bytesOf = (content: string | Uint8Array): Uint8Array =>
  Predicate.isString(content) ? new TextEncoder().encode(content) : content;

const textOf = (deck: RenderedDeck): string =>
  Arr.join(
    Arr.map(deck.files, ({ content }) =>
      Predicate.isString(content) ? content : new TextDecoder().decode(content)
    ),
    "\n"
  );

const sameDeck = (left: RenderedDeck, right: RenderedDeck): boolean =>
  left.entry === right.entry &&
  left.files.length === right.files.length &&
  Arr.every(
    left.files,
    (file, index) =>
      file.path === right.files[index]?.path &&
      sameBytes(
        bytesOf(file.content),
        bytesOf(right.files[index]?.content ?? "")
      )
  );

/** The clauses of the contract, as data (a test runs them against broken adapters). */
export const rendererClauses = (
  options: PlanOptions = {}
): readonly Clause<FixtureError | RenderError, Renderer>[] => {
  const plan =
    options.plan === undefined ? contractPlan : Effect.succeed(options.plan);

  return [
    {
      id: "C1",
      means: "the deck has an entry file among its files",
      run: Effect.gen(function* clause() {
        const renderer = yield* Renderer;
        const deck = yield* Effect.flatMap(plan, renderer.render);

        assert.include(
          Arr.map(deck.files, ({ path }) => path),
          deck.entry
        );
      }),
    },
    {
      id: "C2",
      means:
        "file paths are unique, relative and stay inside the deck directory",
      run: Effect.gen(function* clause() {
        const renderer = yield* Renderer;
        const deck = yield* Effect.flatMap(plan, renderer.render);
        const paths = Arr.map(deck.files, ({ path }) => path);

        assert.deepStrictEqual(Arr.dedupe(paths), paths);

        for (const path of paths) {
          assert.isFalse(Str.startsWith("/")(path), `${path} is relative`);
          assert.isFalse(
            Arr.contains(Str.split(path, "/"), ".."),
            `${path} stays inside`
          );
        }
      }),
    },
    {
      id: "C3",
      means: "equal Plans render to equal bytes",
      run: Effect.gen(function* clause() {
        const renderer = yield* Renderer;
        const given = yield* plan;
        const first = yield* renderer.render(given);
        const second = yield* renderer.render(given);

        assert.isTrue(sameDeck(first, second));
      }),
    },
    {
      id: "C4",
      means: "the deck contains the id of every Element of the Plan",
      run: Effect.gen(function* clause() {
        const renderer = yield* Renderer;
        const given = yield* plan;
        const text = textOf(yield* renderer.render(given));

        const ids = Arr.flatMap(given.scenes, (scene) =>
          Arr.map(scene.elements, ({ id }) => id)
        );

        assert.isAbove(ids.length, 0);

        for (const id of ids) {
          assert.include(text, id, `the deck shows ${id}`);
        }
      }),
    },
    {
      id: "C5",
      means:
        "info declares its id, its egress (local sends nothing) and non-secret settings",
      run: Effect.gen(function* clause() {
        assertInfoDeclared((yield* Renderer).info);
      }),
    },
  ];
};

/** Registers the Renderer contract for the adapter provided by `layer`. */
export const rendererContract = <LE>(
  label: string,
  layer: Layer.Layer<Renderer, LE>,
  options?: PlanOptions
): void => {
  registerClauses(label, layer, rendererClauses(options));
};
