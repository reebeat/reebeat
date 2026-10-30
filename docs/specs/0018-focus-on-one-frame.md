# 0018 Two focus effects on one frame are an error at plan time

Status: **plan** (frozen when its PR opens; revisions are dated entries at the end). Date: 2026-10-30. Decided by: the operator's authorisation of 2026-10-30 to fix problems found while using the CLI; the finding is issue #42.
Process: [spec 0000](0000-development-lifecycle.md). Number 0018: 0016 is held by an open PR (#39) and 0017 by the sibling speech-cache PR.
Verify skill: effect-focus, plan-output, lint-output

## Problem

The Deck has one focus ring. A later `focus` takes the ring over from the running one (spec 0004: `takeover` in `resolve.ts`, `endedBy: replaced`). When two `focus` effects of one Scene fire on the same frame, the later-declared one wins the tie and the earlier one is given a ring that starts and ends on that frame: a window of zero frames. Nothing ever shows it. The Plan accepts the story, `plan` and `lint` print no diagnostic, `plan --timing` shows the symptom only as a ring that "ends frame N, by the next focus" at its own start frame, and `check` then fails F1 with a message about pixels in a cell (`no frame within A to B differs in the cell of <element>`, `ring end not observed`), not about the two effects that collide.

The natural way to meet it is two word anchors whose `.end` land on one frame (`word("moves").end` twice), or two effects anchored to the same event.

## Goal

A Scene in which two different `focus` effects resolve to the same fire frame is rejected when the Plan is scheduled (`plan --timing`, `lint` when the speech cache exists, `build`), with an error that names **both effects** (id, line and `at` anchor) and **the frame** (and the Scene), so the author sees which two to separate.

The decision, with its alternatives:

| Option | Why not / why |
| --- | --- |
| **Error at schedule time (chosen)** | The ring is one by design (spec 0004), so one of two same-frame rings is dead by construction: it is a mistake the author did not mean, and silent dead effects are what F1 later cannot verify. Failing loud is the repository's rule. It costs the author one edit. |
| The schedule separates them by one frame | It moves an authored anchor: the effect no longer fires at the frame its anchor resolves to, which breaks F1's own check (observed frame equals resolved frame) and the "anchors resolve exactly" contract of spec 0002. It also hides the ordering decision (which of the two moves) in the scheduler. |
| Define two rings on one frame (both drawn) | A second ring is a Deck and capture change (a different Element, so a second ring in another cell), a change to the `takeover` model and to what the Deck's step list means. That is a feature with its own spec, not a fix. |

`focus` on one frame as an **error** needs no new Deck behaviour and removes a branch: the tie rule of `takeover` ("at the same frame, one declared later") becomes unreachable and is deleted.

## Non-goals

- Rings that start a few frames apart (issue #42 also reports 6 and 9 frame gaps failing F1, and 15 passing). That is a separate threshold (how long a ring must last for F1's observation window, `fireFrame - 3` to `fireFrame + 12` in `packages/verify/src/own.ts`, to see it), not the same-frame tie; this spec does not change it, and the PR says so.
- `show` and `sound` effects on one frame: they both fire, in declaration order (the grammar says so) and `show`s and `focus`es of one frame make one Beat. Unchanged.
- A `focus` and a `focus` on the **same Element** at one frame is also an error here (the same rule: two focus effects, one frame): the second never changes the ring.

## Journey

```text
an author
  1. writes two focus effects whose anchors land on one frame:
       fa: focus a at word("moves").end
       fb: focus b at word("moves").end
  2. tsukuri plan story.fountain --timing --speech silent --aligner even --cache-dir <dir>
       SimultaneousFocus: focus effects fa (line 9, at word("moves").end) and fb (line 10, at word("moves").end)
       both fire at frame 57 of Scene sc1 ...
  3. moves one of them (fb ... +0.3s) and runs plan --timing again: it prints the frames and a ring on each
```

Real: `plan --timing` over the real cache; the core tests schedule real Plans.

## Constraints and values

- Correctness by construction: the check runs where all runs of the Scene are known (`resolveEffects`), in one place; the error is a typed `ScheduleError` (`SimultaneousFocus`) that `lint` reports with the effect's source line like the other schedule errors.
- The grammar document is generated from `grammarDoc.ts` (`bun tools/quality/genGrammar.ts`); the sentence that says two different effects at one frame both fire gets its exception and the document is regenerated, never edited by hand.
- Tests prove the rule (two focus effects on one frame are rejected, naming both and the frame; one frame apart is accepted), not wording.

## Falsifiers

| # | Falsifier (must hold) | Gate | Negative control (must fail) |
| --- | --- | --- | --- |
| F1 | Two `focus` effects (different Elements, and the same Element) that resolve to one frame fail `schedule` with `SimultaneousFocus` naming both effect ids, their lines and anchors and the frame; the same two a frame apart schedule, and a `show` and a `focus` on one frame still schedule | `packages/core/test/schedule.test.ts` | delete the check in `resolveEffects`: the first case schedules and the test fails |
| F2 | `lint` reports the error with the later effect's source line when the speech cache exists | `packages/cli/test/lint.test.ts` | remove `SimultaneousFocus` from the `catchTags` of `lint.ts`: the type check fails (the handler is exhaustive) |
| F3 | The grammar document equals its generator and says focus effects on one frame are rejected | `packages/core/test/grammarDoc.test.ts` | edit `docs/grammar/effects.md` by hand: the test fails |
| F4 | The committed story and every other test still schedule: no existing Scene has two focus effects on one frame | `bun run ready` (the journey builds `stories/same-id`) | add a second focus on one frame to a copy of `stories/same-id`: `plan --timing` fails with `SimultaneousFocus` |
| F5 | The gates pass | `bun run ready` | any gate fails |

## Revisions

- **2026-10-30, this reverses a rule of spec 0004 on purpose.** Spec 0004 (and its test "gives the later declaration the ring when two focuses fire at one frame" in `packages/core/test/schedule.states.test.ts`) chose the tie rule: the later-declared focus wins and the earlier one gets a zero-length ring. Issue #42 shows the cost of that rule (a story that plans and cannot be verified), so the tie is now an error. The test is replaced by the rejection tests, the tie branch of `takeover` is deleted, and the grammar sentence is changed (regenerated). Spec 0004 itself stays frozen; this entry is the record that the rule moved.
- **2026-10-30, the verifier is untouched.** `packages/verify` reads `endedBy: replaced` from the Timeline; with the tie gone, a replacing focus always starts strictly after the replaced one, and `takerAt` still finds it by its fire frame.
