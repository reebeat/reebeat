/* oxlint-disable typescript/promise-function-async -- EX-0040: Playwright returns Promises; every call goes through `inPage` */
// The browser boundary: the only module that imports Playwright. ABI: Playwright's Promise API driving the
// Chromium named by `REEBEAT_CHROMIUM` (spec 0001, "The controlled clock"). Each `open` launches a fresh
// browser in the caller's Scope and closes it when the Scope closes; interruption stops the waiting fiber, and
// the close that follows kills the browser, so a Promise that is still pending changes nothing afterwards.
// Retirement trigger: an Effect-native browser driver in the installed Effect packages.
import { Config, Context, Effect, Layer, Path } from "effect";
import type { Scope } from "effect";
import { chromium } from "playwright-core";
import type { Page } from "playwright-core";

import type { CaptureCommand } from "./captureSchedule.ts";
import { BrowserFailed } from "./errors.ts";
import { pageRuntime } from "./pageRuntime.ts";

export interface OpenOptions {
  readonly height: number;
  /** The `file://` URL of `deck.html`. */
  readonly url: string;
  readonly width: number;
}

/** The deck page under the controlled clock, as the capture drives it. */
export interface DeckPage {
  /** Moves the virtual clock to `virtualMs` (it only moves forward). */
  readonly clockGoTo: (virtualMs: number) => Effect.Effect<void, BrowserFailed>;
  /** Calls the deck's runtime API. */
  readonly command: (
    command: CaptureCommand
  ) => Effect.Effect<void, BrowserFailed>;
  /** Resolves when the deck's `reebeatDeck.ready` and the page's fonts are ready. */
  readonly ready: Effect.Effect<void, BrowserFailed>;
  /** One PNG of the viewport. */
  readonly screenshot: Effect.Effect<Uint8Array, BrowserFailed>;
  /**
   * Sets every running animation to its time at `frame`; `settle` waits two real frames before a new one; `skewMs` is
   * how far the virtual clock is from its nominal time at `frame` (0 for a clock that is on time).
   */
  readonly seek: (
    frame: number,
    fps: number,
    settle: boolean,
    skewMs: number
  ) => Effect.Effect<void, BrowserFailed>;
}

const chromiumFlags = [
  "--force-color-profile=srgb",
  "--disable-gpu",
  "--font-render-hinting=none",
  "--disable-lcd-text",
  "--hide-scrollbars",
];

const failure = (operation: string) => (cause: unknown) =>
  new BrowserFailed({
    cause,
    message: `${operation} failed: ${cause instanceof Error ? cause.message : String(cause)}`,
    operation,
  });

const inPage = <A>(operation: string, run: () => Promise<A>) =>
  Effect.tryPromise({ catch: failure(operation), try: run });

const evaluateCommand = (command: CaptureCommand): string =>
  command.kind === "goToScene"
    ? `window.reebeatDeck.goToScene(${JSON.stringify(command.sceneId)})`
    : "window.reebeatDeck.stepFragment()";

// Three round trips, as the seek layer asks (see pageRuntime.ts): look, settle, seek.
const seekAnimations = (page: Page): DeckPage["seek"] =>
  Effect.fnUntraced(function* seek(frame, fps, settle, skewMs) {
    const fresh = yield* inPage("look for new animations", () =>
      page.evaluate("window.__reebeatHasNewAnimations()")
    );

    if (settle && fresh === true) {
      yield* inPage("settle", () =>
        page.evaluate("window.__reebeatTwoRealFrames()")
      );
    }

    yield* inPage("seek", () =>
      page.evaluate(`window.__reebeatSeek(${frame}, ${fps}, ${skewMs})`)
    );
  });

const deckPage = (page: Page): DeckPage => ({
  clockGoTo: (virtualMs) =>
    inPage("clock goTo", () =>
      page.evaluate(`window.timeweb.goTo(${virtualMs})`)
    ),
  command: (command) =>
    inPage(command.kind, () => page.evaluate(evaluateCommand(command))),
  ready: inPage("deck ready", () =>
    page.evaluate(
      "Promise.all([window.reebeatDeck.ready, document.fonts.ready]).then(() => 0)"
    )
  ),
  screenshot: inPage("screenshot", () =>
    page.screenshot({ animations: "allow", caret: "initial", type: "png" })
  ),
  seek: seekAnimations(page),
});

export class Browser extends Context.Service<
  Browser,
  {
    /** Launches Chromium, installs the clock before the page's scripts and loads the deck. */
    open: (
      options: OpenOptions
    ) => Effect.Effect<DeckPage, BrowserFailed, Scope.Scope>;
  }
>()("@reebeat/video/browser/Browser") {
  static readonly layer = Layer.effect(
    Browser,
    Effect.gen(function* build() {
      const path = yield* Path.Path;
      const executablePath = yield* Config.String("REEBEAT_CHROMIUM");

      const noSandbox = yield* Config.String(
        "REEBEAT_CHROMIUM_NO_SANDBOX"
      ).pipe(Config.withDefault(""));

      // `timeweb` has no export map: its browser build is a file of the installed package.
      const timeweb = yield* path.fromFileUrl(
        new URL(import.meta.resolve("timeweb/dist/timeweb.js"))
      );

      const args =
        noSandbox === "1" ? [...chromiumFlags, "--no-sandbox"] : chromiumFlags;

      const open = Effect.fn("Browser.open")(function* openPage(
        options: OpenOptions
      ) {
        const browser = yield* Effect.acquireRelease(
          inPage("launch", () =>
            chromium.launch({ args, executablePath, headless: true })
          ),
          (launched) =>
            inPage("close", () => launched.close()).pipe(Effect.ignore)
        );

        const context = yield* inPage("new context", () =>
          browser.newContext({
            deviceScaleFactor: 1,
            viewport: { height: options.height, width: options.width },
          })
        );

        const page = yield* inPage("new page", () => context.newPage());

        yield* inPage("install clock", () =>
          page.addInitScript({ path: timeweb })
        );
        yield* inPage("install seek layer", () =>
          page.addInitScript({ content: pageRuntime })
        );
        yield* inPage("load deck", () => page.goto(options.url));

        return deckPage(page);
      });

      return Browser.of({ open });
    })
  );
}
