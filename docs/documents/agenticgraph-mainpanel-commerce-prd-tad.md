---
title: "AgenticGraph MainPanel Commerce - PRD & TAD"
doc_type: "PRD+TAD"
doc_id: "KGC-MP-COMMERCE-001"
version: "1.0.4"
status: "Accepted and implemented"
date: "2026-06-04"
authors: ["airvio"]
schema: "kgc-computing-flow/v1"
lang: "en-US"
frontmatter_contract: "required"
tags: ["mainpanel", "commerce", "payments", "agentic-commerce", "stripe", "web3", "solana-pay", "openbox"]
---

# AgenticGraph MainPanel Commerce PRD/TAD

## Status

Accepted and implemented.

This document defines the MainPanel Commerce surface for the implemented Agentic Commerce Protocol, hosted Stripe Checkout, Stripe delegate payment, Web3 settlement, Solana Pay settlement, OpenBOX governance, proof artifact, and trace artifact paths.

## Recommendation

Yes: MainPanel should have a dedicated **Commerce** tab.

Commerce is the canonical top-level operator surface for commerce and payment readiness. Payments remains only a subsection inside Commerce for Stripe and payment-provider configuration.

## Decision

MainPanel should expose **Commerce** as the canonical operator surface for agent-buyable workflows.

Commerce is the canonical superset for Stripe, ACP, Web3, governance, and proof inspection. Rendering both a payment-only top-level tab and Commerce would split one workflow across two panels and create conflicting ownership.

## Scope

In scope:

- ACP configuration and endpoint readiness
- Checkout session lifecycle diagnostics
- Stripe delegate payment readiness
- Web3 payment readiness through Base RPC, EAS attestation, and Solana Pay RPC validation
- OpenBOX risk and proof-ingest readiness
- D1-backed proof and trace artifact inspection
- Worker route health for Dev -> Prod -> Cloudflare parity

Out of scope:

- A custom storefront UI
- A second payment settings registry
- A second commerce worker
- Static demo fixtures or hardcoded seller/project routes
- A payment-only top-level tab rendered beside Commerce

## Product Contract

### User Story

As a AgenticGraph operator, I want one Commerce tab in MainPanel so I can verify seller readiness, payment rails, governance signals, proof artifacts, and worker health before exposing agent-buyable workflows.

### Acceptance Criteria

| ID | Criterion |
|---|---|
| MC-AC1 | MainPanel exposes one canonical Commerce tab for commerce/payment operations. |
| MC-AC2 | Commerce reuses the existing settings/rendering owners instead of creating a parallel panel framework. |
| MC-AC3 | Commerce groups Stripe payment config under `Payments`, not as the whole top-level tab identity. |
| MC-AC4 | Commerce shows ACP config, checkout sessions, Stripe, Web3, Solana Pay, OpenBOX, proofs, and trace readiness as sections. |
| MC-AC5 | Commerce links to live worker routes without hardcoded repo-local or project-specific URLs; route paths come from shared SSOT helpers. |
| MC-AC6 | Commerce does not introduce backfill fixtures, fake chain confirmations, or duplicate artifact writers. |
| MC-AC7 | Focused tests prove that `commerce` exists once and `payments` does not remain a top-level tab key. |
| MC-AC8 | Browser-local WebMCP E2E inspection treats Commerce as a valid MainPanel entry surface alongside MCP and Integrations. |

## Information Architecture

| Section | Purpose | Source Owner |
|---|---|---|
| Overview | ACP seller config, worker route health, D1 readiness, deploy context | `grph-shared/src/payments/agenticCommerceSsot.ts`, payment Worker |
| Sessions | Create/get/cancel/complete diagnostics and idempotency checks | `cloudflare/workers/agenticgraph-payment/agenticCommerce.ts` |
| Payments | Hosted Stripe Checkout, Stripe delegate payment, server-managed key readiness, and remote D1 payment schema readiness | existing payments settings/docs owners |
| Web3 | Base RPC confirmation, Solana Pay transfer-reference confirmation, deposit address, and EAS attestation readiness | `agenticCommerceIntegrations.ts`, `agenticCommerceSolanaPay.ts` |
| Governance | OpenBOX risk API and proof ingest readiness | `agenticCommerceIntegrations.ts` |
| Proofs | `harness-proof.json` and `trace.jsonl` inspection | `agenticCommercePersistence.ts`, artifact routes |

