/* oxlint-disable typescript/promise-function-async -- EX-0030: Playwright returns Promises; every call goes through one of the helpers of this file */
// The browser boundary of the tests: the only module that imports Playwright. ABI: Playwright's Promise API driving
// the Chromium named by `REEBEAT_CHROMIUM` (1280x720, no determinism flags: see `launchFlags`). Each `openDeck` launches a fresh
// browser in the caller's Scope and closes it when the Scope closes. The page records every request that is not a
// `file:` URL (the Deck must make none).
// Retirement trigger: an Effect-native browser driver in the installed Effect packages.
import { NodeServices } from "@effect/platform-node";
import { Config, Effect, Path, Schema } from "effect";
import { chromium } from "playwright-core";
import type { Browser, Page } from "playwright-core";

/**
 * A deck STRUCTURE test, not a capture test: it needs no deterministic rendering, so it does not copy the capture's
 * flags (they live in `packages/capture-chromium`, which an adapter must not import, and a copy drifts: this one once
 * lacked `--disable-threaded-animation`). Only the scrollbars are hidden so the 1280x720 viewport is the slide.
 */
const launchFlags = ["--hide-scrollbars"];

const launch = Effect.gen(function* launching() {
  const executablePath = yield* Config.String("REEBEAT_CHROMIUM");

  const noSandbox = yield* Config.String("REEBEAT_CHROMIUM_NO_SANDBOX").pipe(
    Config.withDefault("")
  );

  return yield* Effect.acquireRelease(
    Effect.promise(() =>
      chromium.launch({
        args:
          noSandbox === "1" ? [...launchFlags, "--no-sandbox"] : launchFlags,
        executablePath,
        headless: true,
      })
    ),
    (browser: Browser) => Effect.promise(() => browser.close())
  );
});

/** An open Deck page: `external` collects the URL of every request that is not a `file:` URL. */
interface OpenDeck {
  readonly external: string[];
  readonly page: Page;
  readonly pageErrors: string[];
}

/**
 * Opens `deck.html` of a written Deck directory in a fresh page (a script of `init`, if any, runs before the page's
 * own) and waits for `reebeatDeck.ready`. Network requests outside `file:` are aborted and recorded.
 */
export const openDeck = (directory: string, init = "") =>
  Effect.gen(function* opening() {
    const browser = yield* launch;

    const page = yield* Effect.promise(() =>
      browser.newPage({
        deviceScaleFactor: 1,
        viewport: { height: 720, width: 1280 },
      })
    );

    const external: string[] = [];
    const pageErrors: string[] = [];

    yield* Effect.sync(() =>
      page.on("pageerror", (error) => pageErrors.push(String(error)))
    );

    yield* Effect.promise(() =>
      page.route(/^(?!file:)/u, (route) => {
        external.push(route.request().url());

        return route.abort();
      })
    );

    if (init !== "") {
      yield* Effect.promise(() => page.addInitScript(init));
    }

    const path = yield* Path.Path;

    const url = (yield* path.toFileUrl(
      path.join(directory, "deck.html")
    )).toString();

    yield* Effect.promise(() => page.goto(url));
    yield* Effect.promise(() => page.evaluate("window.reebeatDeck.ready"));

    return { external, page, pageErrors } satisfies OpenDeck;
  }).pipe(Effect.provide(NodeServices.layer));

/** Evaluates a JavaScript expression in the page and decodes its result. */
export const evaluate = <A>(
  page: Page,
  expression: string,
  schema: Schema.Decoder<A>
) =>
  Effect.flatMap(
    Effect.promise<unknown>(() => page.evaluate(expression)),
    Schema.decodeUnknownEffect(schema)
  );

/** Evaluates an expression that must throw in the page and returns the message of the error. */
export const evaluateFailure = (page: Page, expression: string) =>
  Effect.map(
    Effect.flip(
      Effect.asVoid(
        Effect.tryPromise({
          catch: (cause) => ({
            _tag: "Rejected" as const,
            message: String(cause),
          }),
          try: () => page.evaluate(expression),
        })
      )
    ),
    ({ message }) => message
  );

/** Waits until the expression is truthy in the page (Playwright polls it on every animation frame). */
export const waitUntil = (page: Page, expression: string) =>
  Effect.asVoid(Effect.promise(() => page.waitForFunction(expression)));

/** Presses `s` (reveal.js's notes plugin) and returns the notes text the speaker view shows for the current slide. */
export const speakerViewNotes = (page: Page) =>
  Effect.gen(function* speaking() {
    const [popup] = yield* Effect.promise(() =>
      Promise.all([page.waitForEvent("popup"), page.keyboard.press("s")])
    );

    yield* Effect.promise(() =>
      popup.waitForSelector(".speaker-controls-notes")
    );

    return yield* evaluate(
      popup,
      `document.querySelector(".speaker-controls-notes").innerText`,
      Schema.String
    );
  });
