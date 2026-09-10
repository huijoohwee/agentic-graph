---
title: "Core production discovery and storage release"
doc_type: "Runtime Contract"
status: "active"
version: "1.0.0"
date: "2026-09-10"
owner: "agentic-graph"
frontmatter_contract: "required"
---

# Core production discovery and storage release

The protected release transfers every static discovery file produced by
`buildAgentReadyStaticFiles`, alongside the application and runtime markers.
`production-mirror-artifact-entries.mjs` owns the common staging and reconciliation
list. An unrelated file in `.well-known` remains owned by the mirror and is preserved.

Pages MCP document operations use the existing `agentic-storage` Worker through
`storage.airvio.co`. Cloudflare permits same-zone fetches through a Worker custom
domain; a route alone cannot serve that connection. The core preflight uses the
provider's read-only domain changeset, checks the service and zone, and rejects
DNS conflicts, domain replacement, or removal of other domains. The protected
release adds a missing domain after Worker activation with takeover overrides
disabled, reads back ownership, and verifies the actual storage origin.

The release receipt records whether the domain existed or was created. Rollback
retains an existing domain, or removes only the exact domain created by that run
after rechecking its identity. Ambiguous writes and ownership drift require
preservation and inspection. No response-loss retry or paid resource is introduced.

Run 34448248298 exposed missing storage DNS and omitted discovery artifact paths.
Its prior Worker, Pages, and D1 resources were restored, but restored MCP checks
failed, so it did not produce a verified rollback terminal carrier. Source fixes,
local tests, and PR integration do not retroactively change that release outcome.

Validation includes artifact staging and reconciliation against stale root aliases,
preservation of unrelated metadata, domain reuse and exact rollback, conflict and
response-loss cases, and bounded storage-origin propagation checks. The source
scope registers these tests in the collaboration contract. Production completion
still requires the protected release's live checks and terminal receipts.

Provider routing contract: [Cloudflare Worker custom domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).
