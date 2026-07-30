---
title: "Knowgrph Feishu Base MCP - PRD/TAD Companion"
id: "md:knowgrph-feishu-base-mcp-prd-tad.companion"
doc_type: "TAD Companion"
version: "0.1.1"
date: "2026-07-30"
lang: "en-US"
owner: "docs.mcp.feishu-base.companion"
local_rung: "dev-proven"
delivered_rung: "runtime-ready"
lane: "authoring"
universal_scope: false
doc_path: "docs/documents/knowgrph-mcp/knowgrph-feishu-base-mcp-prd-tad.companion.md"
parent: "docs/documents/knowgrph-mcp/knowgrph-feishu-base-mcp-prd-tad.md"
---

# Knowgrph Feishu Base MCP - PRD/TAD Companion

Implementation checklist supplement to [knowgrph-feishu-base-mcp-prd-tad.md](knowgrph-feishu-base-mcp-prd-tad.md).

**Document Version**: 0.1.1
**Date**: 2026-06-06
**Status**: Implementation-aligned supplement

---

## Purpose

This companion turns the Feishu Base MCP PRD/TAD into a phase-gated implementation checklist.

It answers five questions:

1. What must be true before Phase 1 starts?
2. What files or owner types are allowed to change in Phase 1?
3. What new obligations appear in Phase 2 when Feishu Base becomes a real content source?
4. What new obligations appear in Phase 3 when Feishu Base becomes a publish target?
5. Which shortcuts are explicitly forbidden across all phases?

---

## Shipped Vs Planned

| Phase | Status | Actual / Expected Owner | Contract |
|---|---|---|---|
| Phase 1 | Shipped baseline | `grph-shared/src/search/feishuBaseMcpSsot.ts`, `canvas/src/features/settings/registry-feishu-base-mcp.ts`, `canvas/src/features/panels/views/feishuBaseMcpApiDocs.ts`, `canvas/src/features/panels/views/settingsMcpDocEntries.ts` | MainPanel MCP/configuration surface with shared metadata, no secrets, and no new runtime branch |
| Phase 2 | Planned | none yet | Base content-source adapter must reuse existing validation owners |
| Phase 3 | Planned | none yet | Base publish target must stay in promotion owners |

---

## Entry Criteria

### Before Any Phase Starts

- [x] Confirm [knowgrph-feishu-base-mcp-prd-tad.md](knowgrph-feishu-base-mcp-prd-tad.md) remains the current SSOT
- [x] Confirm implementation starts in `$GITHUB_ROOT/knowgrph`
- [x] Confirm no one is proposing a primary implementation in `$GITHUB_ROOT/huijoohwee/content/knowgrph`
- [x] Confirm no one is proposing a primary implementation in Cloudflare Pages Functions
- [x] Confirm browser storage will not own Base secrets, app secrets, or privileged tokens
- [x] Confirm the MainPanel -> validation -> workspace -> canvas path remains the canonical graph-apply route

### Required Review Inputs

- [x] PRD/TAD reviewed for phase scope clarity
- [x] Existing MCP/settings owners identified before file creation
- [ ] Existing validation owners identified before source-ingestion work
- [ ] Existing promotion owners identified before write-back work
- [x] Focused test plan drafted before code changes begin

---

## Phase 1 Checklist

### Objective

Expose Feishu Base as an operator-visible MCP/configuration surface without creating a new runtime branch.

### Allowed Change Types

- [x] Add Feishu Base integration metadata in existing shared MCP/settings owners
- [x] Add MainPanel docs or settings rows for Feishu Base
- [x] Add operator-facing setup guidance, phase boundaries, and auth rules
- [x] Add focused tests for rendered rows, metadata reuse, and secret boundaries
- [x] Add or update MCP documentation files under `docs/documents/knowgrph-mcp`

### Required Conditions

- [x] One SSOT owns Feishu Base labels, phase names, and integration metadata
- [x] MainPanel surface reuses existing settings/docs composition patterns
- [x] Operator copy explains that auth is host/server owned, not browser owned
- [x] No Base adapter logic is hidden inside this phase
- [x] No graph mutation code is added
- [x] No prod mirror patch is required for the feature to exist

### Focused Validation

- [x] Docs/settings rows render from shared metadata
- [x] No Feishu secret literals appear in docs, fixtures, or browser-owned settings
- [x] No duplicate runtime entrypoint is introduced
- [x] No Cloudflare-only implementation dependency is introduced

### Phase 1 Exit Gate

- [x] Feishu Base is discoverable in the intended MainPanel/docs surface
- [x] Shared metadata can be updated in one place
- [x] All focused tests for Phase 1 pass
- [x] No Phase 2 or Phase 3 behavior leaked into this phase unintentionally

---

## Phase 2 Checklist

### Objective

Adapt Feishu Base content into canonical Knowgrph inputs through existing validation owners.

### Allowed Change Types

- [ ] Add a Base source adapter under an upstream shared owner
- [ ] Define typed input and output shapes for Base-derived source content
- [ ] Map Base tables, records, or views into canonical markdown, frontmatter, or equivalent validated document inputs
- [ ] Add focused tests for transform correctness, rejection paths, and validation routing

### Required Conditions

