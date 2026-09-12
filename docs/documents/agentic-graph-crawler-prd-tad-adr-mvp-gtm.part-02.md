---
title: "Reference implementation: agentic-graph-crawler-prd-tad-adr-mvp-gtm section 2"
doc_type: "PRD-TAD-ADR-MVP-GTM"
version: "1.0.2"
date: "2026-09-12"
lang: "en-US"
owner: "Documentation maintainers"
continuity_id: "PLAN-AGENTIC-GRAPH-CRAWLER-PRD-TAD-ADR-MVP-GTM"
prd_revision: "1.0.2"
tad_revision: "1.0.2"
adr_revision: "1.0.2"
mvp_revision: "1.0.2"
gtm_revision: "1.0.2"
local_rung: "undocumented"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
worktree_id: "device-cba000d3779d--planning-v27"
agent_id: "codex-01a0940a"
parent: "agentic-graph-crawler-prd-tad-adr-mvp-gtm.md"
guideline_revision: "2.7.0"
source_section_lines: "477-613"
---

[Combined planning owner](agentic-graph-crawler-prd-tad-adr-mvp-gtm.md) · `PLAN-AGENTIC-GRAPH-CRAWLER-PRD-TAD-ADR-MVP-GTM@1.0.2`. This companion preserves the source section; diagrams and frontmatter projections remain owned by the combined artifact.

## ADR-003: Crawler Indexes Stay Metadata-Oriented

**Status**: Accepted

**Date**: 2026-05-19

### Context

Crawler indexes need to be small, deterministic, and cheap. Embedding every document body would increase response size and make cache invalidation less precise.

### Decision

Return document metadata and doc-view links from the index; serve full markdown through existing doc-view routes.

### Alternatives Considered

1. **Inline full markdown bodies in the index**: Reduces follow-up requests but inflates the index.
2. **Only list titles**: Small but not enough for provenance and freshness checks.
3. **Separate route per metadata field**: Over-fragments the contract.

### Rationale

Metadata plus doc-view links gives crawlers freshness evidence and direct content access while keeping the index stable.

### Consequences

- **Positive**: Indexes remain compact and easy to validate.
- **Negative**: Crawlers need one follow-up request per selected document.
- **Neutral**: Future JSON manifest can reuse the same metadata shape.

---

## Quality Attributes

| Attribute | Scenario | Pattern | Validation |
|---|---|---|---|
| Performance | Crawler opens index for a normal workspace | Single D1 query over non-deleted documents, metadata-only response | Worker route tests and build smoke |
| Scalability | Workspace grows beyond a small document set | Metadata response allows future pagination without changing doc-view URLs | Open question tracked |
| Security | Crawler route is requested by anonymous clients | Read-only GET route; no uploads, no writes, no local paths, no app payment emulation | Contract tests and route review |
| Reliability | Dev and Prod route names must stay aligned | Shared route constants and helper-generated paths | Storage contract tests |
| Observability | Maintainer needs route ownership evidence | Response headers identify source and Pay Per Crawl policy boundary | Worker header assertions |
| Testability | Crawler access must be provable without live billing | Fake D1 Worker tests verify content shape; Cloudflare route checks verify deployment | Focused tests plus deploy proof |

---

## Security And Privacy Boundaries

- Crawler routes are read-only and must not mutate D1, the browser-local persisted cache, local files, graph snapshots, or render state.
- Crawler indexes must not expose local absolute paths, device IDs, user identity, sync outbox records, or conflict logs.
- Deleted Source Files are excluded from crawler indexes.
- Pay Per Crawl headers that express price or charged amount belong to Cloudflare, not the Worker.
- Pay Per Crawl request headers that express crawler payment intent also belong to Cloudflare and verified AI crawler owners; agentic-graph does not sign or synthesize them.
- Private workspace reads require membership or the trusted local runtime and remain excluded from indexing; anonymous reads require current explicit publication.

---

## Deployment Strategy

1. Build the Dev app from `agentic-graph`.
2. Verify static discovery artifact includes crawler routes.
3. Verify focused storage contract and Worker crawler tests.
4. Sync built artifacts into the Prod content mirror.
5. Commit and push the Prod mirror.
6. Deploy the storage Worker and D1 migrations when Worker code changed.
7. Deploy the separate payment Worker when Stripe checkout or webhook code changed.
8. Verify Cloudflare Pages route, storage Worker route, payment Worker route, and static asset MIME types with direct HTTP probes.

**Rollback Plan**:

- Revert the static `llms.txt` advertisement if discovery needs to be withdrawn.
- Revert the Worker crawler route handler and route registration if storage index behavior regresses.
- Keep doc-view and push/pull/export routes unchanged because crawler access is additive and read-only.

---

## Validation Plan

| Validation | Command Or Evidence | Expected Result |
|---|---|---|
| Route contract | Focused storage contract test | Route helpers and Pay Per Crawl header constants remain centralized |
| Worker crawler index | Focused storage Worker test | `/api/storage/source-files/{workspaceId}` returns markdown index, hides deleted rows, links doc-view URLs |
| LLM text entrypoint | Focused storage Worker test | `/api/storage/llms.txt` returns text/plain with Source Files and Pay Per Crawl metadata |
| Type safety | `npm --prefix canvas exec tsc -- -p canvas/tsconfig.json --noEmit --pretty false` | No TypeScript errors |
| Static artifact | `npm run pages:build` | Built `llms.txt` includes Source Files and access policy |
| MainPanel MCP readiness | Focused MainPanel MCP crawler/payment render test | MCP hub surfaces crawler routes, Pay Per Crawl boundary, Stripe MCP payment readiness, MainPanel Commerce handoff, and no app-local crawler price |
| Docs map | `python3 ../huijoohwee.github.io/schema/AgenticRAG/sync_map.py --mode check` | Documentation map remains synchronized or is regenerated from canonical docs |
| Production smoke | Direct Cloudflare route probes after deploy | HTML route, storage crawler route, payment Worker route, and hashed static assets are reachable |

