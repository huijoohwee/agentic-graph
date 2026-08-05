---
title: "Source-Native Graph Workspace Architecture Decisions"
doc_type: "Architecture Decision Record Set"
version: "1.2.0"
date: "2026-08-05"
lang: "en-US"
guideline_version: "1.7.0"
owner: "architecture.decisions"
local_rung: "spec-complete"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
---

# Source-Native Graph Workspace Architecture Decisions

## Authority and economics assumptions

This document owns the accepted core decisions and their alternatives. Decision status is an ADR
lifecycle value, not a readiness rung. The document remains `spec-complete` because VCCs exist and
no satisfying Evidence Reference is attached; Delivery remains `undocumented`.

Cash estimates are planning ranges for 25 monthly first-value sessions and exclude operator labor.
They must be replaced by actuals before any paid deployment model is selected.

## ADR-001 — Reference implementation: Keep the readable source authoritative

**Status**: Accepted  
**Date**: 2026-07-30

### Context

Prose, graph structure, and view state need one inspectable authority without mandatory
infrastructure or a proprietary file format.

### Decision

Use Git-backed Markdown documents with plain YAML frontmatter/graph fields as the portable authored
authority. Git is the authority and audit mechanism; GitHub is the current protected forge and may
be replaced or mirrored without changing the content contract. Runtime and collaboration stores
may cache, edit, publish, or index projections, but must not silently replace that source.

### Alternatives considered

1. FOSS JSON sidecar: simple graph serialization, but content and graph can drift.
2. FOSS local relational store: strong queries, but hides the primary artifact behind an adapter.
3. Managed proprietary canvas store: polished collaboration, but creates lock-in and mandatory TCO.

### TCO impact

| Dimension | Chosen local source | Chosen managed mirror | FOSS local database | FOSS hybrid source + index |
|---|---:|---:|---:|---:|
| Infra/month | $0 | $0–5 | $0 | $0–10 |
| Egress/month | $0 | $0–5 | $0 | $0–5 |
| Token/month | $0 | $0 | $0 | $0 |
| 12-month cash | $0 | $0–120 | $0 | $0–180 |
| Ops burden | low | low | medium | medium |
| Vendor risk | low | medium at mirror | low | low |

### Rationale

The chosen source gives the shortest TTV, readable diffs, zero mandatory egress, and one artifact
for humans and tools.

### Consequences

- **Positive**: portable, diffable, and zero-infrastructure first value.
- **Negative**: collaborative merge and large-document performance need explicit handling.
- **Neutral**: caches and shared stores remain projections.

### Knowledge-base authority boundary

This ADR accepts only the portable authority principle. The detailed provider-role matrix,
proposed projection envelope, current evidence gaps, and Lark candidate flow are owned by the
[storage and synchronization contract](knowgrph-storage-sync-document.md); they are not repeated as
a second normative source here.

External collaboration edits must become reviewed source candidates rather than last-write-wins
updates, and provider credentials must stay outside the browser. The minimum path remains
deterministic and uses zero model tokens: inspect frontmatter and content digests first, fetch or
chunk bodies only on demand, and reuse unchanged projections.

## ADR-002 — Reference implementation: Compose one client before adding service tiers

**Status**: Accepted  
**Date**: 2026-07-30

### Context

The core UI, graph state, parsing, and projections operate in one interactive workspace. Splitting
them into independent applications or a mandatory backend adds coordination cost without proving
user value.

### Decision

Keep one modular client composition with libraries/workers for deterministic processing. Add a
service only for a boundary that requires shared custody, secret custody, or public transport.

### Alternatives considered

1. FOSS micro-frontends: independent delivery, but duplicated contracts and runtime overhead.
2. FOSS local desktop/server split: useful for privileged files, but increases install TTV.
3. Managed application backend: simplifies shared state, but makes the minimum path network-bound.

### TCO impact

| Dimension | Chosen local client | Chosen managed static delivery | FOSS desktop/server split | FOSS micro-frontends |
|---|---:|---:|---:|---:|
| Infra/month | $0 | $0–10 | $0 | $0–20 |
| Egress/month | $0 | $0–5 | $0 | $0–5 |
| Token/month | $0 | $0 | $0 | $0 |
| 12-month cash | $0 | $0–180 | $0 | $0–300 |
| Ops burden | low | low | medium | high |
| Vendor risk | low | medium at delivery | low | low |

### Rationale

One client preserves the fastest local path while component boundaries remain testable and
replaceable.

### Consequences

- **Positive**: fewer deploy/runtime contracts and zero-backend first value.
- **Negative**: client bundle and long-task performance require active control.
- **Neutral**: shared services remain optional adapters.

## ADR-003 — Reference implementation: Separate discovery, local, embedded, and control transports

**Status**: Accepted  
**Date**: 2026-07-30

