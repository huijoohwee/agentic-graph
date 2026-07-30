---
title: "Knowgrph Lark App MCP - PRD/TAD Companion"
id: "md:knowgrph-lark-app-mcp-prd-tad.companion"
doc_type: "TAD Companion"
version: "0.1.20"
date: "2026-07-30"
lang: "en-US"
owner: "docs.mcp.lark-app.companion"
local_rung: "dev-proven"
delivered_rung: "runtime-ready"
lane: "authoring"
universal_scope: false
doc_path: "docs/documents/knowgrph-mcp/knowgrph-lark-app-mcp-prd-tad.companion.md"
parent: "docs/documents/knowgrph-mcp/knowgrph-lark-app-mcp-prd-tad.md"
---

# Knowgrph Lark App MCP - PRD/TAD Companion

Implementation-accurate supplement to [knowgrph-lark-app-mcp-prd-tad.md](knowgrph-lark-app-mcp-prd-tad.md).

**Document Version**: 0.1.20
**Date**: 2026-06-06
**Status**: Implementation-aligned supplement

---

## Purpose

This companion turns the Lark app MCP PRD/TAD into a phase-gated implementation checklist for the shipped baseline and the next controlled extensions.

It answers six questions:

1. What is already shipped today for the Lark app -> `knowgrph` Canvas contract?
2. Which repo owners are allowed to change for the implemented baseline?
3. How should the external Lark app `baseinfo` and `webpage` surfaces be treated?
4. What must be true before Canvas-mediated import work begins?
5. What must be true before any remote write or mutation flow is allowed?
6. Which shortcuts are explicitly forbidden across all phases?

---

## Shipped Vs Planned

| Surface / Phase | Status | Actual / Expected Owner | Contract |
|---|---|---|---|
| Phase 1 baseline | Shipped baseline | `grph-shared/src/search/larkAppMcpSsot.ts`, `canvas/src/features/panels/views/larkAppMcpApiDocs.ts`, `canvas/src/features/panels/views/settingsMcpDocEntries.ts` | MainPanel MCP documentation surface for Lark app -> deployed MCP -> Canvas |
| Lark app `baseinfo` surface | External operator surface | `https://open.larksuite.com/app/cli_a7ddaa5aeff89010/baseinfo` | App-management page only; not a `knowgrph` MCP endpoint and not a local repo path |
| Lark app `webpage` surface | External operator surface, checklist included | `https://open.larksuite.com/app/cli_a7ddaa5aeff89010/webpage` | Treat as app webpage configuration or launch surface only; it must not replace the deployed MCP endpoint or Canvas validation path |
| Phase 2 next slice | Shipped baseline | `canvas/src/features/canvas/larkAppCanvasHandoff.ts`, `canvas/src/features/canvas/CanvasQueryBootstrapRuntime.tsx`, existing import owners | Canvas-mediated handoff, review, and source import ergonomics now reuse shipped bootstrap and import owners without adding remote mutation |
| Phase 3 runtime slice | Shipped browser-local | `canvas/src/features/canvas/larkAppRemoteMutationBridge.ts`, `canvas/src/features/canvas/larkAppRemoteMutationBridgeRuntime.ts`, `grph-shared/src/search/larkAppMcpSsot.ts`, `canvas/src/features/panels/views/larkAppMcpApiDocs.ts` | Authenticated remote mutation now has a typed contract, a browser-local runtime bridge for the supported import action, a dry-run-only publish preview with explicit target, conflict, audit, next-step, blocked-preview metadata, a stable host handoff manifest, a human-readable preview summary, a machine-readable warning severity, a host handoff checklist, a machine-readable remediation hint, a machine-readable retry disposition, a machine-readable required host capability, a machine-readable required host capability status, a machine-readable required host capability verification method, a machine-readable required host capability verification target, a machine-readable required host capability verification evidence type, and a machine-readable required host capability owner, plus MainPanel guidance, but still no remote write-capable endpoint |

---

## Entry Criteria

### Before Any Phase Starts

- [x] Confirm [knowgrph-lark-app-mcp-prd-tad.md](knowgrph-lark-app-mcp-prd-tad.md) remains the current SSOT
- [x] Confirm implementation starts in `$GITHUB_ROOT/knowgrph`
- [x] Confirm no one is proposing a primary implementation in `$GITHUB_ROOT/huijoohwee/content/knowgrph`
- [x] Confirm no one is proposing a primary implementation in Cloudflare Pages route files for Lark-specific behavior
- [x] Confirm the remote MCP target remains `https://airvio.co/knowgrph/mcp`
- [x] Confirm `knowgrph` Canvas remains the canonical review/import/visualization surface
- [x] Confirm browser storage will not own Lark app secrets, Base secrets, app secrets, or privileged tokens
- [x] Confirm the MainPanel -> validation -> workspace -> canvas path remains the canonical graph-apply route

