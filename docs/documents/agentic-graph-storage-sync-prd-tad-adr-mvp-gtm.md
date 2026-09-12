---
title: "Reference implementation: agentic-graph Storage and Synchronization"
id: "md:agentic-graph-storage-sync-prd-tad-adr"
doc_type: "PRD-TAD-ADR-MVP-GTM"
version: "5.0.1"
date: "2026-09-12"
lang: "en-US"
guideline_version: "1.7.0"
owner: "docs.storage.sync"
local_rung: "spec-complete"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
doc_path: "docs/documents/agentic-graph-storage-sync-prd-tad-adr-mvp-gtm.md"
companion: "docs/documents/agentic-graph-storage-sync-document.companion.md"
supersedes: "joohwee:prd-tad-adr-mvp-gtm-archive/2026-09-11/agentic-graph/docs/documents/agentic-graph-storage-sync-document.md@4.1.0"
decision_archive: "joohwee:prd-tad-adr-mvp-gtm-archive/2026-09-11/agentic-graph/docs/documents/agentic-graph-storage-sync-adrs-document.md"
binary_contract: "docs/documents/agentic-graph-artifact-media-storage-architecture.md"
invocation_authority: "Runtime route identities are owned by the typed route-path source module; this document declares no invocation route."
frontmatter_contract: "required"
continuity_id: "PLAN-AGENTIC-GRAPH-STORAGE-SYNC-PRD-TAD-ADR-MVP-GTM"
worktree_id: "device-cba000d3779d--planning-v27"
agent_id: "codex-01a0940a"
guideline_revision: "2.7.0"
guideline_source: "https://github.com/huijoohwee/huijoohwee.github.io/blob/e8d2a10a8d3e5735c43edf350a22523df05fdf91/guidelines/prd-tad-adr-mvp-gtm-guidelines.md"
reviewed_source_revision: "7fb85741121d8c2886027e4a630d013ba91c1027"
previous_document_version: "5.0.0"
prd_revision: "5.0.1"
tad_revision: "5.0.1"
adr_revision: "5.0.1"
mvp_revision: "5.0.1"
gtm_revision: "5.0.1"
---

# Reference implementation: Reference implementation: agentic-graph Storage and Synchronization

This combined planning artifact joins `PLAN-AGENTIC-GRAPH-STORAGE-SYNC-PRD-TAD-ADR-MVP-GTM@5.0.1`. Sections are split solely to keep each authored file below 600 lines. Existing source observations retain their recorded scope and revision. The links below preserve the original section anchors and locate the unchanged requirement/design/decision text plus the current MVP/GTM assessment.

