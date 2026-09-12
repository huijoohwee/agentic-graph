---
title: "agentic-graph Agentic Commerce Platform — Agent Marketplace & Orchestration Hub plus Clean-Room Native Vendor Settlement Layer, with Platform Roadmap"
doc_type: "PRD-TAD-ADR-MVP-GTM"
version: "0.3.1"
date: "2026-09-12"
lang: "en-US"
owner: "Solo Founder / AI Orchestrator"
local_rung: "dev-proven"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
deploy_boundary: "closed"
clean_room_policy: "inspiration-only; no foreign commerce framework code, schema, or dependency"
frontmatter_contract: "required"
continuity_id: "PLAN-AGENTIC-GRAPH-AGENTIC-COMMERCE-PLATFORM-PRD-TAD-ADR-MVP-GTM"
worktree_id: "device-cba000d3779d--planning-v27"
agent_id: "codex-01a0940a"
guideline_revision: "2.7.0"
guideline_source: "https://github.com/huijoohwee/huijoohwee.github.io/blob/e8d2a10a8d3e5735c43edf350a22523df05fdf91/guidelines/prd-tad-adr-mvp-gtm-guidelines.md"
reviewed_source_revision: "7fb85741121d8c2886027e4a630d013ba91c1027"
previous_document_version: "0.3.0"
prd_revision: "0.3.1"
tad_revision: "0.3.1"
adr_revision: "0.3.1"
mvp_revision: "0.3.1"
gtm_revision: "0.3.1"
---

The prior [inherited specification](agentic-graph-agentic-commerce-platform-prd-tad-adr-mvp-gtm.md) remains byte-exact because the travel-commerce reused-interface evidence pins it. This planning successor supplies the current five-role structure; it does not replace the inherited interface baseline or renew its runtime evidence.

# Reference implementation: agentic-graph Agentic Commerce Platform — Agent Marketplace & Orchestration Hub plus Clean-Room Native Vendor Settlement Layer, with Platform Roadmap

This combined planning artifact joins `PLAN-AGENTIC-GRAPH-AGENTIC-COMMERCE-PLATFORM-PRD-TAD-ADR-MVP-GTM@0.3.1`. Sections are split solely to keep each authored file below 600 lines. Existing source observations retain their recorded scope and revision. The links below preserve the original section anchors and locate the unchanged requirement/design/decision text plus the current MVP/GTM assessment.

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