### Required Review Inputs

- [x] PRD/TAD reviewed for phase scope clarity
- [x] Existing MainPanel MCP owners identified before file creation
- [x] Existing shared SSOT owner identified before metadata creation
- [x] Existing Canvas handoff owner identified before deep-link or webpage-launch work
- [ ] Existing validation/import owners identified before Canvas-mediated import ergonomics work
- [x] Existing promotion or remote-bridge owners identified before remote write work
- [x] Focused test plan drafted before code changes begin

---

## External Lark Surface Checklist

### Objective

Keep the external Lark app surfaces explicit in the contract without misclassifying them as `knowgrph` endpoints or bypass paths.

### Baseinfo Surface

- [x] `https://open.larksuite.com/app/cli_a7ddaa5aeff89010/baseinfo` is documented as an app-management surface, not a `knowgrph` MCP endpoint
- [x] `baseinfo` is not treated as a Feishu Base URL
- [x] `baseinfo` is not treated as a remote replacement for MainPanel MCP guidance

### Webpage Surface

- [x] Confirm what `https://open.larksuite.com/app/cli_a7ddaa5aeff89010/webpage` controls in the current Lark app setup
- [x] Confirm whether `webpage` launches, embeds, or configures an external web experience rather than owning MCP transport itself
- [x] Confirm the `webpage` surface does not replace `https://airvio.co/knowgrph/mcp` as the Lark-side remote MCP target
- [x] Confirm the `webpage` surface does not replace `knowgrph` Canvas as the canonical review/import/visualization surface
- [x] Confirm any future webpage-launched flow still hands off to shipped `knowgrph` runtime owners instead of a parallel graph or import stack
- [x] Confirm any future webpage configuration keeps auth backend-managed or host-managed and never browser-owned inside `knowgrph`

### Required Conditions

- [x] External Lark URLs are documented as operator surfaces, not in-repo implementation owners
- [x] The deployed Pages HTTP MCP remains the only documented remote MCP target in the implemented baseline
- [x] Canvas remains the only documented review/import surface in the implemented baseline
- [x] If `webpage` later opens `knowgrph`, the handoff contract is documented before rollout

---

## Phase 1 Checklist

### Objective

Expose the Lark app -> deployed MCP -> Canvas contract as an operator-visible MainPanel MCP surface without creating a new runtime branch.

### Allowed Change Types

- [x] Add Lark app integration metadata in an existing shared MCP SSOT owner
- [x] Add MainPanel MCP docs rows for Lark app setup, phase boundaries, and auth rules
- [x] Add a generated remote MCP config snippet for the Lark-side client layer
- [x] Add focused tests for rendered rows, endpoint truthfulness, and secret boundaries
- [x] Add or update MCP documentation files under `docs/documents/knowgrph-mcp`
- [x] Add package export wiring required for shared metadata consumption

### Required Conditions

- [x] One SSOT owns Lark app labels, deployed endpoint labels, Canvas handoff labels, and phase status strings
- [x] MainPanel surface reuses existing MCP docs composition patterns
- [x] Operator copy explains that auth is backend/host/server owned, not browser owned
- [x] MainPanel rows identify the deployed MCP endpoint and exclude the local repo path
- [x] MainPanel rows identify Canvas as the review/import/visualization surface
- [x] No new runtime branch is added
- [x] No graph mutation code is added
- [x] No prod mirror patch is required for the feature to exist

### Implemented Baseline Owners

- [x] `grph-shared/src/search/larkAppMcpSsot.ts`
- [x] `grph-shared/package.json`
- [x] `canvas/src/features/panels/views/larkAppMcpApiDocs.ts`
- [x] `canvas/src/features/panels/views/settingsMcpDocEntries.ts`
- [x] `canvas/src/features/panels/views/settingsView.constants.ts`
- [x] `canvas/src/features/panels/views/useSettingsView.helpers.ts`
- [x] `canvas/src/__tests__/mainPanelMcpLarkApp.test.tsx`
- [x] `canvas/src/__tests__/helpers/mainPanelMcpExpectations.ts`
- [x] `docs/documents/knowgrph-mcp/knowgrph-lark-app-mcp-prd-tad.md`

### Focused Validation

- [x] MainPanel rows render from shared metadata
- [x] No local repo path is presented as the Lark app remote MCP target
- [x] No Lark or Base secret literals appear in docs, fixtures, or browser-owned settings
- [x] No duplicate runtime entrypoint is introduced
- [x] Nearby MCP surfaces remain stable after the Lark app docs-row change