## UI Ownership

| Layer | Owner | Rule |
|---|---|---|
| Tab registry | `canvas/src/features/panels/mainPanelTabs.ts` | Use one canonical Commerce tab key/label; do not render Payments and Commerce as parallel top-level tabs. |
| View shell | `canvas/src/features/panels/MainPanel.tsx` | Reuse the existing lazy hub pattern. |
| Commerce hub | `canvas/src/features/panels/views/CommerceHubView.tsx` | Reuses the existing settings pipeline while adding commerce readiness sections. |
| Settings rows | `SettingsView` and settings registries | Reuse the shared settings pipeline; keep config keys semantically named. |
| Route readiness | `grph-shared/src/payments/agenticCommerceSsot.ts` | `AGENTIC_COMMERCE_MAIN_PANEL_READINESS` is the single section/row/route contract rendered by Commerce and read by agent inspection. |
| Icons | `canvas/src/features/panels/ui/mainPanelTypeIcons.tsx` | Add Commerce through the shared icon SSOT only. |
| Tests | MainPanel panel/icon/settings tests | Guard against duplicate payment-only and Commerce top-level tabs. |

## Naming Rule

Use **Commerce** for the operator surface.

Use **Payments** only as a Commerce subsection for payment-provider readiness. Existing setting keys such as `payments.stripe.*` may remain where they describe payment configuration; they must not force the MainPanel top-level tab to remain named Payments.

## Route And Data Contract

Commerce consumes route metadata from shared owners:

| Capability | Route / Signal | Source Owner |
|---|---|---|
| ACP discovery | `GET /.well-known/acp.json` with `protocol.name: "acp"`, REST transport, and `capabilities.services: ["checkout"]` | `AGENTIC_COMMERCE_ROUTE_PATHS.acpDiscovery` |
| ACP config | `GET /.well-known/acp-config` | `AGENTIC_COMMERCE_ROUTE_PATHS.acpConfig` |
| UCP profile | `GET /.well-known/ucp` with required root `ucp` services, capabilities, payment handlers, and endpoints | `AGENTIC_COMMERCE_ROUTE_PATHS.ucpProfile` |
| MPP OpenAPI | `GET /openapi.json` with `x-payment-info` | `AGENTIC_COMMERCE_ROUTE_PATHS.mppOpenApi` |
| x402 API probes | `GET /api`, `GET /api/v1`, and `GET /api/payments/commerce/x402` return middleware-backed HTTP 402 with an operator-owned `payTo` address | `AGENTIC_COMMERCE_X402_ROUTE_PATHS`, `X402_PAY_TO_ADDRESS`, `payment:x402:configure`, `payment:x402:readiness` |
| Checkout sessions | `/checkout/sessions` and session item routes | `AGENTIC_COMMERCE_ROUTE_PATHS.checkoutSessions` |
| Stripe Checkout status | Hosted Checkout status route, D1/live Stripe status refresh, and paid/no-payment-required unlock guard | `STRIPE_PAYMENT_ROUTE_PATHS.checkoutSession`, payment Worker |
| Stripe webhook settlement | Stripe webhook route and ACP settlement path | `STRIPE_PAYMENT_ROUTE_PATHS.webhook`, `AGENTIC_COMMERCE_ROUTE_PATHS.commerceWebhook` |
| Stripe D1 migrations | Payment Worker D1 migration command for pending Stripe/ACP schema changes | `payment:d1:migrate:remote`, `STRIPE_PAYMENT_D1_MIGRATION_APPLY_COMMAND_TEMPLATE` |
| Stripe readiness gate | Worker secret names, visible Worker vars including checkout mode and return origin, remote D1 payment tables, required webhook-processing columns, and bounded optional hosted Checkout create-and-expire smoke | `STRIPE_PAYMENT_READINESS_CHECK_SUMMARY`, `payment:stripe:readiness` |
| Agentic payment readiness gate | Visible Worker vars for ACP, Web3, x402, OpenBOX, and Solana Pay plus required ACP/OpenBOX Worker secrets | `AGENTIC_COMMERCE_PAYMENT_READINESS_CHECK_SUMMARY`, `payment:agentic:readiness` |
| Combined payment readiness | Final post-config payment readiness wrapper for Stripe, agentic-payment, and x402 gates | `payment:readiness`, `payment:stripe:readiness`, `payment:agentic:readiness`, `payment:x402:readiness` |
| Web3 settlement | Web3 settlement route | `AGENTIC_COMMERCE_ROUTE_PATHS.web3Settle` |
| Solana Pay settlement | Solana Pay signature settlement route; verifies RPC transaction reference, recipient, amount, optional SPL token mint, and memo before proof emission | `AGENTIC_COMMERCE_ROUTE_PATHS.solanaPaySettle`, `SOLANA_PAY_RECIPIENT`, `SOLANA_PAY_SPL_TOKEN`, `SOLANA_PAY_RPC_URL` |
| OpenBOX ingest | OpenBOX ingest route | `AGENTIC_COMMERCE_ROUTE_PATHS.openboxIngest` |
| Proof artifact | Commerce proof artifact route | `AGENTIC_COMMERCE_ROUTE_PATHS.commerceProofArtifact` |
| Trace artifact | Commerce trace artifact route | `AGENTIC_COMMERCE_ROUTE_PATHS.commerceTraceArtifact` |