### Context

Public reads, local tools, browser-local controls, and approval-gated orchestration have different
trust, credential, and side-effect boundaries. A descriptor catalog is not universal permission.

### Decision

Keep transport catalogs separate and federate them through shared identities and explicit routing.
Do not add a proxy that claims every transport has execution parity.

### Alternatives considered

1. One FOSS unified gateway: simpler URL story, but duplicates dispatch and widens credential scope.
2. FOSS local-only transport: safest and cheapest, but excludes remote discovery.
3. Managed API gateway: mature policy controls, but adds vendor TCO and still cannot erase trust gaps.

### TCO impact

| Dimension | Chosen local + separated remote | Chosen managed control adapter | FOSS unified self-hosted proxy | Managed unified gateway |
|---|---:|---:|---:|---:|
| Infra/month | $0–15 | $0–25 | $10–40 | $20–100 |
| Egress/month | $0–10 | $0–10 | $0–15 | $0–25 |
| Token/month | $0 discovery | $0 discovery | $0 discovery | $0 discovery |
| 12-month cash | $0–300 | $0–420 | $120–660 | $240–1,500 |
| Ops burden | medium | medium | high | medium |
| Vendor risk | low/medium | medium | low | high |

### Rationale

Separation keeps zero-token discovery public, local execution rich, browser controls page-local,
and spend-bearing operations behind a distinct approval boundary.

### Consequences

- **Positive**: least privilege and honest capability descriptions.
- **Negative**: hosts must choose a surface and cannot assume catalog union.
- **Neutral**: shared schemas reduce, but do not eliminate, transport-specific code.

## ADR-004 — Reference implementation: Use tiered persistence roles

**Status**: Accepted  
**Date**: 2026-07-30

### Context

Authored source, local working state, shared structured state, binary objects, and live
collaboration have different retention and consistency needs.

### Decision

Keep Git-backed authored source primary, a local working store recoverable, and Lark plus shared
structured/object/room stores optional projections with explicit source revision, content digest,
identity, residency, retention, conflict, and auth rules. Provider mutations must enter through a
host-owned adapter and reviewed candidate flow; browser code must not custody provider credentials.

### Alternatives considered

1. Source files only: lowest TCO, but weak shared/offline queue ergonomics.
2. FOSS consolidated relational/object service: simpler custody, but higher operator burden.
3. Managed database as authority: convenient sharing, but violates portable source ownership.

### TCO impact

| Dimension | Chosen local tier | Chosen managed shared tiers | FOSS consolidated self-host | FOSS hybrid local + object |
|---|---:|---:|---:|---:|
| Infra/month | $0 | $0–30 | $15–80 | $5–40 |
| Egress/month | $0 | $0–15 | $0–20 | $0–15 |
| Token/month | $0 | $0 | $0 | $0 |
| 12-month cash | $0 | $0–540 | $180–1,200 | $60–660 |
| Ops burden | low | medium | high | high |
| Vendor risk | low | medium | low | low/medium |

### Rationale

Tiered roles preserve local value and permit sharing without assigning every data class to one
costly or opaque system.

### Consequences

- **Positive**: offline-first behavior, scalable bytes, and explicit collaboration.
- **Negative**: reconciliation and retention policies require evidence per adapter.
- **Neutral**: one active provider per role/document prevents dual-write ambiguity.

## ADR-005 — Reference implementation: Require typed bounded harnesses

**Status**: Accepted  
**Date**: 2026-07-30

### Context

Automation may touch files, networks, paid providers, or protected operations. Unbounded raw calls
cannot provide stable cost, failure, or approval semantics.

### Decision

Every automation declares typed input/output, dispatcher/executor/observer/consumer roles, side
effect policy, approvals, step/retry/time/model-call/token/cost limits, circuit-breaker, fallback,
terminal state, and per-call cost fields.

### Alternatives considered

1. FOSS ad-hoc scripts/raw calls: fast initially, but invisible spend and inconsistent failures.
2. FOSS workflow engine: durable orchestration, but adds infrastructure before demand is proven.
3. Managed agent platform: rich observability, but adds egress, lock-in, and variable token TCO.

### TCO impact

| Dimension | Chosen local harness | Chosen managed model adapter | FOSS workflow engine | Managed agent platform |
|---|---:|---:|---:|---:|
| Infra/month | $0 | $0–10 | $10–60 | $20–150 |
| Egress/month | $0 | $0–5 | $0–10 | $0–25 |
| Token/month | $0 deterministic | ≤$10 | ≤$10 | $10–100 |
| 12-month cash | $0 | ≤$300 | $120–960 | $360–3,300 |
| Ops burden | medium | medium | high | medium |
| Vendor risk | low | medium | low | high |

### Rationale

Bounded contracts make cost and side effects reviewable while preserving swappable executors.

