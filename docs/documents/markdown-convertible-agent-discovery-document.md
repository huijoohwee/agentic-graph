---
title: "Markdown-Convertible Agent Discovery Document"
doc_type: "PRD-TAD-ADR-MVP-GTM"
version: "1.0.1"
status: "implemented"
date: "2026-09-12"
lang: "en-US"
owners:
  - "agentic-graph"
  - "huijoohwee.github.io"
frontmatter_contract: "required"
owner: "Product maintainers"
continuity_id: "PLAN-MARKDOWN-CONVERTIBLE-AGENT-DISCOVERY-DOCUMENT"
local_rung: "undocumented"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
worktree_id: "device-cba000d3779d--planning-v27"
agent_id: "codex-01a0940a"
guideline_revision: "2.7.0"
guideline_source: "https://github.com/huijoohwee/huijoohwee.github.io/blob/e8d2a10a8d3e5735c43edf350a22523df05fdf91/guidelines/prd-tad-adr-mvp-gtm-guidelines.md"
reviewed_source_revision: "7fb85741121d8c2886027e4a630d013ba91c1027"
previous_document_version: "1.0.0"
prd_revision: "1.0.1"
tad_revision: "1.0.1"
adr_revision: "1.0.1"
mvp_revision: "1.0.1"
gtm_revision: "1.0.1"
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
- [Technology stack and composition architecture](https://github.com/huijoohwee/agentic-os/blob/main/guides/TECH-STACK.md)

## Planning revision — reference implementation

All five roles below consume `PLAN-MARKDOWN-CONVERTIBLE-AGENT-DISCOVERY-DOCUMENT@1.0.1`. Existing source and runtime observations retain their original revisions and scope; this documentation update renews no deployment or demand evidence. The guideline is [v2.7.0](https://github.com/huijoohwee/huijoohwee.github.io/blob/e8d2a10a8d3e5735c43edf350a22523df05fdf91/guidelines/prd-tad-adr-mvp-gtm-guidelines.md); the shared maturity rubric loads on demand.

| Role | Owning content at this revision |
|---|---|
| PRD | [Problem Statement](markdown-convertible-agent-discovery-document.md#problem-statement) |
| TAD | [Architecture Overview](markdown-convertible-agent-discovery-document.md#architecture-overview) |
| ADR | [Decision: Markdown remains canonical](markdown-convertible-agent-discovery-document.md#decision-markdown-remains-canonical) |
| MVP | [MVP — reference implementation](markdown-convertible-agent-discovery-document.md#mvp--reference-implementation) |
| GTM | [GTM — reference implementation](markdown-convertible-agent-discovery-document.md#gtm--reference-implementation) |

## MVP — reference implementation

Reuse the minimum scope, acceptance conditions and component owners identified above. The demonstration must follow the documented entry, permitted action, durable outcome and readback, including its stated failure/recovery path. Use `npm run check` for its actual coverage and the named feature checks in the specification; attach exact source, command, result and authoring/mirror/delivery surface to each VCC before advancing readiness. A source locator or structural check alone proves no user outcome.

Record the observed steps and elapsed time against the existing TTV target. If no target or invocation is stated, the demonstration remains unverified until the document owner supplies it. All four experience criteria are **unassessed** in this authoring review: Core Requirements & Functionality, Innovation & Theme Alignment, Technical Execution & Integration, and Usefulness & Agentic Experience. No scored user observation is attached to this revision; the document owner must capture a timed pilot and criterion-specific evidence.

## GTM — reference implementation

Use the stated persona and pain hypothesis to test one priced pilot in the existing user environment. Keep the documented free/self-serve workflow as the comparison; additional hosting, channels or agent roles require an evidenced constraint or buyer need. Record the buyer’s workaround, frequency, accepted outcome, offered price, observed response and support minutes before ranking a commercial winner. Demand, collected payment and repeat use remain unvalidated by this documentation review; mechanism evidence keeps its narrower original scope. Measure tokens, cash expense and maintenance separately for each proposed deployment model. Feed actual pilot outcomes into a successor Context using the shared four-column planning record.

## Planning gaps — reference implementation

Source review is bounded to repository `7fb85741121d8c2886027e4a630d013ba91c1027`. Confirmed: these referenced artifacts exist at that revision: [`canvas/src/features/agentic-os/liveCanvasHeroContent.ts`](https://github.com/huijoohwee/agentic-graph/blob/7fb85741121d8c2886027e4a630d013ba91c1027/canvas/src/features/agentic-os/liveCanvasHeroContent.ts), [`canvas/src/features/panels/mainPanelSectionDescriptions.ts`](https://github.com/huijoohwee/agentic-graph/blob/7fb85741121d8c2886027e4a630d013ba91c1027/canvas/src/features/panels/mainPanelSectionDescriptions.ts), [`scripts/sync-pages-agentic-graph.mjs`](https://github.com/huijoohwee/agentic-graph/blob/7fb85741121d8c2886027e4a630d013ba91c1027/scripts/sync-pages-agentic-graph.mjs). Their existence does not confirm every behavior asserted by the specification.
Experience observations, current VCC execution and buyer/payment evidence are unverified here. This is a bounded planning update, not a full-guideline conformance verdict; historical conformance percentages above apply only to their recorded profile and revision.
