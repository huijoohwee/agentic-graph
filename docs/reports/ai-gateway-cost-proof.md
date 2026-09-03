---
title: "AI Gateway Cost Proof"
doc_type: "Analytics Proof"
status: "active"
date: "2026-07-11"
authors:
  - "airvio"
schema: "agentic-os-computing-flow/v1"
lang: "en-US"
frontmatter_contract: "required"
tags:
  - "cloudflare"
  - "ai-gateway"
  - "tco"
  - "observability"
  - "analytics"
---

# AI Gateway Cost Proof

This is the canonical, source-owned observability artifact for Cloudflare AI Gateway metrics. It fulfills the "Turn analytics into proof" goal (Step 4 of the AI Gateway Enhancement Plan) without touching core application logic.

## Purpose

Instead of keeping observability isolated in vendor dashboards, this document materializes key token, cost, and cache-hit metrics into the repository's single source of truth (SSOT). This ensures that architectural decisions are driven by provable token economics.

## Current Metrics (Snapshot)

- **Total Requests by Intent:** TBD (Pending live activation)
- **Total Tokens by Intent:** TBD (Pending live activation)
- **Cost by Provider/Model:** TBD (Pending live activation)
- **Cache-Hit Rate (Stable Context Lanes):** TBD (Pending live activation)
- **Error Rate (Dynamic-Route Fallbacks):** TBD (Pending live activation)

*Note: Since the live AI Gateway transport check was intentionally skipped (deferred secret rollout), these metrics will be populated in subsequent releases once live traffic begins routing through the authenticated `joohwee` Pages project.*

## Next Steps

1. Add the `AGENTIC_OS_CHAT_PROXY_AI_GATEWAY_TOKEN` secret to Cloudflare Pages.
2. Unskip the live readiness checks.
3. Observe live traffic and record the baseline token economics here.
