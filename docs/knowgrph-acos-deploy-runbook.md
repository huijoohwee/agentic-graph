# Deploy Runbook — knowgrph ↔ agentic-canvas-os connector (Section 11 + tasks 12.7, 13.9, 13.10)

**Status:** Ready to run — **operator-gated** (requires cloud credentials + the
`cloud-deploy` Approval_Token). These steps make live, billable changes to
Cloudflare, AWS, and Vercel and call paid providers, so they are NOT executed by
the agent. Run them yourself in order.

All commands run from the `knowgrph` repo root unless noted. Local test/lint
gates must pass first: `npm run runtime:test`.

---

## Recent Pages UI Release Evidence (2026-06-16)

This runbook covers the full connector topology, but the `/knowgrph` Pages app-shell release also has a lighter Dev->Prod->Cloudflare path.

- Dev repo commit: `36dd25e7`
- Publish repo commit: `af9f48a5`
- Preview: `https://ea647ff5.joohwee.pages.dev`
- Live: `https://airvio.co/knowgrph/`

Release path (app shell only):
```
npm --prefix canvas run test:ci:unit -- strybldr
npm --prefix canvas run typecheck
npm run collaboration:release:check
npm run pages:build-sync
npm run pages:check-sync
npm run pages:deploy-cloudflare
```

If the release scope touches authenticated collaboration only and the publish mirror is intentionally dirty during local iteration, you may use `npm run collaboration:release:check -- --skip-sync` before `pages:build-sync`. The actual release lane still requires the full `npm run collaboration:release:check` result before `pages:deploy-cloudflare`.

## Pre-reqs (one-time)

- Cloudflare: account + `airvio.co` zone; `wrangler login`.
- AWS: account + credentials (`aws configure`); CDK bootstrapped in the target
  region (`npx cdk bootstrap` once per account/region).
- Vercel: account + project; `vercel login`.
- Provider credentials (only the tiers you want live): Exa, BytePlus/ModelArk,
  Stripe. The product tiers (AWS/Vercel) hold **no** model keys (R11).

## 0. Gate: secret hygiene + tests

```
npm run runtime:test          # full suite (unit + PBT + integration + smoke), network-free, deterministic
```
The smoke tests assert no model-provider key ships in the Agent-API / McpAgent /
frontend tiers and no auth secret ships in the frontend bundle (R11.1/3/5, R15.7).
Runs with `--test-concurrency=1` so the gate result is independent of host core
count (deterministic across machines/CI).

## 1. Cloudflare control plane (task 11.1)

Provision live-client secrets (only if running live stages):
```
npx wrangler secret put EXA_API_KEY      --config cloudflare/workers/knowgrph-mcp/wrangler.toml
npx wrangler secret put BYTEPLUS_API_KEY --config cloudflare/workers/knowgrph-mcp/wrangler.toml
# set KNOWGRPH_LIVE_CLIENTS="1" + AI_GATEWAY_CHAT_URL / STRYTREE_RENDER_URL /
# KNOWGRPH_PAYMENT_URL in wrangler.toml [vars] to enable each live stage.
```
Deploy + verify the MCP Streamable HTTP endpoint:
```
npm run mcp:worker:deploy
curl -fsS https://airvio.co/knowgrph/control-plane/mcp/health   # expect 200, status:"pass"
```

## 2. AWS Agent-API — REST tier (task 11.2)

> **Topology (task 13.11 — COMPLEMENT):** this API Gateway + Lambda + S3 tier is
> the product **REST** surface the Vercel frontend calls (`POST /auth/session`,
> `POST /run`, `GET /runs/{id}`, `GET /health`, S3 artifacts). It is **retained,
> not replaced** by the AgentCore Runtime — the AgentCore Runtime (§5) is an
> *additive* durable **MCP** tool surface (the deployable-agent judging
> artifact). Both are keyless thin forwarders to the Cloudflare `McpAgent`
> (R11 holds on either path). Deploy this tier whenever the frontend is in play;
> add §5 only when demonstrating the AgentCore deployable-agent artifact.

