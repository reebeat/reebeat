# @reebeat/core

Screenplay in, Plan out. Pure: it depends on `effect` and `fountain-js` only, and reads no file (the CLI reads the
`.fountain` file and passes its text). Spec: [`docs/specs/0001-release-1-screenplay-to-deck-and-video.md`](../../docs/specs/0001-release-1-screenplay-to-deck-and-video.md).

```text
source ──parseFountain──▶ tokens ──adaptTokens──▶ Story ──resolveCues, identityDiff──▶ PlanJson   buildPlan
PlanJson + AlignedLine[] ──schedule──▶ PlanJson with a timeline                                    schedule
PlanJson ──reviewText──▶ the text of `reebeat plan [--timing]`                                     reviewText
```

| Export | What it is |
| --- | --- |
| `buildPlan(source)` | `Effect<PlanJson, PlanError>`; fails with the first error in document order |
| `collectErrors(source)` | every `PlanError`, in document order (plain function) |
| `schedule(plan, aligned)` | `Effect<PlanJson, ScheduleError>`; adds `timeline` |
| `reviewText(plan, { timing })` | the review text, deterministic |
| `decodePlan(json)`, `encodePlan(plan)` | `plan.json` text in and out; keys are written in alphabetical order, so equal Plans are byte-equal |
| `...Schema`, types | the Plan contract of the spec; `src/plan.ts` is its authority |

## Notes for story authors

- `#id` is required on every Element line; `{...}` holds `#id @cell .class hidden`.
- A line that Fountain reads as something else is not an Element: an ALL-CAPS first line is a character cue, a line
  starting `#`, `=`, `~`, `>` or `.` is an outline, lyric, transition or heading. Start the line with `!` to force
  Action (`!BOX {#a}`).
- A transition (`> AUTO-ANIMATE`, `> CUT`) stands alone, between blank lines, right before the scene heading it leads into
  (a `# Section` or `= synopsis` may stand between). A Scene needs a Section before it and at least one `NARRATOR` Line.
- No title: the Plan title is `Untitled`.

## Schedule arithmetic

Frames are integers; every duration is turned into frames with `Math.round` (halves up) before it is added. The
formulas are in the header of `src/schedule.ts`; `test/schedule.test.ts` works the expected frames out by hand.

## Tests

`bun run test` in this directory. `test/fixtures/boxes.plan.json` and `boxes.review.txt` are golden outputs of
`boxes.fountain`: after a deliberate change, regenerate them from `buildPlan`, `encodePlan` and `reviewText` and read
the diff before committing it. The formatter ignores `test/fixtures`.
