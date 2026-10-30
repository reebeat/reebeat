# Architecture Decision Records

An ADR records a decision that is costly to reverse or that a future contributor will ask about ("why is it done this way?"). This directory holds ADRs; [`docs/specs/`](../specs/) holds the specs that deliver them. The two stay apart: a spec is a plan with falsifiers and ends when its PR merges, an ADR is a standing decision with its alternatives. Each ADR is linked from the spec that introduced it.

The format follows the donor repository's (Context, Decision, Consequences, with a date and a status). Numbers here are independent of spec numbers.

## When to write one

**Write one when:**

- the decision affects how packages depend on each other, how plugins are built, or what is public API;
- a technology choice would be costly to reverse;
- a rule must hold across the codebase and someone will ask why.

**Skip when:** the decision is trivially reversible, is a code style preference (use the linter), or a spec's Revisions section already says all there is to say.

## How to write one

1. Copy the template below to `NNNN-short-title.md`.
2. Fill in Context, Decision (with the alternatives considered and why not), Consequences.
3. Mark each decision **Decided** (by the operator, with the date), **Proposed** (by an agent, not yet confirmed) or **Open**, as [`open-core-boundary.md`](../design/open-core-boundary.md) does.
4. Link the ADR from its spec, and the spec from the ADR.
5. A later decision that replaces it sets the old status to `Superseded by ADR-NNNN`, with a link to the new file.

## Statuses

| Status | Meaning |
| --- | --- |
| Proposed | Written by an agent or an author and merged as a record; the operator has not yet confirmed it. A decision inside an ADR may be marked Decided (operator, with the date), Proposed or Open. |
| Accepted | Confirmed by the operator; the confirmation is a dated entry in the ADR's Revisions. |
| Deprecated | No longer relevant, kept for history. |
| Superseded by ADR-NNNN | Replaced by a newer decision. |

## Index

| ADR | Decision | Date | Status |
| --- | --- | --- | --- |
| [0000](0000-extension-architecture.md) | Extension architecture: where contracts live and how third parties extend tsukuri | 2026-10-29 | Proposed |

## Template

```markdown
# ADR-NNNN: Title

**Date:** YYYY-MM-DD
**Status:** Proposed | Accepted | Deprecated | Superseded by [ADR-NNNN](NNNN-title.md)

## Context

What is the issue that motivates this decision?

## Decision

What is the change, with the alternatives considered and why not.

## Consequences

What becomes easier, what becomes harder, what stays the same.
```
