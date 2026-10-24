---
title: "agentic-graph Import URL Complete Page — PRD-TAD-ADR-MVP-GTM"
id: "md:agentic-graph-import-url-complete-page-prd-tad"
doc_type: "PRD-TAD-ADR-MVP-GTM"
version: "1.0.0"
date: "2026-10-21"
lang: "en-US"
owner: "docs.native-web-import-crawler"
status: "active"
universal_scope: true
frontmatter_contract: "required"
continuity_id: "PLAN-AGENTIC-GRAPH-IMPORT-URL-COMPLETE-PAGE"
parent_plan: "docs/documents/agentic-graph-native-web-import-crawler-prd-tad-adr-mvp-gtm.md@0.2.57"
scope: "Complete, bounded single-page HTML capture and parsing through the existing Launch Import URL action, including an explicit local clipboard handoff for rendered pages and account-isolated cloud transfer preferences"
deploy_boundary: "Authoring-only; no publication, deployment, promotion, or production effect"
---
# Import URL Complete Page

## PRD

Direct webpage import preserves the complete readable page, including semantic index/navigation and body sections after large non-rendered markup. The importer must never return a silently truncated prefix. Pages above a declared source or normalized-content budget fail visibly before Markdown is saved. A saved webpage document can be refreshed from its frontmatter URL even if its workspace source-index entry is missing; the per-file action targets that document and refuses to overwrite edits made while fetching. Behavior is generic across public HTTP(S) pages; no host, route, locale, or page-specific parser is added.

The **Index and import website pages** action discovers the same-origin page tree and preselects the discovered set, bounded by the existing 500-page cap, before the user confirms **Import selected**. Pages remain separate URL-owned Markdown documents. Direct Import URL captures one entered page and its in-page navigation without recursively fetching every link. When a source requires an authenticated browser session, the user can copy the rendered page in its browser tab and choose **Use copied page** in Launch → Import URL; the copied content is staged in memory and parsed locally.

## TAD / ADR

Reuse the existing webpage proxy, bounded stream reader, workspace URL importer, HTML normalizer, and unified Markdown converter. The ordinary Import URL fetch may read up to 32,000,000 source bytes, while existing previews retain their 500 KB budget and other fetch callers retain their current defaults. Remove non-rendered script/style blocks and oversized inert JSON hydration attributes before conversion, then enforce a 10,000,000-character normalized HTML ceiling. A ceiling breach is an explicit error; it does not produce a partial Markdown document.

For this import path, parse the full document tree so semantic page navigation is retained alongside the main content. Keep the existing article-root preference for other converter callers. Load the small preprocessing helper only when URL webpage conversion runs. Add no dependency, service, credential path, or persistent schema. The clipboard handoff requires an explicit user action and carries only copied page content plus its clean HTTP(S) source URL through the existing local importer.

## ADR

Treat HTML as untrusted source data. Strip executable/non-rendered markup before Markdown conversion; preserve visible text and ordinary links. Enforce byte limits while streaming, cancel the response on overflow, and fail closed. Browser/session recovery remains under the existing user-mediated owner; this work does not acquire remote credentials.

When a capture contains only a few visible characters plus hidden embeds or tracking pixels, retry through the existing rendered DOM recovery path. Rendered captures also open bounded, semantically identified collapsed disclosures before parsing, without matching host names, labels, or CSS classes. If that path cannot recover substantive content, report an incomplete import and save no shell-only document.

OAuth signup provisions a private personal workspace per provider identity; users may select another workspace only when their membership authorizes it. Browser-local online/offline preference and file/folder transfer path are keyed by the selected user and workspace, so a new account/workspace starts offline with its own transfer scope. Membership checks remain the server authority; client selection is routing state only. No provider credentials enter the browser bundle, and this adds no server schema or dependency.

GitHub localhost callbacks use the loopback literal without a registered port (`http://127.0.0.1/api/storage/auth/callback`); the authorization request supplies the active local port. The local Worker accepts other `127.0.0.1` ports only when `AGENTIC_OS_STORAGE_OAUTH_ALLOW_LOOPBACK_PORTS=true` is set in ignored `.dev.vars`. Production keeps exact HTTPS origins and must not enable this local flag. Wildcard matching stays disabled.

## MVP and verification

Twenty-six changed paths maximum, 40 active minutes, and every changed file below 600 lines and 500 KB. The webpage path is split into focused helpers; no new dependency or paid resource is added. The importer preserves content up to its declared 10,000,000-character limit and fails visibly above that limit instead of saving a prefix or fallback stub. Regression coverage uses generated synthetic HTML and an in-memory network guard only; supplied browser URLs and captured content are never hardcoded or fetched for validation. Verify the raised Import URL byte budget, cache-budget isolation, retained page index/body and visible text beyond the prior 1.5 million character limit, script exclusion, collapsed-disclosure expansion, explicit normalized-budget failure, frontmatter URL fallback for source refresh, race-safe per-file refetch, one-shot local clipboard capture without network access, per-account sync preference and folder-scope isolation, local-only loopback port origin validation, focused affected checks, and type/build validation.

## GTM and rollback

Rank accurate single-page import first, existing selected multi-page crawl second, and offline saved HTML as a later buyer hypothesis. The near-built path reuses the existing free local importer; demand and first-dollar value remain unmeasured. Roll back by reverting the scoped source candidate. Existing imported documents remain intact. Protected integration, publication, deployment, and production authority require their own exact receipts.
