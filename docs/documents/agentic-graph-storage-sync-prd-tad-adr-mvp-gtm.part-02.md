---
title: "Reference implementation: agentic-graph-storage-sync-prd-tad-adr-mvp-gtm section 2"
doc_type: "PRD-TAD-ADR-MVP-GTM"
version: "5.0.1"
date: "2026-09-12"
lang: "en-US"
owner: "docs.storage.sync"
continuity_id: "PLAN-AGENTIC-GRAPH-STORAGE-SYNC-PRD-TAD-ADR-MVP-GTM"
prd_revision: "5.0.1"
tad_revision: "5.0.1"
adr_revision: "5.0.1"
mvp_revision: "5.0.1"
gtm_revision: "5.0.1"
local_rung: "spec-complete"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
worktree_id: "device-cba000d3779d--planning-v27"
agent_id: "codex-01a0940a"
parent: "agentic-graph-storage-sync-prd-tad-adr-mvp-gtm.md"
guideline_revision: "2.7.0"
source_section_lines: "444-598"
---

[Combined planning owner](agentic-graph-storage-sync-prd-tad-adr-mvp-gtm.md) · `PLAN-AGENTIC-GRAPH-STORAGE-SYNC-PRD-TAD-ADR-MVP-GTM@5.0.1`. This companion preserves the source section; diagrams and frontmatter projections remain owned by the combined artifact.

### ADR-2: Yjs as the collaboration-room CRDT engine
**Status**: Proposed
**Date**: 2026-08-06

**Context**: S4 (Optional collaboration) names a Room provider node with no CRDT engine specified,
leaving concurrent-edit merge undefined; S9 requires that any external-edit path, including a room
provider, never overwrite the authored source directly.

**Decision**: adopt Yjs (MIT) as the CRDT engine, hosted inside the existing Durable Object Room
provider node, with a `y-indexeddb`-equivalent local-persistence adapter alongside — not replacing —
the working store. Merged room state squashes to a Markdown/frontmatter candidate that enters the
existing S9 candidate → protected-merge review path; room state is never treated as durable
authoring authority (S4 constraint carried forward unchanged).

**Alternatives Considered**:
1. Automerge (FOSS, MIT/Apache-2.0 dual): Pros — strong JSON-CRDT semantics, actively maintained.
   Cons — smaller Cloudflare-Durable-Object-native provider ecosystem than Yjs at time of evaluation;
   would require building the Durable Object binding from scratch rather than adapting an existing
   FOSS provider.
2. Rust-native CRDT via native bindings (reference implementation pattern: a Yjs-compatible Rust
   engine compiled to native bindings, as used by some document-collaboration platforms): Pros —
   highest raw merge performance. Cons — a native build toolchain requirement conflicts with this
   project's browser-first, JS/TS/WASM-only runtime posture; the performance ceiling is not needed
   at current solo/small-team document sizes.
3. No CRDT — conflict-surfaced-only (status quo, current spec baseline): Pros — zero new dependency,
   already spec'd. Cons — leaves S4 permanently unimplemented; concurrent edits degrade to
   explicit-conflict-only with no automatic convergence, which is the gap this ADR exists to close.

**Rationale**: Yjs is FOSS (MIT), has a Cloudflare-Durable-Object-native provider already available
in the open ecosystem, and its JS-only runtime matches the existing browser-first stack without
adding a Rust build step. It closes S4 at the lowest build-hour cost among FOSS options while
leaving ADR-1's SSOT model unchanged.

**TCO Impact**:

