---
title: "Knowgrph Docs/Sheets/Slides Export Runtime Readiness"
id: "md:knowgrph-docs-sheets-slides-runtime-readiness"
doc_type: "Runtime Readiness Runbook"
version: "1.0.0"
date: "2026-07-30"
lang: "en-US"
owner: "docs.docs-sheets-slides-export.runtime-readiness"
local_rung: "dev-proven"
delivered_rung: "spec-complete"
lane: "authoring"
universal_scope: false
doc_path: "docs/documents/knowgrph-docs-sheets-slides-runtime-readiness.md"
parent: "docs/documents/knowgrph-docs-sheets-slides-prd-tad.md"
live_provider_run_proven: false
production_release_authorized: false
---

# Knowgrph Docs/Sheets/Slides Export Runtime Readiness

## Readiness verdict

The local `export.publish` implementation, deterministic XLSX/PPTX conversion,
provider-neutral dispatcher, provider adapters, fail-closed ledger, CLI surface,
and mocked provider acceptance are available for validation. Real Google and
Microsoft account readiness is **not proven**.

The 2026-07-19 environment audit found no configured Google or Microsoft export
credential mode. The live verifier therefore has an honest blocked result and
must make zero artifact, ledger, or provider calls. Do not relabel unit, mock,
archive, or URL-shape evidence as live account acceptance.

Current local evidence snapshot:

- the focused export, OOXML, auth, ledger, CLI, and stdio MCP suite passes;
- documentation lint and sanity checks pass, including the 600-line document
  maintainability gate; and
- the canonical all-provider/all-kind live command exits `2` with
  `status="blocked"`, `reason="PROVIDER_CREDENTIALS_MISSING"`, and both Google
  and Microsoft listed as missing. It performs no provider call.

This runbook is Dev/local only. It does not authorize a Prod, Pages, Worker, or
Cloudflare deployment.

## Readiness matrix

| Gate | Required evidence | Current state |
|---|---|---|
| Typed MCP contract | `export.publish` appears in local stdio `tools/list`, rejects invalid shapes, and returns its declared schema | Implemented; focused contract coverage available |
| Markdown source safety | Traversal, external symlinks, malformed/secret-like frontmatter, oversize input, and source drift fail closed | Implemented; focused coverage available |
| XLSX conversion | ZIP/OpenXML parts, typed numeric/currency/percentage cells, formula-safe text, deterministic bytes | Implemented; focused coverage available |
| PPTX conversion | ZIP/OpenXML relationships, slide count/content, deterministic bytes | Implemented; focused coverage available |
| Google adapter | Native Sheet/Slides mutation, atomic slide replacement, read-back, identity reuse, partial cleanup | Implemented with mocked HTTPS; live unproven |
| Microsoft adapter | Native `.xlsx`/`.pptx` upload, DriveItem read-back, identity reuse, partial cleanup | Implemented with mocked HTTPS; live unproven |
| Dispatch | Google primary, eligible one-time Microsoft fallback, explicit Microsoft route, no same-provider retry | Implemented with mocked adapters |
| Ledger | Exact `(artifact_id, provider, kind)` identity, hash chain, recoverable cross-process locks, isolated path, tamper failure | Implemented with focused coverage |
| Google real account | Create and update the same Sheet and Slides IDs; open both URLs in the authorized account | Blocked: credentials absent |
| Microsoft real account | Create and update the same `.xlsx` and `.pptx` DriveItem IDs; open/preview both files | Blocked: credentials absent |
| Source preservation | Identical pre/post SHA-256 across all eight live publishes | Pending live verifier |
| Google latency | Enough real samples to establish p95 ≤ 5 seconds | Unproven; the bounded acceptance run records timings but is not a p95 population |
| Recipient access | Deliberately configured recipient can open the returned artifact | Unproven; the verifier does not change sharing permissions |

## Credential modes

Never print, commit, copy into Markdown, or place credential values in the
ledger. Presence checks should report only provider and mode.

### Google

Use one of:

