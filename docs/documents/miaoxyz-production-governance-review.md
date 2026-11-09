---
title: "MiaoXYZ Production Governance Review"
doc_type: "Production Governance Evidence"
version: "1.0.0"
date: "2026-11-10"
owner: "Product Owner"
source_revision: "be18af6a013256596672604eba882248f42ecf71"
review_status: "all-governance-gates-approved-candidate-pending"
---

# MiaoXYZ Production Governance Review

This record captures the production data-location decision and the technical evidence needed for the MiaoXYZ release gate. It records code and provider observations; it does not claim legal review or backup/restore approval where none has been recorded.

## Owner decision and current database observation

On 2026-11-09, the product owner chose to continue with Cloudflare D1 in APAC on a best-effort basis. This accepts an APAC placement preference for this deployment. It does not require Singapore or Malaysia specifically and does not assert a data-residency guarantee.

Read-only Wrangler observation on 2026-11-09 for `agentic-miaoxyz-production` (`cc6558f0-03cd-4401-8c20-51909b437174`) reported `running_in_region: APAC`, `jurisdiction: null`, and `read_replication.mode: disabled`. A read-only remote schema query returned only the `_cf_KV` and `d1_migrations` system/metadata tables. The migration inventory showed `0001_initial.sql` and `0002_delivery_fee.sql` pending; no MiaoXYZ application tables have been installed. No application requests were read or written by these observations.

