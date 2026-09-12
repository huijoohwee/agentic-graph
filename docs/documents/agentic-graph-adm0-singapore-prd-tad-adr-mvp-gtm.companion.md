---
title: "Singapore ADM0 Environment Companion PRD-TAD-ADR-MVP-GTM"
id: "md:adm0-singapore-environment-companion"
doc_type: "PRD-TAD-ADR-MVP-GTM"
version: "1.5.1"
date: "2026-09-12"
lang: "en-US"
owner: "geospatial-environment-data-steward"
local_rung: "spec-complete"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
guideline_version: "1.7.0"
frontmatter_contract: "required"
continuity_id: "PLAN-AGENTIC-GRAPH-ADM0-SINGAPORE-PRD-TAD-ADR-MVP-GTM-COMPANION"
worktree_id: "device-cba000d3779d--planning-v27"
agent_id: "codex-01a0940a"
guideline_revision: "2.7.0"
guideline_source: "https://github.com/huijoohwee/huijoohwee.github.io/blob/e8d2a10a8d3e5735c43edf350a22523df05fdf91/guidelines/prd-tad-adr-mvp-gtm-guidelines.md"
reviewed_source_revision: "7fb85741121d8c2886027e4a630d013ba91c1027"
previous_document_version: "1.5.0"
prd_revision: "1.5.1"
tad_revision: "1.5.1"
adr_revision: "1.5.1"
mvp_revision: "1.5.1"
gtm_revision: "1.5.1"
---

# Reference implementation: Singapore ADM0 Environment Companion PRD-TAD-ADR-MVP-GTM

This combined planning artifact joins `PLAN-AGENTIC-GRAPH-ADM0-SINGAPORE-PRD-TAD-ADR-MVP-GTM-COMPANION@1.5.1`. Sections are split solely to keep each authored file below 600 lines. Existing source observations retain their recorded scope and revision. The links below preserve the original section anchors and locate the unchanged requirement/design/decision text plus the current MVP/GTM assessment.

