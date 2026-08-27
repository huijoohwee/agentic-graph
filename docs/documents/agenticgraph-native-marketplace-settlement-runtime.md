# Native marketplace runtime

This document is the operational contract for the AgenticGraph native vendor settlement layer. The Bundle Graph Durable Object remains the authoritative store for bundle state, vendor splits, payout state, and ordered settlement events. D1 stores versioned vendor/rule reference data and non-authoritative reporting projections.

## Commit and payout sequence

1. `ReoptWorker` obtains verified quotes and resolves every quote `agentId` through the `MARKETPLACE_SERVICE` binding.
2. The deterministic projector groups positive-price legs by vendor and computes gross, commission, and net payout amounts in integer minor units. Zero-price legs are explicitly non-payable.
3. `BundleGraphStore.prepareCommit` independently validates the leg partition and persists prepared splits. An unresolved vendor, currency mismatch, malformed rule, or invalid split rejects the cascade before shopper settlement.
4. `BundleGraphStore.commitPreparedCascade` writes the updated legs, authoritative vendor splits, pending payout rows, settlement verification event, split events, and bundle commit event in one SQLite transaction.
5. The Bundle Graph alarm selects the earliest cascade-recovery or payout deadline. A payout is eligible only after the cascade is committed.
6. Before external I/O, the alarm acquires a durable dispatch lease. It then rechecks the vendor's current D1 lifecycle state. Only `active` is payable; suspension freezes the payout.
7. The existing net-settlement binding receives a negative signed amount so the vendor payout is recorded as a refund effect. The split ID is the idempotency key. The response must echo the exact amount, currency, key, effect, settlement ID, and provider reference.
8. Success, bounded retry, circuit-breaker failure, or lifecycle blocking is persisted in SQLite before the D1 reporting projection is updated.

## Operator policy decisions

- Commission is evaluated against each vendor's gross committed leg amount.
- Payout identity is the vendor's `payout_principal_id`; the initial internal cohort reuses its agent ID.
- A suspended or otherwise inactive vendor freezes pending payout dispatch without deleting the split.
- Platform commission is represented by the explicit `commission_amount_minor` column, not a synthetic vendor row.
- The initial `agent-flight`, `agent-hotel`, `agent-experience`, and `agent-shopping` cohort is seeded as the operator-approved active cohort under `travel-standard` revision `1`. Later lifecycle changes use the operator-authenticated transition route.

## Runtime surfaces

- Travel Commerce `GET /v1/bundles/{bundleId}/marketplace` returns authoritative split/payout state and the ordered event journal.
- Travel Commerce `POST /v1/marketplace/vendors/{vendorId}/transition` requires the distinct reconciliation operator bearer token and proxies only the requested target state plus an authenticated operator marker.
- Marketplace Worker `GET /readyz` verifies the D1 schema and baseline rule.
- Marketplace Worker internal endpoints resolve vendors/rules, authorize payout eligibility, accept idempotent projections, and apply validated lifecycle transitions.

The Marketplace Worker has no public route, `workers_dev`, or preview URL. Travel Commerce and Marketplace bindings are explicitly repeated for Dev, Staging, and Production because Cloudflare environment bindings are not inherited.

## Evidence and release boundary

Run `npm run check:marketplace-settlement` for domain/property tests, both Worker typechecks, the Durable Object runtime test, and all three Marketplace Worker dry-run bundles. Run `npm run travel-commerce:dry-run` for all three Travel Commerce bundles. The D1 migration must parse cleanly with four seeded vendors and no foreign-key violations.

These local checks establish a production-capable candidate; they do not apply remote D1 migrations, deploy Workers, merge protected `main`, or prove the public runtime. Those actions remain exclusive to `.github/workflows/release.yml` and its exact candidate-specific human authorization challenge.
