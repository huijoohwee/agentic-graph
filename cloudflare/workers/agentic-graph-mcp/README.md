# agentic-mcp Worker

Cloudflare Worker that hosts the Agents SDK `McpAgent` for the
**agentic-graph ↔ agentic-canvas-os MCP connector** control plane. Exposes the
Director tool (`agentic-graph.video_remix.run`) plus the five stage tools
(`research`, `storyboard`, `render`, `publish`, `checkout`), the read-only
OS status tool (`agentic-graph.os.status`), the receipt-fenced run-note mutation
(`agentic-graph.run_manifest.note.update`), and the read-only Agentic Canvas OS docs
invocation tool (`agentic-graph.agentic_canvas_os.docs.invoke`) over the
**MCP Streamable HTTP** transport at `https://airvio.co/agentic-os/control-plane/mcp`.

Migrates the deployed plain-JSON-RPC HTTP MCP at
`cloudflare/pages/agentic-graph-agent-ready.mjs` per **ADR-7** and
spec task 1.1 of `.kiro/specs/agentic-graph-acos-mcp-connector` (Requirement
R14.1; Properties 1, 26).

## Layout

| File | Responsibility |
|---|---|
| `index.ts` | Worker entry. Defines `AgenticGraphMcpAgent` (Agents SDK `McpAgent`), registers 10 tools with Streamable HTTP, routes `/agentic-os/control-plane/mcp[*]`, and forwards request metadata and the idempotency header to the durable dispatcher. |
| `tool-registry.mjs` | Pure-JS source of truth for the tool list, schemas, and approval-gate boundary. Imported by the Worker and by the Node `node:test` unit tests. Reuses `mcp/video-remix-runtime.js` for the Director tool. |
| `run-manifest-store.mjs` | Durable Run_Manifest persistence (task 1.2). `RunManifestStore` Durable Object plus pure helpers (`RunManifestPersistence`, `persistRunManifestThroughNamespace`, `readRunManifestThroughNamespace`). One DO instance per `runId`. |
| `run-note-execution.mjs` | Strict native run-note contract, execution-metadata validation, atomic manifest/receipt transaction, replay, conflict, expiry, and capacity owner. |
| `wrangler.toml` | Worker bindings: route `airvio.co/agentic-os/control-plane/mcp[*]`, Durable Object classes `AgenticGraphMcpAgent` (transport sessions) and `RunManifestStore` (Run_Manifest persistence). |
| `__tests__/tool-registry.test.mjs` | Node-built-in unit tests for Property 26 (input + output schemas) and Property 1 (gate boundary). |
| `__tests__/run-manifest-store.test.mjs` | Node-built-in unit tests for Property 25 (durable persistence read-back consistency) against an in-memory storage shim. |
| `__tests__/run-note-execution.test.mjs` | Native first-apply, uncertain retry, no-duplicate revision, missing metadata, catalog, and payload-conflict proof. |

## Tool surface (Property 26 / R14.4)

| Tool | Required Approval_Gate | Schemas |
|---|---|---|
| `agentic-graph.video_remix.run` | n/a (Director enforces gates per stage) | input + output (Run_Manifest) |
| `agentic-graph.video_remix.research` | `paid-model-call` | input + output (Evidence_Pack) |
| `agentic-graph.video_remix.storyboard` | `paid-model-call` | input + output (Kgc_Document + flow) |
| `agentic-graph.video_remix.render` | `render-action` | input + output (assets + ledgerEventIds) |
| `agentic-graph.video_remix.publish` | `cloud-deploy` | input + output (publishedUrls) |
| `agentic-graph.video_remix.checkout` | `payment-action` | input + output (Stripe sessionId, payoutSettled) |
| `agentic-graph.run_manifest.note.update` | Agentic signed review plus native receipt metadata | input + output (operator note, revision, execution receipt) |
| `agentic-graph.os.status` | n/a (read-only) | input + output (Agentic OS status views) |
| `agentic-graph.agentic_canvas_os.docs.invoke` | n/a (read-only) | input + output (`/`, `#`, `@` docs invocation lookup) |

