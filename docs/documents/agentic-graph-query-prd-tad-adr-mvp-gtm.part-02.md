---
title: "Reference implementation: agentic-graph-query-prd-tad-adr-mvp-gtm section 2"
doc_type: "PRD-TAD-ADR-MVP-GTM"
version: "0.3.6"
date: "2026-09-18"
lang: "en-US"
owner: "Product maintainers"
continuity_id: "PLAN-AGENTIC-GRAPH-QUERY-PRD-TAD-ADR-MVP-GTM"
prd_revision: "0.3.6"
tad_revision: "0.3.6"
adr_revision: "0.3.6"
mvp_revision: "0.3.6"
gtm_revision: "0.3.6"
local_rung: "undocumented"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
worktree_id: "device-0232231d4a19--graph-selection-geometry"
agent_id: "codex-01a0af1e"
parent: "agentic-graph-query-prd-tad-adr-mvp-gtm.md"
guideline_revision: "2.7.0"
source_section_lines: "479-569"
---

[Combined planning owner](agentic-graph-query-prd-tad-adr-mvp-gtm.md) · `PLAN-AGENTIC-GRAPH-QUERY-PRD-TAD-ADR-MVP-GTM@0.3.5`. This companion preserves the source section; diagrams and frontmatter projections remain owned by the combined artifact.

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

