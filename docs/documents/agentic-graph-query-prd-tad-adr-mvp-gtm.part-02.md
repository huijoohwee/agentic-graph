---
title: "Reference implementation: agentic-graph-query-prd-tad-adr-mvp-gtm section 2"
doc_type: "PRD-TAD-ADR-MVP-GTM"
version: "0.3.2"
date: "2026-09-17"
lang: "en-US"
owner: "Product maintainers"
continuity_id: "PLAN-AGENTIC-GRAPH-QUERY-PRD-TAD-ADR-MVP-GTM"
prd_revision: "0.3.2"
tad_revision: "0.3.2"
adr_revision: "0.3.2"
mvp_revision: "0.3.2"
gtm_revision: "0.3.2"
local_rung: "undocumented"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
worktree_id: "device-0232231d4a19--node-impact-inspector"
agent_id: "codex-01a0af1e"
parent: "agentic-graph-query-prd-tad-adr-mvp-gtm.md"
guideline_revision: "2.7.0"
source_section_lines: "479-569"
---

[Combined planning owner](agentic-graph-query-prd-tad-adr-mvp-gtm.md) · `PLAN-AGENTIC-GRAPH-QUERY-PRD-TAD-ADR-MVP-GTM@0.3.2`. This companion preserves the source section; diagrams and frontmatter projections remain owned by the combined artifact.

### Context

Queryable graphs are only useful when users can distinguish direct source facts from inferred relationships.

### Decision

Every composed edge emitted by corpus adapters carries evidence kind: `extracted`, `inferred`, or `ambiguous`, plus source references when available. The composer rejects silent inference.

### Alternatives Considered

1. Confidence-free graph edges: rejected because users cannot audit answers.
2. Single numeric confidence only: rejected because it hides source versus inference semantics.
3. Evidence kind plus confidence: accepted for clarity and neutral graph behavior.

### Deployment Strategy

The implementation must preserve the existing topology:

Dev `$GITHUB_ROOT/agentic-graph` owns source edits, tests, docs, and Pages build; prod mirror `$GITHUB_ROOT/huijoohwee/content/agentic-graph` receives generated app payload only; Cloudflare `https://airvio.co/agentic-graph` requires live smoke after sync/deploy when claiming production completion.

### Validation Plan

| Validation | Command or check | Scope |
|---|---|---|
| Frontmatter validity | Markdown begins with YAML frontmatter and quoted scalars where needed | This document and future generated docs |
| Import bridge regression | Focused tests for Launch file/folder shared bridge | Toolbar and workspace bridge |
| Source-unit manifest | `npm --prefix canvas run test:ci:unit -- "queryableCorpus.importManifest"` | Workspace import |
| Parser neutrality | `npm --prefix canvas run test:ci:unit -- "queryableCorpus.parsers"` | Parser adapters |
| Provenance completeness | `npm --prefix canvas run test:ci:unit -- "queryableCorpus.compose"` | Graph fragment composer |
| Chat evidence bounds | `npm --prefix canvas run test:ci:unit -- "queryableCorpus.chat"` | Query evidence pack/chat context |
| E2E render readiness | `npm --prefix canvas run test:ci:unit -- "queryableCorpus.e2e"` | Editor Workspace, Canvas, Chat |
| Hygiene gate | `npm run hygiene:check` | Repo regression bar |
| Typecheck | `npm --prefix canvas exec tsc -- -p canvas/tsconfig.json --noEmit --pretty false` | Canvas type safety |
| Build sync | `npm run pages:build-sync` | Dev -> prod mirror |
| Live smoke | `curl -I https://airvio.co/agentic-graph/` plus browser check | Cloudflare route |

### Traceability Matrix

| PRD requirement | TAD component | `/goal` condition |
|---|---|---|
| PRD-E01-S01 Import folder | Launch import, Workspace import, Source manifest | Import folder creates source units and evidence records without a new Launch path. |
| PRD-E01-S02 Import file | Launch import, Workspace action bridge | Import file and folder share bridge/runtime owners. |
| PRD-E02-S01 Code/script extraction | Parser adapters, Graph fragments | Code/script fixtures emit typed graph nodes and provenance. |
| PRD-E02-S02 SQL/config extraction | Parser adapters, Graph fragments | Schema/config fixtures emit neutral nodes and cross-source refs. |
| PRD-E02-S03 Docs/media extraction | Existing doc/PDF/data import plus media adapters | Docs/media fixtures produce artifacts or structured unsupported states. |
| PRD-E03-S01 Ask questions | Query evidence pack, Chat harness | Chat answers cite graph/source refs and log cost. |
| PRD-E03-S02 Path/explain | Query evidence pack, Graph traversal | Path/explain queries use traversal before LLM summarization. |
| PRD-E04-S01 Cache updates | Parse cache, source hashes | Re-import reuses unchanged cache entries. |
| PRD-E04-S02 Evidence kind | Graph fragment composer | Every composed edge has evidence kind and confidence. |
| PRD-E05-S01 E2E readiness | Editor Workspace, Source Files, Canvas, Chat | Imported corpus is listed, parsed, rendered, and query-ready through existing owners. |

