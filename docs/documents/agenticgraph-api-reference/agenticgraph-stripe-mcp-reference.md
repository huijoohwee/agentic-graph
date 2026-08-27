---
title: "Reference implementation: AgenticGraph - Stripe MCP Reference"
id: "md:agenticgraph-stripe-mcp-reference"
doc_type: "Reference"
version: "0.2.0"
date: "2026-07-30"
lang: "en-US"
owner: "docs.api-reference.stripe-mcp"
local_rung: "undocumented"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
guideline_version: "1.7.0"
doc_path: "docs/documents/agenticgraph-api-reference/agenticgraph-stripe-mcp-reference.md"
ssot_upstream: "https://docs.stripe.com/mcp"
ssot_captured: "2026-07-28"
upstream_release_phase: "public preview"
remote_transport_url: "https://mcp.stripe.com"
local_transport_package: "@stripe/mcp@latest"
attribution: "Summarized and paraphrased from Stripe MCP documentation. Content was rephrased for compliance with licensing restrictions."
consumers:
  - "docs/documents/agenticgraph-payments-prd-tad.md"
  - "docs/documents/agenticgraph-mcp/agenticgraph-stripe-mcp-service.md"
  - ".kiro/specs/agenticgraph-payments/requirements.md"
acos_invocation:
  commands: ["/payment.intent.create", "/payment.refund"]
  bindings: ["@payment-provider"]
  tags: ["#payment-idempotency", "#approval-gate"]
  owner: "agentic-canvas-os/docs/MCP-GATEWAY.md"
ownership_boundary: "Upstream capture only. AgenticGraph readiness, secret custody, and MainPanel wiring remain owned by docs/documents/agenticgraph-mcp/agenticgraph-stripe-mcp-service.md."
tags:
  - "stripe"
  - "mcp"
  - "payments"
  - "agent-platform-readiness"
---

# Reference implementation: AgenticGraph - Stripe MCP Reference

