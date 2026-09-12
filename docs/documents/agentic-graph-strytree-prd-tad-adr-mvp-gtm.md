---
title: "agentic-graph Strytree Storytree - PRD and TAD"
doc_type: "PRD-TAD-ADR-MVP-GTM"
id: "agentic-graph-strytree-prd-tad"
version: "0.2.3"
status: "implementation-contract"
created: "2026-05-30"
updated: "2026-06-10"
author: "airvio / joohwee"
domain: "agentic-graph"
lang: "en-US"
frontmatter_contract: "required"
deployment_topology: "Dev -> Prod -> Cloudflare"
cloudflare_route: "https://airvio.co/agentic-graph"
source_repo: "https://github.com/huijoohwee/agentic-graph"
source_reference: "external static storytree prototype"
source_snapshot_utc: "2026-05-30T09:52:51Z"
orientation:
  - "solo-dev"
  - "AI-native"
  - "min-viable-max-value"
  - "TCO-zero"
  - "FOSS-first"
  - "token-economical"
  - "harness-first"
constraints:
  - "production access state must be server-owned"
  - "credit-token ledger must not trust client mutation"
  - "external video provider credentials must never ship to the browser"
  - "story edges derive from parent_node_id unless a later graph index is justified"
  - "static prototype behavior must be documented separately from target implementation"
  - "no new paid dependency without ADR-level TCO comparison"
  - "no new external graph-rendering dependency for the Strytree workbench"
  - "no hosted database dependency outside the Cloudflare topology"
  - "no alternate app hosting path outside Dev -> Prod -> Cloudflare"
  - "story edge rendering must bind to kgSharedRendererContract@shared-renderer-contract/v1 and buildScopedGraphSemanticKey; no local/downstream/hardcoded edge logic"
  - "story edge projection must use the canonical Storyboard renderer through kgSharedRendererContract; no per-renderer edge path, hardcode, or fork"
tags:
  - "strytree"
  - "storytree"
  - "interactive-story-graph"
  - "external_video_provider"
  - "credit-ledger"
  - "payments"
  - "cloudflare-d1"
  - "cloudflare-r2"
  - "storyboard"
  - "forkcompare"
  - "branch-candidate-workbench"
related:
  - "huijoohwee.github.io/guidelines/prd-tad-adr-mvp-gtm-guidelines.md"
  - "docs/documents/agentic-graph-strytree-prd-tad-adr-mvp-gtm.md"
  - "docs/documents/agentic-graph-strybldr-prd-tad-adr-mvp-gtm.md"
  - "docs/documents/agentic-graph-agentic-commerce-prd-tad-adr-mvp-gtm.md"
  - "docs/documents/agentic-graph-mainpanel-commerce-prd-tad-adr-mvp-gtm.md"
kgCanvas2dRendererCapability:
  supportedRenderers: ["storyboard"]
  selectionModel: "projected-data"          # renderers project this set; they do not branch on it
  edgeProjectionInvariance: "identical-across-supportedRenderers"
kgSharedRendererContract:
  version: "shared-renderer-contract/v1"
  semanticIdentity: "buildScopedGraphSemanticKey"
  edgeModel: "active graph edges from the selected source graph"
  edgeSource: "strytree_nodes.parent_node_id"   # source/upstream derivation, no edge table
  rendererPolicy: "frontmatter and source payloads own data; renderers project view state only"
socket_types:
  idea_signal: {color: "#14b8a6", edgeWidthPx: 2, handleStrokeWidthPx: 2, accepts: [idea_signal]}
  evidence_signal: {color: "#22c55e", edgeWidthPx: 2, handleStrokeWidthPx: 2, accepts: [evidence_signal]}
  approval_signal: {color: "#f59e0b", edgeWidthPx: 3, handleStrokeWidthPx: 3, accepts: [approval_signal]}
  artifact_signal: {color: "#8b5cf6", edgeWidthPx: 2, handleStrokeWidthPx: 2, accepts: [artifact_signal]}
flow:
  direction: "LR"
  edgeType: "smoothstep"
  # Per-node handles + flow:portTypes are the shared, agnostic edge-projection driver.
  # For Strytree, each node carries a single inbound handle keyed to its parent_node_id-derived edge.
  storyEdgeProjection:
    handleModel: "per-node source/target handles derived from parent_node_id"
    portTypeDefault: "idea_signal"            # story-edge semantic mapping (single typed projection)
    semanticKeyRule: "buildScopedGraphSemanticKey(storyId, parentNodeId, childNodeId)"
