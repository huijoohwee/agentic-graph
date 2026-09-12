---
title: "agentic-graph CSV JSON Import Conversion - PRD and TAD"
doc_type: "PRD-TAD-ADR-MVP-GTM"
feature_id: "agentic-graph-csv-json-import-conversion"
project: "agentic-graph"
version: "0.2.1"
status: "draft-ready-for-execution"
date_created: "2026-06-03"
date_updated: "2026-06-03"
owner: "agentic-graph-dev"
scope: "Import URL and Import local files bidirectional CSV or delimited text to JSON and JSON to CSV or delimited text conversion"
source_surfaces:
  - "Toolbar -> Workspace View -> Import URL"
  - "Toolbar -> Workspace View -> Import local files"
reference_sources:
  - "https://github.com/mholt/PapaParse"
  - "/mholt/papaparse"
reference_policy: "Reference public capability categories only; FORBID copying PapaParse code, docs wording, public API surface, tests, fixtures, examples, parser structure, comments, issue text, or bundled assets."
implementation_policy: "Develop a native in-repo bidirectional delimited-text and JSON conversion owner; do not install, vendor, wrap, alias, or depend on PapaParse."
runtime_cost: "$0 recurring TCO; no AI token spend in Must scope"
deployment_scope: "Dev only; no Prod mirror or Cloudflare deployment until explicitly instructed"
tags:
  - "agentic-graph"
  - "prd"
  - "tad"
  - "import-url"
  - "import-local-files"
  - "csv"
  - "delimited-text"
  - "json"
  - "native-parser"
  - "no-copy"
  - "large-files"
  - "malformed-input"
date: "2026-09-12"
lang: "en-US"
frontmatter_contract: "required"
continuity_id: "PLAN-AGENTIC-GRAPH-CSV-JSON-PRD-TAD-ADR-MVP-GTM"
local_rung: "undocumented"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
worktree_id: "device-cba000d3779d--planning-v27"
agent_id: "codex-01a0940a"
guideline_revision: "2.7.0"
guideline_source: "https://github.com/huijoohwee/huijoohwee.github.io/blob/e8d2a10a8d3e5735c43edf350a22523df05fdf91/guidelines/prd-tad-adr-mvp-gtm-guidelines.md"
reviewed_source_revision: "7fb85741121d8c2886027e4a630d013ba91c1027"
previous_document_version: "0.2.0"
prd_revision: "0.2.1"
tad_revision: "0.2.1"
adr_revision: "0.2.1"
mvp_revision: "0.2.1"
gtm_revision: "0.2.1"
---

# Reference implementation: agentic-graph CSV JSON Import Conversion - PRD and TAD

This combined planning artifact joins `PLAN-AGENTIC-GRAPH-CSV-JSON-PRD-TAD-ADR-MVP-GTM@0.2.1`. Sections are split solely to keep each authored file below 600 lines. Existing source observations retain their recorded scope and revision. The links below preserve the original section anchors and locate the unchanged requirement/design/decision text plus the current MVP/GTM assessment.