Do not duplicate route strings locally in the UI if a shared route helper exists.

Production x402 readiness must reject the shared deterministic fallback `payTo`
address and the zero-address future-setup placeholder. Use
`payment:x402:configure -- --write-visible-vars --yes
--confirm=apply-stripe-payment-worker-config` to write an operator-owned
`X402_PAY_TO_ADDRESS` into `agenticgraph-payment` Worker `[vars]`, then deploy
before treating machine-native x402 payments as payable.

For the MainPanel operator view, `buildAgenticCommerceMainPanelReadiness` derives
`AGENTIC_COMMERCE_MAIN_PANEL_READINESS` from those route owners and the shared
`buildAgenticCommerceSemanticKey` helper. Commerce UI rows use each shared row semantic key, and
browser-local agent inspection reads the same readiness snapshot instead of rebuilding it.

## Implementation Record

| Step | Implemented Owner | Evidence |
|---|---|---|
| Replace top-level Payments with Commerce | `canvas/src/features/panels/mainPanelTabs.ts` | `MainPanelTabKey` includes `commerce`; there is no top-level `payments` key. |
| Render Commerce via existing MainPanel lazy hub | `canvas/src/features/panels/MainPanel.tsx` | `CommerceHubView` is loaded through the shared MainPanel view map. |
| Keep Payments as a subsection | `canvas/src/features/panels/views/CommerceHubView.tsx` | The view renders route readiness first, then delegates payment rows to `SettingsView mode="payments"`. |
| Reuse route SSOT helpers | `CommerceHubView.tsx`, shared payment packages | Commerce rows read `AGENTIC_COMMERCE_ROUTE_PATHS` and `STRIPE_PAYMENT_ROUTE_PATHS`. |
| Publish agent-ready Commerce snapshot | `CommerceHubView.tsx`, `browserLocalSurfaceSnapshots.ts`, `localMainPanelChatCanvasPipelineInspection.ts` | WebMCP E2E inspection reports Commerce readiness with the shared semantic key and route count. |
| Keep entry tabs explicit | `localMainPanelChatCanvasPipelineInspection.ts` | MCP, Integrations, and Commerce are accepted as first-class E2E entry tabs; stale Payments tab state is rejected instead of compatibility-remapped. |
| Reuse shared icon metadata | `canvas/src/features/panels/ui/mainPanelTypeIcons.tsx` | Commerce icon metadata is added through the MainPanel icon SSOT. |
| Guard against duplicate tabs | `canvas/src/__tests__/mainPanelCommerce.test.tsx` | Tests assert Commerce renders and Payments is not a top-level tab. |
| Surface Stripe readiness gate | `stripePaymentApiDocs.ts`, `stripePaymentSsot.ts` | Commerce renders `stripeApi.worker.d1_migrations` and `stripeApi.worker.readiness_gate`, including Worker secrets, visible Worker vars, checkout mode and return origin not hidden as secrets, remote D1 payment tables, required webhook-processing columns, and bounded optional live Checkout create-and-expire smoke. |
| Surface Solana Pay readiness | `agenticCommerceSolanaPay.ts`, `agenticCommerceSolanaPaySsot.ts` | Commerce readiness includes the Solana Pay settle route while checkout creation returns a generated `solana:` transfer URL and reference from the shared semantic-key owner. |
| Keep Dev -> Prod -> Cloudflare deploy path intact | `scripts/build-pages-functions-worker.mjs`, Pages sync/deploy scripts | Pages functions worker is built before deploy so commerce UI and API routes stay published together. |