| Dimension | Chosen: Yjs + Durable Object [Managed/Serverless] | FOSS Alt: Yjs + self-hosted relay [Provisioned/Self-Managed — dedicated VPS] | FOSS Alt: Yjs + self-hosted relay [Hybrid/Consolidated — existing Oracle A1] | Delta / 12 months |
|---|---|---|---|---|
| Infra cost | $0/mo at free-tier ceiling (100K requests/day, 13,000 GB-s/day); usage-based beyond | $5–10/mo dedicated VPS | $0/mo incremental | +$0 to +$120 |
| Egress cost | $0 (zero-egress) | $0–5/mo | $0–5/mo | +$0 to +$60 |
| Token cost | $0 | $0 | $0 | $0 |
| Ops burden | Near-zero (provider patches, scales, hibernates idle rooms) | Medium (process supervision; no built-in hibernation) | Medium, amortized against an already-operated box | — |
| Vendor risk | Low (Yjs's own protocol is portable; the Durable Object hosting layer is the only non-portable piece, and it is swappable for the self-hosted variant without a data-format change) | Low | Low | — |

**Consequences**:
- **Positive**: closes S4 at $0 incremental infra cost at current scale; reuses a FOSS provider
  rather than building a custom WebSocket relay.
- **Negative**: adds a new runtime dependency (Yjs) and a new local-persistence surface that must be
  kept explicitly non-authoritative in code, not only in documentation, or it risks becoming a second
  SSOT by accident.
- **Neutral**: this ADR closes the engine-selection open question only; S4 and S4a remain
  `spec-complete`/`undocumented` until the fixtures named in S4a exist and pass — choosing an engine
  does not itself raise a readiness rung.

### ADR-3: Lark as a host-mediated, review-first collaboration projection
**Status**: Accepted
**Date**: 2026-08-06 *(formalizes a decision already reflected in the knowledge-base storage
boundary table above)*

**Context**: the storage boundary table designates Lark Base + Wiki/Docs as an "Integrate as
collaboration projection" role. This ADR records that boundary against the FOSS-first rule.

**Decision**: Lark stays strictly a host-mediated, review-first collaboration projection —
read-only Base/Wiki/Docs discovery and supplied-snapshot import first; outbound write-back only
after the S9 idempotency/conflict/audit/rollback/cost VCCs are evidenced. Lark is never a second
SSOT.

**Alternatives Considered**:
1. No external KB integration (status quo / strict FOSS gate): Pros — zero new closed-source
   dependency, $0 TCO, no rate-limit engineering tax. Cons — no human-facing collaboration surface
   for non-technical stakeholders.
2. FOSS alternative — self-hosted collaboration surface rendering the same Markdown/frontmatter SSOT
   (Provisioned/Self-Managed): Pros — stays inside the FOSS gate entirely. Cons — solo-dev build and
   maintenance cost for a surface that closed-source SaaS already provides at small scale for free;
   not yet justified against a real stakeholder-collaboration workload.
3. Lark Base/Wiki/Docs (chosen, Managed/Serverless only — Lark offers no self-hosted variant): Pros —
   lowest build-hour cost for a polished human-facing view; tenant/token model already scoped by this
   project's MCP configuration docs. Cons — closed-source, per-app rate limits, requires host-owned
   credential management; fails the FOSS gate outright, which is why it is bounded to a
   non-authoritative, review-gated role rather than adopted as infrastructure.

**Rationale**: a strict FOSS-only stance would forbid Lark entirely; the practical bound already
reflected in the storage boundary table is to accept it only as a disposable, regenerable,
human-facing projection — never as a database — which contains the FOSS-gate exposure to the
smallest possible surface (read-mostly discovery, reviewed candidates) while preserving the option
to drop it without data loss, since it owns no canonical state.

**TCO Impact**:

| Dimension | Chosen: Lark Base/Wiki/Docs [Managed/Serverless, closed-source] | Alt: no integration [status quo] | FOSS Alt: self-hosted wiki [Provisioned/Self-Managed] | Delta / 12 months |
|---|---|---|---|---|
| Infra cost | $0 direct API cost; plan-dependent seat cost if collaborators need paid tiers | $0 | $5–15/mo VPS | +$0 to +$180 vs. status quo |
| Egress cost | provider-dependent, unmeasured | $0 | $0–5/mo | unmeasured |
| Token cost | $0 | $0 | $0 | $0 |
| Ops burden | Low/medium (rate-limit backoff engineering, credential management) | none | High (wiki software patching/backup) | — |
| Vendor risk | High (closed-source, per-app rate limits, no FOSS exit path for the *surface* — but zero exit risk for *data*, since Lark holds no canonical state) | none | Low | — |

**Consequences**:
- **Positive**: gives non-technical collaborators a usable view without asking them to read
  Markdown/frontmatter in Git.
- **Negative**: every Lark-facing feature carries a permanent FOSS-gate exception that must stay
  documented and bounded, not quietly expanded — e.g. accidental write-back before S9 evidence
  exists.
- **Neutral**: dropping Lark entirely remains a zero-data-loss operation at any time, because ADR-1
  already guarantees it owns no canonical state.

## Conformance Note

This revision adds Component Specifications, Integration Contracts, Quality Attributes, Deployment
Strategy, a Readiness Gap Matrix, and three embedded ADRs to close template gaps against
`prd-tad-adr-mvp-gtm-guidelines.md` v1.7.0. No VCC in this revision is marked above `spec-complete`/
`undocumented` without a newly recorded Evidence Reference; ADR-2 and S4a add a decision and a VCC
respectively but do not themselves raise any readiness rung, consistent with the Readiness Ladder's
evidence-only derivation rule. Remaining gaps after this revision are evidence gaps — named checks
not yet run — not structural gaps; they are tracked in the Readiness Gap Matrix above, and the three
`blocker`-priority rows (Binary separation, Protected delivery, Shared authorization) are the ones
that must close before any claim of `runtime-ready` on this document's Must-tier capabilities.

## Open questions

- Which shared adapter, region, retention, and deletion policy is authorized per workspace?
- Which exact candidate and live readback prove the signed media capabilities outside local-runtime fallback?
- What clean-environment save/reopen and conflict-recovery TTV is observed?
- What document/blob limits and cost ceilings are acceptable?
- Which separately approved runbook owns Worker migration and rollback?
- Which Base schema and Wiki/Docs hierarchy give enough collaboration value without duplicating the Markdown/frontmatter model?
- Which host owns Lark tokens, event verification, snapshot retention, candidate creation, and outbound idempotency?
- Which package implements the Yjs↔Durable Object provider (ADR-2), and has its license text been verified directly rather than trusted from npm metadata alone?
- What load level (concurrent rooms, updates/second) is the target for the Scalability quality-attribute validation before Durable Object free-tier ceilings are treated as sufficient?

## Planning revision — reference implementation

All five roles below consume `PLAN-AGENTIC-GRAPH-STORAGE-SYNC-PRD-TAD-ADR-MVP-GTM@5.0.1`. Existing source and runtime observations retain their original revisions and scope; this documentation update renews no deployment or demand evidence. The guideline is [v2.7.0](https://github.com/huijoohwee/huijoohwee.github.io/blob/e8d2a10a8d3e5735c43edf350a22523df05fdf91/guidelines/prd-tad-adr-mvp-gtm-guidelines.md); the shared maturity rubric loads on demand.

| Role | Owning content at this revision |
|---|---|
| PRD | [Problem and personas](agentic-graph-storage-sync-prd-tad-adr-mvp-gtm.part-01.md#problem-and-personas) |
| TAD | [Room synchronization (CRDT, design-only — ADR-2)](agentic-graph-storage-sync-prd-tad-adr-mvp-gtm.part-01.md#room-synchronization-crdt-design-only--adr-2) |
| ADR | [Architectural Decisions](agentic-graph-storage-sync-prd-tad-adr-mvp-gtm.part-01.md#architectural-decisions) |
| MVP | [MVP — reference implementation](agentic-graph-storage-sync-prd-tad-adr-mvp-gtm.part-02.md#mvp--reference-implementation) |
| GTM | [GTM — reference implementation](agentic-graph-storage-sync-prd-tad-adr-mvp-gtm.part-02.md#gtm--reference-implementation) |

## MVP — reference implementation

Reuse the minimum scope, acceptance conditions and component owners identified above. The demonstration must follow the documented entry, permitted action, durable outcome and readback, including its stated failure/recovery path. Use `npm run runtime:test` for its actual coverage and the named feature checks in the specification; attach exact source, command, result and authoring/mirror/delivery surface to each VCC before advancing readiness. A source locator or structural check alone proves no user outcome.

Record the observed steps and elapsed time against the existing TTV target. If no target or invocation is stated, the demonstration remains unverified until the document owner supplies it. All four experience criteria are **unassessed** in this authoring review: Core Requirements & Functionality, Innovation & Theme Alignment, Technical Execution & Integration, and Usefulness & Agentic Experience. No scored user observation is attached to this revision; the document owner must capture a timed pilot and criterion-specific evidence.

## GTM — reference implementation

Use the stated persona and pain hypothesis to test one priced pilot in the existing user environment. Keep the documented free/self-serve workflow as the comparison; additional hosting, channels or agent roles require an evidenced constraint or buyer need. Record the buyer’s workaround, frequency, accepted outcome, offered price, observed response and support minutes before ranking a commercial winner. Demand, collected payment and repeat use remain unvalidated by this documentation review; mechanism evidence keeps its narrower original scope. Measure tokens, cash expense and maintenance separately for each proposed deployment model. Feed actual pilot outcomes into a successor Context using the shared four-column planning record.

## Planning gaps — reference implementation

Source review is bounded to repository `7fb85741121d8c2886027e4a630d013ba91c1027`. Confirmed: these referenced artifacts exist at that revision: [`canvas/src/lib/storage/agentic-graph-storage-sync-contract.ts`](https://github.com/huijoohwee/agentic-graph/blob/7fb85741121d8c2886027e4a630d013ba91c1027/canvas/src/lib/storage/agentic-graph-storage-sync-contract.ts), [`canvas/src/lib/storage/agentic-graph-storage-route-paths.ts`](https://github.com/huijoohwee/agentic-graph/blob/7fb85741121d8c2886027e4a630d013ba91c1027/canvas/src/lib/storage/agentic-graph-storage-route-paths.ts), [`cloudflare/workers/agentic-graph-storage/index.ts`](https://github.com/huijoohwee/agentic-graph/blob/7fb85741121d8c2886027e4a630d013ba91c1027/cloudflare/workers/agentic-graph-storage/index.ts). Their existence does not confirm every behavior asserted by the specification.
Experience observations, current VCC execution and buyer/payment evidence are unverified here. This is a bounded planning update, not a full-guideline conformance verdict; historical conformance percentages above apply only to their recorded profile and revision.
