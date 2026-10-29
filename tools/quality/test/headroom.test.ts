// The admission check of skill `verify-reebeat` (spec 0009): `headroom.sh` reads a fake /proc written in a temporary directory. A
// reading that is missing or not a number must be SHORT with its reason, never healthy: each gate has a control for a missing
// file, an empty value and a value that is not a number, and for a reading over its limit.
import { NodeServices } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Effect, Record, String as Str } from "effect";
import { ChildProcess } from "effect/process";

import { scratch, skillScript } from "./skillScripts.ts";

/** The files of a healthy machine: 8 threads, 40 GB of 64 GB available, no swap-in, no pressure. */
const healthy: Readonly<Record<string, string>> = {
  loadavg: "2.00 2.00 2.00 1/100 1\n",
  meminfo: "MemTotal: 65536000 kB\nMemAvailable: 40960000 kB\n",
  "pressure/io":
    "some avg10=1.00 avg60=1.00 avg300=1.00 total=1\nfull avg10=0.00 avg60=0.00 avg300=0.00 total=0\n",
  "pressure/memory":
    "some avg10=1.00 avg60=1.00 avg300=1.00 total=1\nfull avg10=0.00 avg60=0.50 avg300=0.00 total=1\n",
  vmstat: "pswpin 100\npswpout 0\n",
};

/** Runs headroom.sh on `files` (healthy ones with these changes; a `null` value deletes the file) and gives `code:output`. */
const headroom = Effect.fn("headroom")(function* headroom(
  changes: Readonly<Record<string, string | null>>,
  env: Readonly<Record<string, string>> = {}
) {
  const { dir, fs, path, spawner } = yield* scratch;
  const files = { ...healthy, ...changes };

  yield* Effect.forEach(Record.toEntries(files), ([name, text]) =>
    text === null
      ? Effect.void
      : Effect.gen(function* write() {
          const file = path.join(dir, "proc", name);

          yield* fs.makeDirectory(path.dirname(file), { recursive: true });
          yield* fs.writeFileString(file, text);
        })
  );

  const script = skillScript(path, "verify-reebeat", "scripts", "headroom.sh");

  return yield* spawner.string(
    ChildProcess.make(
      "bash",
      [
        "-c",
        'if [ -n "$AFTER_VMSTAT" ]; then (sleep 0.3; printf "%s\\n" "$AFTER_VMSTAT" >"$REEBEAT_VERIFY_PROC_ROOT/vmstat") & fi; out=$("$0" 2>&1); code=$?; wait; printf "%s\\n%s" "$code" "$out"',
        script,
      ],
      {
        env: {
          REEBEAT_VERIFY_DEMAND_MIB: "1024",
          REEBEAT_VERIFY_NPROC: "8",
          REEBEAT_VERIFY_PROC_ROOT: path.join(dir, "proc"),
          REEBEAT_VERIFY_ROOT: path.join(dir, "evidence"),
          REEBEAT_VERIFY_TEST_SAMPLE_SECONDS: "0.1",
          ...env,
        },
        extendEnv: true,
      }
    )
  );
});

const verdict = (output: string) => {
  const [code, ...lines] = Str.split(output, "\n");

  return {
    code,
    short: Arr.filter(lines, Str.startsWith("headroom SHORT:")),
  };
};

