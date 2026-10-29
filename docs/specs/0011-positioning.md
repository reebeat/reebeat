# 0011 Positioning: goals, vision and intent, how it works, and how reebeat differs from existing tools

Status: **plan, built** (frozen when its PR opens; revisions are dated entries at the end). Date: 2026-10-29. Decided by: the operator, 2026-10-29 (the words, the categories and the rules of the comparison).
Process: [spec 0000](0000-development-lifecycle.md). Number 0011, assigned by the lead (0009 npm pre-releases, 0010 review and verify skills, 0012 extension architecture, 0004 to 0006 state machines). The branch is `docs/positioning`, named by the lead (the convention is `feat/NNNN-<slug>`). Docs, plus one test file for the rules of the docs (see Revisions, review round 2): no product code changes.
Verify skill: none, docs and a test of the doc rules only: it changes no output of `reebeat`.

## Goal

Say what reebeat is for, in words that do not claim more than the code does.

- **Tagline:** "Declarative multimedia: accessible, reproducible, rebuilt as you edit."
- **Intent line:** "We take care of building; you focus on creating."
- **Intent sentence:** "Declare your scenes and the narrative's structure; reebeat generates the transitions between them and produces video, decks, captions and audio description from the same source. Every result is byte-for-byte reproducible, and an edit rebuilds only what changed."
- **Technical description (revised 2026-10-29, see Revisions):** "Semantically declared story beats, compiled into multimedia artifacts: statecharts for structure, functional reactive time, and an incremental build graph, written in Effect." The elevator version: "You declare the story's beats and what they mean; reebeat derives motion, timing and every artifact, reproducibly, rebuilding only what an edit changes."
- **Vocabulary:** *creation* or *creating* is the creative work of the author; *build* is what reebeat does. The focus is on declaring the narrative and its structure, not on how it is built.
- **Honesty:** every claim above has a status. Byte-identical builds are real today (F6 of spec 0001). Declared machines and timing are being built (spec 0004); reebeat's own transition generation is being planned (spec 0005, not written yet). Accessible outputs are planned ([#12](https://github.com/reebeat/reebeat/issues/12)), incremental builds are planned ([#9](https://github.com/reebeat/reebeat/issues/9)), and an interactive website artifact is planned ([#19](https://github.com/reebeat/reebeat/issues/19)).

Then compare the approach with existing tools, fairly and with sources, in `docs/design/positioning.md`, and say how the qualities are delivered in `docs/design/how-it-works.md`.

## Journey

```text
$EDITOR README.md                       # the opening: tagline, intent, technical description, status table
$EDITOR docs/design/positioning.md      # the comparison: table, prior art, experience, when not to use
$EDITOR docs/design/how-it-works.md     # the how: qualities to mechanisms, three layers, prior art, built and planned
$EDITOR GLOSSARY.md                     # "Words for the work": creation and build
```

A reader opens the README and sees the tagline, the intent line and sentence, and the technical description. Directly below, a status table says which parts are real, being built or planned. A link leads to the positioning note. The note has a comparison table of 13 tools in three categories and reebeat, a section on prior art for the identity diff, the experience of creating in each category, a "when not to use reebeat" section, and the sources.

Everything is real: every link was opened on 2026-10-29 by an agent that copied the supporting text. Where the pages read say nothing, the note says "not found".

## Constraints and values

- **Fair and sourced.** Each claim about a tool's way of working links to that tool's official documentation. The note credits what each tool does better: real-time interactivity, mature editing, ecosystems, rich hand-made animation, live collaboration, accessibility checkers.
- **No performance claim without a measurement.** Speed is described from the documentation, or "not measured". The one reebeat figure is quoted from spec 0001 with its limits.
- **Status first.** Nothing in the README or the note says that reebeat does more than the code does.
- **Plain English** (the machine skill `simple-english`, pragmatic mode): short sentences, one word for one thing. The tagline, the intent line and the intent sentence are the operator's words and are kept as written.
- **One source per fact.** The status table in the README and the one in the note must agree (F-pos5). The vocabulary lives in the GLOSSARY; the README and the note link to it.
- **Conflicts with open work.** Open branches edit the README and the GLOSSARY (spec 0004 changes the first paragraph and the "Status:" line; spec 0010 may touch the specs list; spec 0012 appends to the GLOSSARY). This change adds a block after the title, two bullets after the specs bullet and one GLOSSARY section before "Groupings", and leaves the other lines alone.

