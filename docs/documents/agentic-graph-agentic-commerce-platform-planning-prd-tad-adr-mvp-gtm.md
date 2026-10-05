---
title: "agentic-graph Agentic Commerce Platform — Agent Marketplace & Orchestration Hub plus Clean-Room Native Vendor Settlement Layer, with Platform Roadmap"
doc_type: "PRD-TAD-ADR-MVP-GTM"
version: "0.4.0"
date: "2026-10-05"
lang: "en-US"
owner: "Solo Founder / AI Orchestrator"
local_rung: "undocumented"
readiness_scope: "GDV-D1 source implemented with bounded local checks; protected source and consumer/browser acceptance pending, no full parity"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
deploy_boundary: "closed"
clean_room_policy: "inspiration-only; no foreign commerce framework code, schema, or dependency"
frontmatter_contract: "required"
continuity_id: "PLAN-AGENTIC-GRAPH-AGENTIC-COMMERCE-PLATFORM-PRD-TAD-ADR-MVP-GTM"
worktree_id: "device-0232231d4a19--commerce-data-view-embed"
agent_id: "codex-commerce-data-view-embed"
guideline_revision: "3.4.0"
guideline_source: "https://github.com/huijoohwee/huijoohwee.github.io/blob/82835ac37d524643faa6b9703cb077ea9474ab15/guidelines/prd-tad-adr-mvp-gtm-guidelines.md"
reviewed_source_revision: "e551c50c7ad74a99af8a3169409aff36d31642bf"
previous_document_version: "0.3.1"
prd_revision: "0.4.0"
tad_revision: "0.4.0"
adr_revision: "0.4.0"
mvp_revision: "0.4.0"
gtm_revision: "0.4.0"
---

The prior [inherited specification](agentic-graph-agentic-commerce-platform-prd-tad-adr-mvp-gtm.md) remains byte-exact because the travel-commerce reused-interface evidence pins it. This planning successor supplies the current five-role structure; it does not replace the inherited interface baseline or renew its runtime evidence.

# Reference implementation: agentic-graph Agentic Commerce Platform — Agent Marketplace & Orchestration Hub plus Clean-Room Native Vendor Settlement Layer, with Platform Roadmap

This combined planning artifact joins `PLAN-AGENTIC-GRAPH-AGENTIC-COMMERCE-PLATFORM-PRD-TAD-ADR-MVP-GTM@0.4.0`. The new native data-view section below owns the 0.4.0 increment. Linked historical parts retain their 0.3.1 acceptance and evidence scope; this join does not renew those observations. Sections are split solely to keep each authored file below 600 lines. The links below preserve the original section anchors and locate the unchanged requirement/design/decision text plus the current MVP/GTM assessment.