All five roles below consume `PLAN-AGENTIC-GRAPH-QUERY-PRD-TAD-ADR-MVP-GTM@0.3.5`. Existing source and runtime observations retain their original revisions and scope; this documentation update renews no deployment or demand evidence. The guideline is [v2.7.0](https://github.com/huijoohwee/huijoohwee.github.io/blob/e8d2a10a8d3e5735c43edf350a22523df05fdf91/guidelines/prd-tad-adr-mvp-gtm-guidelines.md); the shared maturity rubric loads on demand.

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

Source review is bounded to repository `ef2dad01d75fde7722ef9286f668a1de67bd4aed`. Confirmed: these referenced artifacts exist at that revision: [`canvas/src/lib/toolbar/LaunchDropdown.impl.tsx`](https://github.com/huijoohwee/agentic-graph/blob/ef2dad01d75fde7722ef9286f668a1de67bd4aed/canvas/src/lib/toolbar/LaunchDropdown.impl.tsx), [`canvas/src/features/markdown-explorer/workspaceActionBridge.ts`](https://github.com/huijoohwee/agentic-graph/blob/ef2dad01d75fde7722ef9286f668a1de67bd4aed/canvas/src/features/markdown-explorer/workspaceActionBridge.ts), [`canvas/src/features/markdown-workspace/workspaceImport/localImport.ts`](https://github.com/huijoohwee/agentic-graph/blob/ef2dad01d75fde7722ef9286f668a1de67bd4aed/canvas/src/features/markdown-workspace/workspaceImport/localImport.ts). Their existence does not confirm every behavior asserted by the specification.
Experience observations, current VCC execution and buyer/payment evidence are unverified here. This is a bounded planning update, not a full-guideline conformance verdict; historical conformance percentages above apply only to their recorded profile and revision.


## Node impact inspection — reference implementation

**CID QUERY-IMPACT-01**, joined to this family's `0.3.5` revision. Authorization: the
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


## Bounded import and source evidence presentation

**QUERY-IMPACT-02 / PRD.** Solo developer / import and inspect / reach a responsive source graph.
The observed sequence was repository URL import → parsing → Graph Traversal → renderer crash.
A fresh baseline run completed; the original crash cause is not proven. Source review found one
whole-graph publication per parsed file and a renderer transition before the prior XR document
owner was released. Acceptance: a 1,000-file burst publishes at most 32 previews; an active 3D
surface remains intact until final verification; final graph and failure rollback remain bounded.

**TAD / ADR.** Reuse the current preview session and final immutable projection. Cap publications
by source progress, with no timer or background queue. Clear the old document owner before D3
activation. Reuse the source inspector in Graph Traversal for read-only codebase graphs; ordinary
GraphRAG workflows retain their existing controls. Derive node color from captured top-level source
directory, not an invented community or score. Reuse D3 visual properties for exact/inferred/ambiguous
edge certainty; keep absent certainty explicit. Fit decorated projections inside the existing byte
budget and disclose truncation. Preserve source IDs, provenance and explanations; do not manufacture
runtime observations or synthesized evidence. Colors can repeat and group labels disambiguate them.

**MVP / validation.** Scope: 60 active minutes, 16 modules, 150 KB, zero new dependencies or services.
Extend native import/rollback, byte-budget, inspector and style tests; check the real repository URL
and traversal route in the browser. Reuse the existing exact-input protected CI receipt path when
its tree, owner plan, dependencies and environment match. Local owner-plan checks remain fresh
because that plan includes external/runtime inputs. Profile existing stage receipts before any
concurrency change; required integration gates remain intact. Rollback reverts this source change
while retaining all imported source artifacts and lifecycle evidence.

**GTM.** Demonstrate repository import → source-group legend → kind/path/provenance filter → depth
and direction → affected source explanation. Record preview publication count separately from wall
time, CPU and memory. No avoided crash rate, resource savings, buyer demand or WTP is claimed from
synthetic tests. Production deployment remains a separate protected candidate and runtime receipt.


## Import-to-canvas fidelity — reference implementation

**QUERY-IMPACT-03 / PRD.** Solo developer / reopen imported source evidence / inspect the same
identified graph across Source Files, Renderer, Graph Traversal, Workflow Manager and Dashboard.
The source audit found native JSON converted to generic relationships, missing folder artifacts,
selection without viewport focus, and rendered-subset counts labeled as the dataset. The user's
FIX instruction authorizes this four-gap successor at the family's `0.3.5` revision.

**Acceptance.** URL and folder imports retain one native manifest/projection pair. Reopening either
retains IDs, relationship labels, provenance and read-only ownership. Invalid retained identity or
records fail closed. Cancellation adds no artifact. Most connected and Show on canvas bring the
selected root/neighborhood into view within existing render limits. Loaded graph statistics agree
with Workflow Manager; rendered and selected counts remain explicit and partial coverage is disclosed.

**TAD / ADR.** Extend the retained projection reader, document action, existing artifact writer,
render budget, selection-fit request and statistics hook. Retained JSON is not generic Flowchart input.
Use a tagged folder/remote origin without inventing a local URL. Selected nodes take priority in the
existing bounded display set and its cache identity. Native statistics read the loaded immutable
projection; rendering retains its independent budget. No extra store, parser, renderer or dependency.
These owners preserve one graph identity while separating persistence, presentation and analysis.

**MVP / validation.** One lane, 60 active minutes, at most 24 authored files and 150 KB diff;
no new always-loaded module. Regression checks cover folder persistence/cancellation, native JSON
reopen and corruption, selection-aware rendering/cache isolation, loaded/selected statistics, and
inspector focus requests. Reuse unchanged checks by exact input identity; required integration and
browser readback remain distinct receipts. Existing browser folder-picker automation cannot prove
the native picker; host acquisition/commit tests cover the deterministic folder path independently.

**GTM / successor.** Demonstrate import → Source Files reopen → Most connected → focused impact
→ matching loaded totals in 90 seconds. Willingness to pay remains unvalidated. Static code evidence
never implies execution metrics or production readiness. Next optimization: measure import/reopen
and focus latency on the same source snapshot before changing budgets or concurrency. Recovery is
a reviewed revert of these owner changes; retained source artifacts remain available.


### Source modules and connectivity fidelity

**QUERY-IMPACT-04 / PRD.** Solo developer / rank imported source files / inspect the most
connected captured module and its evidence from Graph Traversal or Dashboard. The operator's
follow-up authorizes module labels, meaningful node size, native Graph statistics and local
metadata under `.workspace`. Import URL and folder continue through the same native projection,
Source Files manifest and retained JSON readers. User repository addresses remain runtime inputs.

**TAD.** Reuse `nodeImpact` and `NodeImpactInspector` for both surfaces. A module groups nodes
by captured source-file path; each incident edge counts once per module, including internal
relationships. Missing paths are excluded and never inferred. Selecting a module selects its
loaded member nodes and requests the existing selection fit. Node radius uses distinct loaded
incident relationships, from 6 units for isolates to a 36-unit cap; the render budget does not
recompute that value from its smaller subset. Source-directory colors and certainty styles retain
their existing owner. The final byte-fit callback computes sizes for the actual retained graph.

**ADR.** Native Graph statistics uses captured snapshot, loaded and rendered counts separately,
source-file modules, source-directory groups, node kinds and edge evidence. Generic document
keyword, text-community and similarity analytics retain their existing route. Source groups are
not discovered semantic communities. Existing module/selection/legend UI is reused without a new
renderer or vector index. Removing the duplicate retained-JSON style pass saves repeated work;
no measured latency saving is claimed. Agentic OS owns opt-in clone cache bodies under
`.workspace/.local`; Graph adopts its exact released revision and does not own a second cache.

**MVP / validation.** Check cyclic and shared relationships, missing paths, deterministic ranking,
module selection/focus, renderer radius, stable sizes after selection, byte bounds and native
Dashboard evidence. Existing folder cancellation, URL bridge, retained JSON reopening and loaded
versus rendered tests remain applicable. Use the native required Integration Gate on the candidate.
The fixture is repository-neutral; a real repository is supplied only during local validation.

**GTM / limits.** The pilot is a solo developer tracing one high-connectivity source file after
import, then reviewing incoming/outgoing impact. Projection caps remain 1,000 loaded nodes and
420 rendered nodes: rankings describe that sample, not full-repository centrality or parity with
another implementation. WTP, payment, repeat use and production deployment remain unvalidated.
Store validation records and exact candidate links under `.workspace/.artifacts`, with unknown
model/token/cost fields left unknown. Reuse checks only for matching input and environment digests.


### Selection geometry after retained-source reopening

**QUERY-IMPACT-05 / PRD.** Solo developer / select a captured module after reopening its
retained JSON / bring its rendered nodes into the viewport. Browser validation found that the
inspector selected the correct members while the canvas fitted fresh source objects without
layout coordinates. Rebinding the bounded render graph could also cancel the queued selection.

**TAD / ADR.** Keep source evidence immutable. The existing D3 zoom owner overlays actual
rendered positions only for viewport calculations and includes geometry in the fit-cache key.
The existing zoom effect coalesces to the latest request and resumes pending selection after
render-graph rebinding. No second renderer, store, relationship inference or dependency is added.

**MVP / validation.** Bound this correction to six files, 15 active implementation minutes and
15 KB diff; protected CI is a separate external wait. Regression tests first fail against the
original owners, then verify reopening, changed layout, unchanged source bytes, latest-request
coalescing and queued-selection survival. Existing native import, module, radius and statistics
checks remain applicable. Required integration and browser readback provide separate evidence.

**GTM / limits.** The pilot's Most connected action must focus the selected loaded module after
Source Files reopening. Rankings remain bounded by loaded evidence; viewport repair does not
prove complete repository coverage or production readiness. Reuse exact-input validation receipts
and profile expensive checks before increasing concurrency. Recovery is a reviewed owner revert;
retained source records and validation evidence remain under their existing workspace owners.
