# Post-Deploy Verification Checklist — `airvio.co/knowgrph`

Short operator checklist for the live `knowgrph` Cloudflare Pages + MCP deploy.
This is the compact follow-up to the full [deploy runbook](knowgrph-acos-deploy-runbook.md).

For the hosted AWS REST proof path (`POST /auth/session` -> `POST /run` ->
`GET /runs/{id}`), the fastest path is `npm run runtime:flow` from the main
deploy runbook. The individual commands `runtime:proof`, `runtime:demo-pack`,
`runtime:submission-brief`, and `runtime:bundle` remain available for targeted
re-runs. This checklist stays focused on the Cloudflare `/knowgrph` surface and
direct MCP verification.

## Scope

Use this after publishing from `knowgrph` into `../huijoohwee` and deploying to
Cloudflare Pages. The goal is to confirm:

- the apex and `/knowgrph` readiness markers are byte-identical and bind the exact release SHA
- the `/knowgrph` app shell is reachable
- discovery and health routes are live
- the MCP Streamable HTTP surface accepts a real session
- a safe dry-run `tools/call` works without paid side effects
- persisted Run_Manifest read-back is consistent

## Recent Release Evidence

Record the latest bounded release proof here after a real deploy.

### Latest release snapshot (2026-07-11)

- Pages preview: `https://8ccfa5b7.joohwee.pages.dev`
- Live route: `https://airvio.co/knowgrph/`
- Deployed reachability: `npm run runtime:verify:deployed` passed with explicit URLs
- Docs seed: `node ./scripts/seed-storage-docs-to-cloudflare.mjs` passed
- Canonical docs seed proof:
  - `source-files=41`
  - `chunked-source-files=15`
  - `before-seed` export: `825ms`
  - `direct-d1-verification` export: `736ms`
  - final verification: `documents=41`
  - terminal result: `direct D1 seed complete`

### Release evidence template

- Dev repo commit or release scope:
- Publish repo commit or release scope:
- Pages preview URL:
- Live route:
- `pages:build` result and wall time:
- `collaboration:release:check` result:
- `pages:check-sync` result:
- docs seed result and verification count:
- `runtime:verify:deployed` result:

## 1. Route Reachability

Expect `200` from each route:

```bash
curl -A 'Mozilla/5.0' -sS -o /dev/null -w 'GET /knowgrph/ -> %{http_code} | %{content_type}\n' \
  https://airvio.co/knowgrph/
curl -A 'Mozilla/5.0' -sS -o /dev/null -w 'GET /knowgrph/health -> %{http_code} | %{content_type}\n' \
  https://airvio.co/knowgrph/health
curl -A 'Mozilla/5.0' -sS -o /dev/null -w 'GET /knowgrph/.well-known/openapi.json -> %{http_code} | %{content_type}\n' \
  https://airvio.co/knowgrph/.well-known/openapi.json
curl -A 'Mozilla/5.0' -sS -o /dev/null -w 'GET /knowgrph/.well-known/mcp/server-card.json -> %{http_code} | %{content_type}\n' \
  https://airvio.co/knowgrph/.well-known/mcp/server-card.json
curl -A 'Mozilla/5.0' -sS -o /dev/null -w 'GET /knowgrph/llms.txt -> %{http_code} | %{content_type}\n' \
  https://airvio.co/knowgrph/llms.txt
curl -A 'Mozilla/5.0' -sS -o /dev/null -w 'GET /.well-known/api-catalog -> %{http_code} | %{content_type}\n' \
  https://airvio.co/.well-known/api-catalog
curl -A 'Mozilla/5.0' -sS -o /dev/null -w 'GET /knowgrph/mcp/health -> %{http_code} | %{content_type}\n' \
  https://airvio.co/knowgrph/mcp/health
curl -A 'Mozilla/5.0' -sS -o /dev/null -w 'GET readiness -> %{http_code} | %{content_type}\n' \
  https://airvio.co/.well-known/runtime-readiness.json
curl -A 'Mozilla/5.0' -sS -o /dev/null -w 'GET /knowgrph readiness -> %{http_code} | %{content_type}\n' \
  https://airvio.co/knowgrph/.well-known/runtime-readiness.json
```

Expected content types:

- `/knowgrph/` -> `text/html`
- `/knowgrph/health` -> `application/health+json`
- `/knowgrph/.well-known/openapi.json` -> `application/vnd.oai.openapi+json`
- `/knowgrph/.well-known/mcp/server-card.json` -> `application/json`
- `/knowgrph/llms.txt` -> `text/plain`
- `/.well-known/api-catalog` -> `application/linkset+json`
- `/knowgrph/mcp/health` -> `application/json`
- both runtime-readiness routes -> `application/json`, schema `knowgrph-production-runtime-readiness/v2`, and byte-identical bodies
- arbitrary missing root image, script, directory, `/index.html`, and retired `/hackamap/` paths -> HTTP `404` with the managed Not found document, never a `200` Home shell
- `/singabldr/` and `/singabldr/manifest.webmanifest` -> `200`, preserving the sibling app across the root 404 boundary

The release workflow resolves the exact successful Pages deployment for the protected SHA through the Cloudflare API and runs both the machine-route smoke and immutable marker/browser fidelity through that direct origin before it publishes the mirror. The smoke still validates canonical `airvio.co` URLs and metadata in every response; only its hosted-CI transport changes. For returning-user proof, the workflow derives the stable Pages production alias from `CLOUDFLARE_PAGES_PROJECT`, prewarms one persistent Chrome profile on that same origin, seeds a stale runtime asset plus root/nested app HTML and out-of-scope favicon-shaped HTML in Knowgrph-owned caches, seeds a valid Singabldr HTML cache, and reopens the profile afterward. The gate requires one canonical registration, exact-revision imported-worker URLs, matching active/controller revision and lifecycle-clean chat attestations, only the exact release namespace across every CacheStorage asset entry, zero HTML in Knowgrph-owned or `/knowgrph` cache entries, preserved sibling HTML caches, no installing/waiting legacy worker, clean transition-tab execution, network-owned HTML, and preserved local-first storage. The generated runtime-cache policies also reject non-200, HTML, and XHTML responses on admission and reject existing HTML/XHTML hits. This deterministic Pages transport avoids custom-domain challenge responses in hosted CI without changing the deployed artifact or weakening the checks. It does not claim custom-domain browser acceptance; repeat the public `airvio.co` proof from a non-challenged operator network:

```bash
RELEASE_SHA=<40-character-knowgrph-sha> \
PRODUCTION_IMMUTABLE_MANIFEST_DIGEST=<64-character-sha256> \
npm run production:fidelity:check
```

## AI Gateway Draft-Lane Gate

Before treating the Cloudflare-hosted OpenAI draft lane as live, run:

```bash
npm run ai-gateway:readiness:check -- --skip-sync-check
```

Pass criteria:

- focused source proofs pass
- publish-repo `__chat_proxy` smoke passes
- downloaded Pages project config contains `KNOWGRPH_CHAT_PROXY_AI_GATEWAY_BASE_URL`
- Pages project `joohwee` exposes one accepted AI Gateway secret:
  `KNOWGRPH_CHAT_PROXY_AI_GATEWAY_TOKEN`, `AI_GATEWAY_TOKEN`, or `CLOUDFLARE_API_TOKEN`
- live `POST https://airvio.co/__chat_proxy/v1/responses` smoke returns a bounded non-5xx result

Fail closed until those config checks pass; source proof alone is not enough to claim the hosted
AI Gateway lane is live.

## 2. Browser Sanity