Cloudflare documents that `apac` is a location hint, not a guarantee, and that its currently supported jurisdiction restrictions are `eu`, `fedramp`, and `us`. D1 therefore cannot provide a Singapore- or Malaysia-specific residency guarantee for this database. The Worker may access D1 from other locations. The owner’s APAC best-effort choice is recorded with that limitation. A stricter residency requirement would need a different storage decision before collecting buyer data. See [D1 data location](https://developers.cloudflare.com/d1/configuration/data-location/).

## Evidence records

Each record is a byte-stable block between its named markers. Its SHA-256 digest is calculated over the UTF-8 bytes inside the markers, excluding the marker lines. The digests identify retained evidence records; they do not turn a pending review into an approval.

### Privacy baseline — owner approved

<!-- RECORD privacy-baseline BEGIN -->
Owner decision dated 2026-11-10: approve 30-day retention for request records and purge of linked operator-event rows. Requests collect the buyer name and email or phone contact, service date, fulfillment choice, delivery address only for delivery, optional message, bouquet configuration, and privacy-notice version so the florist can follow up. A submission is a request only; it does not take payment or reserve stock. The operator API is protected by the operator secret. The scheduled purge selects expired request IDs, deletes `operator_events` rows whose `object_id` matches those IDs, then removes the matching status history and request rows. Retention is fixed at 30 days in the profile UI, API, and D1 migration. Cloudflare D1 Time Travel remains provider-managed after application-row deletion and can retain history up to 7 days on Workers Free or 30 days on Workers Paid. The available Cloudflare token could not read the account subscription endpoint (HTTP 403), so the account's specific plan remains unverified; the florist's buyer notice must disclose both possible limits until the plan is observed. The notice and store identity still need operator configuration before intake. This record is a product-owner policy decision, not a legal conclusion. Status: approved for the 30-day retention and linked-event deletion baseline.
<!-- RECORD privacy-baseline END -->

### Data region — owner decision recorded; narrow scope

<!-- RECORD data-region BEGIN -->
Owner decision dated 2026-11-09: continue with the observed APAC D1 primary as best-effort. Provider readback reported APAC, no jurisdiction restriction, and read replication disabled; the pending migration list and system-table-only schema were also observed read-only. Cloudflare’s D1 location documentation says location hints do not guarantee placement and lists no Singapore or Malaysia jurisdiction. This decision approves the APAC best-effort placement choice for this deployment only; it is not a statutory-residency approval and does not approve personal-data collection. Re-observe provider state during candidate preparation. Status: owner-approved, limited to best-effort APAC.
<!-- RECORD data-region END -->

### Backup and restore — owner approved for candidate preparation

<!-- RECORD backup-restore BEGIN -->
Cloudflare’s current D1 Time Travel documentation states that history is always on and supports point-in-time restore to any minute within the previous 30 days on Workers Paid or 7 days on Workers Free. A read-only `wrangler d1 time-travel info` query returned a current bookmark on 2026-11-09. The owner authorized a protected GitHub Actions rehearsal on 2026-11-10 SGT. Workflow run [42667311274](https://github.com/huijoohwee/agentic-graph/actions/runs/42667311274), attempt 1, executed source revision `ccfb0303100a4ec618798c3e0ea14abe27a3a277`. It created temporary D1 `miaoxyz-rehearsal-42667311274-1` (`e55ca88e-c32a-48aa-be18-c46651777f5d`) with the APAC hint; Cloudflare reported `APAC`. The workflow seeded two synthetic rows, captured the pre-mutation bookmark (SHA-256 `6fd6794ac3c788a541c0110ae2b1f85f09a28abaa6043b8b32b628cc627e0c18`), mutated both rows, restored to the bookmark, verified both original rows, and deleted the temporary database. The sanitized receipt is retained at `docs/evidence/miaoxyz-d1-restore-rehearsal-20261109.json` (SHA-256 `c955fe9390fcc2e14618db9871a96b3ca2d04eb1024de6b18b0426e785156492`). GitHub’s artifact digest is `131b6ea19a825abef9c79ca41e10a519ae72ac1e909553370e81f4ee548dfcb3`; its configured repository retention expires on 2026-11-10 at 17:42:59 UTC, so the repository copy is the durable receipt. The receipt reports `productionDatabaseTouched: false` and `workerRoutesTouched: false`; D1 API calls targeted only the temporary database ID. This validates the restore mechanism against synthetic data only. Cloudflare documents restore as destructive and in-place. The account’s Free/Paid plan remains unverified, so its provider-history window is still 7 or 30 days. Owner decision dated 2026-11-10: accept this passing synthetic rehearsal and retained receipt as sufficient backup/restore evidence for candidate preparation, and set `BACKUP_RESTORE_APPROVED` true for the Production candidate gate. This decision grants no authority to restore the production D1; any actual production restore requires separate owner authorization bound to the exact recovery action and protected workflow. Reference: [D1 Time Travel and backups](https://developers.cloudflare.com/d1/reference/time-travel/).
<!-- RECORD backup-restore END -->

### Rate-limit review — owner approved

<!-- RECORD rate-limit-review BEGIN -->
Owner decision dated 2026-11-10: approve the current control values: five requests per 10-minute window, HMAC-SHA-256 bucket expiry after 20 minutes, and daily cleanup at 03:17 UTC. The request path does not store the raw client address in application D1 tables. An expired bucket can remain until the next daily cleanup run. Missing rate-limit secret or client IP fails closed. No production load/abuse exercise or alerting evidence is claimed. The HMAC secret remains protected; no secret values are recorded here. Status: owner-approved for the documented current values.
<!-- RECORD rate-limit-review END -->

## Approval state and release gate

| Gate | Status | Evidence needed before its source flag can be true |
|---|---|---|
| `DATA_REGION_APPROVED` | Owner approved APAC best-effort, with no country-specific guarantee | Re-observe the D1 location and keep the documented limit bound to the exact candidate |
| `PRIVACY_BASELINE_APPROVED` | Owner approved 30-day request retention and linked operator-event purge; buyer notice must disclose D1 history limits | Retain this decision digest and require operator notice configuration before intake |
| `BACKUP_RESTORE_APPROVED` | Owner approved the passed synthetic rehearsal for candidate preparation | Preserve the receipt; separately authorize each actual production restore action |
| `RATE_LIMIT_REVIEW_APPROVED` | Owner approved five requests per 10 minutes, 20-minute HMAC expiry, and 03:17 UTC cleanup | Retain this decision digest and keep the secret protected |

The production gate requires all four approval flags, both required secrets, a real production D1 UUID, and a candidate carrying an `approved` governance-evidence object with four retained SHA-256 records. All four owner-approved source flags are true for candidate preparation. The backup/restore decision does not authorize a production restore, migration, order-intake enablement, or Worker deployment. The production D1 currently has no MiaoXYZ application schema, and its migrations may run only through the protected release workflow after a candidate is prepared and its exact authorization is recorded.

## Record digests

The four digests below are SHA-256 over the exact UTF-8 contents between each matching marker pair above, excluding marker lines. A change inside a record requires recalculating its digest.

| Record | SHA-256 |
|---|---|
| Privacy baseline | `1128d0883fe261d91b90b07f58cfbff37dd6940d39374a55a08afd3c5a3dd3cf` |
| Data region | `cc925159999b5d8c42bff7111aef2bdfb25898c1f576dd8b77739ef03c335540` |
| Backup and restore | `821ea6ee55969adf43846ec31bbc110612cf29163923f9e594b617ba51839adf` |
| Rate-limit review | `99e8a94882aa65e5c013480d8d6f31d83dc6f4de255e6ccbf9a99c0473cedba7` |