<a id="1-authority-and-boundary"></a>
- [1. Authority and boundary](agentic-graph-adm0-singapore-prd-tad-adr-mvp-gtm.companion.part-01.md#1-authority-and-boundary)
<a id="2-readiness-and-lane-statement"></a>
- [2. Readiness and lane statement](agentic-graph-adm0-singapore-prd-tad-adr-mvp-gtm.companion.part-01.md#2-readiness-and-lane-statement)
<a id="3-prd"></a>
- [3. PRD](agentic-graph-adm0-singapore-prd-tad-adr-mvp-gtm.companion.part-01.md#3-prd)
<a id="31-problem-and-outcome"></a>
- [3.1 Problem and outcome](agentic-graph-adm0-singapore-prd-tad-adr-mvp-gtm.companion.part-01.md#31-problem-and-outcome)
<a id="32-personas"></a>
- [3.2 Personas](agentic-graph-adm0-singapore-prd-tad-adr-mvp-gtm.companion.part-01.md#32-personas)
<a id="33-primary-journey"></a>
- [3.3 Primary journey](agentic-graph-adm0-singapore-prd-tad-adr-mvp-gtm.companion.part-01.md#33-primary-journey)
<a id="34-user-stories"></a>
- [3.4 User stories](agentic-graph-adm0-singapore-prd-tad-adr-mvp-gtm.companion.part-01.md#34-user-stories)
<a id="35-must-should-could-will-not"></a>
- [3.5 Must, should, could, will not](agentic-graph-adm0-singapore-prd-tad-adr-mvp-gtm.companion.part-01.md#35-must-should-could-will-not)
<a id="36-time-to-value-measures-and-economics"></a>
- [3.6 Time to value, measures, and economics](agentic-graph-adm0-singapore-prd-tad-adr-mvp-gtm.companion.part-01.md#36-time-to-value-measures-and-economics)
<a id="37-givenwhenthen-acceptance-criteria"></a>
- [3.7 Given/When/Then acceptance criteria](agentic-graph-adm0-singapore-prd-tad-adr-mvp-gtm.companion.part-01.md#37-givenwhenthen-acceptance-criteria)
<a id="4-locale-data-contract"></a>
- [4. Locale data contract](agentic-graph-adm0-singapore-prd-tad-adr-mvp-gtm.companion.part-01.md#4-locale-data-contract)
<a id="41-adm0-identity-and-presentation-reference"></a>
- [4.1 ADM0 identity and presentation reference](agentic-graph-adm0-singapore-prd-tad-adr-mvp-gtm.companion.part-01.md#41-adm0-identity-and-presentation-reference)
<a id="42-camera-policies"></a>
- [4.2 Camera policies](agentic-graph-adm0-singapore-prd-tad-adr-mvp-gtm.companion.part-01.md#42-camera-policies)
<a id="43-derived-local-xr-presentation"></a>
- [4.3 Derived local XR presentation](agentic-graph-adm0-singapore-prd-tad-adr-mvp-gtm.companion.part-01.md#43-derived-local-xr-presentation)
<a id="44-regional-geographic-maplibre-poi-profile"></a>
- [4.4 Regional geographic MapLibre POI profile](agentic-graph-adm0-singapore-prd-tad-adr-mvp-gtm.companion.part-01.md#44-regional-geographic-maplibre-poi-profile)
<a id="5-tad"></a>
- [5. TAD](agentic-graph-adm0-singapore-prd-tad-adr-mvp-gtm.companion.part-01.md#5-tad)
<a id="51-typed-boundaries"></a>
- [5.1 Typed boundaries](agentic-graph-adm0-singapore-prd-tad-adr-mvp-gtm.companion.part-01.md#51-typed-boundaries)
<a id="52-workflow-and-data-flow"></a>
- [5.2 Workflow and data flow](agentic-graph-adm0-singapore-prd-tad-adr-mvp-gtm.companion.part-01.md#52-workflow-and-data-flow)
<a id="53-deterministic-orchestrationharness-flow"></a>
- [5.3 Deterministic orchestration/harness flow](agentic-graph-adm0-singapore-prd-tad-adr-mvp-gtm.companion.part-01.md#53-deterministic-orchestrationharness-flow)
<a id="54-topology-and-lane-boundaries"></a>
- [5.4 Topology and lane boundaries](agentic-graph-adm0-singapore-prd-tad-adr-mvp-gtm.companion.part-01.md#54-topology-and-lane-boundaries)
<a id="55-component-inventory"></a>
- [5.5 Component inventory](agentic-graph-adm0-singapore-prd-tad-adr-mvp-gtm.companion.part-01.md#55-component-inventory)
<a id="56-quality-attributes"></a>
- [5.6 Quality attributes](agentic-graph-adm0-singapore-prd-tad-adr-mvp-gtm.companion.part-01.md#56-quality-attributes)
<a id="57-failure-and-recovery"></a>
- [5.7 Failure and recovery](agentic-graph-adm0-singapore-prd-tad-adr-mvp-gtm.companion.part-01.md#57-failure-and-recovery)
<a id="6-architecture-decisions"></a>
- [6. Architecture decisions](agentic-graph-adm0-singapore-prd-tad-adr-mvp-gtm.companion.part-01.md#6-architecture-decisions)
<a id="adr-sg-1-keep-one-locale-companion-as-the-singapore-document-authority"></a>
- [ADR-SG-1: Keep one locale companion as the Singapore document authority](agentic-graph-adm0-singapore-prd-tad-adr-mvp-gtm.companion.part-01.md#adr-sg-1-keep-one-locale-companion-as-the-singapore-document-authority)
<a id="adr-sg-2-separate-adm0-identity-presentation-framing-and-local-stage"></a>
- [ADR-SG-2: Separate ADM0 identity, presentation framing, and local stage](agentic-graph-adm0-singapore-prd-tad-adr-mvp-gtm.companion.part-01.md#adr-sg-2-separate-adm0-identity-presentation-framing-and-local-stage)
<a id="adr-sg-3-keep-one-geographic-poi-authority-with-separate-projection-ports"></a>
- [ADR-SG-3: Keep one geographic POI authority with separate projection ports](agentic-graph-adm0-singapore-prd-tad-adr-mvp-gtm.companion.part-01.md#adr-sg-3-keep-one-geographic-poi-authority-with-separate-projection-ports)
<a id="adr-sg-4-make-poi-accuracy-and-provenance-representation-specific"></a>
- [ADR-SG-4: Make POI accuracy and provenance representation-specific](agentic-graph-adm0-singapore-prd-tad-adr-mvp-gtm.companion.part-01.md#adr-sg-4-make-poi-accuracy-and-provenance-representation-specific)
<a id="adr-sg-5-prefer-the-zero-dependency-foss-compatible-data-path"></a>
- [ADR-SG-5: Prefer the zero-dependency FOSS-compatible data path](agentic-graph-adm0-singapore-prd-tad-adr-mvp-gtm.companion.part-02.md#adr-sg-5-prefer-the-zero-dependency-foss-compatible-data-path)
<a id="7-vcc-and-evidence-reference-register"></a>
- [7. VCC and Evidence Reference register](agentic-graph-adm0-singapore-prd-tad-adr-mvp-gtm.companion.part-02.md#7-vcc-and-evidence-reference-register)
<a id="8-readiness-gap-matrix"></a>
- [8. Readiness gap matrix](agentic-graph-adm0-singapore-prd-tad-adr-mvp-gtm.companion.part-02.md#8-readiness-gap-matrix)
<a id="9-prd-to-tad-to-adr-traceability"></a>
- [9. PRD to TAD to ADR traceability](agentic-graph-adm0-singapore-prd-tad-adr-mvp-gtm.companion.part-02.md#9-prd-to-tad-to-adr-traceability)
<a id="10-reference-implementation-current-source-projection"></a>
- [10. Reference implementation: current source projection](agentic-graph-adm0-singapore-prd-tad-adr-mvp-gtm.companion.part-02.md#10-reference-implementation-current-source-projection)
<a id="11-change-policy"></a>
- [11. Change policy](agentic-graph-adm0-singapore-prd-tad-adr-mvp-gtm.companion.part-02.md#11-change-policy)
<a id="planning-revision--reference-implementation"></a>
- [Planning revision — reference implementation](agentic-graph-adm0-singapore-prd-tad-adr-mvp-gtm.companion.part-02.md#planning-revision--reference-implementation)
<a id="mvp--reference-implementation"></a>
- [MVP — reference implementation](agentic-graph-adm0-singapore-prd-tad-adr-mvp-gtm.companion.part-02.md#mvp--reference-implementation)
<a id="gtm--reference-implementation"></a>
- [GTM — reference implementation](agentic-graph-adm0-singapore-prd-tad-adr-mvp-gtm.companion.part-02.md#gtm--reference-implementation)
<a id="planning-gaps--reference-implementation"></a>
- [Planning gaps — reference implementation](agentic-graph-adm0-singapore-prd-tad-adr-mvp-gtm.companion.part-02.md#planning-gaps--reference-implementation)

<a id="singapore-adm0-environment-companion-prd-tad-adr-mvp-gtm"></a> [Singapore ADM0 Environment Companion PRD-TAD-ADR-MVP-GTM](agentic-graph-adm0-singapore-prd-tad-adr-mvp-gtm.companion.part-01.md#singapore-adm0-environment-companion-prd-tad-adr-mvp-gtm)