## What is built

| Part | Where |
| --- | --- |
| README opening: tagline, intent line, intent sentence, technical description, status table, link to the note | `README.md` |
| Positioning note: rules, categories, comparison table, prior art, performance, experience, what others do better, when not to use reebeat, status, sources | `docs/design/positioning.md` |
| How reebeat works: qualities to mechanisms, the three layers (Model, Plan, Build) with a diagram, Effect and XState, authoring and interaction tools, prior art and the novelty claim, React considered and rejected, built and planned, sources | `docs/design/how-it-works.md` |
| GLOSSARY section "Words for the work": Creation and Build | `GLOSSARY.md` |
| Tests of the rules over the Markdown, with negative controls (F-pos1, F-pos3 to F-pos7) | `tools/quality/positioning.ts`, `tools/quality/test/positioning.test.ts` |
| This spec | `docs/specs/0011-positioning.md` |

## Falsifiers

- **F-pos1, the words are verbatim.** The README contains the tagline, the intent line, the intent sentence and the technical description exactly as written in the Goal above. Check: the test `tools/quality/test/positioning.test.ts` reads the quoted strings from this Goal and looks for each in the README. Control: a README fixture with one word changed.
- **F-pos2, every outside claim has a source.** Every URL in the note answers. Check: request each URL and list the status codes; a URL that refuses scripted requests is reported by name. Falsified by a link that answers 404.
- **F-pos3, the table has the agreed columns.** The header of the comparison table is exactly: Tool, Authoring model, How time is decided, How transitions arise, One source → many outputs, Accessibility outputs, Reproducibility, Collaboration and agents, Iteration loop (rebuild cost). Each of the 13 tools and reebeat has one row of nine cells, in that order. Check: the same test. Controls: a missing column, a missing tool row, a row with eight cells.
- **F-pos4, no unmeasured speed claim.** The "Performance" section of the note has no "faster than" or ratio sentence outside a quotation. Check: the same test. Controls: "faster than" and "3x" outside a quotation are reported; the same words inside a quotation are not.
- **F-pos5, status agrees.** Every row of the README status table appears in the note's status table with the same status words ("Real today", "Being built", "Being planned", "Roadmap"). The note adds one row, interactive lessons (#20, deferred investigation), and an evidence column. Each roadmap item names its issue and each item being built or planned names its spec. Check: the same test. Controls: a differing status word; a missing row.
- **F-pos6, the vocabulary rule holds.** In the README opening and the notes, "build" describes what reebeat does, and "creation" or "creating" describes the work of the author. Check: the same test applies a blocklist ("reebeat creates", "you build" and similar). The blocklist is partial: whether every use of the two words is right stays a read check. Controls: "reebeat creates the video" and "you build the video" are reported.
- **F-pos7, how-it-works is sourced and consistent.** Every external link in the body of `how-it-works.md` is also in its Sources section. The word "DAG" names the build graph only: a line with "DAG" must say "build" and must not say "Model" or "Plan". Check: the same test. Controls: "The Model is a DAG" and an external link missing from Sources are reported. The agreement of the "Built today, and planned" table with the README table is a read check.
- **F-pos8, the full gate.** `bun run ready` passes on the head.

## Not in scope

- Any product code, the adapters, or a change to the behaviour that the status table describes. The only code is the test of the doc rules.
- A benchmark of reebeat against another tool. The note says "not measured".
- Marketing copy. The note is for communication between readers, not for selling.
- The other open README edits (npm pre-releases, state machines).