edgeContractForbid:
  - "backfill"
  - "churn"
  - "conflict"
  - "duplicate"
  - "freeze"
  - "infinite-loop"
  - "hardcode"
  - "legacy"
  - "re-calculation"
  - "re-computation"
  - "re-rendering"
  - "stale-state"
  - "renderer-specific-edge-path"
  - "per-renderer-hardcode"
  - "alias-stacking"
  - "local-or-downstream-patch"
  - "backward-compat-remap"
edgeContractCleanup:
  rule: "root/source/upstream neutralization; remove 100% of legacy/stale/conflicting edge spec, hardcoded fixtures, and tests; NO backward-compatibility remapping"
edgeContractPrinciples: ["universality", "neutrality", "agnosticity", "modularity", "spec-complete-runtime-ready", "forbid-hardcode-in-repo"]
date: "2026-09-12"
owner: "Product maintainers"
continuity_id: "PLAN-AGENTIC-GRAPH-STRYTREE-PRD-TAD-ADR-MVP-GTM"
local_rung: "undocumented"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
worktree_id: "device-cba000d3779d--planning-v27"
agent_id: "codex-01a0940a"
guideline_revision: "2.7.0"
guideline_source: "https://github.com/huijoohwee/huijoohwee.github.io/blob/e8d2a10a8d3e5735c43edf350a22523df05fdf91/guidelines/prd-tad-adr-mvp-gtm-guidelines.md"
reviewed_source_revision: "7fb85741121d8c2886027e4a630d013ba91c1027"
previous_document_version: "0.2.2"
prd_revision: "0.2.3"
tad_revision: "0.2.3"
adr_revision: "0.2.3"
mvp_revision: "0.2.3"
gtm_revision: "0.2.3"
---

# Reference implementation: agentic-graph Strytree Storytree - PRD and TAD

This combined planning artifact joins `PLAN-AGENTIC-GRAPH-STRYTREE-PRD-TAD-ADR-MVP-GTM@0.2.3`. Sections are split solely to keep each authored file below 600 lines. Existing source observations retain their recorded scope and revision. The links below preserve the original section anchors and locate the unchanged requirement/design/decision text plus the current MVP/GTM assessment.

