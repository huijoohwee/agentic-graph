---
title: "Markdown-Convertible Agent Discovery Document"
doc_type: "PRD + TAD"
version: "1.0.0"
status: "implemented"
date: "2026-07-11"
lang: "en-US"
owners:
  - "agentic-graph"
  - "huijoohwee.github.io"
frontmatter_contract: "required"
---

# Markdown-Convertible Agent Discovery Document

## Goal

Keep the agentic-graph Live Canvas Hero human-first in React while exposing the same landing context as compact Markdown for agent discovery, low-token retrieval, and publish-safe cross-repo release flow.

## Problem Statement

The hero message, invocation grammar, and entry actions originally lived inside the React surface. That made the browser experience rich, but it left agent discovery dependent on the compiled app shell and created avoidable drift risk between source docs, publish artifacts, and Cloudflare delivery.

## Outcome

The Live Canvas Hero now reads its editorial content from a canonical Markdown document:

- source canonical doc: `agentic-graph/docs/documents/agentic-graph-live-canvas-hero.md`
- public discovery route: `https://airvio.co/agentic-graph/agentic-graph-live-canvas-hero.md`
- alternate discovery link: `https://airvio.co/agentic-graph/`
- LLM index advertisement: `https://airvio.co/agentic-graph/llms.txt`

This keeps one source of truth for:

- eyebrow
- headline
- lede
- execution posture
- public discovery route

## User Stories

**As a** human visitor
**I want** the root and `/agentic-graph/` surfaces to keep the interactive Live Canvas Hero
**So that** I can enter the app and hand off agent-ready queries without losing the visual canvas experience

**As an** external agent
**I want** a compact Markdown route for the landing context
**So that** I can discover the product, grammar, and entry actions without paying the cost of parsing the full React shell

**As a** maintainer
**I want** the hero copy to be source-backed and mirrored cleanly into publish
**So that** wording drift is removed from the release path

## Acceptance Criteria

- The canonical hero copy lives in `docs/documents/agentic-graph-live-canvas-hero.md`
- The React Live Canvas Hero reads bundled Markdown sourced from that document
- The public route `/agentic-graph-live-canvas-hero.md` returns `text/markdown`
- `/agentic-graph/` includes an alternate markdown discovery link
- `/agentic-graph/llms.txt` advertises the discovery markdown route
- publish sync keeps the markdown asset in the root-managed file set
- Cloudflare deploy proof shows the markdown route live on `airvio.co`

## Architecture Overview

```text
agentic-graph source doc
  docs/documents/agentic-graph-live-canvas-hero.md
    -> Vite define injects bundled markdown into the React runtime
    -> public build emits /agentic-graph-live-canvas-hero.md
    -> pages:build-sync mirrors artifacts into huijoohwee publish surfaces
    -> Cloudflare Pages serves:
         /agentic-graph/
         /agentic-graph/llms.txt
         /agentic-graph/agentic-graph-live-canvas-hero.md
```

## Implementation Contract

### Source of Truth

The hero editorial contract is owned by `agentic-graph-live-canvas-hero.md`, not by hardcoded JSX strings and not by downstream publish-only patches.

### React Consumption

The browser runtime consumes bundled markdown injected at build time. This avoids browser-facing `node:fs/promises` fallbacks and keeps the source-backed contract compatible with Vite production builds.

### Discovery Surfaces

The publish surface must expose the same landing context through three paths:

1. interactive app shell at `/agentic-graph/`
2. compact markdown route at `/agentic-graph-live-canvas-hero.md`
3. discovery advertisement in `/agentic-graph/llms.txt`

### Publish Ownership

`agentic-graph` owns the source doc, build wiring, and sync rules.
`huijoohwee` owns the published route copies and Cloudflare-facing delivery.
The mirror repo must not invent alternate wording.

## Live Proof

The implemented route is live and verified:

- `curl -i https://airvio.co/agentic-graph/agentic-graph-live-canvas-hero.md`
  - expected: `HTTP 200`
  - expected: `content-type: text/markdown; charset=utf-8`
- `curl https://airvio.co/agentic-graph/llms.txt`
  - expected line: `Live Canvas Hero discovery markdown: /agentic-graph-live-canvas-hero.md`
- `curl https://airvio.co/agentic-graph/`
  - expected alternate link to `/agentic-graph-live-canvas-hero.md`

## Validation Commands

```bash
npm run pages:build-sync
npm run test:ci:unit -- ui.mainPanel.ktvRows.sharedEditableValueCell
curl -i https://airvio.co/agentic-graph/agentic-graph-live-canvas-hero.md
curl -s https://airvio.co/agentic-graph/llms.txt
```

## Decisions

### Decision: Markdown remains canonical

**Rationale**: lowest drift risk and lowest token-cost discovery surface
**Rejected alternative**: keep hero copy hardcoded in React and document it separately

### Decision: discovery is additive, not a separate landing stack

**Rationale**: preserve the human React hero while giving agents a compact Markdown path
**Rejected alternative**: create a second manually maintained landing page just for agents

### Decision: fix browser warnings from the source module

**Rationale**: root/upstream neutralization is better than tolerating browser-incompatible fallbacks in importable modules
**Rejected alternative**: ignore the warning because deploy still passes

## Risks and Mitigations

- Risk: source and mirror wording drift
  - Mitigation: keep identical wording in `agentic-graph` and `huijoohwee.github.io`
- Risk: build regressions from Node-only fallbacks in browser-importable modules
  - Mitigation: use Vite-injected bundled markdown instead of browser-visible Node imports
- Risk: publish sync drops the root markdown asset
  - Mitigation: keep the route in the root-managed publish file set and cover it with sync tests

## Cross-References

- `agentic-graph/docs/documents/agentic-graph-live-canvas-hero.md`
- `agentic-graph/canvas/src/features/agentic-os/liveCanvasHeroContent.ts`
- `agentic-graph/canvas/src/features/panels/mainPanelSectionDescriptions.ts`
- `agentic-graph/scripts/sync-pages-agentic-graph.mjs`
- `huijoohwee.github.io/docs/documents/hjh-topology-document.md`