`buildAgenticGraphMcpToolDefinitions()` in `tool-registry.mjs` is the canonical
builder; every entry carries both `inputSchema` and `outputSchema`.

## Reviewed run-note mutation

`agentic-graph.run_manifest.note.update` accepts only `{ run_id, note }`. The model
arguments do not contain approval or idempotency fields. The owning Agentic
gateway must place its exact `function-execution-receipt/v1` identity under
MCP request metadata key `io.agentic-canvas-os/execution` and send the same
64-character key in `idempotency-key`.

The per-run `RunManifestStore` validates both channels, then atomically updates
`manifest.operatorNote` and a bounded seven-day receipt map in one Durable
Object transaction. A matching retry returns status `replayed` and the original
revision; changed arguments, receipt identity, or digest under the same key
returns `idempotency_conflict` without mutation. Thirty-two unexpired receipts
are retained per run; capacity fails closed instead of evicting active evidence.
Successful output includes exact native evidence:

```json
{
  "ok": true,
  "run_id": "<runId>",
  "note": "<reviewed note>",
  "revision": 1,
  "execution_receipt": {
    "schema": "agentic-graph-tool-execution-receipt/v1",
    "idempotencyKey": "<64 lowercase hex>",
    "requestDigest": "<64 lowercase hex>",
    "status": "applied"
  }
}
```

This source implementation has local cross-repository recovery proof. The
separate `agentic-mcp-dev` Worker also returned one accepted provider-driven
result on 2026-07-19: native status `applied`, exact note revision 1, and the
same 64-character idempotency key as the completed Agentic execution receipt.
The canonical sanitized record is pinned through
`docs/runtime-readiness-contract.md` to Agentic Canvas OS
`LIVE-REVIEWED-FUNCTION-PROOF.md`. Prod and every additional provider or
Cloudflare deployment remain separately gated.

## Isolated Dev deployment

The `dev` Wrangler environment deploys only to
`agentic-mcp-dev.huijoohwee.workers.dev`. It repeats the non-inheritable
bindings and migrations, keeps live stage clients disabled, and declares no
custom-domain routes. Configure a Dev-only runtime bearer with
`wrangler secret put AGENTIC_OS_AGENT_RUNTIME_BEARER_TOKEN --env dev`, then run
`npm run deploy:dev`. The top-level `deploy` script remains the separately
gated production deployment.

Accepted Dev evidence: Worker version
`e8747308-e6af-4e82-957d-cb9b764d575d` persisted
`Reviewed Dev provider proof 20260719-live-01.` at revision 1 for manifest
`dev-provider-proof-manifest-20260719-live-01`. Its native receipt schema was
`agentic-graph-tool-execution-receipt/v1`, status `applied`. This read-back is a
completed historical proof, not permission to repeat the run.

## Durable Run_Manifest persistence (Property 25 / R14.2)

When the Director tool (`agentic-graph.video_remix.run`) returns a Run_Manifest,
the Worker entry persists it to the `RUN_MANIFEST_STORE` Durable Object
keyed by `runId` before responding. Persistence is awaited inline; DO
writes complete in milliseconds, well within the 2,000 ms deadline imposed
by R14.2.

The `structuredContent` returned to the MCP caller is augmented with a
`persistence` block:

```json
{
  "persistence": {
    "persisted": true,
    "persistedAt": "2024-...Z",
    "readBackEndpoint": "/agentic-os/control-plane/mcp/runs/<runId>",
    "deadlineMs": 2000,
    "error": null
  }
}
```

Read back the latest persisted state from any client:

```bash
curl -s https://airvio.co/agentic-os/control-plane/mcp/runs/<runId>
```

Returns:

```json
{
  "runId": "<runId>",
  "persistedAt": "2024-...Z",
  "contractVersion": "agentic-graph.video_remix/v0.1",
  "manifest": { /* full Run_Manifest */ }
}
```

