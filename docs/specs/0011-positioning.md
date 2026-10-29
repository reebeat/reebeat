# 0011 Positioning: goals, vision and intent, and how reebeat differs from existing tools

Status: **plan, built** (frozen when its PR opens; revisions are dated entries at the end). Date: 2026-10-29. Decided by: the operator, 2026-10-29 (the words, the categories and the rules of the comparison).
Process: [spec 0000](0000-development-lifecycle.md). Number 0011: `main` holds 0000 to 0003, 0007 and 0008; open branches hold 0004, 0009 (two branches) and 0010. The branch is `docs/positioning`, named by the lead (the convention is `feat/NNNN-<slug>`). Docs only: no code changes.

## Goal

Say what reebeat is for, in words that do not claim more than the code does.

- **Tagline:** "Declarative multimedia: accessible, reproducible, rebuilt as you edit."
- **Intent line:** "We take care of building; you focus on creating."
- **Intent sentence:** "Declare your scenes and the narrative's structure; reebeat generates the transitions between them and produces video, decks, captions and audio description from the same source. Every result is byte-for-byte reproducible, and an edit rebuilds only what changed."
- **Technical description:** "a declarative, incremental FRP language for multimedia artifact generation".
- **Vocabulary:** *creation* or *creating* is the creative work of the author; *build* is what reebeat does. The focus is on declaring the narrative and its structure, not on how it is built.
- **Honesty:** every claim above has a status. Byte-identical builds are real today (F6 of spec 0001). Declarative scenes and transitions are being built (specs 0004 and 0005). Accessible outputs are planned ([#12](https://github.com/reebeat/reebeat/issues/12)), incremental builds are planned ([#9](https://github.com/reebeat/reebeat/issues/9)), and an interactive website artifact is planned ([#19](https://github.com/reebeat/reebeat/issues/19)).

Then compare the approach with existing tools, fairly and with sources, in `docs/design/positioning.md`.

## Journey

```text
$EDITOR README.md                       # the opening: tagline, intent, technical description, status table
$EDITOR docs/design/positioning.md      # the comparison: table, prior art, experience, when not to use
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
- **Conflicts with open work.** Open branches edit the README and the GLOSSARY (spec 0004 changes the first paragraph and the "Status:" line; spec 0009 adds a bullet; spec 0010 appends to the GLOSSARY). This change adds a block after the title, one bullet after the specs bullet and one GLOSSARY section before "Groupings", and leaves the other lines alone.

## What is built

| Part | Where |
| --- | --- |
| README opening: tagline, intent line, intent sentence, technical description, status table, link to the note | `README.md` |
| Positioning note: rules, categories, comparison table, prior art, performance, experience, what others do better, when not to use reebeat, status, sources | `docs/design/positioning.md` |
| GLOSSARY section "Words for the work": Creation and Build | `GLOSSARY.md` |
| This spec | `docs/specs/0011-positioning.md` |

## Falsifiers

- **F-pos1, the words are verbatim.** The README contains the tagline, the intent line, the intent sentence and the technical description exactly as above. Check: `grep -F` for each. Falsified by a missing or reworded string.
- **F-pos2, every outside claim has a source.** Every URL in the note answers. Check: request each URL and list the status codes; a URL that refuses scripted requests is reported by name. Falsified by a link that answers 404.
- **F-pos3, the table has the agreed columns.** The header of the comparison table is exactly: Tool, Authoring model, How time is decided, How transitions arise, One source → many outputs, Accessibility outputs, Reproducibility, Collaboration and agents, Iteration loop (rebuild cost). Each of the 13 tools and reebeat has one row. Falsified by a missing column or row.
- **F-pos4, no unmeasured speed claim.** The note has no number that compares two tools. Check: read the "Performance" section. Falsified by a ratio or a "faster than" sentence about reebeat and another tool.
- **F-pos5, status agrees.** The status table of the README and the one of the note list the same claims with the same status, and each planned item names its issue (#9, #12, #19) and each in-progress item names its spec. Falsified by a difference.
- **F-pos6, the vocabulary rule holds.** In the README opening and the note, "build" describes what reebeat does, and "creation" or "creating" describes the work of the author. Falsified by "creating" used for what reebeat does in the new text.
- **F-pos7, the full gate.** `bun run ready` passes on the head.

## Not in scope

- Any code, the adapters, or a change to the behaviour that the status table describes.
- A benchmark of reebeat against another tool. The note says "not measured".
- Marketing copy. The note is for communication between readers, not for selling.
- The other open README edits (npm pre-releases, state machines).

## Open questions for the operator

None. The words, the categories, the rules and the status line were decided on 2026-10-29.

## Revisions

- **2026-10-29, interactivity added.** The lead added the roadmap items [#19](https://github.com/reebeat/reebeat/issues/19) (an interactive website as an artifact) and [#20](https://github.com/reebeat/reebeat/issues/20) (interactive lessons, deferred). The README status table lists #19 as planned. The note lists interactivity under "When not to use reebeat" and gives #20 as a deferred investigation.
