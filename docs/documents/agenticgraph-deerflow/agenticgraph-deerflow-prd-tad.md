# AgenticGraph DeerFlow Integration - PRD & TAD

**Document Version**: 1.2.0  
**Date**: 2026-05-29  
**Status**: Accepted and implemented baseline  
**Scope**: MainPanel Integrations, Storyboard Widget text widgets, rich-media generation, DeerFlow URL import

---

## Document Purpose

**Context**: AgenticGraph ships DeerFlow as a first-class optional local-gateway provider. The implementation is grounded in existing MainPanel settings rows, chat-provider normalization, Storyboard Widget registry templates, rich-media dispatch, and workspace URL import.

**Intent**: Record the implemented contract so future DeerFlow work extends the canonical owners instead of adding duplicate panels, provider-specific renderer forks, hardcoded local paths, or parallel adapter stacks.

**Directive**: DeerFlow configuration and runtime behavior must remain provider-neutral at the UI boundary. DeerFlow-specific transport is isolated to the existing gateway owners.

**SuperAgent boundary**: DeerFlow may be referenced as conceptual inspiration for long-horizon harness primitives such as message gateway, memory, tools, skills, subagents, sandboxes, and minutes-to-hours runs. AgenticGraph's native SuperAgent contract lives in `docs/documents/agenticgraph-superagent-harness.md` and `agenticgraph_parser/*`. Do not copy DeerFlow code, clone its architecture, or describe a DeerFlow MCP bridge, parser, renderer, memory stack, or graph apply path as implemented unless a source owner and focused tests exist.

---

# Part I: Product Requirements Documentation (PRD)

## Implemented Baseline

| Product Capability | Implemented Owner | Status |
|---|---|---|
| MainPanel DeerFlow rows | `canvas/src/features/panels/views/deerflowApiDocs.ts` | Shipped |
| Settings search and row rendering | `canvas/src/features/panels/views/useSettingsView.ts` | Shipped |
| Provider identity and default endpoint | `canvas/src/lib/chatEndpoint.ts` | Shipped |
| Storyboard Widget DeerFlow text widget helpers | `canvas/src/features/storyboard-widget-manager/registryTemplates.ts` | Shipped |
| Storyboard Widget DeerFlow seeded registry entry | `canvas/src/hooks/store/storyboardWidgetManagerRegistryPersistence.ts` | Shipped |
| Image/video runtime dispatch | `canvas/src/features/chat/richMediaRun.ts` | Shipped |
| DeerFlow rich-media gateway adapter | `canvas/src/features/chat/deerflowRunGeneration.ts` | Shipped |
| DeerFlow URL import | `canvas/src/features/markdown-workspace/workspaceImport/deerflowUrlImport.ts` | Shipped |
| Native SuperAgent harness reference | `docs/documents/agenticgraph-superagent-harness.md` | Source-owned local harness; DeerFlow is conceptual inspiration only |
| Dev/Prod setup guidance | `docs/documents/agenticgraph-deerflow/agenticgraph-deerflow-setup-guide.md` | Active |

## Problem Statement

Workflow builders need DeerFlow to be discoverable and usable without leaving AgenticGraph, while the rest of the Canvas keeps the same provider-neutral contracts used by OpenAI, BytePlus, Gemini, external video provider, and future providers.

The shipped baseline solves this by exposing `deerflowApi.*` rows in MainPanel Integrations, normalizing `deerflow` through the shared chat endpoint helpers, seeding a DeerFlow text widget through Storyboard Widget registry templates, and routing rich-media generation through the existing `runRichMediaWidgetGeneration()` owner.

## Personas

| ID | Persona | Job To Be Done | Implemented Surface |
|---|---|---|---|
| P1 | Workflow Builder | Configure DeerFlow once and run text/image/video nodes through the Canvas workflow | MainPanel Integrations and Storyboard Widget |
| P2 | Product Integrator | Add provider behavior through reusable rows, links, and dispatcher hooks | `deerflowApiDocs.ts`, `registryTemplates.ts`, `chatEndpoint.ts` |
| P3 | QA Reviewer | Prove DeerFlow docs match source owners and focused tests | `deerflowPrdTadDocs.test.ts` plus existing DeerFlow runtime tests |

## User Journey: Configure and Use DeerFlow

| Stage | Action | Touchpoint | Implemented Behavior |
|---|---|---|---|
| Trigger | User needs DeerFlow-backed text or media generation | MainPanel or Storyboard Widget | DeerFlow appears as a provider option and searchable settings area |
| Discover | User searches "deerflow" | MainPanel Integrations | Rows come from `DEERFLOW_API_REQUEST_DOC_ENTRIES` |
| Engage | User verifies provider, endpoint, model, auth, and request fields | Settings rows | Defaults reuse OpenAI-compatible row semantics with `deerflowApi.*` keys |
| Complete | User runs a DeerFlow-backed node | Storyboard Widget / rich media runtime | `normalizeChatProviderId()` routes image/video to DeerFlow gateway generation |
| Return | User imports a URL through DeerFlow | Launch command / URL import | `importWorkspaceUrlViaDeerFlow()` writes returned manifest files into Source Files |

## User Stories and Acceptance Criteria

### PRD-DF-001: DeerFlow MainPanel Discovery

As a workflow builder, I want DeerFlow to be discoverable from MainPanel Integrations so I can configure the gateway without external notes.