Create the HS256 signing secret (server-side only, R15.7):
```
aws secretsmanager create-secret --name knowgrph/agent-api/auth-jwt-secret \
  --secret-string "$(openssl rand -hex 32)"
```
Install tier deps (so node_modules ships in the Lambda asset) and deploy:
```
npm run agent-api:install
CDK_DEFAULT_ACCOUNT=<acct> \
CDK_DEFAULT_REGION=<region> \
MCP_ENDPOINT=https://airvio.co/knowgrph/control-plane/mcp \
CORS_ALLOW_ORIGIN=<https://your-vercel-app.vercel.app> \
# optional: RUN_MANIFEST_PREFIX=runs
npm run agent-api:cdk:deploy
```
The Agent-API now picks up `MCP_ENDPOINT`, `CORS_ALLOW_ORIGIN`, and optional
`RUN_MANIFEST_PREFIX` from the deploy environment, so the preferred path is to
set them **before** `cdk deploy` rather than patching Lambda env vars manually
after deploy. Verify:
```
curl -fsS <ApiUrl>/health                          # expect 200 within 5s
```

## 3. Vercel frontend (task 11.3)

```
npm run web:build
# deploy web/ to Vercel (point NEXT_PUBLIC_AGENT_API_URL at the AWS ApiUrl)
vercel deploy --prebuilt web   # or `vercel --cwd web`
```
Confirm no auth secret / model key is in the client bundle (the smoke test
covers this; re-run after build): `npm run web:test`.

## 4. Post-deploy verification + live proof (tasks 11.4, 12.7)

For a compact operator-ready checklist covering the live `/knowgrph` routes, MCP
session handshake, dry-run `tools/call`, and persisted Run_Manifest read-back,
see [knowgrph-post-deploy-verification-checklist.md](knowgrph-post-deploy-verification-checklist.md).

```
AGENT_API_URL=<ApiUrl> \
MCP_ENDPOINT=https://airvio.co/knowgrph/control-plane/mcp \
FRONTEND_URL=<vercel-url> \
AGENTCORE_MCP_URL=<optional-agentcore-runtime-base-url> \
npm run runtime:verify:deployed
```
This probes all three `/health`/reachability surfaces (5s-bounded) and prints a
sample Demo_Pack `urls[]`. When `AGENTCORE_MCP_URL` is set, the additive AWS
AgentCore `/ping` liveness URL and `/mcp` URL are included in the same
Demo_Pack block. Exit 0 = AC-7 reachability satisfied for every supplied URL.

**Hosted blocked-path proof (immediate, high-ROI):**
Fastest operator path: run the entire hosted artifact flow in one command after
deploy:
```bash
AGENT_API_URL=<ApiUrl> \
FRONTEND_URL=<vercel-url> \
MCP_ENDPOINT=https://airvio.co/knowgrph/control-plane/mcp \
REFERENCE_URL=https://example.com/reference-video.mp4 \
BRIEF='Hosted proof run: blocked path plus same-session persisted read-back.' \
BUDGET_USD=10 \
ARTIFACTS_DIR=./artifacts \
SUBMISSION_TITLE='Knowgrph Hackathon Submission Brief' \
npm run runtime:flow
```
This runs `runtime:verify:deployed` -> `runtime:proof` -> `runtime:demo-pack` ->
`runtime:submission-brief` -> `runtime:bundle` and writes the complete artifact
set under `ARTIFACTS_DIR`.

For operator review without making network calls first:
```bash
AGENT_API_URL=<ApiUrl> \
FRONTEND_URL=<vercel-url> \
npm run runtime:flow -- --dry-run
```

Equivalent step-by-step commands remain available below if you want to inspect
or re-run an individual phase.

