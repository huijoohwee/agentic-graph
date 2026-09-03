---
title: agentic-graph Chat -> AI Markdown Pipeline (Fallback Recovery Companion)
status: canonical-companion
owner: platform-ai
---

# Fallback Recovery Companion

## Scope
This companion documents fallback recovery behavior for `chatAgenticGraph` when model output fails validation after retries.

## Recovery Order
The canonical recovery owner is the shared upstream recovery path reused by submit, extraction, and storage normalization helpers.

1. Score and select richest error candidate from raw assistant text, non-agenticOs answer text, and extracted `agenticOs`.
2. Try body salvage from leading frontmatter.
3. Try body salvage from embedded malformed frontmatter.
4. Try top-level frontmatter `solution_md` salvage.
5. Use omission note only when no usable markdown body remains.

## Workspace Handoff
- After final save, follow the resolved `agenticOs_*.md` path again.
- Force markdown workspace layout to `editor`.
- If a markdown path is active, runtime must switch from `widget` to `document`.

## Guardrails
- Strip residual artifacts: bare `agenticOs`, escaped `\---`, escaped fence wrappers.
- Strip duplicated recovered shell sections (`# {{subject}}`, `## Intent`, `## Request`, leading `## Solution`) but keep useful content headings.
- Strip legacy parallel grouping aliases so the recovered canonical document keeps `flow.subgraphs` as the only grouping authoring surface.
- Avoid adding new fallback branches outside the canonical recovery path.
