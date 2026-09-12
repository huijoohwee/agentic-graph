---
title: "Reference implementation: agentic-graph-strytree-prd-tad-adr-mvp-gtm-workflows-api section 2"
doc_type: "PRD-TAD-ADR-MVP-GTM"
version: "0.2.3"
date: "2026-09-12"
lang: "en-US"
owner: "Product maintainers"
continuity_id: "PLAN-AGENTIC-GRAPH-STRYTREE-PRD-TAD-ADR-MVP-GTM"
prd_revision: "0.2.3"
tad_revision: "0.2.3"
adr_revision: "0.2.3"
mvp_revision: "0.2.3"
gtm_revision: "0.2.3"
local_rung: "undocumented"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
worktree_id: "device-cba000d3779d--planning-v27"
agent_id: "codex-01a0940a"
parent: "agentic-graph-strytree-prd-tad-adr-mvp-gtm-workflows-api.md"
guideline_revision: "2.7.0"
source_section_lines: "478-576"
---

[Combined planning owner](agentic-graph-strytree-prd-tad-adr-mvp-gtm-workflows-api.md) · `PLAN-AGENTIC-GRAPH-STRYTREE-PRD-TAD-ADR-MVP-GTM@0.2.3`. This companion preserves the source section; diagrams and frontmatter projections remain owned by the combined artifact.

### POST `/api/strytree/checkout/sessions/:sessionId/complete`

Purpose: explicit local-development fixture settlement through the same authoritative actor and audit-finalization owner as signed webhook settlement. Production browser completion is disabled.

Request:

```json
{
  "idempotency_key": "uuid"
}
```

Response:

```json
{
  "payment_session_id": "strypay_123",
  "status": "completed",
  "package_id": "credits_100",
  "credit_amount": 100,
  "ledger_event_id": "ledger_purchase_123",
  "balance_after_credits": 140,
  "idempotent_replay": false
}
```

### POST `/api/strytree/checkout/webhook`

Purpose: signed settlement validation verifies the raw payload, recognized success type, paid status, amount, currency, package, actor, and provider session before the common settlement owner applies credit. Credit can be committed before audit/session finalization; retries recover that credit. Native fixtures do not establish live provider collection.

Headers:

```http
strytree-signature: t=unix_seconds,v1=hmac_sha256
```

Request:

```json
{
  "id": "evt_provider_123",
  "type": "checkout.session.completed",
  "data": {
    "object": {
      "id": "provider_session_id",
      "payment_status": "paid",
      "amount_total": 1800,
      "currency": "usd",
      "metadata": {
        "strytree_payment_session_id": "strypay_123",
        "package_id": "credits_100",
        "user_id": "user_001"
      }
    }
  }
}
```

Response:

```json
{
  "received": true,
  "provider_event_id": "evt_provider_123",
  "payment_session_id": "strypay_123",
  "status": "completed",
  "ledger_event_id": "ledger_purchase_123",
  "balance_after_credits": 140,
  "idempotent_replay": false
}
```

### GET `/api/strytree/wallet`

Purpose: server-owned wallet read model. The route returns committed ledger balance plus pending checkout sessions that have not yet been settled by the signed webhook or local completion fixture.

Response:

```json
{
  "wallet_status": "pending_payment",
  "balance_credits": 40,
  "pending_payment": true,
  "pending_credit_amount": 100,
  "pending_payment_sessions": [
    {
      "payment_session_id": "strypay_123",
      "checkout_session_id": "provider_session_id",
      "status": "open",
      "package_id": "credits_100",
      "credit_amount": 100
    }
  ]
}
```

## Planning continuity — reference implementation

This size/ownership companion consumes `PLAN-AGENTIC-GRAPH-STRYTREE-PRD-TAD-ADR-MVP-GTM@0.2.3` with [the five-role owner](agentic-graph-strytree-prd-tad-adr-mvp-gtm.md#planning-revision--reference-implementation). Requirements, architecture and decisions remain in their linked owners; MVP and GTM consume them. Historical source checks retain their recorded revision, environment and coverage; this documentation revision renews no readiness, experience rating or paid-demand evidence.