- [ ] Base-originated content enters Knowgrph through a documented adapter boundary
- [ ] Adapter output is canonicalized before workspace/canvas application
- [ ] Existing validation owners remain the only path to graph materialization
- [ ] Source metadata and citations remain available where applicable
- [ ] Structured provider failures are surfaced explicitly
- [ ] No direct Base payload reaches graph store or canvas-apply owners

### Mapping Checklist

- [ ] Define how `baseToken`, `tableId`, `viewId`, and field mapping are represented
- [ ] Define which Base fields are authoritative inputs and which are ignored
- [ ] Define row selection and pagination boundaries
- [ ] Define malformed-record handling and partial-failure behavior
- [ ] Define canonical document form produced by the adapter

### Focused Validation

- [ ] Base input that fails mapping is rejected cleanly
- [ ] Base input that passes mapping still routes through existing validation
- [ ] Canvas apply does not gain a new Base-specific bypass
- [ ] Token and content-size budgets are bounded if AI summarization is involved

### Phase 2 Exit Gate

- [ ] Base-sourced content can be transformed into canonical Knowgrph input
- [ ] Validation owners remain authoritative
- [ ] All focused tests for Phase 2 pass
- [ ] No write-back logic is mixed into the adapter

---

## Phase 3 Checklist

### Objective

Add Feishu Base as a promotion target without coupling write-back to graph generation.

### Allowed Change Types

- [ ] Add promotion-layer target metadata for Feishu Base
- [ ] Add typed publish payloads and response handling
- [ ] Add idempotency, conflict, and retry rules where necessary
- [ ] Add focused tests for promotion-only write-back behavior

### Required Conditions

- [ ] Write-back stays in a promotion or artifact-publish owner
- [ ] Write-back requires explicit operator or workflow intent
- [ ] Graph generation remains independent from Base write success
- [ ] Publish failures do not corrupt workspace or graph state
- [ ] Permissions and conflict handling are documented before rollout

### Publish Contract Checklist

- [ ] Define target Base/table ownership
- [ ] Define artifact-to-row mapping
- [ ] Define idempotency key or deduplication rule
- [ ] Define conflict and overwrite policy
- [ ] Define audit/logging expectations

### Focused Validation

- [ ] No write-back is triggered during validation-only flows
- [ ] No write-back is embedded in canvas apply or parser owners
- [ ] Failed Base publish leaves graph state unchanged
- [ ] Successful Base publish remains observable and auditable

### Phase 3 Exit Gate

- [ ] Feishu Base operates as a controlled publish target
- [ ] Promotion-layer ownership is clear
- [ ] All focused tests for Phase 3 pass
- [ ] No hidden coupling to canvas or validation owners exists

---

## File Ownership Checklist

### Phase 1 Implemented Owners

- [x] `grph-shared/src/search/feishuBaseMcpSsot.ts`
- [x] `canvas/src/features/settings/registry-feishu-base-mcp.ts`
- [x] `canvas/src/features/settings/registry.ts`
- [x] `canvas/src/features/panels/views/feishuBaseMcpApiDocs.ts`
- [x] `canvas/src/features/panels/views/settingsMcpDocEntries.ts`
- [x] `canvas/src/features/panels/views/settingsView.constants.ts`
- [x] `canvas/src/features/panels/views/useSettingsView.helpers.ts`
- [x] `canvas/src/__tests__/mainPanelMcpFeishuBase.test.tsx`
- [x] `canvas/src/__tests__/helpers/mainPanelMcpExpectations.ts`

### Safe Owner Classes

- [ ] Existing MainPanel MCP/settings docs owners
- [ ] Existing shared MCP/settings SSOT owners
- [ ] Existing validation owners for document ingestion
- [ ] Existing promotion owners for downstream targets
- [ ] `docs/documents/knowgrph-mcp` for canonical design and checklist updates

### Unsafe Owner Classes

- [ ] Prod mirror as the primary feature owner
- [ ] Cloudflare Pages route files as the first implementation owner
- [ ] Browser localStorage/sessionStorage for privileged credentials
- [ ] Canvas graph-apply owners for direct Base ingestion
- [ ] Validation owners for hidden write-back behavior

---

## Forbidden Shortcuts

- [ ] Do not add direct Base-to-graph mutation logic
- [ ] Do not store Feishu Base secrets in browser state
- [ ] Do not implement the feature first in `$GITHUB_ROOT/huijoohwee/content/knowgrph`
- [ ] Do not implement the feature first in Cloudflare Functions
- [ ] Do not collapse Phase 1, Phase 2, and Phase 3 into one unbounded rollout
- [ ] Do not duplicate Feishu Base constants across docs, settings, tests, and runtime files
- [ ] Do not hide publish behavior inside validation or parsing logic
- [ ] Do not add compatibility shims that create stale parallel contracts

---

## Review Checklist

- [x] Companion matches the current Feishu Base MCP PRD/TAD scope
- [x] Phase boundaries are explicit and non-overlapping
- [x] Required owners are identified before implementation
- [x] Forbidden owners and shortcuts are explicit
- [x] Focused validation exists for each phase
- [x] Dev -> Prod -> Cloudflare release ownership remains intact

---

*Document Version: 0.1.1 · Updated: 2026-06-06*