Open [airvio.co/knowgrph](https://airvio.co/knowgrph/) and confirm:

- the page title is `knowgrph`
- the main shell renders instead of a blank page or edge error
- the apex hero renders `Map intent`, `Run agents`, and `Get results` with a ready canvas iframe
- neither surface remains on `Switching document` or `Preparing canvas view...`
- the top-level controls are present: `Launch`, `Workspace View`, `Interaction`,
  `Settings`, `History`, `Help`
- the explorer/doc surface loads the seeded workspace content
- browser console shows no obvious runtime errors

## 3. MCP Session Handshake

The live Worker requires a streamable-HTTP `Accept` header:

```bash
curl -sS -D - -o - https://airvio.co/knowgrph/mcp \
  -A 'Mozilla/5.0' \
  -X POST \
  -H 'accept: application/json, text/event-stream' \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":"init-1","method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"post-deploy-check","version":"1.0.0"}}}'
```

Expect:

- `HTTP 200`
- `content-type: text/event-stream`
- a non-empty `mcp-session-id` response header
- `serverInfo.name = "knowgrph-control-plane"`

Then acknowledge the session:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://airvio.co/knowgrph/mcp \
  -A 'Mozilla/5.0' \
  -X POST \
  -H 'accept: application/json, text/event-stream' \
  -H "mcp-session-id: <SESSION_ID>" \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","method":"notifications/initialized"}'
```

Expect `202`.

## 4. Tool Surface

List tools on the same session:

```bash
curl -sS https://airvio.co/knowgrph/mcp \
  -A 'Mozilla/5.0' \
  -X POST \
  -H 'accept: application/json, text/event-stream' \
  -H "mcp-session-id: <SESSION_ID>" \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":"tools-1","method":"tools/list"}'
```

Expect these six tools:

- `knowgrph.video_remix.run`
- `knowgrph.video_remix.research`
- `knowgrph.video_remix.storyboard`
- `knowgrph.video_remix.render`
- `knowgrph.video_remix.publish`
- `knowgrph.video_remix.checkout`

Expect both `inputSchema` and `outputSchema` on the listed tool entries.

## 5. Safe Dry-Run Tool Call

Run the Director in `dry-run` mode:

```bash
curl -sS https://airvio.co/knowgrph/mcp \
  -A 'Mozilla/5.0' \
  -X POST \
  -H 'accept: application/json, text/event-stream' \
  -H "mcp-session-id: <SESSION_ID>" \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":"call-run-1","method":"tools/call","params":{"name":"knowgrph.video_remix.run","arguments":{"referenceUrl":"https://example.com/reference-video.mp4","brief":"Post-deploy smoke: dry-run plan across the live Streamable HTTP seam.","mode":"dry-run","budgetUsd":10,"approvals":[]}}}'
```

Expect:

- `isError = false`
- a non-empty `structuredContent.runId`
- `structuredContent.mode = "dry-run"`
- `structuredContent.state = "blocked"`
- `structuredContent.budgetMeters.actualCostUsd = 0`
- no paid-provider execution

For a deeper gate check, first read the persisted manifest at
`/knowgrph/mcp/runs/<RUN_ID>` and extract `manifest.storyboard.plannedShots`.
The live `knowgrph.video_remix.render` contract now requires a non-empty `shots`
array before the tool can evaluate approval gating.

Then call `knowgrph.video_remix.render` with:

- `runId = <RUN_ID>`
- `shots = <manifest.storyboard.plannedShots>`
- `approvals = []`

Example:

```bash
curl -sS https://airvio.co/knowgrph/mcp \
  -A 'Mozilla/5.0' \
  -X POST \
  -H 'accept: application/json, text/event-stream' \
  -H "mcp-session-id: <SESSION_ID>" \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":"call-render-1","method":"tools/call","params":{"name":"knowgrph.video_remix.render","arguments":{"runId":"<RUN_ID>","shots":[{"shotId":"shot-1","prompt":"<from plannedShots>","durationS":4}],"approvals":[]}}}'
```

Expect:

- `isError = true`
- `structuredContent.status = "approval_required"`
- `structuredContent.gateId = "render-action"`
- `structuredContent.paidProviderCalls = 0`
- `structuredContent.runManifestStateChanged = false`

## 6. Persisted Read-Back

Use the `runId` from the dry-run call:

```bash
curl -A 'Mozilla/5.0' -fsS \
  "https://airvio.co/knowgrph/mcp/runs/<RUN_ID>"
```

Expect:

- `HTTP 200`
- top-level `runId` matching `<RUN_ID>`
- top-level `manifest` object present
- `manifest.runId`, `manifest.state`, `manifest.mode` matching the original
  `tools/call` response
- approval gate count, stage count, `demoPack` presence, `stageTransitions`, and
  zero-spend fields matching the original returned manifest

## 7. Known Transport Notes

- `Accept: application/json` alone is not enough for the live MCP Worker; expect
  `406 Not Acceptable`.
- Browser-style traffic or `curl -A 'Mozilla/5.0'` succeeds consistently against
  Cloudflare, while generic non-browser clients may hit edge bot filtering.

## Pass Criteria

The deploy is verified when all of the following are true:

- `/knowgrph` and the discovery/health routes return success
- the browser app shell renders without obvious runtime failure
- MCP `initialize` and `notifications/initialized` succeed
- `tools/list` returns the six-tool surface with schemas
- dry-run `knowgrph.video_remix.run` returns a blocked zero-spend manifest
- unapproved `knowgrph.video_remix.render` fails closed with
  `approval_required` when invoked with schema-valid `shots`
- `GET /knowgrph/mcp/runs/{id}` returns the persisted manifest consistently
