---
title: "agentic-graph Probe-Tree — Combined PRD-TAD-ADR-MVP-GTM"
doc_type: "PRD-TAD-ADR-MVP-GTM"
version: "1.3.1"
date: "2026-09-12"
lang: "en-US"
frontmatter_contract: "required"
owner: "probe-tree-runtime"
local_rung: "runtime-ready"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
publish_policy: "Dev-only until explicit operator approval"
invocation_id: "agentic-graph.probe-tree"
invocation_tokens:
  slash: "/agentic-graph.probe-tree"
  hash: "#agentic-graph.probe-tree"
  at: "@agentic-graph.probe-tree"
runtime_owner: "canvas/src/features/agentic-os/agenticOsDocInvocations.ts"
kgCanvasRenderMode: "2d"
kgCanvas2dRenderer: "storyboard"
kgFrontmatterModeEnabled: true
storyboardDisplay: "2D Renderer: Storyboard"
promptPreset:
  id: "agentic-graph-probe-tree"
  alias: "/agentic-graph-probe-tree-prompt-preset"
  source: "agentic-canvas-os/docs/PROMPT-PRESETS.md"
  activation: "card-inline"
storyboardMermaidMapping:
  kind: "storyboard-probe-tree-flowchart/v1"
  direction: "TB"
  owner: "canvas/src/components/StoryboardCanvas/storyboardProbeTreeMermaidFlowchart.ts"
index:
  mermaid: |
    flowchart TB
      probe_root["Root: initial ask"] -->|probe.generate| probe_options["Candidate options"]
      probe_options -->|probe.select| probe_selected["Selected probe node"]
      probe_selected -->|branches-to| probe_terminal["Resolved terminal node"]
      probe_terminal -->|probe.evolve| probe_memory["Scoped exemplar memory"]
parent: "none"
continuity_id: "PLAN-AGENTIC-GRAPH-PROBE-TREE-PRD-TAD-ADR-MVP-GTM"
worktree_id: "device-cba000d3779d--planning-v27"
agent_id: "codex-01a0940a"
guideline_revision: "2.7.0"
guideline_source: "https://github.com/huijoohwee/huijoohwee.github.io/blob/e8d2a10a8d3e5735c43edf350a22523df05fdf91/guidelines/prd-tad-adr-mvp-gtm-guidelines.md"
reviewed_source_revision: "7fb85741121d8c2886027e4a630d013ba91c1027"
previous_document_version: "1.3.0"
prd_revision: "1.3.1"
tad_revision: "1.3.1"
adr_revision: "1.3.1"
mvp_revision: "1.3.1"
gtm_revision: "1.3.1"
---

# Reference implementation: agentic-graph Probe-Tree — Combined PRD-TAD-ADR-MVP-GTM

This combined planning artifact joins `PLAN-AGENTIC-GRAPH-PROBE-TREE-PRD-TAD-ADR-MVP-GTM@1.3.1`. Sections are split solely to keep each authored file below 600 lines. Existing source observations retain their recorded scope and revision. The links below preserve the original section anchors and locate the unchanged requirement/design/decision text plus the current MVP/GTM assessment.

