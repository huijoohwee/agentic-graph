---
title: "MiaoXYZ Catalog Publication"
doc_type: "Operational Procedure"
status: "active"
---

# MiaoXYZ Catalog Publication

This procedure publishes the owner-approved catalog snapshot to the existing MiaoXYZ Worker without deploying Worker code or applying D1 migrations.

## Protected workflow

Use `.github/workflows/release.yml` with `release_target=miaoxyz-catalog`, on `main`, and the exact current `source_sha`. The read-only preparation job binds the source commit, eight catalog offers, public catalog revision, existing product digest, and request-intake state into an immutable candidate. Its summary shows the candidate digest and offer names and prices before the production job can run.

The publication job uses the protected `production` environment. Its approval authorizes only the candidate artifact prepared in that same run. The job rechecks the source commit and live catalog baseline immediately before its write, then sends the expected catalog revision with the update. The Worker must be deployed with revision-compare support before the catalog workflow runs; it rejects an update if another operator changed the catalog after preparation.

## Write and readback guards

- If the exact catalog is already published, preparation reports a no-op and the production job is skipped.
- A write is allowed only when the public catalog is revision 0 and empty, or the exact approved catalog is already present.
- If the catalog revision, products, or intake state drift after preparation, publication stops without overwriting that state. The Worker also checks the expected revision atomically with the update to close the read/write race.
- The publisher sends the candidate to the authenticated operator catalog API using the existing production secret. It never logs or stores the secret in the candidate or receipt.
- After the API accepts the update, a public readback must match the candidate digest and revision, and `store.intakeEnabled` must remain false.

The workflow changes catalog snapshot data only. Store settings, request intake, routes, Worker code, and D1 migrations are outside this operation. Candidate and publication receipts are retained as GitHub Actions artifacts for 90 days.
