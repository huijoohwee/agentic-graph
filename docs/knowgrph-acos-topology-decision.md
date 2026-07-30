---
title: "Reference implementation: Superseded Multi-Provider Topology Decision"
doc_type: "Architecture Decision Record Archive"
version: "2.0.0"
date: "2026-07-30"
lang: "en-US"
guideline_version: "1.7.0"
owner: "architecture.history.topology"
local_rung: "undocumented"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
document_lifecycle: "superseded"
superseded_by:
  - "docs/documents/knowgrph-architecture-decisions.md#adr-002--reference-implementation-compose-one-client-before-adding-service-tiers"
  - "docs/documents/knowgrph-architecture-decisions.md#adr-003--reference-implementation-separate-discovery-local-embedded-and-control-transports"
  - "docs/documents/knowgrph-architecture-decisions.md#adr-006--reference-implementation-protect-exact-state-promotion"
---

# Reference implementation: Superseded Multi-Provider Topology Decision

**Decision lifecycle**: Superseded
**Original decision family**: product frontend, edge control plane, and fallback agent API
**Superseded on**: 2026-07-30

## Context

The earlier record attempted to satisfy a multi-provider stack mandate by assigning the product
frontend, remote control plane, and fallback agent execution to separate provider tiers. It also
mixed source topology with deployment instructions and described source trees that no longer exist.

## Original decision

The archived design selected:

1. a Vercel-hosted product tier;
2. a Cloudflare-hosted control plane;
3. an AWS Agent API / AgentCore fallback tier; and
4. direct promotion guidance spanning those providers.

The rationale was provider redundancy and conformance with the then-current stack mandate.

## Why it was superseded

Repository inspection found no current Vercel product tier or AWS Agent API / AgentCore source
owner. The actual application is one client composition with separate local, public-read,
browser-local, and control-plane transports. The protected production workflow publishes the
Pages/documentation candidate and does not deploy the separate storage, payment, or MCP Workers.

Keeping the old topology active would therefore create nonexistent owners, ambiguous delivery
authority, and recurring multi-provider audit cost.

## Alternatives and TCO

| Alternative | Infra/month | 12-month cash | Ops burden | Disposition |
|---|---:|---:|---|---|
| Archived three-provider topology | unbounded until provisioned | unbounded | high; three release/secret surfaces | superseded |
| Current local-first client + separated transports | $0–25 estimate | $0–300 estimate | medium | accepted in the active ADR set |
| FOSS self-hosted consolidated runtime | $20–100 estimate | $240–1,200 estimate | high | portability fallback |

## Consequences

- Historical rationale remains inspectable without retaining executable stale instructions.
- This file grants no deploy, publication, secret, or provider mutation authority.
- Current architecture, lane boundaries, rollback, and evidence requirements are owned only by the
  active PRD/TAD/ADR set and protected release runbook.

## Archive note

Git history retains the full pre-supersession prose. This compact record preserves its
Context/Decision/Rationale lineage while removing commands and endpoints that could be mistaken for
current operator instructions.
