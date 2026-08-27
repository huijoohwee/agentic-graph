# AgenticGraph Backend (Dev/Preview Middleware)

AgenticGraph is primarily a client-side app (Vite + React). “Backend” functionality used by the UI is implemented as Vite middleware for **dev** and **preview** runs.

## Endpoints

### Remote media fetch proxy

- Path: `/__fetch_remote?url=<encoded>`
- Purpose: serve remote images/media through same-origin to reduce CORS/ORB issues.
- Used by:
  - Node media panels (remote `image/video/iframe` sources)
  - Markdown slide backgrounds via `applyMediaProxySrc(...)`
- Policy: apply proxy to any remote URL; forbid hardcoded domain rewrites; enforce bounded upstream time and size

Implementation:
- Vite middleware: [vite.config.ts](../../canvas/vite.config.ts)
- URL utility: [url.ts](../../canvas/src/lib/url.ts)

### Run markdown pipeline (dev tooling)

- Path: `/__run_markdown_pipeline` (POST)
- Purpose: allow the UI/dev workflow to trigger the repo-level markdown pipeline once.

Implementation:
- Vite middleware: [vite.config.ts](../../canvas/vite.config.ts)

### YouTube transcript → Markdown (+ JSON source)

- Path: `/__youtube_transcript?url=<encoded>[&lang=<code>]` (POST)
- Purpose: fetch YouTube transcripts/subtitles/captions (manual or generated) and convert into Markdown for the Markdown Editor/Preview/Slides, while also returning a JSON source payload suitable for JSON-backed markdown workspace and UI Editor flows.
- Runtime constraints: bounded Python subprocess execution (timeout) to forbid hanging imports.

Implementation:
- Vite middleware: [vite.config.ts](../../canvas/vite.config.ts)
- Python command: `python3 -m agenticgraph_parser youtube --emit json --url ... [--lang ...]` ([youtube_cmd.py](../../agenticgraph_parser/youtube_cmd.py))

## Production note

These middleware endpoints exist for local development and preview builds. Current production is split by concern:

- Static SPA: `agenticgraph/canvas/dist` -> `huijoohwee/content/agenticgraph` -> Cloudflare Pages at `airvio.co/agenticgraph`
- Storage API: `cloudflare/workers/agenticgraph-storage` -> Cloudflare Worker `agenticgraph-storage` at `airvio.co/api/storage/*`
- Payments API: `cloudflare/workers/agenticgraph-payment` -> Cloudflare Worker `agenticgraph-payment` at `airvio.co/api/payments/*`
- Dev-only tooling routes such as remote media proxying and markdown pipeline execution must be promoted to a real server route before relying on them in production.

## Production Worker API (Cloudflare)

The Cloudflare Worker at `airvio.co/api/storage/*` provides storage sync and document access endpoints. The separate `agenticgraph-payment` Worker owns `airvio.co/api/payments/*` for Stripe checkout and webhook handling. See `agenticgraph-storage-sync-document.md` for full storage specification.

### Public document view

- Path: `/api/storage/doc/:workspaceId/:canonicalPath*` (GET)
- Purpose: serve a single document's markdown content as `text/markdown` for public sharing, import, or programmatic access.
- Response: `200 text/markdown; charset=utf-8` with raw `content_md` from D1 `documents` table; `404` if not found.
- No authentication required.
- Implementation: [index.ts](../../cloudflare/workers/agenticgraph-storage/index.ts) — see ADR-009 in storage-sync-document.md.

### Sync endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/storage/push` | Push workspace mutations to D1 |
| POST | `/api/storage/pull` | Pull mutations since cursor from D1 |
| GET | `/api/storage/export/:workspaceId` | Full workspace snapshot (JSON) |