<a id="authority-and-readiness"></a>
- [Authority and readiness](agentic-graph-storage-sync-prd-tad-adr-mvp-gtm.part-01.md#authority-and-readiness)
<a id="recommended-knowledge-base-storage-boundary"></a>
- [Recommended knowledge-base storage boundary](agentic-graph-storage-sync-prd-tad-adr-mvp-gtm.part-01.md#recommended-knowledge-base-storage-boundary)
<a id="problem-and-personas"></a>
- [Problem and personas](agentic-graph-storage-sync-prd-tad-adr-mvp-gtm.part-01.md#problem-and-personas)
<a id="user-stories"></a>
- [User Stories](agentic-graph-storage-sync-prd-tad-adr-mvp-gtm.part-01.md#user-stories)
<a id="journey-author--save-reconnect-and-reconcile"></a>
- [Journey: Author — Save, reconnect, and reconcile](agentic-graph-storage-sync-prd-tad-adr-mvp-gtm.part-01.md#journey-author--save-reconnect-and-reconcile)
<a id="requirements-and-vccs"></a>
- [Requirements and VCCs](agentic-graph-storage-sync-prd-tad-adr-mvp-gtm.part-01.md#requirements-and-vccs)
<a id="time-to-value-and-metrics"></a>
- [Time-to-value and metrics](agentic-graph-storage-sync-prd-tad-adr-mvp-gtm.part-01.md#time-to-value-and-metrics)
<a id="moscow-priority--roi"></a>
- [MoSCoW Priority & ROI](agentic-graph-storage-sync-prd-tad-adr-mvp-gtm.part-01.md#moscow-priority--roi)
<a id="min-viable-scope"></a>
- [Min-Viable Scope](agentic-graph-storage-sync-prd-tad-adr-mvp-gtm.part-01.md#min-viable-scope)
<a id="out-of-scope"></a>
- [Out of Scope](agentic-graph-storage-sync-prd-tad-adr-mvp-gtm.part-01.md#out-of-scope)
<a id="dependencies"></a>
- [Dependencies](agentic-graph-storage-sync-prd-tad-adr-mvp-gtm.part-01.md#dependencies)
<a id="topology-storage-roles-v50--2026-08-06"></a>
- [Topology: Storage roles v5.0 — 2026-08-06](agentic-graph-storage-sync-prd-tad-adr-mvp-gtm.part-01.md#topology-storage-roles-v50--2026-08-06)
<a id="orchestrationharness-flows"></a>
- [Orchestration/Harness Flows](agentic-graph-storage-sync-prd-tad-adr-mvp-gtm.part-01.md#orchestrationharness-flows)
<a id="data-flows"></a>
- [Data flows](agentic-graph-storage-sync-prd-tad-adr-mvp-gtm.part-01.md#data-flows)
<a id="local-save-and-reopen"></a>
- [Local save and reopen](agentic-graph-storage-sync-prd-tad-adr-mvp-gtm.part-01.md#local-save-and-reopen)
<a id="optional-synchronization"></a>
- [Optional synchronization](agentic-graph-storage-sync-prd-tad-adr-mvp-gtm.part-01.md#optional-synchronization)
<a id="room-synchronization-crdt-design-only--adr-2"></a>
- [Room synchronization (CRDT, design-only — ADR-2)](agentic-graph-storage-sync-prd-tad-adr-mvp-gtm.part-01.md#room-synchronization-crdt-design-only--adr-2)
<a id="lark-collaboration-candidate-flow"></a>
- [Lark collaboration candidate flow](agentic-graph-storage-sync-prd-tad-adr-mvp-gtm.part-01.md#lark-collaboration-candidate-flow)
<a id="component-specifications"></a>
- [Component Specifications](agentic-graph-storage-sync-prd-tad-adr-mvp-gtm.part-01.md#component-specifications)
<a id="integration-contracts"></a>
- [Integration Contracts](agentic-graph-storage-sync-prd-tad-adr-mvp-gtm.part-01.md#integration-contracts)
<a id="architectural-decisions"></a>
- [Architectural Decisions](agentic-graph-storage-sync-prd-tad-adr-mvp-gtm.part-01.md#architectural-decisions)
<a id="quality-attributes"></a>
- [Quality Attributes](agentic-graph-storage-sync-prd-tad-adr-mvp-gtm.part-01.md#quality-attributes)
<a id="deployment-strategy"></a>
- [Deployment Strategy](agentic-graph-storage-sync-prd-tad-adr-mvp-gtm.part-01.md#deployment-strategy)
<a id="component-inventory"></a>
- [Component Inventory](agentic-graph-storage-sync-prd-tad-adr-mvp-gtm.part-01.md#component-inventory)
<a id="vcc-and-evidence-reference-register"></a>
- [VCC and Evidence Reference register](agentic-graph-storage-sync-prd-tad-adr-mvp-gtm.part-01.md#vcc-and-evidence-reference-register)
<a id="readiness-gap-matrix"></a>
- [Readiness Gap Matrix](agentic-graph-storage-sync-prd-tad-adr-mvp-gtm.part-01.md#readiness-gap-matrix)
<a id="tco-comparison"></a>
- [TCO comparison](agentic-graph-storage-sync-prd-tad-adr-mvp-gtm.part-01.md#tco-comparison)
<a id="deploy-boundary-register"></a>
- [Deploy Boundary Register](agentic-graph-storage-sync-prd-tad-adr-mvp-gtm.part-01.md#deploy-boundary-register)
<a id="architectural-decision-records"></a>
- [Architectural Decision Records](agentic-graph-storage-sync-prd-tad-adr-mvp-gtm.part-01.md#architectural-decision-records)
<a id="adr-1-git-backed-markdownfrontmatter-as-the-sole-ssot"></a>
- [ADR-1: Git-backed Markdown/frontmatter as the sole SSOT](agentic-graph-storage-sync-prd-tad-adr-mvp-gtm.part-01.md#adr-1-git-backed-markdownfrontmatter-as-the-sole-ssot)
<a id="adr-2-yjs-as-the-collaboration-room-crdt-engine"></a>
- [ADR-2: Yjs as the collaboration-room CRDT engine](agentic-graph-storage-sync-prd-tad-adr-mvp-gtm.part-02.md#adr-2-yjs-as-the-collaboration-room-crdt-engine)
<a id="adr-3-lark-as-a-host-mediated-review-first-collaboration-projection"></a>
- [ADR-3: Lark as a host-mediated, review-first collaboration projection](agentic-graph-storage-sync-prd-tad-adr-mvp-gtm.part-02.md#adr-3-lark-as-a-host-mediated-review-first-collaboration-projection)
<a id="conformance-note"></a>
- [Conformance Note](agentic-graph-storage-sync-prd-tad-adr-mvp-gtm.part-02.md#conformance-note)
<a id="open-questions"></a>
- [Open questions](agentic-graph-storage-sync-prd-tad-adr-mvp-gtm.part-02.md#open-questions)
<a id="planning-revision--reference-implementation"></a>
- [Planning revision — reference implementation](agentic-graph-storage-sync-prd-tad-adr-mvp-gtm.part-02.md#planning-revision--reference-implementation)
<a id="mvp--reference-implementation"></a>
- [MVP — reference implementation](agentic-graph-storage-sync-prd-tad-adr-mvp-gtm.part-02.md#mvp--reference-implementation)
<a id="gtm--reference-implementation"></a>
- [GTM — reference implementation](agentic-graph-storage-sync-prd-tad-adr-mvp-gtm.part-02.md#gtm--reference-implementation)
<a id="planning-gaps--reference-implementation"></a>
- [Planning gaps — reference implementation](agentic-graph-storage-sync-prd-tad-adr-mvp-gtm.part-02.md#planning-gaps--reference-implementation)

<a id="reference-implementation-agentic-graph-storage-and-synchronization"></a> [Reference implementation: agentic-graph Storage and Synchronization](agentic-graph-storage-sync-prd-tad-adr-mvp-gtm.part-01.md#reference-implementation-agentic-graph-storage-and-synchronization)
