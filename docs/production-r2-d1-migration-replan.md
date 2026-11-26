---
title: "Graph R2 to D1 migration implementation replan"
doc_type: "PRD-TAD-ADR-MVP-GTM"
version: "0.7.0"
status: "active"
frontmatter_contract: "required"
---

# Graph R2 to D1 migration implementation replan

## Replan reason and baseline

The 0.2.0 source sprint cap was 40 KiB. The 0.4.0 replan capped the candidate at 58,368 authored
bytes and 17 paths. The affected integration check exposed five failing browser-session cases because
the shared D1 test fixture did not model the new blob tables. The 0.5.0 replan set a 65,536-byte,
20-path cap; the complete candidate now remains within both bounds. Its exact affected CI passed on
`b8c45599954534250a63e53e075e8b7b63d02100`, and source parity passed. During publication preflight,
protected `main` advanced through PR #2117 to `5267f9a471524fb2d45f17ab2982625c9967be6a`, then
through PR #2120 to `7d4dac81a227b0ddad3ce694877d0f5b886090c7`. The 14 incoming paths are
`.github/workflows/miaoxyz-hosted-staged-release.yml`,
`.github/workflows/miaoxyz-production-release.yml`, `.github/workflows/release.yml`,
`docs/collaboration-runtime-contract.md`,
`scripts/__tests__/miaoxyz-hosted-dev-release.test.mjs`,
`scripts/__tests__/production-pages-boundary-contract.test.mjs`, `scripts/check-collaboration-runtime.mjs`,
`scripts/miaoxyz-hosted-dev-release.mjs`,
`scripts/miaoxyz-production-release-candidate.mjs`,
`scripts/miaoxyz-production-release-core.mjs`,
`scripts/miaoxyz-production-release-deploy.mjs`,
`scripts/miaoxyz-production-release-source.json`, `scripts/miaoxyz-worker-source-sync.mjs`, and
`scripts/pages-mirror-sync.mjs`. None overlaps the lane's 20 reserved changes. This replan authorizes
only a stopped-writer native refresh to exact head `7d4dac81a227b0ddad3ce694877d0f5b886090c7`,
another bound CI run, and source publication preparation.
It does not enlarge the 65,536-byte or 20-path caps or add deployment, provider-write, or data-retirement
authority.

The stopped-writer alignment preserved authored head `b8c45599954534250a63e53e075e8b7b63d02100`
and protected `main` at `7d4dac81a227b0ddad3ce694877d0f5b886090c7` in candidate
`79c26f96030ae5d83ddfd48e69a1500594da014d`. Conflict review preserved the upstream generated-Pages
sync step. A release-window dashboard read shows the exact configured R2
bucket empty and the bound D1 database at 6.51 MB. The workspace media capability and artifact
ownership routes still read/write/delete through R2, so that source gap must be closed before this
candidate can claim storage parity. All preserved source bytes and the original R2 bucket remain
intact.

## Product and safety boundary

- Replace Graph core production blob reads and writes with D1 BLOB storage using chunks no larger
  than 1 MiB and a race-safe 64 MiB Graph allocation ceiling.
- Reject invalid lengths, unknown schema/quota state, quota exhaustion, partial writes, and stale
  reservations before returning success. Preserve object keys, content types, authentication order,
  metadata, HTTP read behavior, and byte-exact readback.
- Keep the R2-to-D1 migration resumable and digest-verified. Never overwrite mismatched D1 objects
  or delete R2 source bytes in this lane.
- Route capability media uploads, reads, ownership checks, artifact persistence, and deletes through
  the same bounded D1 blob store. Retain the configured R2 binding for exact rollback compatibility,
  but remove R2 operations from the production media path.
- Do not activate while the exact Worker plan, D1 headroom, R2 inventory, $0 enforcement, migration
  parity, or candidate-specific production authorization is unproven.

## Replanned sprint caps

- Time: 45 minutes from this replan for native refresh, exact affected CI, and publication preparation.
  A protected provider or review wait is a blocker with a recheck condition, not an ETA.
- Authored source: at most 65,536 bytes total, including this plan; remeasure before commit and stop
  if the cap is exceeded.
- Paths: at most 20 changed paths, including this plan. No added package or dependency.
- Checks: focused D1 storage and migration tests, release contract checks, exact protected Integration
  Gate, then a protected release candidate parity run before any deployment effect.

## Acceptance and rollback

Focused checks cover chunk boundaries, replacement races, reservation release, quota exhaustion,
authentication ordering, resumption, digest parity, and exact readback. The protected release must
recheck current account plan, exact D1 and R2 identities, complete migration inventory, rollback
baseline, and candidate-specific approval before mutation. Until those proofs pass, production remains
pending. Rollback retains both stores and reactivates only the exact previously observed Worker and
artifact. R2 binding/object retirement requires a separate later owner-authorized receipt.
