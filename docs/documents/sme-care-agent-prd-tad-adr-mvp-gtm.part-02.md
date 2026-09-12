---
title: "Reference implementation: sme-care-agent-prd-tad-adr-mvp-gtm section 2"
doc_type: "PRD-TAD-ADR-MVP-GTM"
version: "0.2.1"
date: "2026-09-12"
lang: "en-US"
owner: "SME care-agent product and architecture"
continuity_id: "PLAN-SME-CARE-AGENT-PRD-TAD-ADR-MVP-GTM"
prd_revision: "0.2.1"
tad_revision: "0.2.1"
adr_revision: "0.2.1"
mvp_revision: "0.2.1"
gtm_revision: "0.2.1"
local_rung: "dev-proven"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
worktree_id: "device-cba000d3779d--planning-v27"
agent_id: "codex-01a0940a"
parent: "sme-care-agent-prd-tad-adr-mvp-gtm.md"
guideline_revision: "2.7.0"
source_section_lines: "473-588"
---

[Combined planning owner](sme-care-agent-prd-tad-adr-mvp-gtm.md) · `PLAN-SME-CARE-AGENT-PRD-TAD-ADR-MVP-GTM@0.2.1`. This companion preserves the source section; diagrams and frontmatter projections remain owned by the combined artifact.

### TCO Impact

| Dimension | Chosen Option [Provisioned/Self-Managed, Hybrid/Consolidated] | Best Alternative [Managed/Serverless regional API] | Delta / 12 months |
|---|---|---|---|
| Infra cost | $0/mo incremental (shares existing Oracle ARM host) | $0/mo base + per-call fee | Potentially +$/mo at scale for Managed |
| Egress cost | $0/mo | Non-zero (API egress) | + for Managed |
| Token cost | $0/mo | Non-zero per call | + for Managed |
| Ops burden | Medium (shared host capacity planning, especially given the June 2026 Ampere A1 allocation reduction flagged elsewhere) | Low | − for self-managed |
| Vendor risk | Low (open model, swappable) | Medium (API-dependent) | — |

### Consequences
- **Positive**: zero incremental token/egress cost; consistent with existing FOSS-first, zero-TCO posture.
- **Negative**: shared-host capacity planning is now a real constraint given the flagged Oracle allocation reduction — this ADR's exit criterion should be re-evaluated if that audit shows insufficient headroom.
- **Neutral**: a managed-API fallback remains available as a Follow-on if self-hosted quality is insufficient for `zh`/`id`.

---

## ADR-3: Coverage Catalog Source — Open/Mock Catalog vs Live Insurer API

**Status**: Accepted
**Date**: 2026-07-14

### Context
The Marketplace Matcher needs a coverage-category catalog to rank candidates against a flagged gap. A live insurer/broker API would give real product data but crosses into licensed-intermediary territory in SG/MY/ID/China; an open or mock catalog avoids that boundary for this increment.

### Decision
Seed the Marketplace Matcher with an open or operator-curated **mock coverage-category catalog** (category-level only — e.g. "cyber liability," "public liability" — never a specific insurer product or premium) for this increment. Live insurer/broker API integration is explicitly Follow-on and gated on a licensed-broker partnership.

### Alternatives Considered
1. **Live insurer/broker API (Managed/Serverless)**: Pros — real, actionable product data. Cons — regulated-activity risk (recommending specific insurance products may require a licensed-intermediary status in SG/MY/ID and especially China); non-zero integration cost; out of reach for a hackathon-scoped build.
2. **FOSS alternative — open/mock category catalog (self-managed, in-repo)**: Pros — zero licensing risk, zero egress cost, sufficient to demonstrate the gap-to-category mapping value proposition. Cons — not directly bindable; still requires a licensed broker for the next step.

### Rationale
Keeping the matcher at category-level output (not specific products, premiums, or insurers) preserves the "informational aid, not licensed advice" boundary stated in the safety policy, while still delivering the core "guide them to the right protection" value proposition from the problem statement.

### TCO Impact

| Dimension | Chosen Option [self-managed, mock catalog] | Best Alternative [Managed/Serverless live insurer API] | Delta / 12 months |
|---|---|---|---|
| Infra cost | $0/mo | Integration + subscription fee (varies) | + for live API |
| Egress cost | $0/mo | Non-zero | + for live API |
| Token cost | ~$0–1/mo | ~$0–1/mo (similar ranking calls) | ~$0 |
| Ops burden | Low (static catalog maintenance) | High (compliance review, licensing) | + for live API |
| Vendor risk | Low | Medium–High (regulatory dependency) | — |

### Consequences
- **Positive**: ships inside the hackathon/pilot window with no licensing blocker.
- **Negative**: output is directional, not a bindable quote — must be clearly labeled as such to avoid misleading the SME owner.
- **Neutral**: this ADR should be revisited once a licensed-broker partnership exists, per the Follow-on track below.

### Quality Attributes

| Attribute       | Scenario                                      | Pattern                   | Validation              |
|-----------------|-----------------------------------------------|---------------------------|-------------------------|
| Performance     | 100 concurrent intakes → probe response < 2s   | Local model, small context window | Load test on local runtime |
| Scalability     | Pilot 20 SMEs → 500 SMEs without re-architecture | Stateless harnesses, git-backed REG store | Capacity review at 500-SME mark |
| Security        | Redacted profile must never leak a registry ID or credential downstream | `SourceNormalizer` reject-pattern gate | Adversarial test inputs with embedded IDs |
| Observability   | Every AI call must be traceable to a cost log entry | Cost Ledger append-only log | Cost log completeness audit |
| Token Cost      | 100 intakes/mo → ≤ $5/mo total token spend      | Local model + token budget ceilings per harness | Cost log sampling; alert on p95 overrun |
| TCO             | 12-month projected spend ≤ existing $1.20/day agentic-graph envelope | FOSS-first + zero-egress; self-managed vs managed compared per ADR-2 | Monthly cost audit; ADR review |