### Crawler access endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/storage/source-files` | Default workspace Source Files crawler index |
| GET | `/api/storage/source-files/:workspaceId` | Workspace-scoped Source Files crawler index |
| GET | `/api/storage/llms.txt` | Default LLM crawler entrypoint |
| GET | `/api/storage/source-files/:workspaceId/llms.txt` | Workspace-scoped LLM crawler entrypoint |

Crawler endpoints are read-only D1 document views. They return metadata and markdown doc-view links from existing storage records and do not trigger Import URL, Import local files, graph recomputation, rendering, or writes.

Cloudflare AI Crawl Control Pay Per Crawl remains a zone-level policy boundary. AgenticGraph advertises compatibility and source metadata, but Cloudflare owns `crawler-exact-price`, `crawler-max-price`, `crawler-price`, `crawler-charged`, and `crawler-error`.

### Payment endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/payments/stripe/checkout/session` | Create a hosted Stripe Checkout Session on the payment Worker; defaults to one-time payment and accepts subscription mode from server env |
| GET | `/api/payments/stripe/checkout/session?session_id=...` | Read minimal locally-owned Checkout payment state, or refresh an existing open/unpaid row from Stripe |
| POST | `/api/payments/stripe/webhook` | Verify Stripe webhooks and record Checkout Session updates |

