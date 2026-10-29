// `cleanup.sh` of skill `verify-reebeat` (spec 0009): it stops the process groups that `run.sh` recorded in `pids.txt` and nothing it
// could find by name. The test starts a recorded step (a session of its own, with a child), an unrelated process whose command line
// names the run directory and "chromium", and a live process whose recorded start time is not its own (a reused pid); after the
// cleanup the recorded group is gone and the other two are alive.
import { NodeServices } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Effect, String as Str } from "effect";
import { ChildProcess } from "effect/process";

import { scratch, skillScript } from "./skillScripts.ts";

const scenario = String.raw`
set -u
run=$1; script=$2
mkdir -p "$run"
start() { awk '{ print $22 }' "/proc/$1/stat"; }
alive() { if kill -0 "$1" 2>/dev/null && [ "$(awk '{ print $3 }' "/proc/$1/stat")" != Z ]; then echo alive; else echo dead; fi; }
group() { if kill -0 -- "-$1" 2>/dev/null; then echo alive; else echo dead; fi; }
setsid bash -c 'sleep 300 & wait' &
step=$!
bash -c 'while :; do sleep 1; done' "chromium --user-data-dir=$run/profile" &
other=$!
sleep 302 &
reused=$!
sleep 0.5
echo "before: step=$(alive "$step") group=$(group "$step") other=$(alive "$other") reused=$(alive "$reused")"
printf '%s %s\n%s %s\n' "$step" "$(start "$step")" "$reused" "1" >"$run/pids.txt"
"$script" "$run" >"$run/cleanup.out" 2>&1
sleep 0.5
echo "after: step=$(alive "$step") group=$(group "$step") other=$(alive "$other") reused=$(alive "$reused")"
kill "$other" "$reused" 2>/dev/null
wait 2>/dev/null
`;

describe("cleanup.sh stops what run.sh recorded and nothing else", () => {
  it.effect(
    "negative control: an unrelated lookalike and a reused pid survive, the recorded group dies",
    () =>
      Effect.gen(function* recorded() {
        const { dir, path, spawner } = yield* scratch;

        const script = skillScript(
          path,
          "verify-reebeat",
          "scripts",
          "cleanup.sh"
        );

        const out = yield* spawner.string(
          ChildProcess.make("bash", [
            "-c",
            scenario,
            "scenario",
            path.join(dir, "run"),
            script,
          ])
        );

        assert.strictEqual(
          Str.trim(out),
          Arr.join(
            [
              "before: step=alive group=alive other=alive reused=alive",
              "after: step=dead group=dead other=alive reused=alive",
            ],
            "\n"
          )
        );
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    20_000
  );
});