`404 not_found` is returned when no manifest has been persisted for that
`runId` yet. Caller authentication and authorization on this read-back
path are enforced by the upstream AWS Agent_Api (R15) before forwarding.

The DO class lives in `run-manifest-store.mjs`. Pure persistence helpers
(`RunManifestPersistence`, `buildPersistenceRecord`,
`serializeManifestForStorage`, `extractRunId`) are exported for downstream
tasks (1.3 persistence-failure handling, 5.x Agent_Api forwarding,
9.x property-based and integration tests) to reuse.

## Approval-gate boundary (Property 1 / R14.6)

Stage tool calls flow through `executeAgenticGraphMcpTool` in `tool-registry.mjs`.
Without a verified, unconsumed Approval_Token in `args.approvals[]` matching
the gate id from the table above, the call is withheld at the McpAgent
boundary and returns:

```json
{
  "status": "approval_required",
  "ok": false,
  "gateId": "<required gate>",
  "paidProviderCalls": 0,
  "runManifestStateChanged": false,
  "error": { "code": "approval_required", "message": "..." }
}
```

The Director tool (`agentic-graph.video_remix.run`) reuses the existing gate
semantics from `mcp/video-remix-runtime.js` (`buildApprovalGates`,
live-without-approvals halt, dry-run resolution).

The full HITL_Gate_Service (token issuance, single-use enforcement, 15-min
validity window) is implemented in spec task 4.x. Stage harness wiring
(Exa / BytePlus / external video provider / Stripe) lands in spec task 3.x.

## Local development

```bash
# from this directory
npm install
npm test                       # runs the Node-built-in unit tests
npx wrangler dev --config wrangler.toml
```

Hit the Streamable HTTP endpoint:

```bash
SESSION_ID="$(curl -si -X POST http://localhost:8787/agentic-os/control-plane/mcp \
  -H "content-type: application/json" \
  -H "accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"local-probe","version":"0.1.0"}}}' \
  | awk 'BEGIN{IGNORECASE=1} /^mcp-session-id:/ {print $2}' | tr -d '\r')"

curl -sX POST http://localhost:8787/agentic-os/control-plane/mcp \
  -H "mcp-session-id: ${SESSION_ID}" \
  -H "content-type: application/json" \
  -H "accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
```

## Deployment

Gated by the `cloud-deploy` Approval_Gate (spec task 11.1):

```bash
npx wrangler deploy --config wrangler.toml
```

The route `airvio.co/agentic-os/control-plane/mcp[*]` routes to this Worker
without shadowing the published Pages agent-ready endpoint at
`/agentic-graph/mcp`. Keep the Pages site on the public discovery/read-only MCP
surface (`.well-known/*`, OpenAPI, A2A card, health) and reserve this Worker
for the Streamable HTTP Director control plane.

## Notes for downstream tasks

- Task 1.2 (this task) added the `RunManifestStore` Durable Object and the
  `GET /agentic-os/control-plane/mcp/runs/{id}` read-back route.
- Task 1.3 will tighten persistence-failure handling: retain the most
  recently persisted state, return a structured persistence-failure
  response, and emit an observability diagnostic. The current
  implementation surfaces failures as a non-null `persistence.error` on
  the tool response and keeps prior state intact (DO write is atomic).
- Task 1.4 will refine the tool listing endpoint to mirror the
  `tools/list` payload at `/agentic-os/control-plane/mcp/tools` for non-MCP discovery
  callers; an initial JSON listing is already exposed.
- Task 1.5 will emit stage-transition diagnostics on stage transitions; the
  current Worker only handles boundary enforcement and tool dispatch.
- Tasks 4.1–4.5 implement Approval_Token issuance, single-use enforcement,
  and the 15-minute validity window. The boundary in
  `tool-registry.mjs` accepts any approved gate id today; tighter checks
  (signature, freshness, single-use) are deferred to those tasks.