<a id="feature-agent-marketplace--orchestration-hub--domain-agnostic-commerce-substrate"></a>
- [Feature: Agent Marketplace & Orchestration Hub — Domain-Agnostic Commerce Substrate](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-01.md#feature-agent-marketplace--orchestration-hub--domain-agnostic-commerce-substrate)
<a id="problem-statement"></a>
- [Problem Statement](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-01.md#problem-statement)
<a id="personas"></a>
- [Personas](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-01.md#personas)
<a id="user-journey-stage"></a>
- [User Journey Stage](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-01.md#user-journey-stage)
<a id="user-stories"></a>
- [User Stories](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-01.md#user-stories)
<a id="success-metrics"></a>
- [Success Metrics](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-01.md#success-metrics)
<a id="moscow-priority"></a>
- [MoSCoW Priority](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-01.md#moscow-priority)
<a id="min-viable-scope"></a>
- [Min-Viable Scope](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-01.md#min-viable-scope)
<a id="out-of-scope"></a>
- [Out of Scope](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-01.md#out-of-scope)
<a id="dependencies"></a>
- [Dependencies](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-01.md#dependencies)
<a id="open-questions"></a>
- [Open Questions](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-01.md#open-questions)
<a id="architecture-agent-registryrouter-over-the-reused-commerce-primitive"></a>
- [Architecture: Agent Registry/Router over the Reused Commerce Primitive](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-01.md#architecture-agent-registryrouter-over-the-reused-commerce-primitive)
<a id="overview"></a>
- [Overview](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-01.md#overview)
<a id="journey--system-mapping"></a>
- [Journey → System Mapping](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-01.md#journey--system-mapping)
<a id="topology"></a>
- [Topology](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-01.md#topology)
<a id="orchestrationharness-flows"></a>
- [Orchestration/Harness Flows](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-01.md#orchestrationharness-flows)
<a id="component-specifications"></a>
- [Component Specifications](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-01.md#component-specifications)
<a id="component-inventory"></a>
- [Component Inventory](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-01.md#component-inventory)
<a id="deploy-boundary-register"></a>
- [Deploy Boundary Register](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-01.md#deploy-boundary-register)
<a id="feature-clean-room-native-vendor-settlement-layer--the-marketplaces-supply-side"></a>
- [Feature: Clean-Room Native Vendor Settlement Layer — the Marketplace's Supply Side](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-01.md#feature-clean-room-native-vendor-settlement-layer--the-marketplaces-supply-side)
<a id="problem-statement-1"></a>
- [Problem Statement](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-01.md#problem-statement-1)
<a id="personas-1"></a>
- [Personas](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-01.md#personas-1)
<a id="user-journey-stage-1"></a>
- [User Journey Stage](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-01.md#user-journey-stage-1)
<a id="user-stories-1"></a>
- [User Stories](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-01.md#user-stories-1)
<a id="success-metrics-1"></a>
- [Success Metrics](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-01.md#success-metrics-1)
<a id="moscow-priority-1"></a>
- [MoSCoW Priority](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-01.md#moscow-priority-1)
<a id="min-viable-scope-1"></a>
- [Min-Viable Scope](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-01.md#min-viable-scope-1)
<a id="out-of-scope-1"></a>
- [Out of Scope](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-01.md#out-of-scope-1)
<a id="dependencies-1"></a>
- [Dependencies](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-01.md#dependencies-1)
<a id="open-questions-1"></a>
- [Open Questions](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-01.md#open-questions-1)
<a id="architecture-native-vendor-settlement-layer-over-the-existing-bundle-and-ledger-primitives"></a>
- [Architecture: Native Vendor Settlement Layer over the Existing Bundle and Ledger Primitives](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-01.md#architecture-native-vendor-settlement-layer-over-the-existing-bundle-and-ledger-primitives)
<a id="overview-1"></a>
- [Overview](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-01.md#overview-1)
<a id="journey--system-mapping-1"></a>
- [Journey → System Mapping](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-01.md#journey--system-mapping-1)
<a id="topology-1"></a>
- [Topology](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-01.md#topology-1)
<a id="orchestrationharness-flows-1"></a>
- [Orchestration/Harness Flows](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-02.md#orchestrationharness-flows-1)
<a id="component-specifications-1"></a>
- [Component Specifications](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-02.md#component-specifications-1)
<a id="component-inventory--v030-additions"></a>
- [Component Inventory — v0.3.0 additions](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-02.md#component-inventory--v030-additions)
<a id="deploy-boundary-register--v030-additions"></a>
- [Deploy Boundary Register — v0.3.0 additions](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-02.md#deploy-boundary-register--v030-additions)
<a id="adr-1-agent-registryrouter-as-the-sole-new-primitive-vs-rebuilding-verticals-per-agent"></a>
- [ADR-1: Agent Registry/Router as the Sole New Primitive (vs. Rebuilding Verticals Per Agent)](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-02.md#adr-1-agent-registryrouter-as-the-sole-new-primitive-vs-rebuilding-verticals-per-agent)
<a id="context"></a>
- [Context](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-02.md#context)
<a id="decision"></a>
- [Decision](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-02.md#decision)
<a id="alternatives-considered"></a>
- [Alternatives Considered](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-02.md#alternatives-considered)
<a id="rationale"></a>
- [Rationale](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-02.md#rationale)
<a id="tco-impact"></a>
- [TCO Impact](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-02.md#tco-impact)
<a id="consequences"></a>
- [Consequences](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-02.md#consequences)
<a id="adr-2-third-party-trust-boundary--declarative-allowlist-now-on-chain-attestation-as-roadmap"></a>
- [ADR-2: Third-Party Trust Boundary — Declarative Allowlist Now, On-Chain Attestation as Roadmap](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-02.md#adr-2-third-party-trust-boundary--declarative-allowlist-now-on-chain-attestation-as-roadmap)
<a id="context-1"></a>
- [Context](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-02.md#context-1)
<a id="decision-1"></a>
- [Decision](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-02.md#decision-1)
<a id="alternatives-considered-1"></a>
- [Alternatives Considered](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-02.md#alternatives-considered-1)
<a id="rationale-1"></a>
- [Rationale](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-02.md#rationale-1)
<a id="tco-impact-1"></a>
- [TCO Impact](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-02.md#tco-impact-1)
<a id="consequences-1"></a>
- [Consequences](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-02.md#consequences-1)
<a id="adr-3-marketplace-registry-canvas-as-a-yjs-backed-extension-reuse-vs-a-new-store"></a>
- [ADR-3: Marketplace Registry Canvas as a Yjs-Backed Extension (Reuse) vs. a New Store](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-02.md#adr-3-marketplace-registry-canvas-as-a-yjs-backed-extension-reuse-vs-a-new-store)
<a id="context-2"></a>
- [Context](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-02.md#context-2)
<a id="decision-2"></a>
- [Decision](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-02.md#decision-2)
<a id="alternatives-considered-2"></a>
- [Alternatives Considered](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-02.md#alternatives-considered-2)
<a id="rationale-2"></a>
- [Rationale](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-02.md#rationale-2)
<a id="tco-impact-2"></a>
- [TCO Impact](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-02.md#tco-impact-2)
<a id="consequences-2"></a>
- [Consequences](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-02.md#consequences-2)
<a id="adr-4-clean-room-native-marketplace-layer--mercur-and-medusa-as-inspiration-only"></a>
- [ADR-4: Clean-Room Native Marketplace Layer — Mercur and Medusa as Inspiration Only](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-02.md#adr-4-clean-room-native-marketplace-layer--mercur-and-medusa-as-inspiration-only)
<a id="context-3"></a>
- [Context](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-02.md#context-3)
<a id="decision-3"></a>
- [Decision](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-02.md#decision-3)
<a id="alternatives-considered-3"></a>
- [Alternatives Considered](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-02.md#alternatives-considered-3)
<a id="rationale-3"></a>
- [Rationale](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-02.md#rationale-3)
<a id="tco-impact-3"></a>
- [TCO Impact](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-02.md#tco-impact-3)
<a id="consequences-3"></a>
- [Consequences](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-02.md#consequences-3)
<a id="adr-5-hand-rolled-commission-rules-and-vendor-lifecycle-vs-json-rules-engine-and-xstate"></a>
- [ADR-5: Hand-Rolled Commission Rules and Vendor Lifecycle (vs. json-rules-engine and XState)](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-02.md#adr-5-hand-rolled-commission-rules-and-vendor-lifecycle-vs-json-rules-engine-and-xstate)
<a id="context-4"></a>
- [Context](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-02.md#context-4)
<a id="decision-4"></a>
- [Decision](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-02.md#decision-4)
<a id="alternatives-considered-4"></a>
- [Alternatives Considered](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-02.md#alternatives-considered-4)
<a id="rationale-4"></a>
- [Rationale](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-02.md#rationale-4)
<a id="tco-impact-4"></a>
- [TCO Impact](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-02.md#tco-impact-4)
<a id="consequences-4"></a>
- [Consequences](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-02.md#consequences-4)
<a id="adr-6-vendor-splits-as-a-same-transaction-projection-dispatched-by-durable-object-alarm-vs-a-parallel-ledger-and-a-queue"></a>
- [ADR-6: Vendor Splits as a Same-Transaction Projection, Dispatched by Durable Object Alarm (vs. a Parallel Ledger and a Queue)](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-02.md#adr-6-vendor-splits-as-a-same-transaction-projection-dispatched-by-durable-object-alarm-vs-a-parallel-ledger-and-a-queue)
<a id="context-5"></a>
- [Context](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-02.md#context-5)
<a id="decision-5"></a>
- [Decision](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-02.md#decision-5)
<a id="alternatives-considered-5"></a>
- [Alternatives Considered](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-02.md#alternatives-considered-5)
<a id="rationale-5"></a>
- [Rationale](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-02.md#rationale-5)
<a id="tco-impact-5"></a>
- [TCO Impact](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-02.md#tco-impact-5)
<a id="consequences-5"></a>
- [Consequences](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-02.md#consequences-5)
<a id="platform-roadmap-toward-a-full-fledged-agentic-commerce-platform"></a>
- [Platform Roadmap: Toward a Full-Fledged Agentic Commerce Platform](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-02.md#platform-roadmap-toward-a-full-fledged-agentic-commerce-platform)
<a id="alignment-note-condensed"></a>
- [Alignment Note (condensed)](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-02.md#alignment-note-condensed)
<a id="latest-progress--2026-08-22"></a>
- [Latest Progress — 2026-08-22](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-02.md#latest-progress--2026-08-22)
<a id="next-steps"></a>
- [Next Steps](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-02.md#next-steps)
<a id="next-steps--phase-1b-v030-native-vendor-settlement-layer"></a>
- [Next Steps — Phase 1b (v0.3.0, native vendor settlement layer)](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-02.md#next-steps--phase-1b-v030-native-vendor-settlement-layer)
<a id="planning-revision--reference-implementation"></a>
- [Planning revision — reference implementation](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-02.md#planning-revision--reference-implementation)
<a id="mvp--reference-implementation"></a>
- [MVP — reference implementation](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-02.md#mvp--reference-implementation)
<a id="gtm--reference-implementation"></a>
- [GTM — reference implementation](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-02.md#gtm--reference-implementation)
<a id="planning-gaps--reference-implementation"></a>
- [Planning gaps — reference implementation](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-02.md#planning-gaps--reference-implementation)

<a id="agentic-graph-agentic-commerce-platform--combined-prd-tad-adr-mvp-gtm"></a> [agentic-graph Agentic Commerce Platform — Combined PRD-TAD-ADR-MVP-GTM](agentic-graph-agentic-commerce-platform-planning-prd-tad-adr-mvp-gtm.part-01.md#agentic-graph-agentic-commerce-platform--combined-prd-tad-adr-mvp-gtm)

## Native data-view reuse — reference implementation

**Context:** source `e551c50c7ad74a99af8a3169409aff36d31642bf` contains the native Markdown
multi-dimensional table, row/column orientations and shared appearance authority. Commerce owns
browser-local offers and an independent offer-table projection. The user explicitly selected
**Embed the native table in Commerce**, authorizing source extraction and host integration.
**Directive GDV-D1:** reuse the native table and selected-record inspection inside Commerce.
**Role / action / outcome:** Graph UI and Commerce integration owners extract and consume one
portable native core so users keep the same table semantics without a second visual variant.
All five roles in this section consume `PLAN-AGENTIC-GRAPH-AGENTIC-COMMERCE-PLATFORM-PRD-TAD-ADR-MVP-GTM@0.4.0`;
the consumer joins `edge-commerce-agent-mvp@0.21.0`.

### PRD — native reuse

The nearest hypothesized pain is moving from an offer list to the correct record details and
next permitted edit while retaining selection, readable values and local context. This is a
user-selected reuse requirement, not measured buyer demand. The minimum useful slice is the
existing offer collection and selected-record properties; no new inventory, media, channel,
checkout, authorization or graph-storage behavior is promised.

| Criterion | Observable acceptance |
|---|---|
| GDV-01 one native renderer | Native row/column wrappers and the portable consumer delegate table structure to `MarkdownDataViewTableCore.tsx`; no downstream list/detail table builder remains. |
| GDV-02 bounded host ownership | `mount`/`update`/`destroy` accept bounded plain data, retain safe selection, reject invalid input and dispose exactly; host owns persistence, revision checks, editing and effects. No store/media/network dependency enters the portable closure. |
| GDV-03 one appearance authority | Generated CSS uses native tokens, selection and responsive primitives. No competing design document or host table palette; keyboard and mobile/text-resize checks cover list and selected details. |
| GDV-04 reproducible local artifact | Source/input/output digests bind generated module and CSS; every chunk is <500,000 bytes. The host lazy-loads pinned local assets; loading failure is explicit and no remote fallback is attempted. |

### TAD — native reuse

The [embeddability contract](agentic-graph-embeddability-contract.md#portable-native-data-view--reference-implementation)
owns the versioned component boundary. `MarkdownDataViewTableCore.tsx` takes the existing table
structure out of `MarkdownDataViewTableView.tsx` and `MarkdownDataViewColumnsTableView.tsx`;
those wrappers keep rich cells, editing and application state in their native source owner.
`dataViewBrowserAdapter.tsx` supplies the plain-data DOM lifecycle and record property view.
`canvas/scripts/build-data-view-adapter.mjs` produces the pinned browser module/CSS from that
same core and the existing locked FOSS dependency closure. Full-document iframe embedding is unchanged.

The [canonical design guide](agentic-graph-ui-ux-design-document.md#global-appearance-authority),
`grph-shared/ui/themeTokens`, `selectedRowClasses` and existing responsive primitives remain
visual owners. A `DESIGN.md`, independent brand guideline, alternate stylesheet implementation
or copied host table is forbidden. Commerce supplies content, container context and callbacks;
it retains IndexedDB, drafts, validation, review and MCP/WebMCP `/ @ #` owners.

Five flows: merchant opens collection → native rows → selects record → native property details →
existing edit/review action; UI requests pinned module → validates bounded data → mounts/updates →
disposes on exit; drafts → sanitized projection → pure table, without remote transfer; host controls
selection/errors → adapter reports actions → existing host handler performs authorized effects;
local browser → cached host assets + portable view, with Graph stores and remote services absent.

### ADR — native reuse

**GDV-A1, accepted:** extract one source-owned rendering core and a narrow DOM adapter. The
existing native row and column views are two concrete consumers; Commerce is the third.
Keeping the full app in an iframe remains correct for complete documents, but would add its
store/runtime and navigation to this bounded local-data task. Copying its JSX/CSS downstream
would create a conflicting owner. A new generic grid package adds migration/dependency cost.
The chosen extraction preserves native slots and source ownership; it does not claim all native
editing, media or graph capabilities are portable. Revisit only on an observed unsupported need.

### MVP — native reuse

Core, adapter and native generator implementation is complete; both native wrappers consume the
shared structure. Four portable lifecycle/input/UTF-8/progressive-row checks and ten selected native
regressions pass. The native selection covers inline text editing, bounded previews, progressive
rows, image cells in both orientations, source-line nested tables, sticky header masking, shared
inline-editor commands, workspace-mode ownership and row/column pivot. The two unchanged lazy
media checks `markdown.dataView.richMediaCells` and `markdown.dataView.nestedTableMediaChipToggle`
fail both extracted and original G0 wrappers under the same bounded two-tick harness; baseline
comparison is recorded in session `work/graph-media-baseline-comparison.json`. No all-media or
full-native-parity claim follows. Native Canvas typechecking passed (exit 0, no diagnostics).

The deterministic native build emits JS 168,142 bytes, ShadowRoot CSS 52,697 bytes and root token
CSS 6,088 bytes, each below 500,000. Full installed MIT notices for React 18.3.1, React DOM 18.3.1,
scheduler 0.23.2 and Tailwind 4.3.3 accompany the generated output; the manifest binds notice files,
source inputs, tool versions and output hashes. Build checks resolve referenced native tokens and
reject external JavaScript imports/remote CSS. These observed working-source artifacts still carry
`sourceDirty: true`; commit then regenerate to obtain the exact clean consumer pin. Publication,
protected integration, Commerce browser/consumer acceptance and deployment remain distinct gates.
The local results are retained in `work/graph-native-table-10.log`, `work/graph-data-view-build-repeat-proof.json` and the generated manifest; the
release handoff must bind clean source/check receipts rather than relabel these working bytes.

Reproduce the portable checks with `TSX_TSCONFIG_PATH=canvas/tsconfig.json node --import tsx --test canvas/src/__tests__/dataViewBrowserAdapter.test.tsx`; build with `node canvas/scripts/build-data-view-adapter.mjs --out-dir <artifact-directory>`. The recorded native command is `npm -C canvas run test:ci:unit -- markdown.dataView.inlineEdit.textCell.parityAndCommit markdown.dataView.inlineEdit.longTextCell.boundedPreview markdown.dataView.inlineEdit.largeTable.progressiveRows markdown.dataView.imageCellsRenderThumbnails markdown.dataView.imageCellsRenderThumbnailsInColumns markdown.dataView.sourceLineNestedTables markdown.dataView.stickyHeaderOpaqueMask markdown.dataView.inlineEditor.sharedAtMediaCommands ui.multiDimTable.surface.workspaceModeOwners ui.multiDimTable.pivot.rowsColumns`.

Rollback reverts host adapter/assets/pin together and restores the preceding view; no persisted
format or stored-record migration is required. Commerce keeps loading/stale/error semantics,
exact draft revisions and existing editing/review effects while consuming the local artifact.

Combined cap: 60–75 active minutes, 25 admitted paths across both source repositories,
≤140 kB authored changed bytes excluding generated dependency artifacts, <600 lines per authored
file and <500,000 bytes per chunk. Three new runtime owners: native core, browser adapter and
Commerce projection; one source-owned generator. Load the adapter only on relevant surfaces;
zero new paid plans/addons/overages, remote prerequisites or serving-model tokens. Existing
FOSS dependency bytes must be reported separately from authored growth. CI/provider waits name
the missing receipt and are rechecked on results/source drift, not assigned a delivery ETA.

### GTM — native reuse

Rank a clearer existing offer setup/recovery handoff before integration services, hosted tiers or
marketplace expansion. Measure clean-browser time from list to the correct record and next
permitted action against the current UI; target ≤60 seconds to identify that action. Human TTV,
WTP and first-dollar collection remain unobserved and retain their existing Commerce owner.
Source/browser proof establishes mechanisms only. No outreach, transaction, deployment or
conversion uplift is authorized or claimed by this increment.