---

## PRD -> TAD Traceability

| PRD Story | TAD Component / Interface | Validation |
|---|---|---|
| PRD-E001-S001 Static LLM Entrypoint | Static discovery, TAD-C001-I003 | Built artifact inspection and Worker LLM test |
| PRD-E001-S002 Storage-Owned Source Files Index | Crawler handler, TAD-C001-I001, TAD-C001-I002 | Worker crawler index test |
| PRD-E002-S001 Direct Markdown Document Links | Doc-view route, TAD-C001-I005 | Worker doc-link assertions |
| PRD-E002-S002 Read-Only Crawl Behavior | Crawler handler, D1 read query | Route review and focused tests |
| PRD-E003-S001 Cloudflare-Owned Payment Negotiation | ADR-002, header contract | Contract test and Cloudflare docs check |
| PRD-E003-S002 Paid Access Metadata Compatibility | Header contract, ADR-002 | Production route verification when zone policy is enabled |
| PRD-E004-S001 Dev -> Prod -> Cloudflare Route Parity | Deployment strategy, shared route contract | Build/sync/deploy proof |

---

## Living Document Rules

- Update this document when crawler route names, metadata fields, policy headers, or deployment responsibilities change.
- Keep route names and header names sourced from shared storage contracts, not duplicated prose-first decisions.
- Add an ADR before adding JSON manifests, pagination, private workspace crawl access, or app-local crawler policy logic.
- Keep product requirements focused on crawler outcomes and technical architecture focused on storage-owned delivery.

## Planning revision — reference implementation

All five roles below consume `PLAN-AGENTIC-GRAPH-CRAWLER-PRD-TAD-ADR-MVP-GTM@1.0.2`. Existing source and runtime observations retain their original revisions and scope; this documentation update renews no deployment or demand evidence. The guideline is [v2.7.0](https://github.com/huijoohwee/huijoohwee.github.io/blob/e8d2a10a8d3e5735c43edf350a22523df05fdf91/guidelines/prd-tad-adr-mvp-gtm-guidelines.md); the shared maturity rubric loads on demand.

| Role | Owning content at this revision |
|---|---|
| PRD | [PART I: PRODUCT REQUIREMENTS DOCUMENTATION (PRD)](agentic-graph-crawler-prd-tad-adr-mvp-gtm.part-01.md#part-i-product-requirements-documentation-prd) |
| TAD | [PART II: TECHNICAL ARCHITECTURE DOCUMENTATION (TAD)](agentic-graph-crawler-prd-tad-adr-mvp-gtm.part-01.md#part-ii-technical-architecture-documentation-tad) |
| ADR | [Architectural Decisions](agentic-graph-crawler-prd-tad-adr-mvp-gtm.part-01.md#architectural-decisions) |
| MVP | [MVP — reference implementation](agentic-graph-crawler-prd-tad-adr-mvp-gtm.part-02.md#mvp--reference-implementation) |
| GTM | [GTM — reference implementation](agentic-graph-crawler-prd-tad-adr-mvp-gtm.part-02.md#gtm--reference-implementation) |

## MVP — reference implementation

Reuse the minimum scope, acceptance conditions and component owners identified above. The demonstration must follow the documented entry, permitted action, durable outcome and readback, including its stated failure/recovery path. Use `npm run pages:build` for its actual coverage and the named feature checks in the specification; attach exact source, command, result and authoring/mirror/delivery surface to each VCC before advancing readiness. A source locator or structural check alone proves no user outcome.

Record the observed steps and elapsed time against the existing TTV target. If no target or invocation is stated, the demonstration remains unverified until the document owner supplies it. All four experience criteria are **unassessed** in this authoring review: Core Requirements & Functionality, Innovation & Theme Alignment, Technical Execution & Integration, and Usefulness & Agentic Experience. No scored user observation is attached to this revision; the document owner must capture a timed pilot and criterion-specific evidence.

## GTM — reference implementation

Use the stated persona and pain hypothesis to test one priced pilot in the existing user environment. Keep the documented free/self-serve workflow as the comparison; additional hosting, channels or agent roles require an evidenced constraint or buyer need. Record the buyer’s workaround, frequency, accepted outcome, offered price, observed response and support minutes before ranking a commercial winner. Demand, collected payment and repeat use remain unvalidated by this documentation review; mechanism evidence keeps its narrower original scope. Measure tokens, cash expense and maintenance separately for each proposed deployment model. Feed actual pilot outcomes into a successor Context using the shared four-column planning record.

## Planning gaps — reference implementation

Source review is bounded to repository `7fb85741121d8c2886027e4a630d013ba91c1027`. Confirmed: these referenced artifacts exist at that revision: [`canvas/public/llms.txt`](https://github.com/huijoohwee/agentic-graph/blob/7fb85741121d8c2886027e4a630d013ba91c1027/canvas/public/llms.txt), [`canvas/index.html`](https://github.com/huijoohwee/agentic-graph/blob/7fb85741121d8c2886027e4a630d013ba91c1027/canvas/index.html), [`canvas/src/lib/storage/agentic-graph-storage-sync-contract.ts`](https://github.com/huijoohwee/agentic-graph/blob/7fb85741121d8c2886027e4a630d013ba91c1027/canvas/src/lib/storage/agentic-graph-storage-sync-contract.ts). Their existence does not confirm every behavior asserted by the specification.
Experience observations, current VCC execution and buyer/payment evidence are unverified here. This is a bounded planning update, not a full-guideline conformance verdict; historical conformance percentages above apply only to their recorded profile and revision.
