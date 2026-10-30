// The stdio transport interrupts its owning fiber after EOF, request drain and stdout drain. The executable owns
// that transport in a child fiber so only its EOF exit is normalized; a signal interrupts the parent separately.
import { Effect, Layer, Stream } from "effect";
import * as Stdio from "effect/Stdio";

/** Whether standard input ended naturally; only used when inspecting the transport child fiber's exit. */
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
