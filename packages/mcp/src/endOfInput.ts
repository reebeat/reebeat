// How the `tsukuri-mcp` process ends (spec 0018, Revision 23). A client ends a stdio session by closing the server's
// standard input. Effect's stdio transport answers the end of input by interrupting the program's main fiber, which
// `runMain` reports as exit status 130, the status of a SIGINT. Closing stdin is the protocol's normal end, not an
// interruption, so the status is 0 when the interrupt follows the end of input, and stays 130 for a signal.
import { Cause, Effect, Exit, Layer, Runtime, Stream } from "effect";
import * as Stdio from "effect/Stdio";

/** Whether standard input has reached its end; set by `watchedStdio`, read by `teardownAfter`. */
export interface InputWatch {
  ended: boolean;
}

export const newInputWatch = (): InputWatch => ({ ended: false });

/** `Stdio` with its input stream noting its own natural end in `watch`; an interrupted stream does not note it. */
export const watchedStdio = (
  watch: InputWatch
): Layer.Layer<Stdio.Stdio, never, Stdio.Stdio> =>
  Layer.effect(
    Stdio.Stdio,
    Effect.map(Stdio.Stdio, (stdio) =>
      Stdio.make({
        ...stdio,
        stdin: Stream.concat(
          stdio.stdin,
          Stream.drain(
            Stream.fromEffect(
              Effect.sync(() => {
                watch.ended = true;
              })
            )
          )
        ),
      })
    )
  );

/** The teardown of `runMain`: an interrupt after the end of input is a clean exit; everything else as the default. */
export const teardownAfter =
  (watch: InputWatch): Runtime.Teardown =>
  (exit, onExit) => {
    if (
      Exit.isFailure(exit) &&
      Cause.hasInterruptsOnly(exit.cause) &&
      watch.ended
    ) {
      onExit(0);

      return;
    }

    Runtime.defaultTeardown(exit, onExit);
  };