### Consequences

- **Positive**: predictable termination, approval, and cost evidence.
- **Negative**: current harnesses may remain below the target until their VCCs prove every field.
- **Neutral**: deterministic paths emit zero-valued cost records.

## ADR-006 — Reference implementation: Protect exact-state promotion

**Status**: Accepted  
**Date**: 2026-07-30

### Context

Local checks, mirror shape, and public delivery are independent evidence surfaces. Automatic
delivery from ordinary source activity would blend their readiness and weaken rollback.

### Decision

Use protected exact-revision integration, immutable mirror verification, a separate explicit
operator instruction, live delivery checks, and a prior-state rollback path. Never promote directly
from Authoring to Delivery.

### Alternatives considered

1. Deploy on each branch/main update: low latency, but weak candidate identity and approval.
2. FOSS local/manual CLI: zero service cost, but poor provenance and high operator error.
3. FOSS GitOps controller: strong reconciliation, but excessive controller/cluster TCO here.

### TCO impact

| Dimension | Chosen protected CI | Chosen managed delivery | FOSS local/manual CLI | FOSS GitOps controller |
|---|---:|---:|---:|---:|
| Infra/month | $0–20 | $0–25 | $0 | $20–100 |
| Egress/month | $0–5 | $0–10 | $0–5 | $0–10 |
| Token/month | $0 | $0 | $0 | $0 |
| 12-month cash | $0–300 | $0–420 | $0–60 | $240–1,320 |
| Ops burden | medium | low/medium | high/error-prone | high |
| Vendor risk | medium | medium | low | low |

### Rationale

This is the minimum design that separates source proof from public proof while retaining an
auditable approval and rollback chain.

### Consequences

- **Positive**: exact revision identity and honest delivered readiness.
- **Negative**: release latency and protected-workflow maintenance.
- **Neutral**: separate runtime deploy scripts remain separately authorized capabilities.

## ADR-007 — Reference implementation: Separate authored owners from generated projections

**Status**: Accepted  
**Date**: 2026-07-30

### Context

Duplicate prose owners and generators writing the same artifact to multiple paths create drift,
stale links, and conflicting claims.

### Decision

Keep one authored core requirement, architecture, and decision owner. Generated registries name
their generator and emit one canonical output unless a distinct consumer contract requires a
separately named projection. Superseded ADRs are retained and marked; stale non-decision duplicates
are removed.

### Alternatives considered

1. Multiple equal prose owners: easy copying, but recurring reconciliation cost.
2. FOSS static-doc generator for all content: consistent format, but weak for authored rationale.
3. Managed documentation database: search/collaboration, but adds sync and migration authority.

### TCO impact

| Dimension | Chosen authored + generated | Chosen managed mirror | FOSS fully generated site | Managed docs database |
|---|---:|---:|---:|---:|
| Infra/month | $0 | $0–5 | $0–10 | $10–50 |
| Egress/month | $0 | $0–5 | $0–5 | $0–10 |
| Token/month | $0 | $0 | $0 | $0 |
| 12-month cash | $0 | $0–120 | $0–180 | $120–720 |
| Ops burden | low | low | medium | medium |
| Vendor risk | low | medium at mirror | low | high |

### Rationale

One owner per contract minimizes false references and regeneration drift while preserving readable
decision history.

### Consequences

- **Positive**: predictable reading order and smaller active corpus.
- **Negative**: old deep links may resolve only to superseded compatibility records.
- **Neutral**: generated files change through their generator, not hand-maintained prose.

## Decision traceability

| ADR | PRD requirement | TAD component ↔ interface | VCC chain | Evidence state |
|---|---|---|---|---|
| ADR-001 | `PRD-CORE-R1`, `PRD-CORE-R2`, `PRD-CORE-R3`, `PRD-CORE-R6` | `TAD-CORE-C03` ↔ `I-PARSE`; `TAD-CORE-C05` ↔ `I-SOURCE` | `VCC-PRD-R1` ↔ `VCC-T3`, `VCC-T5` | no satisfying evidence |
| ADR-002 | `PRD-CORE-R2`, `PRD-CORE-R3`, `PRD-CORE-R8` | `TAD-CORE-C01` ↔ `I-WORKSPACE`; `TAD-CORE-C04` ↔ `I-PROJECTION` | `VCC-PRD-R2` ↔ `VCC-T1`, `VCC-T4` | no satisfying evidence |
| ADR-003 | `PRD-CORE-R4`, `PRD-CORE-R5` | `TAD-CORE-C07` ↔ `I-LOCAL-TOOL`; `TAD-CORE-C08` ↔ `I-REMOTE-TOOL` | `VCC-PRD-R4`, `VCC-PRD-R5` ↔ `VCC-T7`, `VCC-T8` | no satisfying evidence |
| ADR-004 | `PRD-CORE-R1`, `PRD-CORE-R3`, `PRD-CORE-R6` | `TAD-CORE-C09` ↔ `I-WORKING-STORE`; `TAD-CORE-C10` ↔ `I-SHARED-STORE` | `VCC-PRD-R6` ↔ `VCC-T9`, `VCC-T10` | no satisfying evidence |
| ADR-005 | `PRD-CORE-R4`, `PRD-CORE-R5` | `TAD-CORE-C07` ↔ `I-LOCAL-TOOL`; `TAD-CORE-C08` ↔ `I-REMOTE-TOOL` | `VCC-PRD-R5` ↔ `VCC-T7`, `VCC-T8` | no satisfying evidence |
| ADR-006 | `PRD-CORE-R7` | `TAD-CORE-C11` ↔ `I-PROMOTION` | `VCC-PRD-R7` ↔ `VCC-T11` | delivery not authorized |
| ADR-007 | `PRD-CORE-R1`, `PRD-CORE-R7` | `TAD-CORE-C05` ↔ `I-SOURCE`; `TAD-CORE-C11` ↔ `I-PROMOTION` | `VCC-PRD-R1`, `VCC-PRD-R7` ↔ `VCC-T5`, `VCC-T11` | no satisfying evidence |