`agenticgraph-payment` owns Stripe server credentials, checkout price authority, checkout mode, return URL authority, ACP expected-total checks, ACP Stripe idempotency, and remote D1 payment schema. Cloudflare Pages project variables do not satisfy this Worker runtime. Keep `STRIPE_RESTRICTED_KEY` or `STRIPE_SECRET_KEY` plus `STRIPE_WEBHOOK_SECRET` as Worker secrets, never visible Worker `[vars]`; keep checkout price authority, `STRIPE_CHECKOUT_MODE`, and `STRIPE_CHECKOUT_RETURN_ORIGIN` as visible non-secret Worker `[vars]` config, not Worker secrets; set `STRIPE_CHECKOUT_MODE=subscription` only with `STRIPE_CHECKOUT_PRICE_ID`, while inline price tuples remain one-time payment sessions. Checkout creation validates `successUrl` and `cancelUrl` against `STRIPE_CHECKOUT_RETURN_ORIGIN` when set, otherwise against the Checkout route origin; caller `Origin` headers never define hosted Checkout redirect authority. Agentic hosted Checkout requires `expectedAmountTotal` and `expectedCurrency`; the ACP route derives them from the checkout session before persistence, fails inline price mismatches before Stripe is called, expires a Price-ID-backed Stripe Session if the returned `amount_total`/`currency` diverges before any ACP session or Stripe audit row is written, expires hosted Sessions if the Stripe audit row cannot be persisted after Stripe creation, and expires the hosted Session if ACP persistence fails after Stripe creation but before the ACP handoff is owned. Checkout creation keeps `session_id={CHECKOUT_SESSION_ID}` on success URLs so `StripeCheckoutReturnRuntime` can read D1 status after the Canvas paywall creates a fresh hosted Checkout Session and redirects the current browser window, or let the Worker retrieve Stripe live status for an existing local checkout row when webhook delivery lags. Checkout Session URLs are session-only runtime state, not browser settings; any Checkout return clears the transient URL, but only `paid` or `no_payment_required` sessions close the paywall, while cancelled/expired/unpaid returns stay locked. Agentic Checkout callers may include `agenticCommerceSessionId` plus expected total on the hosted Checkout route or request hosted Checkout directly from `POST /checkout/sessions` with `stripe_checkout { success_url, cancel_url, workspace_id }`; both paths use the same return-origin validation, write Stripe `metadata[acp_session_id]`, `metadata[expected_amount_total]`, and `metadata[expected_currency]`, use the ACP id as `client_reference_id` and Stripe `Idempotency-Key`, keep `workspaceId` in `metadata[workspace_id]`, let verified first-time Stripe webhooks or the status-route live refresh settle only the matching fiat ACP session when payment status, `metadata[acp_session_id]`, `client_reference_id`, amount, and currency match D1, let `checkout.session.async_payment_failed` mark that session `payment_failed`, and let `checkout.session.expired` or live `status=expired` mark it `cancelled` without proof writes. Checkout status lookups accept only the canonical `session_id` query parameter; unknown `session_id` values return 404 before Stripe is called, legacy `id` aliases return 400, and successful public status responses omit customer identifiers, Stripe metadata, hosted Checkout URLs, and workspace ids while D1 keeps those values for server-side audit and ACP reconciliation. Human Paywall Checkout omits Stripe idempotency intentionally so each Open Checkout action creates a fresh hosted Session. Stripe webhook event ids move through `processing`, `processed`, or `failed`; same-payload duplicate `processing`/`processed` ids are acknowledged without replaying settlement/failure/cancel side effects, conflicting payloads for an existing event id return 409, and `failed` or stale `processing` ids can be retried by Stripe. Later paid Stripe events update Stripe audit state only when ACP is already `cancelled` or `payment_failed`. Direct delegate-token completion is rejected for hosted Stripe sessions and for `cancelled` or `payment_failed` sessions, so terminal Stripe outcomes cannot be bypassed locally. `npm run payment:stripe:configure` validates operator-supplied environment values, rejects Stripe credential names in visible Worker `[vars]`, writes checkout price authority to `wrangler.toml` only with `-- --write-visible-vars --yes --confirm=apply-stripe-payment-worker-config`, rejects `STRIPE_CHECKOUT_MODE` and `STRIPE_CHECKOUT_RETURN_ORIGIN` process input because both belong in Worker `[vars]`, and dry-runs only Worker secret names; it requires `-- --apply --yes --confirm=apply-stripe-payment-worker-config` before calling `wrangler secret put`, and it does not create Stripe Products, Prices, Checkout Sessions, webhook endpoints, or D1 migrations. Deploy `payment:worker:deploy` after visible Worker `[vars]` changes before live Checkout smoke. Apply D1 migrations separately with `npx wrangler d1 migrations apply agenticgraph-storage --remote --config cloudflare/workers/agenticgraph-payment/wrangler.toml`; the Stripe webhook processing migration rebuilds `stripe_webhook_events` so `processed_at` can stay `NULL` while an event is claimed as `processing`. `npm run payment:stripe:readiness` is the non-mutating readiness gate for Worker secrets/visible vars plus remote D1 payment tables, required webhook-processing columns, and nullable in-flight claim fields; it fails if Stripe credentials appear in visible Worker `[vars]`, fails if checkout price authority, checkout mode, or return origin is hidden as a Worker secret, and `-- --live-checkout-create` intentionally asks the Worker to create, persist, expire, and withhold the hosted URL for one test Checkout Session only after config and schema are present; use `-- --live-checkout-timeout-ms=<ms>` only when intentionally adjusting the smoke timeout. As of 2026-06-04, `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are present on `agenticgraph-payment`, and remote D1 has no pending payment migrations; live checkout still fails closed until visible Worker `[vars]` checkout price authority is configured and deployed.

The explicit `--deploy-visible-vars --apply --yes --confirm=apply-stripe-payment-worker-config` configure path can deploy a freshly written checkout price authority before live Checkout smoke.

### Dev -> Prod -> Cloudflare contract

| Stage | Path | Responsibility |
|---|---|---|
| Dev | `$GITHUB_ROOT/agenticgraph` | Source code, docs, tests, Worker configs, and build source |
| Prod mirror | `$GITHUB_ROOT/huijoohwee/content/agenticgraph` | Synced static SPA artifact only |
| Cloudflare Pages | `airvio.co/agenticgraph` | Static app route and hashed assets |
| Cloudflare Workers | `airvio.co/api/storage/*`, `airvio.co/api/payments/*` | D1 storage, crawler access, Stripe checkout, and Stripe webhook routes |