**Step-by-step equivalent:**
```bash
AGENT_API_URL=<ApiUrl> \
FRONTEND_URL=<vercel-url> \
MCP_ENDPOINT=https://airvio.co/knowgrph/control-plane/mcp \
REFERENCE_URL=https://example.com/reference-video.mp4 \
BRIEF='Hosted proof run: blocked path plus same-session persisted read-back.' \
BUDGET_USD=10 \
PROOF_OUTPUT_PATH=./artifacts/runtime-proof.json \
npm run runtime:proof
```
This performs the minimum hosted proof sequence end to end:
1. `POST /auth/session` on the deployed AWS API.
2. `POST /run` with `approvals: []`.
3. `GET /runs/{id}` with the **same** Auth_Token.
4. Writes a proof JSON artifact when `PROOF_OUTPUT_PATH` is set.

Then turn the saved proof into a judging-ready Demo_Pack artifact:
```bash
PROOF_INPUT_PATH=./artifacts/runtime-proof.json \
DEMO_PACK_OUTPUT_PATH=./artifacts/runtime-demo-pack.json \
npm run runtime:demo-pack
```
This reads the persisted manifest payload from the proof file, builds the
Demo_Pack through the existing SSOT manifest-to-pack path, validates it against
the canonical contract, and writes the final artifact JSON when
`DEMO_PACK_OUTPUT_PATH` is set.

Then export a polished markdown submission brief:
```bash
DEMO_PACK_INPUT_PATH=./artifacts/runtime-demo-pack.json \
SUBMISSION_BRIEF_OUTPUT_PATH=./artifacts/runtime-submission-brief.md \
SUBMISSION_TITLE='Knowgrph Hackathon Submission Brief' \
npm run runtime:submission-brief
```
This converts the contract-valid Demo_Pack artifact into a human-readable brief
 you can paste into a hackathon form, PR comment, doc, or review packet.

Finally, package everything into one portable submission bundle directory:
```bash
PROOF_INPUT_PATH=./artifacts/runtime-proof.json \
DEMO_PACK_INPUT_PATH=./artifacts/runtime-demo-pack.json \
SUBMISSION_BRIEF_INPUT_PATH=./artifacts/runtime-submission-brief.md \
SUBMISSION_BUNDLE_DIR=./artifacts/submission-bundle \
npm run runtime:bundle
```
This copies the three source artifacts into a single directory and generates:
`index.md`, `summary.html`, and `bundle-manifest.json` for judge-friendly review
and handoff.

Pass criteria for the hosted blocked-path proof:
1. `/auth/session` returns `201` with a non-empty token.
2. `/run` returns `202` with a non-empty `runId`.
3. `/runs/{id}` returns `200` for the same session.
4. `runId`, `state`, and `mode` match between submit and read-back.
5. The proof JSON captures frontend/API/control-plane URLs for the Demo_Pack.
6. `runtime:demo-pack` emits a contract-valid Demo_Pack artifact JSON.
7. `runtime:submission-brief` emits a polished markdown brief from that artifact.
8. `runtime:bundle` emits a portable submission folder with an index and HTML summary page.

**One approved live end-to-end run (follow-on judging capture):**
1. Start with the hosted blocked-path proof above and keep the same browser
   session/Auth_Token.
2. Re-submit `POST /run` with the required `approvals[]` after each operator
   decision.
3. Let the live path execute research → storyboard → render → publish →
   checkout.
4. Read back `GET /runs/{id}` again and capture the terminal Run_Manifest.
5. Use the terminal manifest + reachable URLs as the canonical judging artifact.

## 5. AWS AgentCore Runtime — MCP tier (tasks 13.9, 13.10) — OPTIONAL / ADDITIVE