### Phase 1 Exit Gate

- [x] Lark app MCP guidance is discoverable in the intended MainPanel/docs surface
- [x] Shared metadata can be updated in one place
- [x] All focused tests for Phase 1 pass
- [x] No Phase 2 or Phase 3 behavior leaked into this phase unintentionally

---

## Phase 2 Checklist

### Objective

Add Canvas-mediated handoff and import ergonomics for Lark-driven review flows without bypassing shipped import and validation owners.

### Allowed Change Types

- [x] Add explicit Canvas handoff or deep-link guidance for Lark-driven workflows
- [x] Add webpage-launch or app-handoff documentation only if it reuses existing Canvas/runtime owners
- [x] Add thin runtime affordances that call the existing Feishu Base import seam
- [x] Add focused tests for handoff visibility, import entry conditions, and non-secret defaults
- [x] Update docs to describe how the `webpage` surface should hand off into Canvas if that flow is adopted

### Required Conditions

- [x] Canvas remains the canonical review/import/visualization surface
- [x] The `webpage` surface, if used, acts only as a launch or configuration surface and not as a second import or graph runtime
- [x] Existing Feishu Base source adapter and import command remain the only Base snapshot import path
- [x] Existing validation owners remain the only path to graph materialization
- [x] Any operator handoff from Lark to Canvas is explicit, documented, and reversible
- [x] No direct Lark or webpage payload reaches graph store or canvas-apply owners

### Webpage Handoff Checklist

- [x] Define whether `https://open.larksuite.com/app/cli_a7ddaa5aeff89010/webpage` opens `knowgrph` directly or configures a separate launch artifact
- [x] Define what URL, route, or query parameters the webpage surface is allowed to pass into `knowgrph`
- [x] Define whether the handoff is read-only, review-only, or import-capable
- [x] Define how operator identity and auth context are preserved without storing secrets in browser state
- [x] Define failure behavior when Canvas is unavailable or the handoff payload is invalid
- [x] Define how the handoff avoids introducing a second docs/config SSOT outside MainPanel and the PRD/TAD

### Focused Validation

- [x] Canvas handoff is visible and operator-understandable
- [x] Webpage-launched flows do not bypass validation/import owners
- [x] Base snapshot import still routes through the existing runtime command and adapter
- [x] No remote mutation behavior is mixed into the Canvas handoff work

### Phase 2 Exit Gate

- [x] Canvas-mediated handoff for Lark-driven review/import is documented and implemented through existing owners
- [x] Existing import and validation owners remain authoritative
- [x] All focused tests for Phase 2 pass
- [x] No remote write or mutation logic is mixed into this phase

---

## Phase 3 Checklist

### Objective

Add an authenticated remote mutation bridge only if the product needs server-mediated import or write-back without opening Canvas.

### Allowed Change Types

- [x] Add a dedicated remote bridge owner for authenticated write/import actions
- [x] Add typed publish or mutation payloads and response handling
- [x] Add idempotency, conflict, and audit rules
- [x] Add focused tests for mutation-only behavior and failure isolation

### Required Conditions

- [x] Remote mutation stays separate from MainPanel docs/config owners
- [x] Remote mutation stays separate from Canvas graph-apply owners
- [x] Remote mutation requires explicit operator or workflow intent
- [x] Write failures do not corrupt workspace or graph state
- [x] Permissions, conflict handling, and audit boundaries are documented before rollout
- [x] The `webpage` surface does not become an undocumented write-capable mutation shortcut

### Publish And Mutation Contract Checklist

- [x] Define authenticated caller identity and token ownership
- [x] Define idempotency key or deduplication rule
- [x] Define conflict and overwrite policy
- [x] Define audit/logging expectations
- [x] Define rollback behavior for partial remote failures
- [x] Define how the remote bridge reuses existing source adaptation, validation, and promotion owners

### Focused Validation

