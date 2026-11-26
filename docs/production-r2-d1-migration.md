---
title: "Graph R2 to D1 blob migration"
doc_type: "PRD-TAD-ADR-MVP-GTM"
version: "0.2.0"
status: "draft"
frontmatter_contract: "required"
---

# PRD/TAD/ADR/MVP/GTM: Graph blob storage migration off R2

## Objective

Replace Graph core production binary storage with bounded, chunked D1 storage so Graph no longer creates billable R2 reads, writes, or storage. Reuse the existing production D1 database and protected release controller; add no paid plan, add-on, service, bucket, or external dependency.

## Product and safety boundary

- Store object bytes in D1 BLOB chunks no larger than 1 MiB; D1 documents a 2,000,000-byte value and row ceiling.
- Enforce a race-safe Graph blob allocation below the D1 Free per-database ceiling; reject unknown size, quota exhaustion, partial write, and stale reservations before serving success.
- Preserve media HTTP behavior, object identity, content type, authentication, and exact readback. Fail closed when D1 schema or quota proof is absent.
- Add a protected, resumable R2-to-D1 migration that inventories keys and bytes, verifies source and destination hashes, retains source objects for rollback, and never deletes or overwrites R2 data.
- Do not activate the candidate while Workers is Paid, required $0 proof is absent, migration parity is incomplete, or candidate-specific protected authorization is missing.

## Evidence gates

1. Focused storage checks cover chunk boundaries, concurrent same-key replacement, reservation release, quota exhaustion, auth ordering, and byte-for-byte readback.
2. Protected GitHub checks pass for the exact PR head; the protected release workflow validates the source SHA and Free-only account policy.
3. Before activation, the protected migration inventories the exact Graph bucket, copies within the recorded free allocation, verifies every object by digest, and captures a rollback baseline. Existing R2 objects remain retained until a separate authorized retirement receipt.
4. Live readiness and representative browser readback prove D1-backed behavior; rollback restores the exact prior Worker and artifact and leaves both stores intact.

## Protected lane and release sequence

This first lane records the product contract and release gates. It does not change Worker behavior,
run a remote migration, activate a version, or retire R2 objects. Runtime implementation must be
reviewed and integrated as a separate exact candidate before the protected release workflow can run.

1. Preflight the Cloudflare account, the exact `agentic-storage` database and the `agentic-storage-blobs`
   bucket with read-only identity and inventory evidence. Record the actual Workers billing plan, D1
   database size and headroom, object count, total bytes, maximum object size and inventory digest.
2. Reject the candidate if the Worker plan is paid, any R2 operation remains on a Graph production path,
   any inventory page is missing, or D1 Free capacity cannot be reserved for every Graph writer.
3. Build bounded chunk storage and a resumable migration operation. Persist a cursor and per-object
   source/destination hashes. Recheck existing destination keys before writing; never overwrite a
   mismatched destination. Verify byte-for-byte readback for the complete inventory before cutover.
4. Use the protected release environment for the exact merged candidate. Keep the prior Worker version,
   original R2 objects, and migration receipt available through live D1 readback and rollback checks.
5. Retire the R2 binding or source objects only through a separate exact owner-authorized effect after
   the retention period and a fresh inventory. This plan grants no retirement authority.

## External blocker and recheck

The release is blocked until the protected account read proves the billing plan and the exact production
database and bucket inventory. The current cost policy does not treat a Free allowance, usage snapshot,
or quota alert as a hard $0 cap. Recheck when the account plan and inventory are available; do not assign
an ETA to that external wait.

## Non-goals

Change other repositories or other R2 buckets, raise account limits, authorize a paid plan, delete legacy bytes, or infer $0 from a quota snapshot. If account-wide free-tier headroom or plan cannot be proven, stop before production mutation and retain the candidate.

## Sprint cap

First source sprint: 90 minutes, at most 18 files and 40 KiB authored delta; replan if either cap is exceeded. External approval or provider wait has no ETA; record the exact blocker and recheck condition.