1. Human OAuth access token: `KNOWGRPH_GOOGLE_ACCESS_TOKEN`.
2. Human OAuth refresh: `KNOWGRPH_GOOGLE_CLIENT_ID`,
   `KNOWGRPH_GOOGLE_CLIENT_SECRET`, and
   `KNOWGRPH_GOOGLE_REFRESH_TOKEN`.
3. Service account: `KNOWGRPH_GOOGLE_SERVICE_ACCOUNT_JSON` plus either
   `KNOWGRPH_GOOGLE_IMPERSONATED_USER` for Workspace domain-wide delegation or
   `KNOWGRPH_GOOGLE_SHARED_DRIVE_FOLDER_ID` for a destination folder in a shared
   drive. `KNOWGRPH_GOOGLE_DRIVE_FOLDER_ID` may constrain only human-OAuth output.

A bare service-account key is not a valid personal My Drive owner. Personal
account acceptance should use human OAuth. The enabled Google project must allow
the Drive, Sheets, and Slides APIs and the selected identity must be able to
write the target folder.

### Microsoft

Use either:

1. `KNOWGRPH_MICROSOFT_ACCESS_TOKEN`; or
2. `KNOWGRPH_MICROSOFT_CLIENT_ID` and
   `KNOWGRPH_MICROSOFT_REFRESH_TOKEN`, with optional
   `KNOWGRPH_MICROSOFT_CLIENT_SECRET`.

The default tenant is `consumers` and the default delegated scope is
`offline_access Files.ReadWrite`. Override them only with
`KNOWGRPH_MICROSOFT_TENANT` and `KNOWGRPH_MICROSOFT_SCOPE`. Set
`KNOWGRPH_MICROSOFT_ONEDRIVE_FOLDER` when acceptance artifacts should be grouped
under one existing OneDrive folder. When Microsoft rotates a refresh token, the
runtime replaces it in process memory and can call an injected host persistence
callback; durable secret storage and restart injection remain host-owned.

### Runtime controls

- `KNOWGRPH_EXPORT_MICROSOFT_FALLBACK_ENABLED` defaults to enabled.
- `KNOWGRPH_EXPORT_FLEET_PATH` selects an isolated ledger.
- `KNOWGRPH_ROOT` selects the repository root for bounded artifact resolution.

## Focused local verification

Run from the Knowgrph repository root. These commands do not require provider
credentials and must not create external artifacts.

```bash
npm run smoke:prepare
node --test \
  grph-shared/__tests__/markdown-office-artifacts.test.mjs \
  mcp/__tests__/export-publish-core.test.mjs \
  mcp/__tests__/export-ledger.test.mjs \
  mcp/__tests__/export-google-adapter.test.mjs \
  mcp/__tests__/export-microsoft-adapter.test.mjs \
  mcp/__tests__/export-provider-auth.test.mjs \
  mcp/__tests__/export-publish-runtime.test.mjs \
  mcp/__tests__/export-publish-stdio-e2e.test.mjs \
  scripts/__tests__/export-cli.test.mjs
npm run export:ledger:verify
```

The local MCP server remains the registration authority:

```bash
KNOWGRPH_ROOT="$(pwd)" node ./mcp/server.js
```

Connect through a stdio MCP client and verify `tools/list` includes
`export.publish`. A missing-credential `tools/call` must return
`PROVIDER_NOT_CONFIGURED`, make no provider request, and append no ledger entry.

## Single bounded publication

After configuring exactly the intended account, publish one explicit
provider/kind pair with a private ledger path:

```bash
KNOWGRPH_EXPORT_FLEET_PATH=/ABS/PRIVATE/PATH/knowgrph-export-proof.md \
  npm run export:publish -- \
  --artifact docs/documents/knowgrph-docs-sheets-slides-prd-tad.md \
  --kind spreadsheet \
  --provider google \
  --json
```

Change `--kind` to `slides` and `--provider` to `microsoft` only when those
specific external writes are intended. The command returns a provider URL and
ID. It does not alter sharing permissions and does not delete the created
artifact.

