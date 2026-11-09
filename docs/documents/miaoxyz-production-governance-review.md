---
title: "MiaoXYZ Production Governance Review"
doc_type: "Production Governance Evidence"
version: "1.0.0"
date: "2026-11-09"
owner: "Product Owner"
source_revision: "572baf9d60583d6b6c8264a2b0152310b3054a1c"
review_status: "pending-owner-approval"
---

# MiaoXYZ Production Governance Review

This record captures the production data-location decision and the technical evidence needed for the MiaoXYZ release gate. It records code and provider observations; it does not claim legal review, backup/restore rehearsal, or security approval where none has been recorded.

## Owner decision and current database observation

On 2026-11-09, the product owner chose to continue with Cloudflare D1 in APAC on a best-effort basis. This accepts an APAC placement preference for this deployment. It does not require Singapore or Malaysia specifically and does not assert a data-residency guarantee.

Read-only Wrangler observation on 2026-11-09 for `agentic-miaoxyz-production` (`cc6558f0-03cd-4401-8c20-51909b437174`) reported `running_in_region: APAC`, `jurisdiction: null`, and `read_replication.mode: disabled`. A read-only remote schema query returned only the `_cf_KV` and `d1_migrations` system/metadata tables. The migration inventory showed `0001_initial.sql` and `0002_delivery_fee.sql` pending; no MiaoXYZ application tables have been installed. No application requests were read or written by these observations.

