# spike/scxml (throwaway)

Evidence for `docs/specs/0007-scxml-persistent-ir-spike.md` (the report is on branch `spike/scxml-ir`). Never merged into a package.

- `vendor/0004/`: a copy of the IR schema of the `feat/0004-state-machines` working tree (HEAD `28b3d13` plus uncommitted work), the files `graph.ts`, `plan.ts`, `machines.ts`, `errors.ts`, `speed.ts`. Provenance: reebeat repository, spec 0004, unmodified.
- `fixtures/`: the 0004 IR of `stories/same-id` (`same-id.graph.json`, made by `dump-graph.ts`) and its SCXML form (`same-id.scxml`).
- `src/`: `xml.ts` (saxes parser, printer), `profile.ts` (the profile as an Effect Schema), `codec.ts` (IR to SCXML and back), `generic.ts` (structure-blind XML), `coverage.ts`, `ergonomics.ts`, `stats.ts`, and the tests `roundtrip.test.ts`, `profile.test.ts`.
- `interop/`: probes for Apache Commons SCXML, SCION, `@xstate/scxml` and the XSD driver.
- `results/`: the output of each script as run for the report.

`bun install` here, then see the Reproduction section of the report.