- [x] No write-back is triggered during read-only or review-only flows
- [x] No write-back is embedded in MainPanel docs rows, webpage-launch configuration, or parser owners
- [x] Failed remote mutation leaves graph state unchanged
- [x] Successful remote mutation remains observable and auditable at the browser-local runtime layer
- [x] Dry-run publish preview validates the contract locally without applying remote write-back
- [x] Dry-run publish preview returns explicit target metadata without implying that write-back succeeded
- [x] Dry-run publish preview returns conflict, audit, and next-step metadata for host-managed follow-up without implying that write-back succeeded
- [x] Dry-run publish preview returns an explicit blocked-preview state and canonical blocking reason while remote publish remains deferred
- [x] Dry-run publish preview returns a stable host handoff manifest for downstream host-managed orchestration while remote publish remains deferred
- [x] Dry-run publish preview returns a stable human-readable summary for host-side display while remote publish remains deferred
- [x] Dry-run publish preview returns a machine-readable warning severity for host-side branching while remote publish remains deferred
- [x] Dry-run publish preview returns a host handoff checklist for downstream operational follow-up while remote publish remains deferred
- [x] Dry-run publish preview returns a machine-readable remediation hint for canonical blocked-preview follow-up while remote publish remains deferred
- [x] Dry-run publish preview returns a machine-readable retry disposition so blocked publish callers avoid local retry loops while remote publish remains deferred
- [x] Dry-run publish preview returns a machine-readable required host capability so blocked publish callers can verify endpoint readiness before retry or apply while remote publish remains deferred
- [x] Dry-run publish preview returns a machine-readable required host capability status so blocked publish callers can distinguish requirement from current browser-local availability while remote publish remains deferred
- [x] Dry-run publish preview returns a machine-readable required host capability verification method so blocked publish callers know how to verify host readiness while remote publish remains deferred
- [x] Dry-run publish preview returns a machine-readable required host capability verification target so blocked publish callers know which readiness target the host must confirm while remote publish remains deferred
- [x] Dry-run publish preview returns a machine-readable required host capability verification evidence type so blocked publish callers know which host-reported signal must satisfy readiness while remote publish remains deferred
- [x] Dry-run publish preview returns a machine-readable required host capability owner so blocked publish callers can route follow-up to the responsible host-side owner while remote publish remains deferred

### Phase 3 Exit Gate

- [x] Authenticated remote mutation operates as a controlled, explicit browser-local runtime slice
- [x] Ownership is clear and conflict-aware
- [x] All focused tests for the Phase 3 contract slice pass
- [x] No hidden coupling to MainPanel, webpage-launch, Canvas apply, or validation owners exists
- [x] Live browser-local runtime bridge is limited to the supported import action plus dry-run-only publish preview
- [x] Live write-capable remote endpoint remains deferred to a later rollout

---

## File Ownership Checklist

### Safe Owner Classes

- [x] Existing MainPanel MCP docs owners
- [x] Existing shared MCP SSOT owners
- [x] Existing package export owner for shared metadata wiring
- [ ] Existing Canvas route or handoff owners for future webpage-launch integration
- [ ] Existing validation/import owners for Canvas-mediated source ingestion
- [x] Existing promotion or remote-bridge owners for future write-capable flows
- [x] `docs/documents/knowgrph-mcp` for canonical design and checklist updates

### Unsafe Owner Classes

- [x] Prod mirror as the primary feature owner
- [x] Cloudflare Pages route files as the first Lark-specific implementation owner
- [x] Browser localStorage/sessionStorage for privileged credentials
- [x] Canvas graph-apply owners for direct Lark or webpage ingestion
- [x] Validation owners for hidden write-back behavior
- [x] The Lark `webpage` surface as an undocumented substitute for the shipped MainPanel or Canvas owners

---

## Forbidden Shortcuts

- [x] Do not connect the Lark app directly to `$GITHUB_ROOT/knowgrph`
- [x] Do not treat `https://open.larksuite.com/app/cli_a7ddaa5aeff89010/baseinfo` as a Base URL or `knowgrph` MCP endpoint
- [x] Do not treat `https://open.larksuite.com/app/cli_a7ddaa5aeff89010/webpage` as the deployed MCP endpoint
- [x] Do not let the `webpage` surface replace `knowgrph` Canvas as the canonical review/import surface
- [x] Do not store Lark or Base secrets in browser state
- [x] Do not add direct Lark/webpage-to-graph mutation logic
- [x] Do not implement the feature first in `$GITHUB_ROOT/huijoohwee/content/knowgrph`
- [x] Do not implement the feature first in Cloudflare Pages route files
- [x] Do not collapse Phase 1, Phase 2, and Phase 3 into one unbounded rollout
- [x] Do not duplicate Lark app constants across docs, tests, and runtime files
- [x] Do not hide publish or mutation behavior inside MainPanel docs/config, webpage-launch config, validation, or parsing logic
- [x] Do not add compatibility shims that create stale parallel contracts

---

## Review Checklist

- [x] Companion matches the current Lark app MCP PRD/TAD scope
- [x] Shipped vs planned boundary is explicit
- [x] Implemented Phase 1 owners are identified
- [x] `baseinfo` and `webpage` surfaces are explicitly covered
- [x] Forbidden owners and shortcuts are explicit
- [x] Focused validation exists for each phase
- [x] Dev -> Prod -> Cloudflare release ownership remains intact

---

*Document Version: 0.1.20 · Updated: 2026-06-06*
