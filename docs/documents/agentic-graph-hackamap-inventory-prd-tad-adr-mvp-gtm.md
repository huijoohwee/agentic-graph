---
title: "HackaMap whole-repository Source Files and graph projection"
id: "md:agentic-graph-hackamap-inventory"
doc_type: "PRD-TAD-ADR-MVP-GTM"
continuity_id: "HACKAMAP-SOURCE-FILES-001"
version: "1.0.1"
date: "2026-10-11"
lang: "en-US"
owner: "agentic-graph Source Files product"
frontmatter_contract: "required"
local_rung: "spec-complete"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
lifecycle_status: "implementation-validated"
deployment_topology: "Local Vite Dev preview -> protected Production Release"
load_policy: "on-demand"
worktree_id: "agent/device-0232231d4a19/hackamap-folder-contents"
agenticOsCanvasRenderMode: "2d"
agenticOsCanvas2dRenderer: "d3"
kgCanvasSurfaceMode: "2d"
kgCanvasRenderMode: "2d"
kgCanvas2dRenderer: "d3"
source_docs:
  - "docs/documents/agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm.md"
  - "docs/documents/prd-tad-adr-mvp-gtm-knowledge-graph-node-cluster-edge.md"
  - "docs/START-WORKFLOW.md"
  - "docs/RELEASE-WORKFLOW.md"
  - "guides/DEPLOY-WORKFLOW.md"
---

# HackaMap whole-repository Source Files and graph projection

## Planning record

| PRD-TAD-ADR-MVP-GTM | CID | RAO | Updated |
|---|---|---|---|
| `HACKAMAP-SOURCE-FILES-001@1.0.1` | C: keep private repository bytes local while exposing a navigable inventory and bounded graphs. E: current preview is a single-file wrapper or a cluttered tree. I: use existing Source Files, graph, and codebase-indexing owners. D: generate local manifests and source previews on demand. | R: HackaMap maintainer · A: browse an entire repository through manifests, D3 and Source Files · O: exact local inventory and independently checked projections · V: H1–H7 below | 2026-10-11 |

## PRD

**Pain.** Opening a repository as one Markdown document loses folder navigation; importing every
file directly into the explorer makes a large tree hard to browse. The HackaMap source repository is
private, so copying its contents into the public Agentic Graph source or production artifact would
also disclose private material.

**Outcome.** The maintainer can open one concise overview, navigate a complete path/size index, inspect
selected source files under their original relative paths, and open a D3 graph of domain nodes,
clusters and typed edges. A second, separately labelled codebase graph uses the existing shared
indexing utility. Source bytes are read-only and remain in a local preview workspace.

| Requirement | Observable result |
|---|---|
| R1 Complete inventory | Recursively enumerate files under the selected repository, preserving relative paths and byte sizes; exclude `.git` internals and never follow symlinks outside the root. |
| R2 Readable Source Files | Split large text and binary previews into ordered bounded documents; link each inventory row to its preview parts without expanding the entire tree by default. |
| R3 Domain graph | Render the source graph as a validated D3 node/cluster/typed-edge projection; demos form the `Demos · core` cluster. |
| R4 Codebase graph | Reuse `mcp/agent-graph/workspace-codebase-indexing.mjs`, including its deterministic snapshot identity, bounded projection, and reuse/cache behavior. Do not add a second parser or index store. |
| R5 Browse collections | Keep generated domain manifest, codebase manifest, CSV inventory and full source previews distinct so each view has one job. |
| R6 Safe import | Show progress and cancellation; reject stale/cross-root results; never modify the selected source repository. |
| R7 Privacy and delivery | Store generated snapshots under local temporary workspace storage. Exclude private HackaMap source bytes and generated snapshots from commits, CI artifacts, release evidence and public deployment. |

**Observed local input (Oct 11, 2026).** The selected repository had 234 files, 247 preview parts,
14,570,069 source bytes, 1,489 domain nodes and 3,689 domain edges. These values describe that
observation only; the runtime inventory must derive current counts from the selected source.

### Product verification and completion criteria

| ID | Acceptance check | Evidence required |
|---|---|---|
| H1 | Nested paths, ignored `.git`, hidden files, empty folders, symlinks and read failures have explicit deterministic handling. | Importer tests; no source mutation. |
| H2 | Inventory rows exactly cover admitted files; preview chunks reassemble byte-for-byte and stay below the configured per-document limit. | Path/byte/digest comparison and chunk boundary tests. |
| H3 | Domain graph validates every node and edge endpoint, preserves edge type, is deterministic for equal input, and puts demos in the core cluster. | Projection tests plus D3 preview readback. |
| H4 | Codebase projection uses the shared indexer; repeat indexing reports reuse and does not reparse unchanged sources. | Unit assertions and emitted per-stage metrics. |
| H5 | Explorer remains compact; manifests link to previews and the table exposes all inventory rows without eagerly rendering all source bodies. | Browser walkthrough on the local Dev preview. |
| H6 | Progress, cancellation, duplicate selection and out-of-order completion cannot apply a stale import. | Existing and new importer/runtime tests. |
| H7 | No private source bytes occur in the staged source diff or production bundle. | Exact diff review and artifact inventory before publication. |