## Validation Contract

| Gate | Command / Probe | Expected Result |
|---|---|---|
| MainPanel Commerce focused tests | `npm --prefix canvas run test:ci:unit -- "ui.mainPanel.commerce"` | Commerce tab exists, renders route readiness, and excludes top-level Payments. |
| Stripe payment focused tests | `npm --prefix canvas run test:ci:unit -- "payments.stripe"` | Commerce Stripe rows, hosted Checkout, status refresh, config helper, readiness helper, and remote D1 table/column schema checks pass. |
| Solana Pay focused tests | `npm --prefix canvas run test:ci:unit -- "worker.payments.agenticCommerce.solanaPay"` | Solana Pay checkout URL/reference generation, RPC-backed settlement, and generic-webhook bypass rejection pass. |
| MainPanel entry-tab inspector | `npm --prefix canvas run test:ci:unit -- "agentReady.localMainPanelChatCanvasPipeline"` | MCP, Integrations, and Commerce all pass the same E2E readiness fixture; stale Payments is reported as an issue. |
| MainPanel hub regression | `npm --prefix canvas run test:ci:unit -- "ui.mainPanel.commerceHub"` | Commerce hub keeps shared MainPanel controls stable. |
| WebMCP E2E readiness | `npm --prefix canvas run test:ci:unit -- "agentReady.webMcpRuntime.lateBinding.sameOriginStoragePaths"` | Browser-local pipeline inspection exposes Commerce readiness with the shared semantic key. |
| Type surface | `npm --prefix canvas exec tsc -- -p canvas/tsconfig.json --noEmit --pretty false` | MainPanel tab and view types compile without aliases. |
| Repo hygiene | `npm run hygiene:check` | Changed files pass current hygiene rules. |
| Pages publication | `npm run pages:functions:build && npm run pages:check-sync` | Functions worker and production mirror remain deploy-ready. |

## Non-Goals And Guards

- Do not add local aliases that keep a stale `payments` MainPanel tab alive beside Commerce.
- Do not add compatibility remapping for old tab labels unless a current source owner requires it for a persisted setting key.
- Do not hardcode `airvio.co`, repo paths, seller IDs, or Cloudflare project names in UI logic.
- Do not recalculate proof state in the UI; read artifacts from the Worker/D1-backed routes.
- Do not reimplement Stripe, Base RPC, Solana RPC, EAS, or OpenBOX clients in the browser.
- Do not let the generic commerce webhook settle Solana Pay sessions; Solana Pay settlement must verify the transaction signature through the Worker route.

## Traceability

| Source Contract | MainPanel Commerce Impact |
|---|---|
| `agenticgraph-agentic-commerce-prd-tad.md` | Defines ACP, checkout, Web3, OpenBOX, proof, and trace runtime behavior. |
| `agenticgraph-mcp/agenticgraph-stripe-mcp-service.md` | Remains Stripe MCP/service documentation, not the top-level commerce UI owner. |
| `agenticgraph-settings-document.md` | Remains settings architecture owner for row rendering and generated schema. |
| `agenticgraph-cross-repo-publish-topology.md` | Remains Dev -> Prod -> Cloudflare topology owner. |
