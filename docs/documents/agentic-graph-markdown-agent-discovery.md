---
title: "agentic-graph Markdown Agent Discovery"
doc_type: "Agent Discovery Contract"
date: "2026-07-11"
lang: "en-US"
status: "implemented"
source_of_truth:
  - "cloudflare/pages/agentic-graph-agent-ready.mjs"
  - "cloudflare/workers/agentic-graph-storage/db.ts"
publish_policy: "Dev -> generated Prod mirror -> operator-authorized Cloudflare deploy"
---

# agentic-graph Markdown Agent Discovery

Airvio exposes a progressive-disclosure path that costs no model tokens before document retrieval:

1. `/llms.txt` routes agents to products and machine interfaces.
2. `/agentic-graph/llms.txt` describes the agentic-graph application surface.
3. `/api/storage/llms.txt` lists non-empty published Markdown documents.
4. `/api/storage/content-manifest.json` maps every source path to canonical HTML and Markdown URLs.
5. Individual `/api/storage/doc*` routes return `text/markdown`.

The shared agent-ready Pages owner generates the domain index, sitemap, headers, OpenAPI, agent card, and MCP card. The D1 crawler query excludes zero-length editor placeholders without deleting or rewriting their storage rows.

The manifest contains metadata and links, never duplicated document bodies. Editor Workspace Markdown remains the content SSOT; HTML pages and agent-readable Markdown URLs are projections of the same D1-backed document revision and content hash.

Legacy `/agentic-graph/openapi.json` and `/agentic-graph/api-catalog.json` requests use permanent redirects to their canonical well-known resources. They must never return the SPA HTML fallback with HTTP 200.

## Validation

```bash
npm --prefix canvas run test:ci:unit -- agentReady.httpMcpParity.commerceDiscovery
npm --prefix canvas run test:ci:unit -- storage.worker.defaultLlmsSourceFilesEntrypoint
npm run pages:check-sync
```