> **Topology (task 13.11 — COMPLEMENT):** the AgentCore Runtime is an *additive*
> AWS surface — it does **not** replace the §2 API Gateway + Lambda + S3 REST
> tier. It hosts the durable streamable-HTTP **MCP** tool surface
> (`tools/list`, `knowgrph.video_remix.run` + stage tools, `/ping`) as the
> AWS-tier "deployable agent" judging artifact. Like the REST tier it is a
> **keyless thin forwarder** to the Cloudflare `McpAgent`: no model keys in the
> image/role/env, no direct paid-model invocation (R11 preserved; the IAM role
> grants no `bedrock:InvokeModel*`). Deploy this only when demonstrating the
> deployable-agent artifact; the frontend does not depend on it.

Gated by the `cloud-deploy` Approval_Gate (same gate as §1–§3). Build + push the
ARM64 image to ECR and launch the runtime, wiring the inbound JWT authorizer
(R15 Auth_Token), the least-privilege IAM role (no model-invoke permission), and
the control-plane endpoint env:
```
# local test first (network-free, fail-closed when control-plane endpoint unset)
npm run agentcore:test
# build + push ARM64 image and create the AgentCore Runtime
CLOUD_DEPLOY_APPROVAL_TOKEN=<token> \
MCP_ENDPOINT=https://airvio.co/knowgrph/control-plane/mcp \
AUTH_JWT_SECRET=<server-side-secret> \
npm run agentcore:deploy        # wraps agentcore launch; set AGENTCORE_DEPLOY_COMMAND=deploy for newer CLI flows
# verify the deployed MCP endpoint + liveness
AGENTCORE_MCP_URL=<agentcore-runtime-base-url> \
AGENTCORE_AUTH_TOKEN=<auth-token-from-post-auth-session> \
npm run agentcore:verify        # tools/list over Streamable HTTP; /ping 200 within 5s
```
Register the deployed AgentCore MCP endpoint in the Demo_Pack `urls[]` and the
`runtime:verify:deployed` probe (task 13.10) so the Demo_Pack carries **both** AWS
endpoints — the REST Agent_Api `/health` (§2) and the AgentCore MCP endpoint —
as distinct reachable artifacts. Mark the section unverified if the endpoint
does not return success within 5s.

## Manual runtime verification

The `.github/workflows/runtime-gate.yml` workflow verifies §0 + §4 only after
an explicit `workflow_dispatch`. It does not deploy or mutate an environment:

- Always runs `npm run runtime:ci` (deterministic and network-free). Run
  `npm run runtime:test` separately for the broader property/audit suite while
  its existing source-contract findings remain under upstream remediation.
- Runs `npm run runtime:verify:deployed` only when both required endpoints are explicitly configured. Wire
  the endpoints WITHOUT editing the workflow (no hardcode): set repository
  **Variables** `AGENT_API_URL`, `MCP_ENDPOINT`, `FRONTEND_URL` (or pass them as
  `workflow_dispatch` inputs). Until then the verify step skips with a notice, so
  the gate is inert pre-wiring and self-activates afterward.

Production deployment is isolated in `.github/workflows/release.yml`. It requires
an exact protected `main` SHA and the matching
`agentic-local-review-candidate/v1` JSON through `workflow_dispatch`. After the
candidate is verified, `npm run production:authorize` requires the authenticated
operator to reply exactly `authorize <candidate_digest>` before the protected
GitHub `production` environment can release it. Pull requests and pushes to
`main` cannot invoke Production.

## Rollback

- Cloudflare: `npx wrangler rollback --config cloudflare/workers/knowgrph-mcp/wrangler.toml`.
- AWS: `npm run diff --prefix aws/agent-api/cdk` then `cdk destroy` (the artifact
  bucket is `RETAIN` — delete manually if intended).
- Vercel: promote the previous deployment.
- AgentCore Runtime (§5, if deployed): delete the runtime via the starter
  toolkit / `agentcore` CLI and remove its Demo_Pack `urls[]` entry; the §2 REST
  tier is unaffected (the two AWS surfaces are independent — task 13.11).
- Unset `KNOWGRPH_LIVE_CLIENTS` / `MCP_ENDPOINT` to fail closed to mock/501.