### Implementation Phases

| Phase | Deliverable | Exit check | Status |
|---|---|---|---|
| 0 | Source audit and final implementation PRD review | Owners confirmed; no duplicate architecture. | Complete |
| 1 | Source unit manifest, cache, import file/folder shared pipeline | Focused import/cache tests pass. | Implemented |
| 2 | Parser adapter extensions and evidence-kind graph fragments | Parser/provenance tests pass. | Implemented for code, SQL, scripts, config, media metadata, and cross-source refs |
| 3 | Query evidence pack and FloatingPanel Chat context injection | Chat query tests pass with token bounds. | Implemented |
| 4 | Dev -> Prod -> Cloudflare build/smoke | Build sync and live smoke pass when publishing source changes. | Deployment gate; rerun for production claim |

## Acceptance Gate

This implemented PRD/TAD remains accepted when it keeps valid YAML frontmatter, measurable Must criteria, AI harness/fallback/token budgets, FOSS/TCO reasoning, native owner reuse, and explicit Dev -> Prod -> Cloudflare validation for production claims.

## Planning revision — reference implementation

All five roles below consume `PLAN-AGENTIC-GRAPH-QUERY-PRD-TAD-ADR-MVP-GTM@0.3.2`. Existing source and runtime observations retain their original revisions and scope; this documentation update renews no deployment or demand evidence. The guideline is [v2.7.0](https://github.com/huijoohwee/huijoohwee.github.io/blob/e8d2a10a8d3e5735c43edf350a22523df05fdf91/guidelines/prd-tad-adr-mvp-gtm-guidelines.md); the shared maturity rubric loads on demand.

| Role | Owning content at this revision |
|---|---|
| PRD | [Product Requirements](agentic-graph-query-prd-tad-adr-mvp-gtm.part-01.md#product-requirements) |
| TAD | [Technical Architecture](agentic-graph-query-prd-tad-adr-mvp-gtm.part-01.md#technical-architecture) |
| ADR | [Architectural Decisions](agentic-graph-query-prd-tad-adr-mvp-gtm.part-01.md#architectural-decisions) |
| MVP | [MVP — reference implementation](agentic-graph-query-prd-tad-adr-mvp-gtm.part-02.md#mvp--reference-implementation) |
| GTM | [GTM — reference implementation](agentic-graph-query-prd-tad-adr-mvp-gtm.part-02.md#gtm--reference-implementation) |

## MVP — reference implementation

Reuse the minimum scope, acceptance conditions and component owners identified above. The demonstration must follow the documented entry, permitted action, durable outcome and readback, including its stated failure/recovery path. Use `npm run hygiene:check` for its actual coverage and the named feature checks in the specification; attach exact source, command, result and authoring/mirror/delivery surface to each VCC before advancing readiness. A source locator or structural check alone proves no user outcome.

Record the observed steps and elapsed time against the existing TTV target. If no target or invocation is stated, the demonstration remains unverified until the document owner supplies it. All four experience criteria are **unassessed** in this authoring review: Core Requirements & Functionality, Innovation & Theme Alignment, Technical Execution & Integration, and Usefulness & Agentic Experience. No scored user observation is attached to this revision; the document owner must capture a timed pilot and criterion-specific evidence.

## GTM — reference implementation

Use the stated persona and pain hypothesis to test one priced pilot in the existing user environment. Keep the documented free/self-serve workflow as the comparison; additional hosting, channels or agent roles require an evidenced constraint or buyer need. Record the buyer’s workaround, frequency, accepted outcome, offered price, observed response and support minutes before ranking a commercial winner. Demand, collected payment and repeat use remain unvalidated by this documentation review; mechanism evidence keeps its narrower original scope. Measure tokens, cash expense and maintenance separately for each proposed deployment model. Feed actual pilot outcomes into a successor Context using the shared four-column planning record.

## Planning gaps — reference implementation

Source review is bounded to repository `9cb689e67578d2e326470fe21a59e918a2160151`. Confirmed: these referenced artifacts exist at that revision: [`canvas/src/lib/toolbar/LaunchDropdown.impl.tsx`](https://github.com/huijoohwee/agentic-graph/blob/9cb689e67578d2e326470fe21a59e918a2160151/canvas/src/lib/toolbar/LaunchDropdown.impl.tsx), [`canvas/src/features/markdown-explorer/workspaceActionBridge.ts`](https://github.com/huijoohwee/agentic-graph/blob/9cb689e67578d2e326470fe21a59e918a2160151/canvas/src/features/markdown-explorer/workspaceActionBridge.ts), [`canvas/src/features/markdown-workspace/workspaceImport/localImport.ts`](https://github.com/huijoohwee/agentic-graph/blob/9cb689e67578d2e326470fe21a59e918a2160151/canvas/src/features/markdown-workspace/workspaceImport/localImport.ts). Their existence does not confirm every behavior asserted by the specification.
Experience observations, current VCC execution and buyer/payment evidence are unverified here. This is a bounded planning update, not a full-guideline conformance verdict; historical conformance percentages above apply only to their recorded profile and revision.


## Node impact inspection — reference implementation

**CID QUERY-IMPACT-01**, joined to this family's `0.3.2` revision. Authorization: the
2026-09-17 operator instruction explicitly requests native enhancements and protected integration.
Role/Subject: solo developer; Action/Verb: inspect; Outcome/Object: bounded source-explained change reach.

**PRD.** Pain: an operator can import a codebase but must manually trace which nodes and files a
change may affect. The requested node inspector supplies Blast radius, Depth (1–3), Nodes affected,
Incoming and Outgoing. Count distinct reachable nodes excluding the selected root, retain shortest
hop distances, deduplicate known source files, and disclose missing paths and partial projections.
Incoming is the default dependency-impact direction; outgoing explores references. Reachability is
potential impact, never proof that a test or runtime will fail. Demand/WTP remains unvalidated.

**TAD / ADR.** Reuse the existing deterministic parser, source evidence, GraphData selection,
D3 canvas, graph lookup cache and native query traversal. Extract the materialized traversal into
one browser-safe owner consumed by MCP and the lazy inspector. No parser, model call, network,
vector store, service, dependency or competing graph store is added. The inspector reads the full
loaded graph before group collapse; it cannot infer absent source records. Each edge retains its
native explanation. Show on canvas uses existing multi-selection and preserves source graph bytes.
OS retains lifecycle collection/economics; Canvas retains runtime coordination; generated mirrors
receive source only through the protected release owner. Other fleet owners need no implementation delta.

**VCC.** Cyclic, diamond, parallel-edge and isolated fixtures prove unique counts, shortest hops,
direction, source-path deduplication and partial-state disclosure. Interaction checks exercise depth,
direction, selection and Show on canvas without graph mutation; existing MCP tests cover extracted
traversal compatibility. Run affected integration checks and production/browser checks separately.
At most 2,000 nodes/5,000 edges per imported projection, depth ≤3, and 32 visible rows per list;
counts cover the bounded traversal and label graph truncation separately from list truncation.

**MVP / GTM.** Demo (60 seconds): import existing local evidence (15s), select a node (10s),
change depth/direction and read the count/explanation (20s), select the affected nodes (10s),
record outcome (5s). The reveal is the VCC-backed changed count, not a narrated risk claim.
Nearest first-dollar hypothesis: a priced code-change review for an existing solo builder before
hosted monitoring or agent payments. No payer, revenue or savings is claimed; measure review time,
CPU/memory and known token/cost provenance with the existing OS workflow collector, then remeasure
one successor on the same graph/quality cohort. Rollback reverts the inspector and shared extraction;
retained imports, source documents, lifecycle manifests and runtime receipts remain independent.


The same `QUERY-IMPACT-01` scope includes the operator's follow-up: Find a node accepts bounded
`kind:`, `path:` and `prov:` filters plus text; Most connected ranks distinct incident edges with
stable node-ID ties. The legend explains captured evidence and direction without claiming renderer
colors encode confidence. Missing provenance is unreported; edge-derived provenance is labelled as
such, never silently assigned to a node. Lists show eight ranked matches and retain total match count.


Authoring evidence (2026-09-17): all 110 native MCP tests and three inspector behavior/interaction
tests passed locally; the eight-repository fleet scan reports zero ownership findings. Required
integration/CI and deployed browser evidence remain separate and are bound to the eventual exact
candidate in its PR and release receipts; this record claims neither production readiness nor savings.
