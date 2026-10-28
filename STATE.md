# State

Lifecycle: build

Now:

reebeat turns a Fountain screenplay into a reveal.js Deck and a captured Video. Spec 0000 (development lifecycle) is merged. Spec 0001 (release 1) is built and in review, in the composable layout of design R3 (libraries, services, a build program, adapters, tools): `stories/same-id` builds end to end (parse, Plan, speech cache, schedule, Deck, Video, checks) on adapters chosen by `reebeat.config.json` or flags, the whole pipeline also builds offline with stand-in speech (`--speech silent --aligner even`), and `reebeat check` verifies the falsifiers on the written files.

Next:

- Merge spec 0001 after its review rounds; then spec 0002.
- Candidates for 0002 (recorded in design R2, not started): reebeat's own motion engine as a renderer plug-in, and the pixel-identical port of the earlier 4EM explainer as its regression test (`docs/design/4em-regression-baseline.md`).

Blocked:

- Nothing blocks release 1. Open questions for the operator are at the end of spec 0001.
