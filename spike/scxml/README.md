# spike/scxml (throwaway)

Evidence for `docs/specs/0007-scxml-persistent-ir-spike.md` (the report is on branch `spike/scxml-ir`). Never merged into a package.

- `vendor/0004/`: a copy of the IR schema of the `feat/0004-state-machines` working tree (HEAD `28b3d13` plus uncommitted work), the files `graph.ts`, `plan.ts`, `machines.ts`, `errors.ts`, `speed.ts`. Provenance: reebeat repository, spec 0004, unmodified.
- `fixtures/`: the 0004 IR of `stories/same-id` (`same-id.graph.json`, made by `dump-graph.ts`) and its SCXML form (`same-id.scxml`).
- `src/`: `xml.ts` (saxes parser, printer), `profile.ts` (the profile as an Effect Schema), `codec.ts` (IR to SCXML and back), `generic.ts` (structure-blind XML), `coverage.ts`, `ergonomics.ts`, `stats.ts`, and the tests `roundtrip.test.ts`, `profile.test.ts`.
- `interop/`: probes for Apache Commons SCXML, SCION, `@xstate/scxml` and the XSD driver.
- `results/`: the output of each script as run for the report.

`bun install` here, then see the Reproduction section of the report.

## Result files and the command that made each (from `spike/scxml/`)

| File in `results/` | Command |
| --- | --- |
| `same-id.txt`, `coverage.txt`, `generator-stats.txt` | `bun src/same-id.ts`, `bun src/coverage.ts`, `bun src/stats.ts` |
| `property-test.txt`, `mutation-*.txt`, `profile-test.txt` | `RUNS=1000 bun test --timeout 300000 src/roundtrip.test.ts` (with `MUTATE=<name>` for a mutant), `bun test src/profile.test.ts` |
| `raw-falsification.txt` | `bun src/raw-count.ts` |
| `drift.txt` | `sh src/drift.sh` (adds an optional field to the vendored `ElementSchema`, runs the tests, restores) |
| `ergonomics.txt` | `PAIRS=1000 bun src/ergonomics.ts` |
| `xml-libs.txt` | `sh src/xml-libs.sh` |
| `interop-*.txt` | `WORK=/tmp/scxml-interop sh interop/run-interop.sh` (Commons SCXML build, SCION, Qt `qscxmlc`, `@xstate/scxml`, W3C XSD; needs network and nix) |

The XState measurements are in `../xstate/` (`README.md`, `results/`).
