/* oxlint-disable typescript/promise-function-async -- EX-0040: Playwright returns Promises; every call goes through `inPage` */
// The browser boundary: the only module that imports Playwright. ABI: Playwright's Promise API driving the
// Chromium named by `REEBEAT_CHROMIUM` (spec 0001, "The controlled clock"). Each `open` launches a fresh
// browser in the caller's Scope and closes it when the Scope closes; interruption stops the waiting fiber, and
// the close that follows kills the browser, so a Promise that is still pending changes nothing afterwards.
// The layer checks what the capture needs when it is built (the variable, the binary, the clock script) and reads
// the two versions that name the adapter; a missing one is `AdapterUnavailable`, never a fallback.
// Retirement trigger: an Effect-native browser driver in the installed Effect packages.
import { AdapterUnavailable } from "@reebeat/services";
import {
  Config,
  Context,
  Effect,
  FileSystem,
  Layer,
  Path,
  Schema,
} from "effect";
import type { Scope } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
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

/** The Chromium flags of the capture (spec 0001, "Risks": fixed rendering); they change the pixels. */
export const chromiumFlags = [
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

/** The versions that name this adapter: the Chromium binary and the `timeweb` clock script. */
export interface BrowserVersions {
  readonly chromium: string;
  readonly timeweb: string;
}

const unavailable = (requirement: string, message: string) =>
  new AdapterUnavailable({
    adapter: "chromium",
    message,
    requirement,
    service: "FrameCapturer",
  });

const timewebMissing = (cause: unknown) =>
  unavailable(
    "package timeweb",
    `timeweb is not installed: ${cause instanceof Error ? cause.message : String(cause)}`
  );

/** A variable of the environment, or "" when it is absent; a failing config source is `AdapterUnavailable` too. */
const readVariable = (name: string) =>
  Config.String(name).pipe(
    Config.withDefault(""),
    Effect.mapError(() =>
      unavailable(`env ${name}`, `${name} cannot be read from the environment`)
    )
  );

const PackageVersion = Schema.fromJsonString(
  Schema.Struct({ version: Schema.String })
);

const decodePackageVersion = Schema.decodeUnknownEffect(PackageVersion);

/** The binary named by `REEBEAT_CHROMIUM`, and the version it prints. */
const findChromium = Effect.fnUntraced(function* findChromium() {
  const executable = yield* readVariable("REEBEAT_CHROMIUM");

  if (executable === "") {
    return yield* unavailable(
      "env REEBEAT_CHROMIUM",
      "REEBEAT_CHROMIUM is not set: it names the Chromium binary the capture drives"
    );
  }

  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

  const printed = yield* spawner
    .string(ChildProcess.make(executable, ["--version"]))
    .pipe(
      Effect.mapError(() =>
        unavailable(
          "binary named by REEBEAT_CHROMIUM",
          "the binary named by REEBEAT_CHROMIUM did not run `--version`"
        )
      )
    );

  const version = /\d+(?:\.\d+)+/u.exec(printed)?.[0];

  return version === undefined
    ? yield* unavailable(
        "binary named by REEBEAT_CHROMIUM",
        "the binary named by REEBEAT_CHROMIUM printed no version"
      )
    : { executable, version };
});

/** The `timeweb` browser build and its package version (`timeweb` has no export map: both are files of the package). */
const findTimeweb = Effect.fnUntraced(function* findTimeweb() {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const resolved = yield* Effect.try({
    catch: timewebMissing,
    try: () => import.meta.resolve("timeweb/dist/timeweb.js"),
  });

  const script = yield* Effect.mapError(
    path.fromFileUrl(new URL(resolved)),
    timewebMissing
  );

  const manifest = yield* Effect.mapError(
    fs.readFileString(path.join(path.dirname(script), "..", "package.json")),
    timewebMissing
  );

  const { version } = yield* Effect.mapError(
    decodePackageVersion(manifest),
    timewebMissing
  );

  return { script, version };
});

/** What the capture needs from the machine, once found: the binary, its flags, the clock script and the versions. */
interface Install {
  readonly args: readonly string[];
  readonly executablePath: string;
  readonly timewebScript: string;
  readonly versions: BrowserVersions;
}

const findInstall = Effect.fnUntraced(function* findInstall() {
  const chromiumBinary = yield* findChromium();
  const timeweb = yield* findTimeweb();
  const noSandbox = yield* readVariable("REEBEAT_CHROMIUM_NO_SANDBOX");

  return {
    args:
      noSandbox === "1" ? [...chromiumFlags, "--no-sandbox"] : chromiumFlags,
    executablePath: chromiumBinary.executable,
    timewebScript: timeweb.script,
    versions: { chromium: chromiumBinary.version, timeweb: timeweb.version },
  } satisfies Install;
});

export class Browser extends Context.Service<
  Browser,
  {
    /**
     * Launches Chromium, installs the clock before the page's scripts and loads the deck. Fails with
     * `AdapterUnavailable` when the machine lacks what `versions` names.
     */
    open: (
      options: OpenOptions
    ) => Effect.Effect<
      DeckPage,
      AdapterUnavailable | BrowserFailed,
      Scope.Scope
    >;
    /** The versions that name the adapter, or why the machine cannot run it. */
    readonly versions: Effect.Effect<BrowserVersions, AdapterUnavailable>;
  }
>()("@reebeat/capture-chromium/browser/Browser") {
  /**
   * Looks for the variable, the binary and the clock script when the layer is built and settles the outcome; nothing
   * fails then. A machine that lacks one makes every `open` (and `versions`) fail with `AdapterUnavailable`.
   */
  static readonly layer = Layer.effect(
    Browser,
    Effect.gen(function* build() {
      const platform = yield* Effect.context<
        | ChildProcessSpawner.ChildProcessSpawner
        | FileSystem.FileSystem
        | Path.Path
      >();

      const settled = yield* Effect.exit(
        Effect.provideContext(findInstall(), platform)
      );

      const open = Effect.fn("Browser.open")(function* openPage(
        options: OpenOptions
      ) {
        const { args, executablePath, timewebScript } = yield* settled;

        const browser = yield* Effect.acquireRelease(
          inPage("launch", () =>
            chromium.launch({ args: [...args], executablePath, headless: true })
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
          page.addInitScript({ path: timewebScript })
        );
        yield* inPage("install seek layer", () =>
          page.addInitScript({ content: pageRuntime })
        );
        yield* inPage("load deck", () => page.goto(options.url));

        return deckPage(page);
      });

      return Browser.of({
        open,
        versions: Effect.map(settled, (install) => install.versions),
      });
    })
  );
}
