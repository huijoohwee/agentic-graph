---
title: "Reference implementation: agentic-graph AI Gateway Enhancement Plan"
doc_type: "Execution Plan"
version: "1.1.0"
date: "2026-07-30"
lang: "en-US"
owner: "docs.ai-gateway.plan"
local_rung: "spec-complete"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
guideline_version: "1.7.0"
authors:
  - "airvio"
schema: "agentic-os-computing-flow/v1"
frontmatter_contract: "required"
tags:
  - "cloudflare"
  - "ai-gateway"
  - "tco"
  - "token-economics"
  - "roadmap"
  - "no-code-edits"
related:
  - "README.md"
  - "docs/documents/agentic-graph-cloudflare-document.md"
  - "docs/documents/agentic-graph-prd.md"
  - "canvas/src/features/panels/views/cloudflareAiGatewayMcpApiDocs.ts"
  - "web/src/lib/ai-gateway.js"
---

# Reference implementation: agentic-graph AI Gateway Enhancement Plan

## Purpose

This document turns the current "AI Gateway-ready" position into a min-viable-max-value execution
queue.

It is optimized for the current operating mode:

- solo-dev, high-ROI execution
- no core runtime edits in this phase
- time-to-value before feature breadth
- token economics and TCO visibility before provider expansion
- authoring -> mirror -> delivery lane discipline

## Current Repo Truth

agentic-graph already has the right structural boundary for Cloudflare AI Gateway:

- Cloudflare is the runtime boundary for hosted routes and secrets
- AI Gateway is already treated as the correct model-routing boundary
- the repo already documents caching, dynamic routing, observability, and control surfaces

The next highest-ROI move is not adding more providers. It is operationalizing the existing gateway
boundary so cost, routing, and proof become explicit operator contracts.

## Operating Rule

Prefer the smallest change that improves one or more of:

1. token-cost reduction
2. operator proof density
3. routing flexibility without redeploy churn
4. spend isolation
5. migration clarity toward current Cloudflare AI Gateway surfaces

If a task does not improve one of those five outcomes, defer it.

## Strict Priority Order

### 1. Cache deterministic context first

**Goal:** cut repeat token spend on stable context before changing model strategy.

**Why now:** this is the fastest measurable savings lane and requires the least product complexity.

**Cloudflare primitive:** per-request caching headers such as `cf-aig-cache-ttl`,
`cf-aig-cache-key`, and `cf-aig-skip-cache`.

**Apply to:**

- stable `@` context hydration
- repeated retrieval/RAG envelopes
- fixed system prompts and reusable orchestration scaffolds
- deterministic mock-to-live comparison prompts

**Do not apply to:**

- highly user-specific prompts without a stable cache key
- approval-bearing mutation steps
- prompts that intentionally depend on volatile state

**Proof:** observe `cf-aig-cache-status` and compare repeat-request latency/cost before and after.

### 2. Map intent to dynamic routes

**Goal:** let `#` semantics choose cost/latency/reliability policy without app redeploys.

**Why now:** agentic-graph already has grammar as the category anchor. Dynamic routes let Cloudflare own
provider selection while the app keeps owning intent.

**Cloudflare primitive:** `dynamic/<route-name>` with request metadata and fallback nodes.

**First route set:**

- `dynamic/draft` for lowest-cost acceptable drafting
- `dynamic/proof` for higher-reliability verification and review
- `dynamic/publish` for stricter quality or fallback coverage

**Proof:** capture the returned `cf-aig-model` and `cf-aig-provider` headers and confirm the route
selected the intended downstream model policy.

### 3. Attach spend and abuse limits to request metadata

**Goal:** stop runaway loops and budget drift at the gateway boundary.

**Why now:** for a solo startup, bounded spend is more valuable than broader model optionality.

**Cloudflare primitive:** spend limits, rate limiting, and request metadata.

**Metadata contract to standardize when runtime edits are open:**

- intent
- workspace or document id
- user or operator scope
- run or request id
- environment lane (`dev`, `prod`, `cloudflare`)

**Proof:** a controlled over-budget or over-rate test must block at the gateway and produce a clear
operator-visible reason.

### 4. Turn analytics into proof, not dashboard decoration

**Goal:** make token and cost data part of the source-owned operating loop.

**Why now:** observability only compounds when it feeds decisions, not when it stays isolated in a
vendor dashboard.

**Cloudflare primitive:** AI Gateway analytics, logs, and GraphQL usage queries.

**First output to materialize:**

- requests by intent
- tokens by intent
- cost by provider/model
- cache-hit rate for repeated context lanes
- error rate for dynamic-route fallback paths

**Proof:** one small daily or release-scoped summary that shows spend, cache-hit behavior, and the
highest-cost route by intent.

### 5. Modernize the canonical integration target

**Goal:** keep future implementation work aligned with current Cloudflare AI Gateway surfaces.

**Why now:** Cloudflare's 2026 AI Gateway REST API unifies model calling and makes old endpoint
guidance easier to misread if it remains implicit.