Acceptance:
- MainPanel exposes a DeerFlow settings area named `DeerFlow Gateway API`.
- Settings rows use `deerflowApi.*` keys generated by `mapOpenAiRowKeyToDeerFlowRowKey()`.
- Deep links use `getDeerFlowApiRowAnchorId()` and route through Storyboard Widget registry templates.

### PRD-DF-002: Provider-Normalized Text Widget

As a workflow builder, I want a DeerFlow text widget entry so Storyboard Widget can route text-generation prompts through DeerFlow without a custom panel.

Acceptance:
- Default widget registry seed includes `textGeneration.deerflow`.
- Provider normalization forces `CHAT_PROVIDER_DEERFLOW`.
- The endpoint defaults to `CHAT_DEERFLOW_ENDPOINT_URL`.

### PRD-DF-003: Unified Rich-Media Dispatch

As a workflow builder, I want DeerFlow image/video nodes to use the same rich-media runtime owner as other providers.

Acceptance:
- `runRichMediaWidgetGeneration()` selects DeerFlow only after `normalizeChatProviderId()` resolves `deerflow`.
- Image runs call `generateRunImageWithDeerFlow()`.
- Video runs call `generateRunVideoWithDeerFlow()`.
- Output is persisted through the shared rich-media artifact writer before patching node properties.

### PRD-DF-004: DeerFlow Gateway Adapter

As a product integrator, I want provider-specific DeerFlow transport isolated in one adapter module.

Acceptance:
- `deerflowRunGeneration.ts` derives `/api/runs/stream` from the configured chat endpoint.
- Gateway requests use `buildChatProxyHeaders()` with `CHAT_PROVIDER_DEERFLOW`.
- SSE and JSON responses both normalize to a `GeneratedBinaryAsset`.
- Artifact URLs resolve through the same binary proxy path used by other rich-media providers.

### PRD-DF-005: DeerFlow URL Import

As a workflow builder, I want DeerFlow URL import to create Source Files from a returned manifest instead of bypassing the workspace.

Acceptance:
- `importWorkspaceUrlViaDeerFlow()` resolves `/api/runs/wait` from the configured endpoint.
- Returned manifest files are sanitized and written under a workspace `deerflow/` folder.
- Failure states return structured `failed` entries rather than throwing UI-only errors.

## In Scope

- DeerFlow as optional local gateway provider.
- MainPanel search/discovery and row anchors.
- Storyboard Widget text widget registry seed and links.
- Image/video rich-media generation through the shared dispatcher.
- URL import through the workspace Source Files path.
- Dev -> Prod -> Cloudflare setup via the active setup guide.

## Out of Scope

- A second DeerFlow-only MainPanel tab.
- Provider-specific Canvas renderer branches.
- Hardcoded absolute fixture paths or local repo paths.
- A separate DeerFlow graph parser.
- A DeerFlow-copied SuperAgent architecture or duplicated AgenticGraph harness stack.
- Silent fallback from DeerFlow to another provider.
- Unimplemented DeerFlow MCP bridge claims in the shipped baseline.

## Success Metrics

| Metric | Baseline | Implemented Evidence |
|---|---|---|
| DeerFlow discoverability | No stable docs guard | MainPanel rows are generated from `DEERFLOW_API_REQUEST_DOC_ENTRIES` |
| Widget registration | Ad hoc provider setup | `textGeneration.deerflow` is seeded by registry templates |
| Image/video routing | Provider-specific drift risk | `runRichMediaWidgetGeneration()` dispatches by normalized provider |
| Transport isolation | Scattered endpoint logic risk | `/api/runs/stream` derivation is isolated in `deerflowRunGeneration.ts` |
| URL import parity | External workflow risk | `importWorkspaceUrlViaDeerFlow()` writes Source Files through workspace FS |

## Continuation

Part II: Technical Architecture Documentation continues in [agenticgraph-deerflow-prd-tad.companion.md](agenticgraph-deerflow-prd-tad.companion.md).

---

## Requirement Traceability Matrix

| PRD ID | Requirement Summary | Source Owner | Validation |
|---|---|---|---|
| PRD-DF-001 | DeerFlow discoverable in MainPanel | `deerflowApiDocs.ts`, `useSettingsView.ts` | `mainPanelIntegrations.test.tsx`, `deerflowPrdTadDocs.test.ts` |
| PRD-DF-002 | DeerFlow text widget seeded | `registryTemplates.ts`, `storyboardWidgetManagerRegistryPersistence.ts`, `chatEndpoint.ts` | `storyboardWidgetManagerRegistry.test.ts` |
| PRD-DF-003 | Unified rich-media runtime | `richMediaRun.ts` | `byteplusRunGeneration.test.ts`, `flowWidgetOutputRichMediaReuse.test.ts` |
| PRD-DF-004 | Gateway adapter isolated | `deerflowRunGeneration.ts` | `byteplusRunGeneration.test.ts`, `deerflowPrdTadDocs.test.ts` |
| PRD-DF-005 | URL import writes Source Files | `deerflowUrlImport.ts` | import workflow tests and docs guard |

---

## Revision History

| Version | Date | Author | Summary |
|---|---|---|---|
| 1.0.0 | 2026-05-07 | joohwee | Initial PRD-TAD for DeerFlow integration |
| 1.1.0 | 2026-05-07 | joohwee | Added PRD/TAD guideline sections |
| 1.2.0 | 2026-05-29 | joohwee | Promoted to implemented baseline and replaced unshipped mode framing with current gateway owners |
