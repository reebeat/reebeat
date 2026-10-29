// `cleanup.sh` of skill `verify-reebeat` (spec 0009): it stops the process groups that `run.sh` and `observe.ts` recorded in `pids.txt`
// and nothing it could find by name. Scenario 1: a recorded step group dies; an unrelated process whose command line names the run
// directory and "chromium" survives; a live group leader whose recorded start time is not its own (a reused pid) survives.
// Scenario 2: a step launches the real Chromium through Playwright (detached, a group of its own) and records it with `recordBrowser`;
// the step group is then killed hard, as an interrupted run would be: the browser outlives it, and `cleanup.sh` stops it.
import { NodeServices } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Effect, String as Str } from "effect";
import { ChildProcess } from "effect/process";

import { scratch, skillScript } from "./skillScripts.ts";

const helpers = String.raw`
start() { awk '{ print $22 }' "/proc/$1/stat"; }
alive() { if kill -0 "$1" 2>/dev/null && [ "$(awk '{ print $3 }' "/proc/$1/stat")" != Z ]; then echo alive; else echo dead; fi; }
group() { if kill -0 -- "-$1" 2>/dev/null; then echo alive; else echo dead; fi; }
`;

const groups = String.raw`
set -u
run=$1; script=$2
mkdir -p "$run"
setsid bash -c 'sleep 300 & wait' &
step=$!
bash -c 'while :; do sleep 1; done' "chromium --user-data-dir=$run/profile" &
other=$!
setsid sleep 302 &
reused=$!
sleep 0.5
echo "before: step=$(alive "$step") group=$(group "$step") other=$(alive "$other") reused=$(group "$reused")"
printf '%s %s\n%s %s\n' "$step" "$(start "$step")" "$reused" "1" >"$run/pids.txt"
"$script" "$run" >"$run/cleanup.out" 2>&1
sleep 0.5
echo "after: step=$(alive "$step") group=$(group "$step") other=$(alive "$other") reused=$(group "$reused")"
kill "$other" 2>/dev/null; kill -- "-$reused" 2>/dev/null
wait 2>/dev/null
`;

const interrupted = String.raw`
set -u
run=$1; script=$2; playwright=$3; record=$4
mkdir -p "$run"
cat >"$run/launch.ts" <<EOF
import { chromium } from "$playwright";
import { recordBrowser } from "$record";
const browser = await chromium.launch({ args: ["--disable-gpu"], executablePath: process.env.REEBEAT_CHROMIUM });
console.log("browser", await recordBrowser(browser));
await new Promise((resolve) => setTimeout(resolve, 300000));
EOF
export REEBEAT_VERIFY_PIDS="$run/pids.txt"
setsid bun "$run/launch.ts" >"$run/launch.out" 2>&1 &
step=$!
printf '%s %s\n' "$step" "$(start "$step")" >"$run/pids.txt"
for _ in $(seq 100); do grep -q '^browser [0-9]' "$run/launch.out" 2>/dev/null && break; sleep 0.2; done
browser=$(awk '/^browser/ { print $2 }' "$run/launch.out")
[ -n "$browser" ] || { echo "no browser: $(cat "$run/launch.out")"; exit 1; }
echo "recorded: $(awk -v b="$browser" '$1 == b { print "browser" }' "$run/pids.txt")"
echo "own group: $([ "$(awk '{ print $5 }' "/proc/$browser/stat")" = "$browser" ] && echo yes || echo no)"
kill -STOP -- "-$browser"  # a hung browser: it cannot notice that its parent is gone
kill -KILL -- "-$step"
sleep 0.5
echo "interrupted: step=$(group "$step") browser=$(alive "$browser")"
"$script" "$run" >"$run/cleanup.out" 2>&1
for _ in $(seq 50); do [ "$(group "$browser")" = dead ] && break; sleep 0.1; done
echo "cleaned: browser=$(group "$browser")"
kill -KILL -- "-$browser" 2>/dev/null
wait 2>/dev/null
`;

describe("cleanup.sh stops what was recorded and nothing else", () => {
  it.effect(
    "negative control: an unrelated lookalike and a reused-pid group leader survive, the recorded group dies",
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
            `${helpers}${groups}`,
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

  it.effect(
    "an interrupted run's Chromium, detached in a group of its own, is recorded and stopped",
    () =>
      Effect.gen(function* browser() {
        const { dir, path, spawner } = yield* scratch;

        const script = skillScript(
          path,
          "verify-reebeat",
          "scripts",
          "cleanup.sh"
        );

        const playwright = path.resolve(
          skillScript(path, "verify-reebeat"),
          "..",
          "..",
          "..",
          "packages",
          "capture-chromium",
          "node_modules",
          "playwright-core",
          "index.mjs"
        );

        const record = skillScript(
          path,
          "verify-reebeat",
          "scripts",
          "recordPid.ts"
        );

        const out = yield* spawner.string(
          ChildProcess.make("bash", [
            "-c",
            `${helpers}${interrupted}`,
            "scenario",
            path.join(dir, "run"),
            script,
            playwright,
            record,
          ])
        );

        assert.strictEqual(
          Str.trim(out),
          Arr.join(
            [
              "recorded: browser",
              "own group: yes",
              "interrupted: step=dead browser=alive",
              "cleaned: browser=dead",
            ],
            "\n"
          )
        );
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    60_000
  );
});