### Deployment Strategy

Local-first rollout: ship to the existing agentic-graph clean-canvas demo mode first (`VITE_AGENTIC_OS_RUN_READY_DEMO=risk-copilot`), validate on a clean environment, then promote read-only Canvas projection to a shared environment only after `/validation.run` passes. Rollback is a git revert of the frontmatter-owned REG and probe-tree data directories — no database migration risk since state is file-backed.

### Architecture Diagrams

See Topology diagram above (`flowchart TB`) and per-pipeline flow tables under Orchestration/Harness Flows.

### Component Inventory

| Layer | Component | File / Module | Status |
|-------|-----------|---------------|--------|
| Source | `SourceNormalizer` | `agentic-graph/mcp/source-normalize.js` (reference path) | Planned |
| Intake | `ProbeTreeHarness` | `agentic-graph/mcp/probe-tree-runtime.js` | Reused (existing) |
| Store | `REGStore` | `agentic-graph/canvas/schema/agentic-os-computing-flow` | Reused (existing) |
| Trigger | `TriggerEngineHarness` | `agentic-graph/mcp/trigger-engine.js` (reference path) | Planned |
| Copilot | `BrokerCopilotHarness` | `agentic-graph/mcp/broker-copilot.js` (reference path) | Planned (Should-tier) |
| Matcher | `MarketplaceMatcherHarness` | `agentic-graph/mcp/marketplace-matcher.js` (reference path) | Planned (Could-tier, gated) |
| Adapter | `MultilingualAdapter` | `agentic-graph/mcp/multilingual-adapter.js` (reference path) | Planned |
| Canvas | `CanvasProjector` | `agentic-graph/canvas/src/features/agent-ready` | Reused (existing) |

---

## Agent-Platform Readiness, Validation, and Traceability

The local readiness evidence, gap matrix, validation checklist, PRD-to-TAD traceability,
Role—Action—Outcome mapping, and mantra remain part of this contract in the linked
[SME Care-Agent Readiness, Validation, and Traceability Companion](sme-care-agent-readiness-validation-companion.md).

## Planning revision — reference implementation

All five roles below consume `PLAN-SME-CARE-AGENT-PRD-TAD-ADR-MVP-GTM@0.2.1`. Existing source and runtime observations retain their original revisions and scope; this documentation update renews no deployment or demand evidence. The guideline is [v2.7.0](https://github.com/huijoohwee/huijoohwee.github.io/blob/e8d2a10a8d3e5735c43edf350a22523df05fdf91/guidelines/prd-tad-adr-mvp-gtm-guidelines.md); the shared maturity rubric loads on demand.

| Role | Owning content at this revision |
|---|---|
| PRD | [Part I — Product Requirements (PRD)](sme-care-agent-prd-tad-adr-mvp-gtm.part-01.md#part-i--product-requirements-prd) |
| TAD | [Part II — Technical Architecture (TAD)](sme-care-agent-prd-tad-adr-mvp-gtm.part-01.md#part-ii--technical-architecture-tad) |
| ADR | [Architectural Decisions](sme-care-agent-prd-tad-adr-mvp-gtm.part-01.md#architectural-decisions) |
| MVP | [MVP — reference implementation](sme-care-agent-prd-tad-adr-mvp-gtm.part-02.md#mvp--reference-implementation) |
| GTM | [GTM — reference implementation](sme-care-agent-prd-tad-adr-mvp-gtm.part-02.md#gtm--reference-implementation) |

## MVP — reference implementation

Reuse the minimum scope, acceptance conditions and component owners identified above. The demonstration must follow the documented entry, permitted action, durable outcome and readback, including its stated failure/recovery path. Use `npm run sme-risk-copilot:check` for its actual coverage and the named feature checks in the specification; attach exact source, command, result and authoring/mirror/delivery surface to each VCC before advancing readiness. A source locator or structural check alone proves no user outcome.

Record the observed steps and elapsed time against the existing TTV target. If no target or invocation is stated, the demonstration remains unverified until the document owner supplies it. All four experience criteria are **unassessed** in this authoring review: Core Requirements & Functionality, Innovation & Theme Alignment, Technical Execution & Integration, and Usefulness & Agentic Experience. No scored user observation is attached to this revision; the document owner must capture a timed pilot and criterion-specific evidence.

## GTM — reference implementation

Use the stated persona and pain hypothesis to test one priced pilot in the existing user environment. Keep the documented free/self-serve workflow as the comparison; additional hosting, channels or agent roles require an evidenced constraint or buyer need. Record the buyer’s workaround, frequency, accepted outcome, offered price, observed response and support minutes before ranking a commercial winner. Demand, collected payment and repeat use remain unvalidated by this documentation review; mechanism evidence keeps its narrower original scope. Measure tokens, cash expense and maintenance separately for each proposed deployment model. Feed actual pilot outcomes into a successor Context using the shared four-column planning record.

## Planning gaps — reference implementation

Source review is bounded to repository `7fb85741121d8c2886027e4a630d013ba91c1027`. Confirmed: these referenced artifacts exist at that revision: [`mcp/probe-tree-runtime.js`](https://github.com/huijoohwee/agentic-graph/blob/7fb85741121d8c2886027e4a630d013ba91c1027/mcp/probe-tree-runtime.js). Their existence does not confirm every behavior asserted by the specification.
Experience observations, current VCC execution and buyer/payment evidence are unverified here. This is a bounded planning update, not a full-guideline conformance verdict; historical conformance percentages above apply only to their recorded profile and revision.