<a id="document-map"></a>
- [Document Map](agentic-graph-strytree-prd-tad-adr-mvp-gtm.part-01.md#document-map)
<a id="a1-observed-strytree-prototype"></a>
- [A1. Observed Strytree Prototype](agentic-graph-strytree-prd-tad-adr-mvp-gtm.part-01.md#a1-observed-strytree-prototype)
<a id="delivery-shape"></a>
- [Delivery Shape](agentic-graph-strytree-prd-tad-adr-mvp-gtm.part-01.md#delivery-shape)
<a id="prototype-state-object"></a>
- [Prototype State Object](agentic-graph-strytree-prd-tad-adr-mvp-gtm.part-01.md#prototype-state-object)
<a id="prototype-node-shape"></a>
- [Prototype Node Shape](agentic-graph-strytree-prd-tad-adr-mvp-gtm.part-01.md#prototype-node-shape)
<a id="prototype-access-behavior"></a>
- [Prototype Access Behavior](agentic-graph-strytree-prd-tad-adr-mvp-gtm.part-01.md#prototype-access-behavior)
<a id="prototype-credit-token-behavior"></a>
- [Prototype Credit-Token Behavior](agentic-graph-strytree-prd-tad-adr-mvp-gtm.part-01.md#prototype-credit-token-behavior)
<a id="prototype-unlock-payment-behavior"></a>
- [Prototype Unlock Payment Behavior](agentic-graph-strytree-prd-tad-adr-mvp-gtm.part-01.md#prototype-unlock-payment-behavior)
<a id="prototype-external-video-provider-behavior"></a>
- [Prototype external video provider Behavior](agentic-graph-strytree-prd-tad-adr-mvp-gtm.part-01.md#prototype-external-video-provider-behavior)
<a id="prototype-calculation-engine"></a>
- [Prototype Calculation Engine](agentic-graph-strytree-prd-tad-adr-mvp-gtm.part-01.md#prototype-calculation-engine)
<a id="b1-problem-statement"></a>
- [B1. Problem Statement](agentic-graph-strytree-prd-tad-adr-mvp-gtm.part-01.md#b1-problem-statement)
<a id="b2-falsifiable-hypothesis"></a>
- [B2. Falsifiable Hypothesis](agentic-graph-strytree-prd-tad-adr-mvp-gtm.part-01.md#b2-falsifiable-hypothesis)
<a id="b3-personas"></a>
- [B3. Personas](agentic-graph-strytree-prd-tad-adr-mvp-gtm.part-01.md#b3-personas)
<a id="b4-user-journey"></a>
- [B4. User Journey](agentic-graph-strytree-prd-tad-adr-mvp-gtm.part-01.md#b4-user-journey)
<a id="b5-product-epics-and-acceptance-criteria"></a>
- [B5. Product Epics And Acceptance Criteria](agentic-graph-strytree-prd-tad-adr-mvp-gtm.part-01.md#b5-product-epics-and-acceptance-criteria)
<a id="prd-str-e01---access-and-identity"></a>
- [PRD-STR-E01 - Access And Identity](agentic-graph-strytree-prd-tad-adr-mvp-gtm.part-01.md#prd-str-e01---access-and-identity)
<a id="prd-str-e02---persistent-story-graph"></a>
- [PRD-STR-E02 - Persistent Story Graph](agentic-graph-strytree-prd-tad-adr-mvp-gtm.part-01.md#prd-str-e02---persistent-story-graph)
<a id="prd-str-e03---credit-token-wallet"></a>
- [PRD-STR-E03 - Credit-Token Wallet](agentic-graph-strytree-prd-tad-adr-mvp-gtm.part-01.md#prd-str-e03---credit-token-wallet)
<a id="prd-str-e04---payment-to-credit-purchase"></a>
- [PRD-STR-E04 - Payment-To-Credit Purchase](agentic-graph-strytree-prd-tad-adr-mvp-gtm.part-01.md#prd-str-e04---payment-to-credit-purchase)
<a id="prd-str-e05---branch-unlock-and-creator-split"></a>
- [PRD-STR-E05 - Branch Unlock And Creator Split](agentic-graph-strytree-prd-tad-adr-mvp-gtm.part-01.md#prd-str-e05---branch-unlock-and-creator-split)
<a id="prd-str-e06---external-video-provider-generation-harness"></a>
- [PRD-STR-E06 - external video provider Generation Harness](agentic-graph-strytree-prd-tad-adr-mvp-gtm.part-01.md#prd-str-e06---external-video-provider-generation-harness)
<a id="prd-str-e07---observability-and-governance"></a>
- [PRD-STR-E07 - Observability And Governance](agentic-graph-strytree-prd-tad-adr-mvp-gtm.part-01.md#prd-str-e07---observability-and-governance)
<a id="prd-str-e08---forkcompare-branch-candidate-workbench"></a>
- [PRD-STR-E08 - ForkCompare Branch Candidate Workbench](agentic-graph-strytree-prd-tad-adr-mvp-gtm.part-01.md#prd-str-e08---forkcompare-branch-candidate-workbench)
<a id="b6-moscow-prioritization"></a>
- [B6. MoSCoW Prioritization](agentic-graph-strytree-prd-tad-adr-mvp-gtm.part-01.md#b6-moscow-prioritization)
<a id="min-viable-scope"></a>
- [Min-Viable Scope](agentic-graph-strytree-prd-tad-adr-mvp-gtm.part-01.md#min-viable-scope)
<a id="recommended-add-on-scope"></a>
- [Recommended Add-On Scope](agentic-graph-strytree-prd-tad-adr-mvp-gtm.part-01.md#recommended-add-on-scope)
<a id="out-of-scope"></a>
- [Out Of Scope](agentic-graph-strytree-prd-tad-adr-mvp-gtm.part-01.md#out-of-scope)
<a id="b7-success-metrics"></a>
- [B7. Success Metrics](agentic-graph-strytree-prd-tad-adr-mvp-gtm.part-02.md#b7-success-metrics)
<a id="planning-revision--reference-implementation"></a>
- [Planning revision — reference implementation](agentic-graph-strytree-prd-tad-adr-mvp-gtm.part-02.md#planning-revision--reference-implementation)
<a id="mvp--reference-implementation"></a>
- [MVP — reference implementation](agentic-graph-strytree-prd-tad-adr-mvp-gtm.part-02.md#mvp--reference-implementation)
<a id="gtm--reference-implementation"></a>
- [GTM — reference implementation](agentic-graph-strytree-prd-tad-adr-mvp-gtm.part-02.md#gtm--reference-implementation)
<a id="planning-gaps--reference-implementation"></a>
- [Planning gaps — reference implementation](agentic-graph-strytree-prd-tad-adr-mvp-gtm.part-02.md#planning-gaps--reference-implementation)

<a id="agentic-graph-strytree-storytree---prd-and-tad"></a> [agentic-graph Strytree Storytree - PRD and TAD](agentic-graph-strytree-prd-tad-adr-mvp-gtm.part-01.md#agentic-graph-strytree-storytree---prd-and-tad)
<a id="part-a---source-analysis"></a> [Part A - Source Analysis](agentic-graph-strytree-prd-tad-adr-mvp-gtm.part-01.md#part-a---source-analysis)
<a id="part-b---product-requirements-document"></a> [Part B - Product Requirements Document](agentic-graph-strytree-prd-tad-adr-mvp-gtm.part-01.md#part-b---product-requirements-document)
