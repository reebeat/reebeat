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
| `buildPlan(source, sourceSha256)` | `Effect<PlanJson, PlanError>`; fails with the first error in document order. The CLI hashes the `.fountain` bytes (Effect's `Crypto` service) and passes the hash in; the core copies it into `plan.sourceSha256` and computes nothing |
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
- `= synopsis` lines under a `# Section` become the Chapter's `synopsis` (joined by a space); only `reebeat plan` shows it.
- No title: the Plan title is `Untitled`.
- The title page has three keys: `Title:`, `Author:` and `Speed:` (anything else is an error with its line).

## Speech rate

- `Speed: <number>` on the title page is the story's default speech rate, a multiple of the voice's natural speed from
  0.5 to 2.0. **Absent, it is 1.1.** It is written to `settings.speed` in `plan.json`.
- `(speed <number>)` before a Line sets that Line's rate absolutely (same range). `(slowly)` and `(quickly)` are
  presets relative to the story default (x 0.9 and x 1.1, rounded to four decimals, clamped to 0.5 to 2.0). `(pause N)`
  is unchanged. A Line takes one speed hint and one pause.
- The resolved rate of every Line is `Line.hints.speed` in `plan.json`; `reebeat plan` prints it only for a Line that
  differs from the default. The rate is part of the speech cache key, so changing it re-synthesises a Line and never
  reuses audio made at another rate.
- Errors name their line: `BadSpeed` (a `Speed:` or `(speed N)` that is not a number from 0.5 to 2, or a second
  `Speed:`), `BadParenthetical` (two speed hints before one Line, or `(speed)` without a value).

## Sounds that go with a transition

**Interim.** The positional rule below is release 1's stopgap: spec 0002 replaces it with an explicit `transition.start` anchor written in the screenplay, and the Plan's `anchor` field then comes from that syntax.

An `sfx` Cue written **before the first word of the first Line of a Scene** is anchored to that Scene's slide change
(`Cue.anchor` is `"transition-start"` in `plan.json`; every other Cue is `"word"`). It fires at the Scene's
`slideFrame`, the first frame of the transition, so `[[sfx: whoosh]] On the next screen, ...` sounds when the box starts
to move, although the narration starts `sceneLead` later. A `(pause N)` before that Line does not move it. A Cue of
another kind, or a Cue after a word, or before the first word of a later Line, keeps its meaning: the end of the word
before it, or the start of its Line. `reebeat plan` shows the anchor (`sfx whoosh  transition.start -> frame 729`
with `--timing`).

## Schedule arithmetic

Frames are integers; every duration is turned into frames with `Math.round` (halves up) before it is added. The
formulas are in the header of `src/schedule.ts`; `test/schedule.test.ts` works the expected frames out by hand.

## Tests

`bun run test` in this directory. `test/fixtures/boxes.plan.json` and `boxes.review.txt` are golden outputs of
`boxes.fountain`: after a deliberate change, regenerate them from `buildPlan`, `encodePlan` and `reviewText` and read
the diff before committing it. The formatter ignores `test/fixtures`.