The sample observation's run reported approximately 14.57 MB of source data, under the 500-file
projection bound and below the per-document chunk limit. Record actual run timing for discovery,
source projection, graph projection, indexing and total time; do not claim a latency target from one
sample. User-visible work remains local and on demand. No network crawler, paid service, model call,
new database, or write-back to HackaMap is part of this increment.

## TAD

1. A local launcher resolves the selected repository root and a temporary workspace root. Collection
   is deterministic and bounded; `.git` is excluded, symlink targets are not traversed, and every
   emitted relative path is checked to stay inside the selected root.
2. The collector creates chunked source documents, a compact CSV inventory and two graph artifacts.
   Manifest links are relative to the workspace root. Large source payloads are lazy to the explorer;
   the runtime may materialize their preview documents without committing them.
3. The HackaMap domain adapter validates the source graph, selects only allowlisted properties,
   creates stable typed nodes and edges, assigns entity clusters, and enforces the encoded projection
   byte/node bounds before writing output.
4. The codebase adapter calls the existing shared indexer and emits stage metrics and cache reuse
   counts. There is one indexing/cache owner; the graph projection consumes its bounded result.
5. Existing Source Files, graph-store, workspace-document and collection-table owners render the
   generated artifacts. Async completion must still match the selected root, import ID and source
   revision before activating a document or graph layer.
6. Temporary generated files stay under `.workspace` for the local preview. No generated source
   snapshot is committed or uploaded. A production release contains application code only and follows
   the protected Release workflow, with separate Dev readback, production authorization, Prod
   readback and rollback receipts.

**Limits.** Keep every changed or new implementation file below 600 lines and every projected
Source Files document below 500,000 bytes. Preserve the existing 500-entry cap and existing graph
projection limits. Add no always-loaded dependency; any test-only package must be dev-only and
free/open-source. Timing and byte metrics are evidence, not authority.

## ADR

- **Accepted:** local source stays local; manifests summarize and link; codebase indexing is reused;
  domain graph and repository code graph remain separate views.
- **Rejected:** committing the private repository copy, rendering every source body at once, following
  symlinks outside the selected root, or adding a parallel index/cache implementation.
- **Deployment:** the local Vite preview is Dev evidence only. Release CI, source merge and a local
  preview do not authorize Prod. Follow the repository's exact candidate and protected human approval
  protocol; record independent environment receipts.

## MVP and GTM

MVP user is the repository maintainer, with the first use case being local review of HackaMap's full
repository structure. The product proves navigation and representation, not semantic correctness of
the underlying HackaMap dataset. First delivery is the local preview and merged application feature;
production remains conditional on exact protected release evidence. There is no measured external
buyer demand or pricing claim. Start with the smallest local workflow and collect import/index timing
and actual browsing feedback before extending source limits or adding remote integrations.

## Implementation handover 1.0.1

The reserved feature lane implements the full Source Files collection, chunked source previews,
separate domain and codebase graph projections, collection-table import, stale-result protection, and
reuse of the shared workspace codebase indexer. The observed local sample contained 234 files, 247
source parts and 14,570,069 source bytes. Its domain graph contained 1,489 nodes and 3,689 typed
edges. A repeat codebase-index pass visited 71 sources, reused all 71, parsed none, and reported a
5,207 ms indexing stage (6,697 ms total for that observed run); this is an observation, not a latency
guarantee.

Validation recorded for this revision: 28/28 selected standard affected-CI checks passed; four
focused collection-import/table tests passed; `agent-graph:check` passed 124 tests; and the Pages
application, PWA-authority and observability builds passed. The local Vite Dev preview rendered the
HackaMap manifest and D3 graph, including the `Demos · core` cluster, with 1,430 canvas items and a
virtualized first page. The generated projection was local-only: the built artifact audit found no
matching private source-file hashes and no absolute local source-root string. These checks validate
the source implementation and local Dev preview only; source publication, protected integration,
production authorization and production readback remain separate transitions. External buyer-demand
and pricing hypotheses remain unmeasured.

Next owner actions: publish through native `release:common`, pass the protected Integration Gate and
merge the exact reviewed source candidate; retain source and Dev receipts, then prepare the
candidate-bound production evidence bundle and use only the protected release workflow. Promote only
the same candidate after Dev readback and exact terminal human authorization, then record independent
Prod readback and rollback receipts. If release verification fails, use the product-owned protected
release rollback to the observed retained predecessor and verify its runtime readback. No production
effect is claimed by this handover.
