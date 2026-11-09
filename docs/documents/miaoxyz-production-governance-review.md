---
title: "MiaoXYZ Production Governance Review"
doc_type: "Production Governance Evidence"
version: "1.0.0"
date: "2026-11-10"
owner: "Product Owner"
source_revision: "551e144f73512d27c2310c3b266612d27937aa39"
review_status: "privacy-and-rate-limit-approved-backup-rehearsal-pending"
---

# MiaoXYZ Production Governance Review

This record captures the production data-location decision and the technical evidence needed for the MiaoXYZ release gate. It records code and provider observations; it does not claim legal review, backup/restore rehearsal, or security approval where none has been recorded.

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

### Backup and restore — pending rehearsal and owner approval

<!-- RECORD backup-restore BEGIN -->
Cloudflare’s current D1 Time Travel documentation states that history is always on and supports point-in-time restore to any minute within the previous 30 days on Workers Paid or 7 days on Workers Free. A read-only `wrangler d1 time-travel info` query returned a current bookmark on 2026-11-09. The owner authorized a protected GitHub Actions rehearsal dated 2026-11-10 using one temporary D1 database with synthetic rows and an APAC location hint. The workflow must capture a pre-mutation bookmark, mutate synthetic data, restore to that bookmark, verify the restored rows, and delete only the temporary database. It must not access or mutate the production D1 database or Worker routes. The workflow implementation is pending merge and no rehearsal receipt is retained yet. Cloudflare documents restore as destructive and in-place; this rehearsal confines that operation to the temporary database. Status: rehearsal authorized, evidence pending. Reference: [D1 Time Travel and backups](https://developers.cloudflare.com/d1/reference/time-travel/).
<!-- RECORD backup-restore END -->

### Rate-limit review — code review complete; approval pending

<!-- RECORD rate-limit-review BEGIN -->
Owner decision dated 2026-11-10: approve the current control values: five requests per 10-minute window, HMAC-SHA-256 bucket expiry after 20 minutes, and daily cleanup at 03:17 UTC. The request path does not store the raw client address in application D1 tables. An expired bucket can remain until the next daily cleanup run. Missing rate-limit secret or client IP fails closed. No production load/abuse exercise or alerting evidence is claimed. The HMAC secret remains protected; no secret values are recorded here. Status: owner-approved for the documented current values.
<!-- RECORD rate-limit-review END -->

## Approval state and release gate

| Gate | Status | Evidence needed before its source flag can be true |
|---|---|---|
| `DATA_REGION_APPROVED` | Owner approved APAC best-effort, with no country-specific guarantee | Re-observe the D1 location and keep the documented limit bound to the exact candidate |
| `PRIVACY_BASELINE_APPROVED` | Owner approved 30-day request retention and linked operator-event purge; buyer notice must disclose D1 history limits | Retain this decision digest and require operator notice configuration before intake |
| `BACKUP_RESTORE_APPROVED` | Protected synthetic rehearsal authorized; evidence pending | Retain the exact non-production restore-rehearsal receipt and verify production D1/routes were untouched |
| `RATE_LIMIT_REVIEW_APPROVED` | Owner approved five requests per 10 minutes, 20-minute HMAC expiry, and 03:17 UTC cleanup | Retain this decision digest and keep the secret protected |

The production gate requires all four approval flags, both required secrets, a real production D1 UUID, and a candidate carrying an `approved` governance-evidence object with four retained SHA-256 records. The three owner-approved source flags are true in this candidate; backup/restore remains false until the protected synthetic rehearsal passes and its receipt is retained. No production D1 migration, order-intake enablement, or Worker deployment is authorized by this document. The production D1 currently has no MiaoXYZ application schema, and its migrations may run only through the protected release workflow after all four evidence records are approved.

## Record digests

The four digests below are SHA-256 over the exact UTF-8 contents between each matching marker pair above, excluding marker lines. A change inside a record requires recalculating its digest.

| Record | SHA-256 |
|---|---|
| Privacy baseline | `1128d0883fe261d91b90b07f58cfbff37dd6940d39374a55a08afd3c5a3dd3cf` |
| Data region | `cc925159999b5d8c42bff7111aef2bdfb25898c1f576dd8b77739ef03c335540` |
| Backup and restore | `48b297bfb275e2dfbaad95a6ee333db5c1c7fa8f15392f208932f462e88c7398` |
| Rate-limit review | `99e8a94882aa65e5c013480d8d6f31d83dc6f4de255e6ccbf9a99c0473cedba7` |