<a id="scope--neutrality-note"></a>
- [Scope & Neutrality Note](agentic-graph-probe-tree-prd-tad-adr-mvp-gtm.part-01.md#scope--neutrality-note)
<a id="overview"></a>
- [Overview](agentic-graph-probe-tree-prd-tad-adr-mvp-gtm.part-01.md#overview)
<a id="journey-help-seeker--reach-a-resolved-outcome-through-guided-branching"></a>
- [Journey: Help-Seeker — Reach a Resolved Outcome Through Guided Branching](agentic-graph-probe-tree-prd-tad-adr-mvp-gtm.part-01.md#journey-help-seeker--reach-a-resolved-outcome-through-guided-branching)
<a id="feature-probe-tree"></a>
- [Feature: Probe-Tree](agentic-graph-probe-tree-prd-tad-adr-mvp-gtm.part-01.md#feature-probe-tree)
<a id="problem-statement"></a>
- [Problem Statement](agentic-graph-probe-tree-prd-tad-adr-mvp-gtm.part-01.md#problem-statement)
<a id="personas"></a>
- [Personas](agentic-graph-probe-tree-prd-tad-adr-mvp-gtm.part-01.md#personas)
<a id="user-journey-stage"></a>
- [User Journey Stage](agentic-graph-probe-tree-prd-tad-adr-mvp-gtm.part-01.md#user-journey-stage)
<a id="user-stories"></a>
- [User Stories](agentic-graph-probe-tree-prd-tad-adr-mvp-gtm.part-01.md#user-stories)
<a id="widget-card-entrypoint-coexistence"></a>
- [Widget Card entrypoint coexistence](agentic-graph-probe-tree-prd-tad-adr-mvp-gtm.part-01.md#widget-card-entrypoint-coexistence)
<a id="acceptance-criteria"></a>
- [Acceptance Criteria](agentic-graph-probe-tree-prd-tad-adr-mvp-gtm.part-01.md#acceptance-criteria)
<a id="success-metrics"></a>
- [Success Metrics](agentic-graph-probe-tree-prd-tad-adr-mvp-gtm.part-01.md#success-metrics)
<a id="moscow-priority"></a>
- [MoSCoW Priority](agentic-graph-probe-tree-prd-tad-adr-mvp-gtm.part-01.md#moscow-priority)
<a id="min-viable-scope"></a>
- [Min-Viable Scope](agentic-graph-probe-tree-prd-tad-adr-mvp-gtm.part-01.md#min-viable-scope)
<a id="out-of-scope"></a>
- [Out of Scope](agentic-graph-probe-tree-prd-tad-adr-mvp-gtm.part-01.md#out-of-scope)
<a id="dependencies"></a>
- [Dependencies](agentic-graph-probe-tree-prd-tad-adr-mvp-gtm.part-01.md#dependencies)
<a id="open-questions"></a>
- [Open Questions](agentic-graph-probe-tree-prd-tad-adr-mvp-gtm.part-01.md#open-questions)
<a id="architecture-probe-tree"></a>
- [Architecture: Probe-Tree](agentic-graph-probe-tree-prd-tad-adr-mvp-gtm.part-01.md#architecture-probe-tree)
<a id="overview-1"></a>
- [Overview](agentic-graph-probe-tree-prd-tad-adr-mvp-gtm.part-01.md#overview-1)
<a id="journey--system-mapping"></a>
- [Journey → System Mapping](agentic-graph-probe-tree-prd-tad-adr-mvp-gtm.part-01.md#journey--system-mapping)
<a id="topology"></a>
- [Topology](agentic-graph-probe-tree-prd-tad-adr-mvp-gtm.part-01.md#topology)
<a id="orchestrationharness-flows"></a>
- [Orchestration/Harness Flows](agentic-graph-probe-tree-prd-tad-adr-mvp-gtm.part-01.md#orchestrationharness-flows)
<a id="pipeline-probegenerate"></a>
- [Pipeline: `probe.generate`](agentic-graph-probe-tree-prd-tad-adr-mvp-gtm.part-01.md#pipeline-probegenerate)
<a id="pipeline-probeselect"></a>
- [Pipeline: `probe.select`](agentic-graph-probe-tree-prd-tad-adr-mvp-gtm.part-01.md#pipeline-probeselect)
<a id="pipeline-probeevolve"></a>
- [Pipeline: `probe.evolve`](agentic-graph-probe-tree-prd-tad-adr-mvp-gtm.part-01.md#pipeline-probeevolve)
<a id="the-outer-conversational-loop-agentic-loop-bound"></a>
- [The outer conversational loop (agentic-loop bound)](agentic-graph-probe-tree-prd-tad-adr-mvp-gtm.part-01.md#the-outer-conversational-loop-agentic-loop-bound)
<a id="component-specifications"></a>
- [Component Specifications](agentic-graph-probe-tree-prd-tad-adr-mvp-gtm.part-01.md#component-specifications)
<a id="integration-contracts"></a>
- [Integration Contracts](agentic-graph-probe-tree-prd-tad-adr-mvp-gtm.part-01.md#integration-contracts)
<a id="architectural-decisions"></a>
- [Architectural Decisions](agentic-graph-probe-tree-prd-tad-adr-mvp-gtm.part-01.md#architectural-decisions)
<a id="quality-attributes"></a>
- [Quality Attributes](agentic-graph-probe-tree-prd-tad-adr-mvp-gtm.part-01.md#quality-attributes)
<a id="deployment-strategy"></a>
- [Deployment Strategy](agentic-graph-probe-tree-prd-tad-adr-mvp-gtm.part-01.md#deployment-strategy)
<a id="architecture-diagrams"></a>
- [Architecture Diagrams](agentic-graph-probe-tree-prd-tad-adr-mvp-gtm.part-01.md#architecture-diagrams)
<a id="worked-example-resolved-thread-as-flowchart-tb"></a>
- [Worked Example: Resolved Thread as `flowchart TB`](agentic-graph-probe-tree-prd-tad-adr-mvp-gtm.part-01.md#worked-example-resolved-thread-as-flowchart-tb)
<a id="component-inventory"></a>
- [Component Inventory](agentic-graph-probe-tree-prd-tad-adr-mvp-gtm.part-01.md#component-inventory)
<a id="adr-1-reuse-the-existing-graph-orchestration-engine-dependency-instead-of-introducing-a-dedicated-conversation-tree-engine"></a>
- [ADR-1: Reuse the Existing Graph Orchestration Engine Dependency Instead of Introducing a Dedicated Conversation-Tree Engine](agentic-graph-probe-tree-prd-tad-adr-mvp-gtm.part-01.md#adr-1-reuse-the-existing-graph-orchestration-engine-dependency-instead-of-introducing-a-dedicated-conversation-tree-engine)
<a id="context"></a>
- [Context](agentic-graph-probe-tree-prd-tad-adr-mvp-gtm.part-01.md#context)
<a id="decision"></a>
- [Decision](agentic-graph-probe-tree-prd-tad-adr-mvp-gtm.part-01.md#decision)
<a id="alternatives-considered"></a>
- [Alternatives Considered](agentic-graph-probe-tree-prd-tad-adr-mvp-gtm.part-01.md#alternatives-considered)
<a id="rationale"></a>
- [Rationale](agentic-graph-probe-tree-prd-tad-adr-mvp-gtm.part-01.md#rationale)
<a id="tco-impact"></a>
- [TCO Impact](agentic-graph-probe-tree-prd-tad-adr-mvp-gtm.part-01.md#tco-impact)
<a id="consequences"></a>
- [Consequences](agentic-graph-probe-tree-prd-tad-adr-mvp-gtm.part-01.md#consequences)
<a id="adr-2-custom-checkpoint-persistence-over-the-existing-graph-markdown-store-deferring-the-native-checkpointreplay-mechanism"></a>
- [ADR-2: Custom Checkpoint Persistence Over the Existing Graph Markdown Store, Deferring the Native Checkpoint/Replay Mechanism](agentic-graph-probe-tree-prd-tad-adr-mvp-gtm.part-01.md#adr-2-custom-checkpoint-persistence-over-the-existing-graph-markdown-store-deferring-the-native-checkpointreplay-mechanism)
<a id="context-1"></a>
- [Context](agentic-graph-probe-tree-prd-tad-adr-mvp-gtm.part-01.md#context-1)
<a id="decision-1"></a>
- [Decision](agentic-graph-probe-tree-prd-tad-adr-mvp-gtm.part-01.md#decision-1)
<a id="alternatives-considered-1"></a>
- [Alternatives Considered](agentic-graph-probe-tree-prd-tad-adr-mvp-gtm.part-01.md#alternatives-considered-1)
<a id="rationale-1"></a>
- [Rationale](agentic-graph-probe-tree-prd-tad-adr-mvp-gtm.part-01.md#rationale-1)
<a id="tco-impact-1"></a>
- [TCO Impact](agentic-graph-probe-tree-prd-tad-adr-mvp-gtm.part-02.md#tco-impact-1)
<a id="consequences-1"></a>
- [Consequences](agentic-graph-probe-tree-prd-tad-adr-mvp-gtm.part-02.md#consequences-1)
<a id="validation-checklist-snapshot"></a>
- [Validation Checklist Snapshot](agentic-graph-probe-tree-prd-tad-adr-mvp-gtm.part-02.md#validation-checklist-snapshot)
<a id="implementation-snapshot--2026-07-07"></a>
- [Implementation Snapshot — 2026-07-07](agentic-graph-probe-tree-prd-tad-adr-mvp-gtm.part-02.md#implementation-snapshot--2026-07-07)
<a id="planning-revision--reference-implementation"></a>
- [Planning revision — reference implementation](agentic-graph-probe-tree-prd-tad-adr-mvp-gtm.part-02.md#planning-revision--reference-implementation)
<a id="mvp--reference-implementation"></a>
- [MVP — reference implementation](agentic-graph-probe-tree-prd-tad-adr-mvp-gtm.part-02.md#mvp--reference-implementation)
<a id="gtm--reference-implementation"></a>
- [GTM — reference implementation](agentic-graph-probe-tree-prd-tad-adr-mvp-gtm.part-02.md#gtm--reference-implementation)
<a id="planning-gaps--reference-implementation"></a>
- [Planning gaps — reference implementation](agentic-graph-probe-tree-prd-tad-adr-mvp-gtm.part-02.md#planning-gaps--reference-implementation)

<a id="agentic-graph-probe-tree--combined-prd-tad-adr-mvp-gtm"></a> [agentic-graph Probe-Tree — Combined PRD-TAD-ADR-MVP-GTM](agentic-graph-probe-tree-prd-tad-adr-mvp-gtm.part-01.md#agentic-graph-probe-tree--combined-prd-tad-adr-mvp-gtm)
