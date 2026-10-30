// `tsukuri build`: the build program (`@tsukuri/pipeline`) run on the adapters the selection picks. This file is the
// composition: it turns the selection into Layers (`Composition`), runs the program on them once and says what ran.
// Everything the build does, and its atomic `<out>.partial` and `build.json` last, is the program's.
import { buildProgram } from "@tsukuri/pipeline";
import type { AdapterRecord, BuildSummary } from "@tsukuri/pipeline";
import type { Egress, Selection } from "@tsukuri/services";
import { Array as Arr, Effect } from "effect";

import { Composition, servicesOf } from "./adapters.ts";

export interface BuildCommand {
  /** The speech cache directory. */
  readonly cacheDir: string;
  /** The capture's deadline in seconds; `undefined` is the capturer's default. */
  readonly captureTimeoutSeconds?: number | undefined;
  /** The base name of `<name>.mp4` and `<name>.vtt`. */
  readonly name: string;
  readonly out: string;
  /** Fill missing speech assets from the speech adapter (see `refillsSpeech`). */
  readonly refreshSpeech: boolean;
  readonly selection: Selection;
  /** The `.fountain` file. */
  readonly story: string;
}

/**
 * Whether a missing speech asset is filled: when `--refresh-speech` says so, and always for a stand-in narrator
 * (`silent`), which needs no model and whose assets carry its own id, so they never stand in for a real voice's.
 */
const refillsSpeech = (selection: Selection, refreshSpeech: boolean): boolean =>
  refreshSpeech || selection.speech === "silent";

/** What an adapter sends out, as a line of the summary: `none` for a local adapter, else the kinds of data. */
const egressText = (egress: Egress): string =>
  egress.kind === "local" && egress.sends.length === 0
    ? "none"
    : `${egress.kind}, sends ${Arr.join(egress.sends, ", ")}`;

/** The adapters a build used, one line each, with the egress each declares. */
const renderAdapters = (adapters: readonly AdapterRecord[]): string =>
  Arr.join(
    [
      "adapters:",
      ...Arr.map(
        adapters,
        (adapter) =>
          `  ${adapter.service}: ${adapter.id}, egress: ${egressText(adapter.egress)}`
      ),
    ],
    "\n"
  );

/** The line `build` and `journey` print for a finished build, then its adapters and their egress. */
export const renderSummary = (summary: BuildSummary): string =>
  `built ${summary.out}: ${summary.files} files, ${summary.frames} frames, mp4 ${summary.mp4Bytes} bytes, vtt ${summary.vttBytes} bytes, ${summary.seconds.toFixed(1)} s\n${renderAdapters(summary.adapters)}`;

/** Builds the story into `command.out` on the adapters of `command.selection`. */
export const buildStory = Effect.fn("buildStory")(function* buildStory(
  command: BuildCommand
) {
  const compose = yield* Composition;

  const parts = compose(command.selection, {
    cacheDir: command.cacheDir,
    captureTimeoutSeconds: command.captureTimeoutSeconds,
  });

  return yield* Effect.provide(
    buildProgram({
      name: command.name,
      out: command.out,
      refreshSpeech: refillsSpeech(command.selection, command.refreshSpeech),
      story: command.story,
    }),
    servicesOf(parts)
  );
});
