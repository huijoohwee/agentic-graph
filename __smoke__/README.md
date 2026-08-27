# Static-scan / smoke tests — agenticgraph ↔ agentic-canvas-os MCP connector (spec task 9.3)

These are **static-scan + connectivity smoke tests** for the spend-isolation and
tool-surface boundaries. They are pure logic + filesystem reads + in-process
seams with **ZERO live network/AWS/Cloudflare calls**.

> **Reuse-not-rebuild.** The detectors are the existing reusable scanners
> (`web/src/lib/ai-gateway.js`, `aws/agent-api/src/lib/secret-hygiene.js`) and
> the in-process MCP seam reuses the integration harness's in-memory
> `RUN_MANIFEST_STORE` namespace (`__integration__/lib/in-process-mcp-adapter.mjs`)
> and the Worker's real `tools/list` / `tools/call` code paths. `lib/` only adds
> the cross-tier glue task 9.3 newly requires.

## What each suite asserts

| File | Requirements | Scope |
|---|---|---|
| `model-provider-key-scan.smoke.test.mjs` | R11.1, R11.3, R11.5 | No model provider keys (inlined key SHAPES + ENV-NAMES for OpenAI/Anthropic/Gemini/Google/Replicate/fal/ElevenLabs/…) in the Agent_Api, McpAgent (worker + `mcp/` runtime), or Frontend tiers. Product tiers (Agent_Api, Frontend) additionally forbid direct paid-provider host invocation; the control-plane McpAgent tiers legitimately integrate commerce/providers and are exempt from the host scan. |
| `frontend-auth-secret-scan.smoke.test.mjs` | R15.7, R14.1 | No auth signing secret in the Frontend source tree, built bundle (no-op pass until a bundle lands), logs, or responses. |
| `tool-surface-connectivity.smoke.test.mjs` | R14.1 | The MCP tool surface is reachable + enumerable over the Streamable HTTP transport via an injectable in-process seam (`tools/list` enumerates the Director + 5 stage tools with input+output schemas; `tools/call` routes to the Director; a withheld stage tool returns `approval_required`). |

Every scan is **meaningful** (not vacuously passing): each suite plants a fake
key/secret/host and asserts the detector catches it, and confirms at least one
real source file is scanned per present tier.

## Shared in-process / scan helpers (`lib/`)

- `lib/cross-tier-scan.mjs` — tier roots + cross-tier composition of the reused
  model-key / auth-secret scanners, plus ENV-NAME + extra key-shape coverage.
- `lib/in-process-tool-surface.mjs` — the injectable in-process MCP Streamable
  HTTP transport seam (`tools/list` + `tools/call`) and a minimal client.

## Running

```bash
node --test __smoke__/*.smoke.test.mjs
```

In **spec task 11.4** the SAME transport seam is pointed at the live
`airvio.co/agenticgraph/mcp` endpoint by swapping the in-process transport for a
real `fetch` — no caller changes — and the bundle scan tightens once the Vercel
Frontend bundle is built.