<a id="executive-summary"></a>
- [Executive Summary](agentic-graph-csv-json-prd-tad-adr-mvp-gtm.part-01.md#executive-summary)
<a id="governing-directives"></a>
- [Governing Directives](agentic-graph-csv-json-prd-tad-adr-mvp-gtm.part-01.md#governing-directives)
<a id="reference-evidence-and-no-copy-boundary"></a>
- [Reference Evidence and No-Copy Boundary](agentic-graph-csv-json-prd-tad-adr-mvp-gtm.part-01.md#reference-evidence-and-no-copy-boundary)
<a id="public-capability-reference"></a>
- [Public Capability Reference](agentic-graph-csv-json-prd-tad-adr-mvp-gtm.part-01.md#public-capability-reference)
<a id="allowed-inspiration"></a>
- [Allowed Inspiration](agentic-graph-csv-json-prd-tad-adr-mvp-gtm.part-01.md#allowed-inspiration)
<a id="forbidden-copying"></a>
- [Forbidden Copying](agentic-graph-csv-json-prd-tad-adr-mvp-gtm.part-01.md#forbidden-copying)
<a id="native-json-evidence"></a>
- [Native JSON Evidence](agentic-graph-csv-json-prd-tad-adr-mvp-gtm.part-01.md#native-json-evidence)
<a id="current-implementation-baseline"></a>
- [Current Implementation Baseline](agentic-graph-csv-json-prd-tad-adr-mvp-gtm.part-01.md#current-implementation-baseline)
<a id="prd"></a>
- [PRD](agentic-graph-csv-json-prd-tad-adr-mvp-gtm.part-01.md#prd)
<a id="problem-statement"></a>
- [Problem Statement](agentic-graph-csv-json-prd-tad-adr-mvp-gtm.part-01.md#problem-statement)
<a id="personas-and-jobs-to-be-done"></a>
- [Personas and Jobs To Be Done](agentic-graph-csv-json-prd-tad-adr-mvp-gtm.part-01.md#personas-and-jobs-to-be-done)
<a id="user-journey"></a>
- [User Journey](agentic-graph-csv-json-prd-tad-adr-mvp-gtm.part-01.md#user-journey)
<a id="epics-stories-and-acceptance-criteria"></a>
- [Epics, Stories, and Acceptance Criteria](agentic-graph-csv-json-prd-tad-adr-mvp-gtm.part-01.md#epics-stories-and-acceptance-criteria)
<a id="prd-cj-01-import-csv-or-delimited-text-and-generate-json"></a>
- [PRD-CJ-01: Import CSV or Delimited Text and Generate JSON](agentic-graph-csv-json-prd-tad-adr-mvp-gtm.part-01.md#prd-cj-01-import-csv-or-delimited-text-and-generate-json)
<a id="prd-cj-02-import-json-and-generate-csv-or-delimited-text"></a>
- [PRD-CJ-02: Import JSON and Generate CSV or Delimited Text](agentic-graph-csv-json-prd-tad-adr-mvp-gtm.part-01.md#prd-cj-02-import-json-and-generate-csv-or-delimited-text)
<a id="prd-cj-03-provenance-safety-large-files-and-malformed-input"></a>
- [PRD-CJ-03: Provenance, Safety, Large Files, and Malformed Input](agentic-graph-csv-json-prd-tad-adr-mvp-gtm.part-01.md#prd-cj-03-provenance-safety-large-files-and-malformed-input)
<a id="prd-cj-04-import-surface-reuse-and-cleanup"></a>
- [PRD-CJ-04: Import Surface Reuse and Cleanup](agentic-graph-csv-json-prd-tad-adr-mvp-gtm.part-01.md#prd-cj-04-import-surface-reuse-and-cleanup)
<a id="success-metrics"></a>
- [Success Metrics](agentic-graph-csv-json-prd-tad-adr-mvp-gtm.part-01.md#success-metrics)
<a id="roi-and-tco-estimate"></a>
- [ROI and TCO Estimate](agentic-graph-csv-json-prd-tad-adr-mvp-gtm.part-01.md#roi-and-tco-estimate)
<a id="moscow"></a>
- [MoSCoW](agentic-graph-csv-json-prd-tad-adr-mvp-gtm.part-01.md#moscow)
<a id="minimum-viable-scope"></a>
- [Minimum Viable Scope](agentic-graph-csv-json-prd-tad-adr-mvp-gtm.part-01.md#minimum-viable-scope)
<a id="dependencies"></a>
- [Dependencies](agentic-graph-csv-json-prd-tad-adr-mvp-gtm.part-01.md#dependencies)
<a id="scope-boundaries"></a>
- [Scope Boundaries](agentic-graph-csv-json-prd-tad-adr-mvp-gtm.part-01.md#scope-boundaries)
<a id="open-questions"></a>
- [Open Questions](agentic-graph-csv-json-prd-tad-adr-mvp-gtm.part-01.md#open-questions)
<a id="tad"></a>
- [TAD](agentic-graph-csv-json-prd-tad-adr-mvp-gtm.part-01.md#tad)
<a id="system-context"></a>
- [System Context](agentic-graph-csv-json-prd-tad-adr-mvp-gtm.part-01.md#system-context)
<a id="data-flow-csv-or-delimited-text-to-json"></a>
- [Data Flow: CSV or Delimited Text to JSON](agentic-graph-csv-json-prd-tad-adr-mvp-gtm.part-01.md#data-flow-csv-or-delimited-text-to-json)
<a id="data-flow-json-to-csv-or-delimited-text"></a>
- [Data Flow: JSON to CSV or Delimited Text](agentic-graph-csv-json-prd-tad-adr-mvp-gtm.part-01.md#data-flow-json-to-csv-or-delimited-text)
<a id="component-specifications"></a>
- [Component Specifications](agentic-graph-csv-json-prd-tad-adr-mvp-gtm.part-02.md#component-specifications)
<a id="tad-cj-c01-conversion-intent-resolver"></a>
- [TAD-CJ-C01: Conversion Intent Resolver](agentic-graph-csv-json-prd-tad-adr-mvp-gtm.part-02.md#tad-cj-c01-conversion-intent-resolver)
<a id="tad-cj-c02-native-delimited-text-parser-and-generator"></a>
- [TAD-CJ-C02: Native Delimited Text Parser and Generator](agentic-graph-csv-json-prd-tad-adr-mvp-gtm.part-02.md#tad-cj-c02-native-delimited-text-parser-and-generator)
<a id="tad-cj-c03-native-json-adapter-and-tabular-shape-resolver"></a>
- [TAD-CJ-C03: Native JSON Adapter and Tabular Shape Resolver](agentic-graph-csv-json-prd-tad-adr-mvp-gtm.part-02.md#tad-cj-c03-native-json-adapter-and-tabular-shape-resolver)
<a id="tad-cj-c04-derived-artifact-writer"></a>
- [TAD-CJ-C04: Derived Artifact Writer](agentic-graph-csv-json-prd-tad-adr-mvp-gtm.part-02.md#tad-cj-c04-derived-artifact-writer)
<a id="tad-cj-c05-import-error-and-diagnostics-presenter"></a>
- [TAD-CJ-C05: Import Error and Diagnostics Presenter](agentic-graph-csv-json-prd-tad-adr-mvp-gtm.part-02.md#tad-cj-c05-import-error-and-diagnostics-presenter)
<a id="integration-contracts"></a>
- [Integration Contracts](agentic-graph-csv-json-prd-tad-adr-mvp-gtm.part-02.md#integration-contracts)
<a id="workflow"></a>
- [Workflow](agentic-graph-csv-json-prd-tad-adr-mvp-gtm.part-02.md#workflow)
<a id="sequence-diagram"></a>
- [Sequence Diagram](agentic-graph-csv-json-prd-tad-adr-mvp-gtm.part-02.md#sequence-diagram)
<a id="architectural-decisions"></a>
- [Architectural Decisions](agentic-graph-csv-json-prd-tad-adr-mvp-gtm.part-02.md#architectural-decisions)
<a id="adr-cj-01-develop-a-native-in-repo-delimited-text-owner"></a>
- [ADR-CJ-01: Develop a Native In-Repo Delimited-Text Owner](agentic-graph-csv-json-prd-tad-adr-mvp-gtm.part-02.md#adr-cj-01-develop-a-native-in-repo-delimited-text-owner)
<a id="adr-cj-02-use-native-json-apis-as-the-json-owner"></a>
- [ADR-CJ-02: Use Native JSON APIs as the JSON Owner](agentic-graph-csv-json-prd-tad-adr-mvp-gtm.part-02.md#adr-cj-02-use-native-json-apis-as-the-json-owner)
<a id="adr-cj-03-preserve-source-and-write-derived-sibling-artifacts"></a>
- [ADR-CJ-03: Preserve Source and Write Derived Sibling Artifacts](agentic-graph-csv-json-prd-tad-adr-mvp-gtm.part-02.md#adr-cj-03-preserve-source-and-write-derived-sibling-artifacts)
<a id="quality-attributes"></a>
- [Quality Attributes](agentic-graph-csv-json-prd-tad-adr-mvp-gtm.part-02.md#quality-attributes)
<a id="security-and-privacy"></a>
- [Security and Privacy](agentic-graph-csv-json-prd-tad-adr-mvp-gtm.part-02.md#security-and-privacy)
<a id="deployment-strategy"></a>
- [Deployment Strategy](agentic-graph-csv-json-prd-tad-adr-mvp-gtm.part-02.md#deployment-strategy)
<a id="component-inventory"></a>
- [Component Inventory](agentic-graph-csv-json-prd-tad-adr-mvp-gtm.part-02.md#component-inventory)
<a id="traceability-matrix"></a>
- [Traceability Matrix](agentic-graph-csv-json-prd-tad-adr-mvp-gtm.part-02.md#traceability-matrix)
<a id="validation-plan"></a>
- [Validation Plan](agentic-graph-csv-json-prd-tad-adr-mvp-gtm.part-02.md#validation-plan)
<a id="risks-and-mitigations"></a>
- [Risks and Mitigations](agentic-graph-csv-json-prd-tad-adr-mvp-gtm.part-02.md#risks-and-mitigations)
<a id="implementation-notes-for-future-work"></a>
- [Implementation Notes for Future Work](agentic-graph-csv-json-prd-tad-adr-mvp-gtm.part-02.md#implementation-notes-for-future-work)
<a id="planning-revision--reference-implementation"></a>
- [Planning revision — reference implementation](agentic-graph-csv-json-prd-tad-adr-mvp-gtm.part-03.md#planning-revision--reference-implementation)
<a id="mvp--reference-implementation"></a>
- [MVP — reference implementation](agentic-graph-csv-json-prd-tad-adr-mvp-gtm.part-03.md#mvp--reference-implementation)
<a id="gtm--reference-implementation"></a>
- [GTM — reference implementation](agentic-graph-csv-json-prd-tad-adr-mvp-gtm.part-03.md#gtm--reference-implementation)
<a id="planning-gaps--reference-implementation"></a>
- [Planning gaps — reference implementation](agentic-graph-csv-json-prd-tad-adr-mvp-gtm.part-03.md#planning-gaps--reference-implementation)

<a id="agentic-graph-csv-json-import-conversion---prd-and-tad"></a> [agentic-graph CSV JSON Import Conversion - PRD and TAD](agentic-graph-csv-json-prd-tad-adr-mvp-gtm.part-01.md#agentic-graph-csv-json-import-conversion---prd-and-tad)
