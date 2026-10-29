# 0012 Extension architecture

Status: **plan, built** (frozen when its PR opens; revisions are dated entries at the end). Date: 2026-10-29. Decided by: the operator's direction of 2026-10-29 (declarative multimedia that is accessible, reproducible and rebuilt as you edit; multiple render engines chosen per Scene, with compositor transitions and snapshot carry-over between engines; an SDK for building render engines; open core with plugin seams and an open agent tool protocol). The ADR marks which of its decisions the operator made and which are proposed.
Process: [spec 0000](0000-development-lifecycle.md). Number 0012 because the lead assigned the numbers on 2026-10-29: 0009 is the merged npm pre-releases spec, 0010 the review and verify skills, 0011 the positioning, and 0004, 0005 and 0006 the state-machine work. Branch `docs/extension-architecture`, named by the lead (the convention is `feat/NNNN-<slug>`).
Verify skill: none, documentation only: it changes no output of `reebeat`; the falsifiers below are observed with commands on the committed files.
Decision record: [ADR-0000](../decisions/0000-extension-architecture.md).

## Goal

**Declarative multimedia: accessible, reproducible, rebuilt as you edit.** *We take care of building; you focus on creating.* reebeat is a declarative, incremental FRP language for multimedia artifact generation (the operator's wording of 2026-10-29). Its extension points are real but narrow: seven service tags and a closed selection table. The operator now wants engines in other languages (Manim), several engines in one story, third-party plugins and an open core. Before any of it is built, one record fixes:

1. where the extension contracts are declared;
2. the catalogue of extension points, each with its tier and whether third parties may use it now, later or never;
3. the engine protocol for engines in other languages, and the SDK and the conformance runner around it;
4. how the compiler checks a story against what an engine can do, at plan time and failing closed;
5. how contracts are versioned and how a plugin declares what it implements;
6. how a plugin is packaged, discovered, shown in the studio and sandboxed;
7. what determinism and testing every plugin owes.

The record is [ADR-0000](../decisions/0000-extension-architecture.md). This spec is the plan that delivers it and the falsifiers that hold it to the repository.

## Journey

A reader of each kind opens the repository and finds what they need:

```text
Plugin author (Python engine):   docs/decisions/0000 -> Decision 3 (protocol, messages, conformance clauses E1 to E22)
                                                       Decision 4 (capabilities)  Decision 6 (manifest, trust)
Plugin author (lint rule):       Decision 2 row 15 (open now, pure)  Decision 5 (stability, peer range)
Reviewer of the architecture:    Context (what exists, what is new, status of each) -> each Decision with its alternatives
Studio engineer:                 Decision 1 (what is generated from the registry)  Decision 6 ("What the studio does")
Next spec author:                "Order of work" and "What is deliberately not built yet" in the Consequences
```

Everything in the record is a decision with a reason. Nothing is built: no package, no schema, no test changes. The implementing specs are named in the ADR and numbered when they are written.

## What is built

| Part | Where |
| --- | --- |
| The ADR: context, seven decisions each with alternatives and reason, consequences, open questions, sources | `docs/decisions/0000-extension-architecture.md` |
| The ADR directory: when to write one, the template, the index | `docs/decisions/README.md` |
| This spec | `docs/specs/0012-extension-architecture.md` |
| Glossary entries for the terms the ADR introduces (Contract, Capability, Engine, Compositor, Boundary frame, Plugin, Run, Brief) | `GLOSSARY.md`, section "Extension points" |

No code is built; the PR changes documentation only.

## Falsifiers

Each is observed with a command on the head.

- **F-ext1, every question is decided with alternatives.** `grep -c '^## Decision [1-7]:' docs/decisions/0000-extension-architecture.md` prints 7, and `grep -c '^### Alternatives considered' docs/decisions/0000-extension-architecture.md` prints 7. Falsified by a missing decision or a decision with no alternatives table.
- **F-ext2, the catalogue is complete.** Every name in the list below appears in a row of the catalogue table of Decision 2 with a tier and an openness value (`now`, `later`, `never`): `SpeechSynthesizer`, `WordAligner`, `SoundLibrary`, `AssetCache`, `Encoder`, `FrameCapturer`, `Renderer`, `Engine`, `Compositor`, `ArtifactRenderer`, `IrCodec`, `Importer`, `EffectKind`, `TransitionType`, `LintRule`, `StatechartInterpreter`, `AgentTool`, `Sandbox`, `InteractiveArtifact`, `InputSource`, `ElementKind`, `InteractionKind` (the last four are roadmap items or closed by design, [#19](https://github.com/reebeat/reebeat/issues/19) and [#20](https://github.com/reebeat/reebeat/issues/20) among them), and the curves and expression language row. Falsified by a name with no row. The command is a loop of `grep -F` over the table lines.
- **F-ext3, links resolve.** Every relative link in the three new files points to an existing path, and every external link answers with a success status, with one stated exception: the publisher of Build Systems à la Carte (`doi.org`, ACM) answers non-browser clients with 403, so its title, authors and venue were checked in the Crossref record. Falsified by any other that does not. The commands and their raw output are in the PR body.
- **F-ext4, diagrams are valid.** Every `mermaid` block of the ADR parses with the Mermaid parser. Falsified by a parse error. Command and raw output in the PR body.
- **F-ext5, documentation only.** `git diff --name-only origin/main...HEAD` lists only files under `docs/` and `GLOSSARY.md` (the README is another change's). Falsified by a source, manifest or tool file.
- **F-ext6, the vocabulary is the operator's.** The tagline "Declarative multimedia: accessible, reproducible, rebuilt as you edit" appears in the ADR and in this spec, the ADR has its section "The four aims every decision serves" (declarative scenes and transitions, accessible, reproducible, rebuilt as you edit) with a row for each, and `grep -riE 'multi-?sens' docs GLOSSARY.md README.md` finds nothing (the operator retired the earlier wording on 2026-10-29). Falsified by either.
- **F-ext7, the decisions' provenance is honest.** Every decision of the ADR carries one of **Decided**, **Proposed** or **Open**; the operator's decisions listed in Context are the only ones marked Decided. Falsified by a proposal worded as decided.
- **F-ext8, the critique is recorded.** The ADR's Revisions section has a dated entry that lists each objection of the `architecture-critic` review and how it was resolved or why it was not. Falsified by an empty Revisions section after review.
- **F-ext11, the React alternative and the layering are decided.** The ADR has the section "Considered alternative: React's core as reebeat's engine" with seven reasons, the two kept options (React as one engine, JSX as an importer) and the Remotion licence point marked as an inference, and the section "Layering: the story, the plans and the build graph" saying that "DAG" applies only to the build graph. `grep -c '^## Considered alternative: React' docs/decisions/0000-extension-architecture.md` and `grep -c '^## Layering' ...` print 1 each, and the React table has seven rows. Falsified by a missing section or row.
- **F-ext9, the gates pass.** `bun run ready` passes on the head (the spec and feature-map tests, formatting of the files, the licence and tier gates, the journey).
- **F-ext10, claims about existing code are checked.** Every path of the repository that the ADR names in backticks exists, and every symbol it names (`xContract`, `failingClauses`, `assetKey`, `RendererInfo`, `AdapterInfo`, `UnknownSelection`, `AdapterUnavailable`, `rejectSecretSettings`, `atomicWriteClause`, `choices`) is found in the sources by `grep -rlw`. Falsified by a path or symbol that is absent (a path of a *future* file, such as `docs/contracts/<id>.md`, is written as a template and is the one expected miss). Command and raw output in the PR body.

## Not in scope

- Any code: the `contracts` package, the registry, the generated docs, the engine protocol and SDK, the compositor, plugin loading, the `Sandbox` service. Each is a spec after this one (the ADR's "Order of work").
- The README and the positioning document (another change owns them); the ADR is linked from this spec and from `docs/decisions/README.md`.
- The grammar of the per-Scene engine Hint (it belongs to the grammar spec after 0005).
- Publishing: [spec 0009](0009-npm-prereleases.md) decides how packages reach npm. This record only says what plugin authors will peer-depend on.
- A decision on the closed products (the studio's licence, price, sync server).

## Open questions for the operator

The ADR lists eight (package name and tier, engine id as story content, default trust level, TypeScript-only SDK, reproducible by default, compositor timing, ADR numbering, WebMCP). None blocks this PR: each decision is marked Proposed and the implementing specs record the answer.

## Revisions

- **2026-10-29, review round 1 (`architecture-critic`).** The ADR's Revisions table lists the fourteen objections (one blocker, ten majors, three minors) and how each was resolved. The blocker (a Beat between two Scenes on the same engine had no home) changed the protocol's unit of work from a Scene to a run. F-ext10 was added because the review found wrong claims about existing code that the shape-only falsifiers could not catch.
- **2026-10-29, direction folded in.** The operator's tagline and the four aims; interactions as elements, with `static` and `dynamic` artifact kinds and interaction surfaces in the artifact renderer's capability declaration, and the split between authoring tools and interaction tools; WebMCP as an experimental candidate with its status checked and cited; the README is left to the change that owns it, so this spec no longer links the ADR from it.
- **2026-10-29, review round 2 (`architecture-critic`, second pass).** Two blockers (the SDK needs its own `sdk` tier so first-party engines may import it; the decisions README now defines Proposed as merged and not yet confirmed by the operator), six majors (a plan brief and a render brief; a per-Scene seed from stable identity and an honest statement that the unit of reuse is the run; the registry rule's exceptions and clauses E23 and E24; accessibility on by default like reproducibility; what "open now" means; interactions fire only declared transitions) and two minors, all recorded in the ADR's Revisions. The ADR's decisions are unchanged in direction; the open questions grew to nine.
- **2026-10-29, operator direction on React.** The operator rejected React's core as reebeat's engine core and fixed the layering (statechart, per-artifact plan, build DAG); the ADR gained the two sections above (F-ext11).
