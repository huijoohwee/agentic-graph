---
title: "SME Care-Agent — Readiness, Validation, and Traceability Companion"
doc_type: "PRD/TAD Companion"
version: "0.1.0"
date: "2026-09-05"
lang: "en-SG"
frontmatter_contract: "required"
owner: "SME care-agent readiness evidence"
local_rung: "dev-proven"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
worktree_id: "huis-macbook-pro-3.local--agent-graph-native-identity"
agent_id: "codex:graph_frontmatter_and_docs"
doc_path: "docs/documents/sme-care-agent-readiness-validation-companion.md"
parent: "docs/documents/sme-care-agent-prd-tad.md"
parent_version: "0.2.0"
guidelines_ref: "huijoohwee.github.io/guidelines/prd-tad-adr-guidelines.md@2.4.0"
production_release_authorized: false
evidence_references:
  - check: "npm run ci:integration"
    result: "passed: affected integration gate including repository runtime tests"
    surface: "authoring"
    observed_at: "2026-09-05"
---

# SME Care-Agent — Readiness, Validation, and Traceability Companion

## Authority

The parent combined PRD/TAD owns the product requirements, architecture, and decisions. This
companion owns their local readiness evidence, validation checklist, traceability, and role mapping.
It introduces no separate product, runtime, store, deployment, or delivery claim.

## Agent-Platform Readiness

This increment is **dev-proven locally**: Agentic OS and AI Agent discovery, local MCP federation, bounded probe-tree intake, deterministic risk orchestration, single-use marketplace approval, and Canvas projection are verified with zero paid calls. A deployed runtime, real broker/insurer integration, and regulated actions remain explicitly out of scope.

### Agentic OS: SME Care-Agent

**Tool surface**: a single combined `sme_care_agent_status` tool with a typed `view` argument (documented choice; avoids a separate tool per view)
**Read views**: `capabilities | cost_summary | gate_catalog | circuit_breakers`
**Aggregation rule**: read-time only over existing harness/cost-ledger state; zero new persistent datastore
**Token budget**: 0 prompt + 0 completion = $0.00/call
**Partial failure**: `unavailableSources[]` surfaced explicitly; call still succeeds

> **VCC**: `Verify the status view's response shape matches schema and a before/after snapshot diff of every read harness-state source is empty.`

### AI Agent-Ready

Discovery chain reuses the existing agentic-graph MCP discovery metadata; the Probe-Tree, Trigger Engine, and (gated) Marketplace Matcher tools are each discoverable with zero token spend before any optional model call executes.

### MCP Gateway-Ready

No new proxy tier. Existing local-host and control-plane transports already used by the care-agent demo are federated for the risk-copilot tools under the same capabilities-union rule (dedup by tool id/name).

### Readiness Gap Matrix

| Workstream | Current state | Gap | Priority | Exit criteria (VCC) |
|---|---|---|---|---|
| OS Status Surface (local) | Implemented and focused-tested | None | P0 | `sme_care_agent_status` returns typed, read-only, exact-zero-cost views |
| Gateway discovery | Implemented through local stdio MCP | None | P1 | Discovery and the full source → trigger → nudge → matcher → status path pass with zero spend |
| Spend safety (approval tokens for Broker Copilot / Matcher) | Implemented for marketplace matching | Outbound send remains deliberately unavailable | P1 | Missing, expired, mismatched, forged, or reused marketplace approval fails closed |
| Live orchestration proof | Implemented as a bounded Dev-local MCP path | No deployed run manifest is claimed | P1 | VCC: Given a clean Dev checkout, when `npm run sme-risk-copilot:check` runs, then all local stages pass at $0 with no quote, bind, contact, Prod, or Cloudflare mutation |
| Operator UI projection | Implemented through the shared Canvas projection | Dedicated dashboard intentionally out of scope | P2 | Storyboard evidence renders through the shared Canvas owner with no renderer fork |

---
## Validation Checklist (applied)

- [x] User journey mapped before stories written; every story anchored to a journey stage.
- [x] Every acceptance criterion translated to a VCC with end state, stated check, and constraint.
- [x] Features prioritized via MoSCoW with ROI rationale per feature.
- [x] Min-viable scope explicitly stated for Must-tier features.
- [x] Token budget estimated for every AI-powered pipeline.
- [x] Monthly TCO estimated; FOSS-first decisions recorded in ADR-1/2/3.
- [x] Deployment-model variants separated in ADR-2 and ADR-3 TCO tables.
- [x] Time-to-value estimated in Phase 0 and recorded as a PRD success metric.
- [x] Orchestration/Harness Flow documented for all four AI-powered pipelines with dispatcher/executor/observer/consumer roles and cost log fields.
- [x] Every agentic loop (Probe-Tree Intake) carries a max-iteration bound and circuit-breaker condition.
- [x] Topology documented with all connection types labelled and data residency stated per storage node.
- [x] Every AI component has a harness contract: typed input/output schema, cost log fields, fallback path.
- [x] PRD-to-TAD traceability established (Epic ↔ Component below).
- [x] No implementation detail in Part I (PRD); no business/domain logic in Part II (TAD) beyond what's needed to specify structure.
- [x] Agent-platform readiness documented with tier (Must/Follow-on) and readiness gap matrix.
- [x] Gateway federation compared against the unified-proxy alternative implicitly by reuse (no new proxy introduced; ADR not required since no candidate proxy was considered).

### Traceability

```
PRD-EpicA-SourceIntake       ↔ TAD-SourceNormalizer-Interface
PRD-EpicB-ProbeTree          ↔ TAD-ProbeTreeHarness-Interface
PRD-EpicC-TriggerEngine      ↔ TAD-TriggerEngineHarness-Interface
PRD-EpicD-BrokerCopilot      ↔ TAD-BrokerCopilotHarness-Interface
PRD-EpicE-MarketplaceMatcher ↔ TAD-MarketplaceMatcherHarness-Interface
PRD-EpicF-Multilingual       ↔ TAD-MultilingualAdapter-Interface
```

---

## Role—Action—Outcome

**Solo Founder / AI Orchestrator** *(collapses all roles for this build)* → validates ROI before writing this document, applies min-viable-max-value to the MoSCoW above, designs the four harness contracts, sets token budgets per pipeline, maintains FOSS-first ADRs, tracks TCO actuals each sprint → ships an SME risk copilot at near-zero infrastructure cost with every AI pipeline observable and cost-bounded.

**Licensed Broker** *(external stakeholder, not a document author)* → reviews the broker-handoff packet format, confirms it is usable without re-running discovery → validates that Epic E's output genuinely accelerates a real quote, without the copilot ever acting as an unlicensed intermediary.

---

## Mantra Application

**"CID frames PRD/TAD standards · Flow patterns anchor stories to reality · Agent-platform readiness sequences Must before Follow-on · RAO aligns team responsibilities · SVO clarifies requirement semantics · VCC closes the loop from criterion to verified implementation"**

Applied here: the Scope & Neutrality Contract and CID-style acceptance criteria frame this document; the five flow patterns (journey, workflow, data, orchestration/harness, topology) trace every epic from the SME owner's growth-stage trigger to a rendered REG edge; Agentic OS/AI Agent readiness, spend safety, bounded Dev-local orchestration proof, and shared Canvas projection are verified through the aggregate VCC, while deployed and regulated actions remain deliberately gated; the Role—Action—Outcome table keeps the solo-dev accountability explicit even with one person in every role; every acceptance criterion above is written so its VCC translation is directly evaluable from the harness's own surfaced output — not a narrative claim of completeness.