## Full real-account acceptance

The canonical bounded verifier requires a clean worktree and exact Git SHA,
covers both providers and both kinds, and creates
four provider artifacts, publishes each identity twice, and therefore performs
eight publication calls. The second call for each pair must return the same
`doc_id` as the first.

```bash
npm run export:verify:live -- \
  --artifact docs/documents/knowgrph-docs-sheets-slides-prd-tad.md \
  --providers google,microsoft \
  --kinds spreadsheet,slides
```

The verifier:

- rejects a dirty or changing Git tree before auth, artifact, ledger, or provider work;
- binds the receipt to one clean exact Git SHA and source SHA-256 and rechecks
  Git state before success;
- creates a private temporary hash-chained ledger;
- calls every requested provider/kind pair twice with explicit provider routing;
- rejects fallback during per-provider acceptance;
- requires stable provider IDs across the repeat call;
- verifies the source SHA-256 remains unchanged;
- verifies the isolated ledger entry count and head hash; and
- emits one JSON receipt with per-call durations and returned URLs.

Exit code `2` with `status="blocked"` and
`reason="PROVIDER_CREDENTIALS_MISSING"` is an expected honest result when one or
more requested providers are not configured. Exit code `0` is necessary but not
sufficient for full runtime readiness.

## Human account verification

After an exit-0 run, verify the returned links in the same authorized accounts:

1. Google spreadsheet opens as a native Sheet and contains the expected first
   Markdown table with a frozen formatted header.
2. Google presentation opens as native Slides and contains the expected
   Markdown-derived slide titles and body text.
3. Microsoft spreadsheet appears as a `.xlsx` DriveItem in OneDrive and opens
   or previews as a valid workbook.
4. Microsoft presentation appears as a `.pptx` DriveItem in OneDrive and opens
   or previews as a valid presentation.
5. No duplicate appears after the second publication for any identity.
6. No source Markdown diff exists.

Do not read browser cookies or local storage, change account sharing, delete
artifacts, or move them between folders as part of this verification. A browser
open proves the current operator can access the object; it does not prove a
recipient can access it.

## Performance proof

The full bounded verifier records two durations per provider/kind pair. Those
samples are acceptance timings, not a statistically meaningful p95. To close
the AC1 latency gate, run a separately approved sample set against the same
Google identities, record the exact Git/source SHA pair and per-call timings,
and compute p95 without adding same-provider retries to the product runtime.
Keep account-specific receipts outside Git.

## Evidence retention

Retain these items in a private proof location:

- exact Git SHA and source SHA-256;
- the live verifier JSON receipt;
- isolated ledger path, entry count, and head hash;
- four provider IDs and HTTPS URLs;
- browser/open screenshots or account-native confirmation;
- whether sharing was tested and under which explicit recipient policy; and
- measured timing sample count and p95, if separately authorized.

The repository may record only a sanitized readiness verdict. Do not commit
access tokens, refresh tokens, service-account JSON, account email addresses,
private provider IDs, private URLs, or screenshots containing account details.

## Stop conditions

Stop and keep `live_provider_run_proven: false` when:

- any requested provider is unconfigured;
- the Git worktree is dirty or HEAD changes during verification;
- OAuth consent or account selection requires user input;
- a provider asks to broaden scopes or enable billing unexpectedly;
- source SHA-256 changes;
- provider read-back MIME type, size, ID, or URL validation fails;
- repeat publication returns a different provider ID;
- the ledger fails verification or cannot acquire/write its lock;
- a real account is reachable only by reading browser credentials; or
- the requested action would deploy to Prod/Cloudflare or modify sharing beyond
  the explicitly approved acceptance scope.

## Related contracts

- `knowgrph-docs-sheets-slides-prd-tad.md`
- `knowgrph-api-document.md`
- `../../mcp/README.md`
- `../../mcp/export-publish-contract.js`
- `../../scripts/verify-export-live.mjs`