Cloudflare documents that `apac` is a location hint, not a guarantee, and that its currently supported jurisdiction restrictions are `eu`, `fedramp`, and `us`. D1 therefore cannot provide a Singapore- or Malaysia-specific residency guarantee for this database. The Worker may access D1 from other locations. The owner’s APAC best-effort choice is recorded with that limitation. A stricter residency requirement would need a different storage decision before collecting buyer data. See [D1 data location](https://developers.cloudflare.com/d1/configuration/data-location/).

## Evidence records

Each record is a byte-stable block between its named markers. Its SHA-256 digest is calculated over the UTF-8 bytes inside the markers, excluding the marker lines. The digests identify retained evidence records; they do not turn a pending review into an approval.

### Privacy baseline — pending owner approval

<!-- RECORD privacy-baseline BEGIN -->
Source review at `572baf9d60583d6b6c8264a2b0152310b3054a1c`: `cloudflare/workers/miaoxyz/src/requests.ts` accepts buyer name, email or phone contact, service date, fulfillment choice, a delivery address only for delivery, optional message, bouquet configuration, and the privacy-notice version. The request is described as a request only; the code does not take payment or reserve stock. `cloudflare/workers/miaoxyz/src/operator.ts` protects staff endpoints with the operator secret. `cloudflare/workers/miaoxyz/src/worker.ts` schedules deletion of expired request rows and their status history using the florist-configured 1–365 day retention period. The request purge does not currently delete `operator_events`; status events can retain a request identifier after its request row is purged. Cloudflare D1 Time Travel remains on after application-row deletion. Cloudflare documents a restore window of up to 30 days on Workers Paid and up to 7 days on Workers Free; the account plan is not recorded in this evidence. Owner review still needs to approve the buyer notice, purpose, retention rule, event-row treatment, deletion expectations, and disclosure of the applicable backup/history window before intake is enabled. No legal conclusion is made here. Status: pending.
<!-- RECORD privacy-baseline END -->

### Data region — owner decision recorded; narrow scope

<!-- RECORD data-region BEGIN -->
Owner decision dated 2026-11-09: continue with the observed APAC D1 primary as best-effort. Provider readback reported APAC, no jurisdiction restriction, and read replication disabled; the pending migration list and system-table-only schema were also observed read-only. Cloudflare’s D1 location documentation says location hints do not guarantee placement and lists no Singapore or Malaysia jurisdiction. This decision approves the APAC best-effort placement choice for this deployment only; it is not a statutory-residency approval and does not approve personal-data collection. Re-observe provider state during candidate preparation. Status: owner-selected, limited to best-effort APAC.
<!-- RECORD data-region END -->

### Backup and restore — pending rehearsal and owner approval

<!-- RECORD backup-restore BEGIN -->
Cloudflare’s current D1 Time Travel documentation states that history is always on and supports point-in-time restore to any minute within the previous 30 days on Workers Paid or 7 days on Workers Free; the account plan has not been recorded. A read-only `wrangler d1 time-travel info` query returned a current bookmark on 2026-11-09, confirming that the command is available for this database; this is not a restore rehearsal. Cloudflare documents restore as destructive and in-place. The production D1 exists, but both application migrations are still pending; there is no MiaoXYZ schema or retained restore-rehearsal receipt yet. Before production migration or buyer intake, rehearse restore against a separate non-production database, verify the restored schema and representative synthetic rows, capture the pre-restore state and recovery procedure, and retain the result. Do not rehearse by restoring the production database. Owner approval remains pending. Reference: [D1 Time Travel and backups](https://developers.cloudflare.com/d1/reference/time-travel/).
<!-- RECORD backup-restore END -->

### Rate-limit review — code review complete; approval pending

<!-- RECORD rate-limit-review BEGIN -->
Source review at `572baf9d60583d6b6c8264a2b0152310b3054a1c`: `cloudflare/workers/miaoxyz/src/validation.ts` sets a limit of five requests per ten-minute window. `cloudflare/workers/miaoxyz/src/requests.ts` derives the bucket with HMAC-SHA-256 over the Cloudflare client IP and window start, stores the digest and count with a twenty-minute expiry, and returns 429 after the limit. The raw address is not inserted into the application D1 tables by this path. The scheduled cleanup runs daily at 03:17 UTC, so an expired bucket may remain until the next run. Missing rate-limit secret or client IP fails closed; code-review found no production load/abuse exercise, alerting evidence, or owner-approved threshold. The operator must confirm the threshold and response, keep the HMAC secret protected, and decide whether the daily purge delay is acceptable. No secret values are recorded here. Status: pending owner approval.
<!-- RECORD rate-limit-review END -->

## Approval state and release gate

| Gate | Status | Evidence needed before its source flag can be true |
|---|---|---|
| `DATA_REGION_APPROVED` | Owner’s APAC best-effort choice recorded | Re-observe the D1 location and keep the documented no-guarantee limit bound to the exact candidate |
| `PRIVACY_BASELINE_APPROVED` | Pending | Owner approval of notice, collection purpose, retention/deletion behavior, operator-event retention, and D1 history window |
| `BACKUP_RESTORE_APPROVED` | Pending | Retained non-production restore-rehearsal evidence and owner approval of recovery procedure |
| `RATE_LIMIT_REVIEW_APPROVED` | Pending | Owner approval of the five-per-ten-minute threshold, expiry/purge behavior, and retained security review |

The production gate requires all four approval flags, both required secrets, a real production D1 UUID, and a candidate carrying an `approved` governance-evidence object with four retained SHA-256 records. This document does not authorize changing pending flags to `true`, applying migrations, enabling order intake, or deploying the Worker. The D1 database currently has no MiaoXYZ application schema, and production migrations must run only through the protected release workflow after the required evidence and approvals exist.

## Record digests

The four digests below are SHA-256 over the exact UTF-8 contents between each matching marker pair above, excluding marker lines. A change inside a record requires recalculating its digest.

| Record | SHA-256 |
|---|---|
| Privacy baseline | `9b6ae8f31f74670e1812cec5c811c4271696bfd0777c45569d8318c1f8c0f49b` |
| Data region | `b6eb902f742a5d8cec065c25c0647e8c85d55d97264a99cc4f71989a770c8266` |
| Backup and restore | `b24e352fd4482781f6cf8e46afd2f53be6e8db93f12c6b56570ce8f0fcdb0924` |
| Rate-limit review | `5465628d632381593c206f9ad32157e65466abb94a157a7199d99aae93fe6bbd` |