describe("headroom.sh reads before it admits", () => {
  it.effect("a healthy machine is admitted", () =>
    Effect.gen(function* admitted() {
      const { code, short } = verdict(yield* headroom({}));

      assert.deepStrictEqual([code, short], ["0", []]);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer))
  );

  it.effect("negative control: a reading over its limit is SHORT", () =>
    Effect.gen(function* over() {
      const overLimits: readonly (readonly [
        string,
        Record<string, string | null>,
        string,
      ])[] = [
        [
          "memory pressure",
          {
            "pressure/memory":
              "some avg10=1.00 avg60=1.00 avg300=1.00 total=1\nfull avg10=0.00 avg60=12.00 avg300=0.00 total=1\n",
          },
          "memory PSI full avg60 is 12.00, not under 10",
        ],
        [
          "load",
          { loadavg: "9.00 9.00 9.00 1/100 1\n" },
          "load1 9.00 is not under 8 CPU threads",
        ],
        [
          "memory",
          { meminfo: "MemTotal: 65536000 kB\nMemAvailable: 3000000 kB\n" },
          "MemAvailable after the job would be 1905 MiB, under 20% of RAM (12800 MiB)",
        ],
      ];

      for (const [name, changes, reason] of overLimits) {
        const { code, short } = verdict(yield* headroom(changes));

        assert.deepStrictEqual(
          [name, code, short],
          [name, "1", [`headroom SHORT: ${reason}`]]
        );
      }
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer))
  );

  it.effect(
    "negative control: a missing, empty or non-numeric reading is SHORT, never healthy",
    () =>
      Effect.gen(function* unreadable() {
        const unreadableReadings: readonly (readonly [
          string,
          Record<string, string | null>,
        ])[] = [
          ["pressure file missing", { "pressure/memory": null }],
          ["pressure empty", { "pressure/memory": "" }],
          [
            "pressure not a number",
            {
              "pressure/memory":
                "some avg10=1.00 avg60=1.00 avg300=1.00 total=1\nfull avg10=0.00 avg60=lots avg300=0.00 total=1\n",
            },
          ],
          ["load file missing", { loadavg: null }],
          ["load not a number", { loadavg: "busy 2.00 2.00 1/100 1\n" }],
          ["meminfo missing", { meminfo: null }],
          [
            "MemAvailable empty",
            { meminfo: "MemTotal: 65536000 kB\nMemAvailable:\n" },
          ],
          ["vmstat missing", { vmstat: null }],
          ["pswpin not a number", { vmstat: "pswpin many\n" }],
        ];

        for (const [name, changes] of unreadableReadings) {
          const { code, short } = verdict(yield* headroom(changes));

          assert.strictEqual(code, "1", name);
          assert.isTrue(
            short.length > 0 && Arr.every(short, Str.includes("unreadable")),
            name
          );
        }

        const { code, short } = verdict(
          yield* headroom({}, { REEBEAT_VERIFY_NPROC: "many" })
        );

        assert.strictEqual(code, "1");
        assert.isTrue(
          short.length === 1 &&
            Str.includes("CPU thread count is unreadable")(short[0] ?? "")
        );
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer))
  );

  it.effect(
    "negative control: swap-in over its limit, backwards, or unreadable at the end of the sample is SHORT",
    () =>
      Effect.gen(function* swapIn() {
        // The fake vmstat reads `pswpin 100` at the start; the injected file replaces it 0.3 s into a 0.6 s sample.
        const cases: readonly (readonly [string, string, string])[] = [
          [
            "over the limit",
            "pswpin 1300",
            "swap-in is 2000 pages/s, not under 1,000",
          ],
          [
            "backwards",
            "pswpin 50",
            "swap-in counter went backwards (100 to 50)",
          ],
          [
            "empty at the end",
            "pswpin",
            'swap-in sample (pswpin) after is unreadable (got "")',
          ],
        ];

        for (const [name, after, reason] of cases) {
          const { code, short } = verdict(
            yield* headroom(
              {},
              { AFTER_VMSTAT: after, REEBEAT_VERIFY_TEST_SAMPLE_SECONDS: "0.6" }
            )
          );

          assert.deepStrictEqual(
            [name, code, short],
            [name, "1", [`headroom SHORT: ${reason}`]]
          );
        }

        const under = verdict(
          yield* headroom(
            {},
            {
              AFTER_VMSTAT: "pswpin 400",
              REEBEAT_VERIFY_TEST_SAMPLE_SECONDS: "0.6",
            }
          )
        );

        assert.deepStrictEqual([under.code, under.short], ["0", []]);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    20_000
  );

  it.effect(
    "negative control: a sample window outside 10 to 30 s is refused, not admitted",
    () =>
      Effect.gen(function* window() {
        for (const seconds of ["0", "5", "31", "abc"]) {
          const { code, short } = verdict(
            yield* headroom(
              {},
              {
                REEBEAT_VERIFY_SAMPLE_SECONDS: seconds,
                REEBEAT_VERIFY_TEST_SAMPLE_SECONDS: "",
              }
            )
          );

          assert.deepStrictEqual(
            [seconds, code, short],
            [
              seconds,
              "1",
              [
                `headroom SHORT: the swap-in sample window is "${seconds}" s, not a whole number from 10 to 30`,
              ],
            ]
          );
        }
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer))
  );

  it.effect("REEBEAT_VERIFY_FORCE continues past a shortage and says so", () =>
    Effect.gen(function* forced() {
      const { code, short } = verdict(
        yield* headroom(
          { loadavg: "9.00 9.00 9.00 1/100 1\n" },
          { REEBEAT_VERIFY_FORCE: "1" }
        )
      );

      assert.deepStrictEqual([code, short.length], ["0", 1]);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer))
  );
});