**Preferred future target when runtime edits are open:**

- `POST /ai/run` for universal model and modality coverage
- `POST /ai/v1/chat/completions` for OpenAI-compatible LLM flows
- `POST /ai/v1/responses` for agentic OpenAI-compatible flows
- `POST /ai/v1/messages` only where Anthropic-schema compatibility is the right fit

**Migration rule:** keep existing compat/universal references stable until a named runtime owner
updates them, then cut over source docs and operator surfaces together.

**Proof:** one named runtime owner and one focused verification path per adopted endpoint.

## Recommended Sequence

1. Document the metadata contract and cache policy.
2. Introduce one dynamic route for one low-risk intent.
3. Add spend/rate limits scoped by that same metadata.
4. Publish one small source-owned cost proof artifact.
5. Update remaining legacy endpoint wording only when the runtime owner is ready.

## First Runtime Slice When Code Edits Open

Start with one narrow lane only:

- preserve current gateway boundary
- add request metadata for intent plus run id
- add caching to deterministic context requests
- add one `dynamic/draft` route
- verify with cache-status plus returned model/provider headers

This is the best first slice because it improves token economics, routing flexibility, and proof
density with the least runtime churn.

## Non-Goals For This Slice

- broad provider expansion
- deep UI surface redesign
- changing the Dev -> Prod -> Cloudflare release contract
- replacing existing local harness proof with hosted-only proof
- claiming unified billing or provider-key removal in runtime surfaces before implementation exists

## Source Baseline And Open Delivery Gap

The repository contains source owners for the planned gateway boundary:

- `web/src/lib/ai-gateway.js` validates gateway-only URL construction;
- `canvas/vite.config.ts` owns the development chat-proxy transport and secret
  lookup;
- `cloudflare/workers/agentic-graph-storage/chatAuth.ts` derives the
  `dynamic/draft` route and bounded cache policy for authenticated relay
  requests;
- `scripts/check-ai-gateway-readiness.mjs` provides source checks and optional
  target-environment checks; and
- `docs/reports/ai-gateway-cost-proof.md` is an empty operating template until
  live, attributable traffic supplies measured values.

These owners establish a source-present contract. They do not prove that a
mirror or delivery environment has the required variables, secret, route,
deployment, or live traffic. No historical environment observation in this
plan raises `delivered_rung` above `undocumented`.

## Lane Topology

| Lane | Current artifact | Exit boundary | Evidence required |
|---|---|---|---|
| Authoring | Source contract, focused tests, readiness checker, cost-proof template | Source review and deterministic checks | Exact revision plus passing VCC result |
| Mirror | Candidate runtime with environment-owned gateway configuration | Protected release authorization | Candidate URL, configuration presence, and bounded smoke receipt |
| Delivery | Public runtime and attributable gateway traffic | Operational acceptance | Protected revision, live transport receipt, and populated cost metrics |

Promotion remains closed until the next lane's evidence is recorded. A local
source check cannot substitute for mirror or delivery evidence.

## Economics Boundary

| Path | Token cost | Infrastructure TCO | Control |
|---|---:|---:|---|
| Readiness/document inspection | $0 | $0 incremental | Must not call a model |
| Source-focused unit checks | $0 | Existing development compute | Network/provider calls prohibited |
| Candidate smoke | Bounded by one explicit request | Existing candidate environment | Operator-authorized; record request and result |
| Delivery traffic | Unknown until measured | Provider and platform usage | Spend/rate limit plus per-intent cost record |

## Verification Conditions

| VCC | Condition | Invocable check | Expected result | Recorded evidence |
|---|---|---|---|---|
| `VCC-AIG-01` | Browser and proxy owners preserve the typed route, metadata, cache, and secret boundary. | From `canvas/`: `npm exec -- tsx src/tests/runExport.ts src/__tests__/chatEndpointProviders.test.ts testOpenAiDraftRouteBuildsAiGatewayHeaders` | Focused source contract passes without a provider call. | None recorded in this document |
| `VCC-AIG-02` | Authenticated storage relay derives the draft route and bounded cache TTL. | From `canvas/`, invoke `testStorageChatRelayRouteForwardsOpenAiResponsesInput` and `testStorageChatRelayRouteDerivesShortAiGatewayCacheTtlWithoutWorkspaceCacheKey` through `src/tests/runExport.ts`. | Both focused relay contracts pass with injected transport. | None recorded in this document |
| `VCC-AIG-03` | Public web URL construction rejects non-gateway model targets. | `node --test web/__tests__/ai-gateway-routing.test.mjs` | Static routing and spend-isolation checks pass. | None recorded in this document |
| `VCC-AIG-04` | A delivery environment is configured and carries one bounded live request. | Run `npm run ai-gateway:readiness:check` only with explicit operator authorization for its live gate. | Receipt names exact revision, environment, response, and cost observation. | Not satisfied; `delivered_rung` remains `undocumented` |
