# MiaoXYZ Worker

This standalone Worker owns the florist catalog, deterministic arrangement pricing, request intake, and operator queue. It does not charge buyers, reserve stock, send email, or depend on a third-party catalog.

## Local development

Run the Worker from this directory with `npm run dev`, or run `npm run miaoxyz:dev` from the repository root. The dev command applies pending migrations to Wrangler's local D1 database, then starts the Worker. It does not contact a remote database.

Before using the private florist tools, prepare local variables and review the data in your local database:

1. Copy dev.vars.example to .dev.vars and replace both values with different random strings of at least 32 characters.
2. Run `npm run dev`.
3. Open the printed local URL. Use Florist access to configure the store and publish only florist-approved catalog data.

The local D1 database is separate from any Cloudflare database. No sample flowers, prices, or service areas are seeded. On loopback hosts, the public page defaults to a clearly labeled synthetic preview held in browser memory; add `?preview=empty` to inspect the actual local catalog. This preview disables request submission and never writes its products to D1. Public request intake stays disabled until the operator configures a published catalog, service area, privacy notice, retention period, delivery fee if applicable, and fulfillment method. The deployment must also explicitly approve `PRIVACY_BASELINE_APPROVED`, `DATA_REGION_APPROVED`, `BACKUP_RESTORE_APPROVED`, and `RATE_LIMIT_REVIEW_APPROVED`, and provide `OPERATOR_ACCESS_TOKEN` and `RATE_LIMIT_HMAC_SECRET`; all approvals are `false` in committed configuration.

## Catalog format

Publish an array of 1–40 florist-approved products through the studio desk. Each product has these fields:

| Field | Format |
|---|---|
| `id` | Unique lowercase slug, 2–48 letters, digits, or hyphens |
| `name`, `description` | Plain text, up to 80 and 500 characters |
| `basePriceMinor` | Positive integer cents in SGD |
| `occasionTags`, `paletteTags` | Arrays of up to eight short plain-text tags |
| `available` | Boolean; unavailable designs are hidden from buyers |
| `availableFrom`, `availableUntil` | Inclusive `YYYY-MM-DD` dates |
| `choices` | Exactly `size` and `stems`; each is an array of 1–6 options |
| Choice fields | Unique `id`, plain-text `label`, signed integer `priceDeltaMinor`, and boolean `available` |
| `finishing` | Exactly `ribbon`, `outerWrap`, and `innerWrap`; each is an array of 1–8 finish options |
| Finish fields | Unique `id`, plain-text `label`, signed integer `priceDeltaMinor`, six-digit `colorHex`, and boolean `available` |
| `flowers` | Array of 1–24 florist-approved stem types, each with `id`, `label`, positive `pricePerStemMinor`, `colorHex`, and `available` |
| `recipe` | Base arrangement as 1–24 unique `{id, quantity}` rows; each row references an available flower and uses a quantity from 1–12; total included stems cannot exceed 30 |

Each choice, finish, and flower group must contain at least one available item. Flower IDs in a recipe or request must be unique. Each selected flower quantity is 1–12 and the whole composition is limited to 30 stems. Request flower groups can include one bounded layout record per stem (`offsetX` and `offsetY` from −240 to 240; `scale` from 0.5 to 2; `rotation` from −180° to 180°; and a horizontal mirror flag). Layout is retained for florist review and does not affect the server-recomputed estimate. The editor draws an original local SVG composition from the florist-approved recipe, flower colors, and wrapping colors; the catalog accepts no image URL or unrecognized field.

The displayed estimate is the published base price plus selected size, stem-recipe, and wrapping deltas, plus the selected flower subtotal minus the included recipe subtotal. This keeps the published base recipe at the base price while pricing added or removed stems at the florist-set per-stem rate. A catalog combination is capped at S$28,000 before delivery; the delivery fee is capped at S$2,000, keeping the request total at or below S$30,000. Values are integer SGD cents. A delivery fee is set separately in Studio profile and included in the buyer’s estimate when delivery is selected; enter `0` only when the florist confirms delivery is free.

Buyers can compare up to three designs, customize one design at a time, change an individual flower variety, position, size, rotation, and horizontal orientation, and use undo/redo plus tab-local snapshots for compositions. Selected-layer controls are named semantic form controls, and individual flower layers are exposed as selectable SVG groups with hit-testable move and scale affordances. Buyers can bring a selected flower back into view or remove it. Snapshots contain the catalog revision, bouquet choices, flower counts, and layer transforms, not contact details. Snapshot records stay in the browser tab session; when a buyer submits a request, the current layer layout is included in the immutable request snapshot.

## Data and privacy controls

- D1 stores only the published catalog, request details required for florist follow-up, immutable price snapshots, status history, and short-lived rate-limit digests.
- The request API requires a same-origin JSON post, a unique idempotency key, explicit request-only consent, an allowed catalog revision, and server-recomputed price.
- Request bodies and customer details are never written to application logs.
- Staff endpoints require the OPERATOR_ACCESS_TOKEN secret. The browser keeps that token in session storage only.
- A scheduled task removes request records, status history, and operator-event rows linked to those requests after 30 days, and expires rate-limit digests. A D1 index on `operator_events.object_id` supports the linked-event purge.
- The approved application retention period is fixed at 30 days in the operator interface, API, and database migration.
- Cloudflare D1 keeps provider-managed recovery history beyond application-row deletion: up to 7 days on Workers Free or up to 30 days on Workers Paid. Disclose the applicable plan window in the florist's buyer notice before enabling intake.

## Release boundary

The production route is `airvio.co/MiaoXYZ` and `airvio.co/MiaoXYZ/*`; Cloudflare route paths are case-sensitive. Wrangler is pinned in this package and the generated Worker types come from `wrangler types`.

Production remains blocked while its D1 ID is a placeholder or any approval flag is `false`. The selected APAC placement is best-effort and does not guarantee Singapore or Malaysia residency. Before release, the owner must set both required secrets in the protected `production` environment and retain the exact privacy, data-region, backup/restore, and rate-limit evidence. Customer request intake remains disabled until a florist configures the shop, publishes a catalog, and enters its buyer notice.

The `miaoxyz_governance_evidence` workflow input accepts this JSON shape; each digest must identify a retained evidence record, and `reviewedAt` must be a canonical UTC timestamp:

```json
{
  "schema": "agentic-miaoxyz-production-governance-evidence/v1",
  "status": "approved",
  "privacyBaselineDigest": "<64 lowercase hex characters>",
  "dataRegionDigest": "<64 lowercase hex characters>",
  "backupRestoreDigest": "<64 lowercase hex characters>",
  "rateLimitReviewDigest": "<64 lowercase hex characters>",
  "reviewedAt": "<YYYY-MM-DDTHH:mm:ss.sssZ>"
}
```

Candidate capture also requires the repository secret `CLOUDFLARE_READ_API_TOKEN` with Zone Read, Workers Routes Read, Workers Scripts Read, and D1 read access, plus the repository variables `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_ZONE_ID` (the zone ID must resolve to `airvio.co`). The route owner and route inventory are bound to the candidate; overlapping `/MiaoXYZ` routes owned by another Worker block release. Promote only an exact reviewed source candidate through `.github/workflows/release.yml` with `release_target=miaoxyz`; the candidate-specific authorization command shown by that workflow must approve the pending `production` deployment. The controller refuses to execute its production mutation command outside that exact protected workflow job. Do not run Wrangler deployment or remote D1 migration commands from a developer checkout.