## Open questions for the operator

None. The words, the categories, the rules and the status line were decided on 2026-10-29.

## Revisions

- **2026-10-29, interactivity added.** The lead added the roadmap items [#19](https://github.com/reebeat/reebeat/issues/19) (an interactive website as an artifact) and [#20](https://github.com/reebeat/reebeat/issues/20) (interactive lessons, deferred). The README status table lists #19 as roadmap. The note lists interactivity under "When not to use reebeat" and gives #20 as a deferred investigation.
- **2026-10-29, technical framing (supersedes the technical description of the Goal).** The operator accepted a new one-liner: "Semantically declared story beats, compiled into multimedia artifacts: statecharts for structure, functional reactive time, and an incremental build graph, written in Effect." It replaces "a declarative, incremental FRP language for multimedia artifact generation". The README carries the new line. The new note `docs/design/how-it-works.md` gives the technical "how": three layers (Model, Plan, Build), the role of Effect and XState, authoring and interaction tools, prior art with a small novelty claim, React's core considered and rejected, and what is built or planned. F-pos1 reads the new description; F-pos7 is new and the full gate is now F-pos8.
- **2026-10-29, numbering.** The lead fixed the spec numbers: 0009 npm pre-releases, 0010 review and verify skills, 0011 this spec, 0012 extension architecture. The first version of the Process line named the numbers then open.
- **2026-10-29, review round 1 (supersedes the status of spec 0005 above and the Plan wording of the first `how-it-works.md`).**
  - Spec 0005 does not exist yet. The README, the note and this spec now say "being planned" for it, and "being built" only for spec 0004.
  - There is one Plan today: `buildProgram` derives one Plan and one Timeline, and the Deck and the Video render from them. `how-it-works.md` now says so. A Plan per artifact is the design and is roadmap with the website (#19).
  - `how-it-works.md` no longer cites design R5, which exists only on the branch of PR #17. It cites spec 0004 by its PR and says that it is not yet on `main`. Merge order: PR #17 first, then this PR (one README hunk to resolve).
  - F-pos1 and F-pos3 to F-pos7 now have a test with negative controls (`tools/quality/test/positioning.test.ts`). F-pos2 (links) stays a manual request run, because it needs the network. The tables' agreement between `how-it-works.md` and the README, and the full reading of "creating" and "build", stay read checks.
  - The "is new" claims are limited to the tools compared here. The performance line quotes the two build times of spec 0001 alone and says that they were not measured again. The Resolve cell no longer says that the free version includes collaboration.
- **2026-10-29, review round 2.**
  - The "only one" statement in `positioning.md` is reworded: none of the pages read for the tools compared describes such a step. "Not found" is not "absent".
  - The lines "Docs only: no code changes" (Process) and "Any code" (Not in scope) are corrected: the PR adds `tools/quality/positioning.ts` and its test, as round 1 recorded. No product code changes.
  - The agreement of the README status table with the "Built today, and planned" table of `how-it-works.md` stays a read check. The two tables use different row names and a different scope (the note lists specs and extension work that the README does not), so a mechanical compare needs a hand-kept name map, which is a second copy of the facts. The README against `positioning.md` compare is mechanical (F-pos5).
  - The tests are re-run after PR #17 merges and this branch is rebased.
  - The merge of `main` with spec 0010 added the rule that a spec from 0010 on carries a `Verify skill:` line. This spec now has one (`none`, with its reason), which the drift test `verifyMap.test.ts` required.
- **2026-10-29, merge of `main` with spec 0012 and the extension ADR.** `how-it-works.md` now lists the extension architecture as written (spec 0012, ADR-0000 proposed) and the diagram says "transitions" where it said "beats", so that the Model layer does not define Beat; the GLOSSARY entry for Beat is the business of PR #17 and spec 0012. This PR does not touch it. The ADR of spec 0012 still quotes the earlier technical description ("a declarative, incremental FRP language ..."); the owner of that ADR decides when to update it.