## Readiness Gap Matrix

Local and delivered rungs are independent. Priority is the highest severity of a linked current
finding; `none` records an evidence gap with no separate defect.

| Workstream | Local rung | Delivered rung | Gap | Priority | Exit criteria (VCC) |
|---|---|---|---|---|---|
| Source authority and client composition | `spec-complete` | `undocumented` | decision VCC results are unrecorded | none | ADR-001/002 mappings through `VCC-T1`–`VCC-T6` gain satisfying Evidence References |
| Separated transports and bounded harnesses | `spec-complete` | `undocumented` | complete token/cost evidence is absent from the current model-backed harness | major | ADR-003/005 mappings through `VCC-T7`, `VCC-T8` prove bounds, approval, terminal state, and cost |
| Tiered persistence | `spec-complete` | `undocumented` | structured shared routes lack authorization enforcement | blocker | ADR-004 mapping through `VCC-T9`, `VCC-T10` proves authorization, conflicts, retention, and rollback |
| Exact-state promotion | `spec-complete` | `undocumented` | mirror/live results and operator instruction are absent | none | ADR-006 mapping through `VCC-T11` has satisfying evidence in all three lanes |
| Authored/generated ownership | `spec-complete` | `undocumented` | document-structure result is unrecorded | none | ADR-007 owner/generator check records a passing result without changing generated outputs |

## VCC and Evidence Reference register

| Decision set | Named check | Recorded result | Surface | Derived rung |
|---|---|---|---|---|
| ADR-001–005 | canonical client/runtime validation host | not recorded for this revision | authoring | `spec-complete` |
| ADR-002 parser boundary | canonical offline parser validation host | not recorded for this revision | authoring | `spec-complete` |
| ADR-007 document structure | canonical documentation validation host | not recorded for this revision | authoring | `spec-complete` |
| ADR-006 Authoring | protected integration workflow | not recorded for this revision | authoring | `spec-complete` |
| ADR-006 Mirror | protected release qualification | not recorded for this revision | mirror | `undocumented` |
| ADR-006 Delivery | protected live verification | not recorded for this revision | delivery | `undocumented` |

## Deploy Boundary Register

| Boundary | From lane | To lane | Evidence Reference | Operator instruction | Rollback statement and check | State |
|---|---|---|---|---|---|---|
| `SOURCE-TO-MIRROR` | Authoring | Mirror | ER-B1: mirror verify job; result `not recorded` | `none` | discard candidate, rerun verify, compare immutable digest | `closed` |
| `MIRROR-TO-DELIVERY` | Mirror | Delivery | ER-B2: protected live check; result `not recorded` | `none` | reconstruct prior approved revision, republish through both boundaries, rerun live check | `closed` |

## Reference implementation: Knowgrph source mapping

- PRD owner: `docs/documents/knowgrph-prd.md`
- TAD owner: `docs/documents/knowgrph-tad.md`
- Generated GrabMaps reference owner: `canvas/src/cli/generate-grabmaps-reference.ts`
- Protected controllers: `.github/workflows/integration.yml` and `.github/workflows/release.yml`
- Superseded topology archive: `docs/knowgrph-acos-topology-decision.md`

| Neutral validation host | Reference implementation command |
|---|---|
| canonical client/runtime validation host | `npm run check && npm test && npm run runtime:test` |
| canonical offline parser validation host | `python3 -m unittest discover -s knowgrph_parser -p '*_test.py'` |
| canonical documentation validation host | `npm --prefix canvas run doc:lint && npm --prefix canvas run doc:sanity` |