**Upstream SSOT**: [Stripe Model Context Protocol](https://docs.stripe.com/mcp), captured 2026-07-28.
**Release phase**: public preview ([Stripe release phases](https://docs.stripe.com/release-phases)).

Content was rephrased for compliance with licensing restrictions. Every row carries the
upstream anchor it derives from. Anything absent upstream is recorded as `not documented
upstream` rather than inferred.

## Ownership Boundary

| Concern | Owner |
|---|---|
| Upstream MCP capability capture (this file) | `docs/documents/agenticgraph-api-reference/agenticgraph-stripe-mcp-reference.md` |
| AgenticGraph MCP readiness, secret custody, MainPanel wiring | `docs/documents/agenticgraph-mcp/agenticgraph-stripe-mcp-service.md` |
| Payment rail architecture and harness contracts | `docs/documents/agenticgraph-payments-prd-tad.md` |
| Invocation surface and gateway federation contract | `agentic-canvas-os/docs/MCP-GATEWAY.md` |
| Normative acceptance criteria | `.kiro/specs/agenticgraph-payments/requirements.md` |

This file introduces no transport tier. It documents one external transport that the existing
AgenticGraph MCP federation may register.

## Transport

| Key | Value | Source |
|---|---|---|
| Remote transport URL | `https://mcp.stripe.com` | [Stripe MCP](https://docs.stripe.com/mcp) |
| Client config shape | An `mcpServers.stripe.url` entry in the host's MCP config file | [Stripe MCP](https://docs.stripe.com/mcp) |
| Connected-account header | `Stripe-Account: acct_...` alongside the bearer credential | [Stripe MCP](https://docs.stripe.com/mcp) |
| Connected-account credential | A restricted access key (`rk_...`) with the required Connect permissions; OAuth is not available for this path | [Stripe MCP](https://docs.stripe.com/mcp), [Restricted API keys](https://docs.stripe.com/keys/restricted-api-keys) |
| Session management | MCP client sessions are managed from Dashboard settings after install | [Stripe MCP](https://docs.stripe.com/mcp) |
| Local transport | `@stripe/mcp@latest`, per the existing AgenticGraph service doc | `docs/documents/agenticgraph-mcp/agenticgraph-stripe-mcp-service.md` |

Remote registration in connected-account form (placeholder values):

```json
{
  "mcpServers": {
    "stripe": {
      "url": "https://mcp.stripe.com",
      "headers": {
        "Authorization": "Bearer rk_...",
        "Stripe-Account": "acct_..."
      }
    }
  }
}
```

## Tool Surface

Upstream groups the exposed tools as below. `Mutating` marks tools that can change Stripe state
or move money; those are the tools AgenticGraph keeps behind the existing approval gate with human
confirmation.

| Group | Tool | Purpose (paraphrased) | Mutating |
|---|---|---|---|
| API | `stripe_api_search` | Keyword lookup over Stripe API methods | No |
| API | `stripe_api_details` | Parameter detail for one named API method | No |
| API | `stripe_api_read` | Issue any Stripe API `GET` | No |
| API | `stripe_api_write` | Issue any Stripe API `POST`, `PATCH`, `PUT`, `DELETE` | Yes |
| Account | `get_stripe_account_info` | Retrieve the account object | No |
| Refund | `create_refund` | Create a refund | Yes |
| Treasury (public preview) | `get_balance_summary` | Interactive balance view across the Stripe balance and Treasury accounts | No |
| Other | `search_stripe_resources` | Search Stripe resources | No |
| Other | `fetch_stripe_resources` | Fetch one Stripe object | No |
| Other | `search_stripe_documentation` | Search Stripe documentation by question and language | No |
| Other | `stripe_implementation_planner` | Guided walkthrough of Stripe products for an integration goal | No |
| Other | `send_stripe_mcp_feedback` | Submit feedback about the MCP server tools | No |
| Other | `stripe_report` | Search, retrieve, and create reports and report runs | Yes |

Source for the table: [Stripe MCP](https://docs.stripe.com/mcp).

Upstream notes that the read and write tools intentionally expose a broad slice of the API
through two tools so the host's context window does not carry one tool definition per endpoint.
That design choice is why AgenticGraph treats `stripe_api_write` as the highest-risk registered
tool rather than treating tool count as the risk signal.

## Upstream Safety Guidance (binding for AgenticGraph)

| Guidance | AgenticGraph position |
|---|---|
| Enable human confirmation of tools | Binding. Every `Mutating` tool above is registered as confirmation-required. |
| Exercise caution when combining this server with other servers, given prompt-injection exposure | Binding. Payment-mutating tools stay behind the approval gate; discovery tools federate freely. |
| Treasury tools that move money, pay bills, and manage cards are an opt-in extension requiring an access request | Excluded from AgenticGraph scope this increment. |

Guidance source: [Stripe MCP](https://docs.stripe.com/mcp).

## Cost Posture

| Path | Model calls | Recorded cost |
|---|---|---|
| Transport registration and tool discovery | 0 | `0.00` |
| Tool execution by an external agent host | Host-side, not billed to AgenticGraph | Logged per call by the Cost_Observer wherever AgenticGraph mediates the call |

Discovery of this transport must not invoke a paid model. Execution routes through the existing
spend gate.

## Known Gaps

1. Upstream marks the server as public preview, so tool names and groupings can change without a
   AgenticGraph-visible version pin. Re-capture before depending on any single tool name.
2. No per-tool rate limit is documented on this page. `not documented upstream`.
3. No MCP-specific idempotency contract is documented; the underlying API idempotency rules
   apply instead ([Idempotent requests](https://docs.stripe.com/api/idempotent_requests)).
4. No StraitsX equivalent MCP surface is documented. See `agenticgraph-straitsx-api-reference.md`.

## References

- [Stripe Model Context Protocol](https://docs.stripe.com/mcp)
- [Stripe restricted API keys](https://docs.stripe.com/keys/restricted-api-keys)
- [Stripe release phases](https://docs.stripe.com/release-phases)
- [MCP tools concept](https://modelcontextprotocol.io/docs/concepts/tools)
