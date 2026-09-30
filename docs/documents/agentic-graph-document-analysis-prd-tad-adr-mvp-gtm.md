---
title: "Native document analysis"
doc_type: "PRD-TAD-ADR-MVP-GTM"
continuity_id: "GRAPH-NATIVE-TEXT-001"
version: "1.0.0"
date: "2026-09-30"
lang: "en-US"
prd_revision: "1.0.0"
tad_revision: "1.0.0"
adr_revision: "1.0.0"
mvp_revision: "1.0.0"
gtm_revision: "1.0.0"
owner: "agentic-graph"
frontmatter_contract: "required"
local_rung: "dev-proven"
delivered_rung: "undocumented"
lane: "authoring"
load_policy: "on-demand"
---

# Native document analysis

All five roles consume GRAPH-NATIVE-TEXT-001@1.0.0. The user authorizes native enhancements,
local validation and review delivery. Merge and production effects require their own authority.

## PRD

A reader needs to check why a term or relationship appears without sending a document to a service.
Document insights exposes observed source matches, contexts and navigation. Keyword Mode preserves
ranking while reporting actual occurrences separately. Dashboard retains general node, edge and
cluster metrics and adds text evidence only when the current graph carries it.

The analysis accepts plain text and an opaque source identity: no domain, filename, document type,
agent manifest or provider selects behavior. Existing workspace adapters own source resolution and
navigation. An ordinary document toolbar can open insights without website metadata.

Acceptance: Unicode normalization preserves original offsets; repeated phrase counts are exact within
declared bounds; phrases do not cross sentence/newline boundaries; user phrases and language tags
work locally; selected keyword candidates select their contexts; stale source navigation is rejected;
ordinary graphs retain a useful Dashboard without text metadata.

## TAD

Shared text utilities own normalization and segmentation. Use native `Intl.Segmenter` where available,
with an original Unicode fallback that reports its policy. Browser/runtime language data may differ;
explicit language tags affect inspection segmentation. The keyword graph uses the runtime default.
GraphRAG and Keyword Mode share one mention extractor and one small original English grammar filter.
The filter is a heuristic, not a multilingual stopword corpus; negation and modal words are retained.

One evidence collector counts complete-token occurrences, sentence spread, six-span distribution and
up to three original-offset contexts. Ranking and weighted relationship strength remain distinct from
counts. Graph metadata records the analysis policy, bounds and source. Cache version 8 invalidates
older weighted-count results. Document insights scans raw source, including markup; graph evidence
describes the existing graph-analysis text. These scopes are stated in the UI.

Keyword inspection loads lazily when Document insights opens. User phrases and locale are transient
inspection controls, not document edits or a second settings store. Graph selection uses existing IDs;
navigation uses the existing source-revision guard. Optional Dashboard cards consume evidence only.

## ADR

- Native, original implementation: no Stanza, spaCy, NLTK, model, corpus, copied rules or new dependency.
  General concepts of segmentation, phrase ranking and concordance inspire behavior only.
- Remove the embedded NLTK stopword list and duplicate mention/sentence extraction implementations.
  Existing exported names remain aliases only where existing consumers require the contract.
- Preserve literal counts independently of ranking. Heuristic relationships and co-occurrence are
  labeled as such; neither is named-entity recognition, dependency parsing or causal evidence.
- Retain graph-wide Dashboard scope; Mission evidence is optional and never the required source.
- Runtime validation inputs stay outside the repository; regression fixtures are independent examples.

## MVP

Bounds: 60,000 characters, 12,000 tokens, 800 evidence labels, 12 tokens per phrase, three contexts
per phrase; inspection shows up to 24 phrases. Partial final words are discarded, and truncation is
visible. Context display uses bounded source lines. Existing graph node/edge budgets remain in force.
Implementation budget: 16 production modules, less than 30 KB added source, no packages or assets.
No service is contacted during analysis; loading the application and optional source import are
separate operations. Cold offline application installation and full linguistic-model parity are out of scope.

Validation owners: `nativeDocumentAnalysis.test.ts` checks Unicode offsets, fallback behavior, bounds,
literal counts, explicit network rejection and optional Dashboard evidence; the panel test checks phrase
controls, graph selection, source navigation and stale rejection. The collaboration contract selects
these tests with existing keyword, signal, Dashboard and runtime-input guards. Type checking and
affected checks gate delivery. An externally supplied rendered page is used only as a temporary local
input; an independent occurrence counter and blocked fetch verify the analysis without a golden corpus.

Rollback: revert this source change, retaining user documents and existing generic Dashboard behavior.
Invalidate keyword caches again if their semantics change; never reinterpret old cached frequencies.
Keep the task lane while its local preview or review delivery needs it.

## GTM

Initial user: a reader checking repeated themes and evidence in a local document. The near-built path
reuses existing preview, graph and Dashboard controls. First value is a counted phrase with a source
jump, requiring no account, paid plan or model download. Measure successful source jumps and time
to verify a term before expanding linguistic features. Willingness to pay and revenue are unvalidated.
