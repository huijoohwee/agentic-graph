---
title: "Core canonical document publication"
doc_type: "Runtime Contract"
status: "active"
lang: "en-US"
frontmatter_contract: "required"
---

# Core canonical document publication

The core release must explicitly publish the reconciled canonical documentation before checking anonymous MCP source-file reads. D1 seeding alone does not authorize anonymous access. The existing storage publication endpoint remains the effect owner; the release does not make the workspace public or write publication rows through direct SQL.

`seed-storage-docs-to-cloudflare.mjs --publication-plan-output` emits a preparation artifact only after direct authoritative D1 readback matches the complete canonical corpus. The plan includes the normalized document/chunk state contract, its digest, and the current document IDs and revisions, including retained legacy IDs. Its own digest seals that preparation; `authorizesEffects: false` prevents treating it as a grant.

`core-runtime-release-publications.mjs` joins that plan to the D1 reconciliation evidence and the consumed exact-candidate human authorization. It accepts only the reviewed core profile on the exact protected main release workflow, with the matching operator and workspace and an unexpired private operator key. It sends sequential revision/content-fenced requests to the existing `/api/storage/publications` endpoint and verifies each returned identity. Anonymous runtime checks then independently prove the resulting reads on all release transports.

Only the `publish_docs` step receives the operator access key for this effect. The collaboration contract limits this step to that key and its owner/workspace/expiry metadata: no Cloudflare mutation token, signing secret, travel credential, or provider secret is passed to document publication. Install, build, lifecycle, smoke, artifact, and mirror-publication steps keep their existing credential boundaries.

The plan and publication receipt are retained as release artifacts. The receipt binds source revision, candidate, human actor, canonical state, plan, request digests, and confirmed provider identities; it contains no credential or raw provider error. Responses are bounded to 65,536 bytes and each request has a ten-second timeout. A redirect, malformed or mismatched response, or response loss stops publication immediately. The failure receipt records the confirmed prefix and pending request for reconciliation and never retries an uncertain effect.

Publication remains inside the existing pre-mirror release failure boundary. Failed state reconciliation or publication cannot issue a successful live-verification receipt. Restoring a corpus does not prove publication restoration: changed document revisions make previous publication records ineligible, and rollback must still pass its independent runtime checks before it can claim success.

Validation runs through the existing core runtime, provider-proof and direct D1 seeder suites, including a native Worker publication/readback regression, and protected release contract checks. These local checks authorize no production mutation; live completion still requires the protected release, retained provider receipts, and passing transport/browser verification.
