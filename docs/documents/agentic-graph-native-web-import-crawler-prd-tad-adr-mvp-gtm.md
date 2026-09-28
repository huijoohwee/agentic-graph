---
title: "Reference implementation: agentic-graph Native Web Import Crawler — PRD-TAD-ADR-MVP-GTM"
id: "md:agentic-graph-native-web-import-crawler-prd-tad"
doc_type: "PRD-TAD-ADR-MVP-GTM"
version: "0.2.10"
date: "2026-09-28"
lang: "en-US"
guideline_version: "1.7.0"
owner: "docs.native-web-import-crawler"
local_rung: "spec-complete"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
doc_path: "docs/documents/agentic-graph-native-web-import-crawler-prd-tad-adr-mvp-gtm.md"
scope: "Native Import URL crawler, progressive Source Files materialization, accessible icon controls, Canvas projection, and local Markdown export destination"
deploy_boundary: "Authoring-only; mirror and delivery lanes are not provisioned for this increment"
reference_repository: "https://github.com/apify/crawlee"
reference_boundary: "Concept-only review of queue, browser, proxy, retry, and storage capabilities; no source, tests, fixtures, schemas, prose, assets, or dependency copied or imported"
runtime_library: "Reference implementation uses the existing Playwright dependency"
invocation: "/reference.expand @url:<https-url> @reference-policy #canvas"
constraints:
  - "native in-repo implementation"
  - "no Apify or Crawlee package, service, generated code, or runtime dependency"
  - "server-owned credentials and proxy configuration"
  - "bounded pages, downloads, bytes, concurrency, redirects, and navigation time"
  - "private-network targets fail closed unless explicitly enabled for local development"
  - "no proxy endpoint or credential in client options, manifests, Canvas documents, or logs"
frontmatter_contract: "required"
continuity_id: "PLAN-AGENTIC-GRAPH-NATIVE-WEB-IMPORT-CRAWLER-PRD-TAD-ADR-MVP-GTM"
worktree_id: "device-cba000d3779d--planning-v27"
agent_id: "codex-01a0940a"
guideline_revision: "2.7.0"
guideline_source: "https://github.com/huijoohwee/huijoohwee.github.io/blob/e8d2a10a8d3e5735c43edf350a22523df05fdf91/guidelines/prd-tad-adr-mvp-gtm-guidelines.md"
reviewed_source_revision: "7fb85741121d8c2886027e4a630d013ba91c1027"
previous_document_version: "0.2.9"
prd_revision: "0.2.10"
tad_revision: "0.2.10"
adr_revision: "0.2.10"
mvp_revision: "0.2.10"
gtm_revision: "0.2.10"
---

# Reference implementation: agentic-graph Native Web Import Crawler

## Product decision

Enhance the existing website-import job instead of adding a second crawler stack. The Import URL globe action starts a server-owned headless crawl, materializes extracted pages through the existing Markdown workspace owner, creates a Canvas projection document, and exposes bounded HTML and downloaded-file artifacts. Import local files remains owned by the existing corpus import path, which already resolves source units and applies corpus-backed imports to Canvas.

The external crawler project is a capability reference only. The implementation uses the repository's existing Playwright dependency and native Node.js modules. It does not copy or depend on the reference project.

## 2026-09-28 usability increment

**PRD.** The Launch → Import URL icon row shows its labels in a shared hover or focus tooltip above the menu, with no extra text below the controls. During a sitemap or website crawl, the website import folder and each completed page appear in Source Files as the manifest advances. The terminal sitemap and Canvas projection appear when the crawl completes. Launch → Export → Markdown defaults to the configured local sibling `docs_` directory derived from the current workspace; the browser save picker remains the fallback when local host writing is unavailable.

**TAD.** The existing server manifest remains the source of completed node records. The icon actions retain `aria-label` and `title`; the existing delegated tooltip renders their labels in a body portal above the anchored menu. Rich media hover previews also use that shared tooltip owner, and a source guard rejects another `role="tooltip"` renderer or legacy `z-[10000]` layer. The extra crawler hint below the icons is removed. The workspace action checks the manifest when the processed count advances, and one workspace writer deduplicates node IDs across snapshots and writes each page through the existing workspace filesystem. Each completed page publishes only file and folder metadata to the Explorer; the workspace performs one full reconciliation at completion. The `/websites` workspace root is projected into Source Files, and completed page folders expand during the run. Finalization writes the sitemap and Canvas document once. The Markdown export derives the host output root from the configured docs mirror instead of hardcoding a device path.

**ADR.** Reuse the shared tooltip owner and its z-index constants for plain labels and rich media previews; remove standalone tooltip renderers. Keep the crawler server and artifact routes unchanged. Reuse the manifest and local filesystem write contracts, with the existing save picker as the cross-device fallback. This keeps the page writer under 600 lines and avoids adding a second export service or paid dependency.

**MVP check.** Focused tests cover a page appearing in the projected Source Files tree and its folders expanding before the terminal status, deduplication when a later snapshot repeats it, and the Markdown destination path and bytes. A live local crawl showed page files in Source Files while its server manifest remained `running`. The local browser preview confirms that the crawler tooltip appears above the open menu on focus, with no extra text below the icon row. Source checks and any protected CI result belong to the source lane receipt; no Production or buyer outcome is claimed by this increment.

**GTM.** The immediate buyer pain is waiting through a multi-page import without usable files and then hunting for its export. A timed user pilot should compare time to first usable page and time to locate the exported Markdown file, then record willingness to pay $1. Demand and revenue remain unverified.

## 2026-09-28 browser freeze recovery

**PRD.** A long website crawl must keep Source Files usable as pages arrive and must not freeze the browser tab from a full workspace rebuild for each page.

**TAD and ADR.** The website importer publishes a metadata-only file entry when its workspace write succeeds. The Explorer's automatic refresh listener ignores filesystem events under the active import folder; unrelated workspace changes continue to refresh normally. The importer releases that folder guard and reconciles the full workspace once after finalization or on failure. This retains the existing filesystem as the durable source and avoids copying every page body into React state during progress updates.

**MVP check.** A focused 500-page projection test checks metadata-only growth, folder projection, and deduplication. The progress integration test checks that the first file is visible before terminal status and that the full refresh runs once. A live rerun of the user's crashed in-app browser tab remains unverified because the browser tool rejects the crash page's `data:` URL under its URL policy; source checks cannot substitute for that live observation.

**GTM.** Measure browser responsiveness and time to first visible file during a timed 100-page pilot before claiming this recovery for users. No buyer or revenue evidence is recorded.

## 2026-09-28 bounded import writes and conversion ownership

**PRD.** Completed crawl pages must become usable progressively without repeated whole-workspace reconciliation or large HTML conversion on the browser UI thread. When server Markdown is unavailable, the file must clearly report that condition and retain the existing captured-HTML viewer reference.

**TAD.** Text upserts now reuse the shared filesystem initialization owner. One crawl writer shares a single folder inventory and serializes folder creation across page workers. Its Explorer refresh guard begins before the import folder is created. Completed Markdown still writes through the shared workspace filesystem and publishes metadata immediately; one final refresh reconciles the tree.

**ADR.** The server owns crawl HTML-to-Markdown conversion. Remove the client raw-HTML conversion fallback, which can parse a multi-megabyte capture and copy its full snapshot into a workspace document. Keep the server artifact and existing HTML viewer reference; emit an explicit Markdown-unavailable notice when conversion did not produce text. Browser enhancement remains disabled for the Launch headless action. Reuse the shared initialization and folder owners instead of introducing an import-specific filesystem.

**MVP check.** A 100-page regression reproduced 103 seed reconciliations before the fix and one afterward, with one folder inventory and progressive visibility preserved. The saved 100-node crawl replay included a 12,017,857-byte HTML-only capture: removing the duplicate conversion reduced the local replay from 15.2 seconds to 1.3 seconds and maximum observed event-loop delay from 9,160 ms to 78 ms. It retained all 99 successful page files and both terminal documents. These local measurements are bounded evidence, not a browser crash-recovery claim. Focused tests also cover missing Markdown without raw-HTML fetch, concurrent folder ancestors, failed initialization retry, explicit seed refresh, and the first file's refresh guard. The crashed in-app tab remains inaccessible to automation under the browser URL policy; live review is pending.

**GTM.** The immediate outcome is shorter time to a usable imported page and a responsive Source Files tree. Validate the exact reported browser flow before closing the crash report; no buyer or revenue result is claimed.

## 2026-09-28 D3 crawl default

**PRD / MVP.** Launch → Import URL → Crawl website headlessly selects 2D D3 when the canvas import starts. Progressive Source Files remain usable during the crawl. The completed `website.crawl.canvas.md` also declares D3, so opening it uses the same renderer.

**TAD / ADR.** `runWorkspaceWebsiteImport` uses the shared `applyCanvasFrontmatterPreset` owner for canvas imports after checking the current job. Storage-only imports leave the current view alone. `buildWebsiteCrawlCanvasMarkdown` owns the saved D3 preset; the previous Flowchart override is removed. Other import types and the user's ability to choose another renderer retain their existing owners.

**Verification / delivery.** The two native crawler/Launch checks, nine progressive import/filesystem regressions, TypeScript, hygiene and collaboration checks passed. A direct runtime probe confirms D3 before the crawl request, saved crawl preset readback, preserved storage-only view and no view change from a stale job. The in-app preview remained on Storyboard after menu clicks; live crawl verification remains pending. Source publication, protected integration and Production evidence remain separate. No new dependency or service is introduced. GTM remains the existing crawl-to-exploration workflow; no new commercial claim.

## 2026-09-28 automatic webpage fidelity

**PRD / MVP.** Imported webpages use the existing automatic conversion policy. The workspace toolbar has no fidelity selector or replacement fidelity label; the HTML and Markdown pane controls remain available.

**TAD / ADR.** Remove the manual fidelity selector, its toolbar/main/runtime props and the unused metadata-update callback. Keep the conversion owner and its size-aware limits unchanged. Previously saved fidelity metadata remains readable for compatibility and is not rewritten on open. No new conversion mode, dependency or always-loaded module is introduced.

**Verification / delivery.** The three existing toolbar consolidation, automatic routing and HTML/Viewer coexistence checks passed. The live preview at `http://127.0.0.1:5174/` has no fidelity selector and retains the HTML, Markdown, Viewer and Canvas controls. The inherited D3 renderer is also visible. TypeScript, hygiene and collaboration checks passed. Publication, protected integration and Production remain separate. GTM remains the existing crawl workflow with fewer decisions; buyer and payment claims are unchanged.

## 2026-09-28 complete webpage content

**PRD / MVP.** A completed headless capture imports the article title, media, sibling sections and full body instead of stopping at an embedded summary. The same conversion applies across sites without domain, URL, publisher class or chapter-label branches. Visual rows remain separate readable paragraphs. The automatic toolbar policy and progressive file writes retain their current owners.

**TAD / ADR.** The shared HTML converter consumes rendered content first and uses caller-supplied embedded Markdown only when the body conversion is empty. Head metadata cannot mask that fallback. One extracted content-root owner includes the nearest bounded title-bearing container around a prose fragment while respecting explicit article/main and existing strong root boundaries, multiple-title boundaries, and surrounding navigation. Existing embedded-data compatibility remains an input fallback, never an early return that discards rendered siblings. The crawler writes normal article Markdown; head diagnostics remain in the captured raw HTML artifact. Debug snapshot formatting moves into its own helper; the webpage artifact entry point drops below 600 lines. The pre-existing 1,420-line unified converter shrinks; splitting its remaining unrelated transforms is outside this increment. No new dependency or always-loaded renderer is added.

**Verification / delivery.** Nineteen focused cases pass, including fixtures with no embedded data, independent URLs, explicit article markup, title/media/section preservation, separate visual rows, embedded-only pages with image exclusion, and existing multilingual/media conversions. A local server import verifies article output without diagnostic metadata. Replaying the saved 196,776-byte reported page changed the former 104-character result to complete article Markdown; title, video reference, all 27 chapter rows, description once and transcript ending are checked. TypeScript, hygiene and collaboration contract checks pass. This is captured-source replay evidence, not a claim of pixel-identical reproduction or recovery of an already-saved workspace file. The screenshot's `destroy` error has no reproduced stack and remains unresolved. Source publication, protected integration and Production receipts remain distinct. GTM remains reliable crawl-to-exploration; no new buyer or payment claim.

## User outcomes

| Surface | Outcome |
|---|---|
| Import URL | Crawl a public HTTP(S) site in headless Chromium, follow same-site links, extract rendered HTML, and download bounded linked files. |
| Import local files | Preserve the established local-file and folder corpus pipeline and its existing Canvas extraction behavior. |
| Canvas | Create `website.crawl.canvas.md` with page nodes, link edges, downloaded-file nodes, and direct artifact links, then apply it through the shared workspace-to-Canvas owner. |
| Chat and Widget Card invocation | Route `/reference.expand @url:<https-url> @reference-policy #canvas` through the existing live `/`, `@`, and `#` grammar and the same website-import runtime. Widget Card Run creates or reuses a Rich Media Panel immediately, bypasses text-model generation, and falls back to the imperative importer when the React workspace bridge is unavailable. |

## Acceptance contract

- Rendered HTML from JavaScript-driven pages is captured in headless mode.
- Same-site links discovered in rendered DOM are queued until the configured page ceiling is reached.
- HTML, PDF, JPG, PNG, and other linked file types use one bounded artifact record and download route.
- Each downloaded artifact records its source URL, safe file name, MIME type, byte count, and SHA-256 digest.
- Proxy rotation is enabled when `AGENTIC_OS_CRAWLER_PROXY_URLS` contains valid HTTP, HTTPS, SOCKS4, or SOCKS5 proxy URLs; the pool is bounded to crawler concurrency.
- When no proxy pool is configured, runtime metadata reports direct mode rather than claiming rotation occurred.
- Loopback, link-local, RFC1918, carrier-grade NAT, unique-local IPv6, and resolved private addresses are blocked by default.
- Userinfo-bearing target URLs are rejected by the chat invocation. Redirects used for file retrieval are checked at every hop.
- The dependency manifests contain no Apify or Crawlee dependency.
- Headless HTML capture and direct PDF download pass real Chromium smoke proof.
- Physical crawler artifacts are stored under the sibling `sandbox/agentic-graph-workspace` root. New manifests use portable `agentic-graph-workspace/...` logical paths, while existing dot-prefixed paths remain readable through the shared resolver.
- One `YYYYMMDDTHHmmssZ` UTC generation token owns the crawl folder and every derived artifact; an existing valid token from the active generated document is reused.

## Reference implementation: Technical architecture

### Existing owners retained

| Responsibility | Owner |
|---|---|
| Website job lifecycle and manifests | `canvas/src/lib/websites/server/websiteImportServer.ts` |
| Native browser crawl, proxy pool, SSRF policy, and download budget | `canvas/src/lib/websites/server/nativeWebsiteCrawler.ts` |
| Binary and text artifact delivery | `canvas/src/lib/websites/server/websiteImportArtifactServer.ts` |
| Sandbox storage resolution and UTC generation identity | `canvas/src/lib/websites/server/websiteImportStorage.ts` |
| Workspace materialization | `canvas/src/features/markdown-workspace/useWorkspaceFileActions/websiteImportAction.ts` |
| Local files and corpus-to-Canvas application | existing `workspaceImport` and `applyWorkspaceImportToCanvas` owners |
| Live invocation grammar | existing Agentic Canvas OS dictionary-backed catalog plus `nativeCrawlerInvocation.ts` route adapter |
| Prompt preset | centralized Agentic Canvas OS `PROMPT-PRESETS.md`; `/crawler-agent @url:<https-url> @reference-policy #canvas` routes to the same native executor |

### Input contract

The client may request `browserMode=headless`, proxy rotation, asset downloads, a maximum page count, concurrency, download count, total download bytes, and an existing valid UTC generation token. It cannot provide proxy URLs or credentials. Server proxy endpoints come only from `AGENTIC_OS_CRAWLER_PROXY_URLS`, with one URL per comma or line.

The default physical store is the sibling `sandbox` checkout, resolved from the repository root without a developer-specific absolute path. `AGENTIC_OS_WORKSPACE_STORE_ROOT` may override that root for another local environment. The portable logical output setting is `agentic-graph-workspace/website-imports`, so workspace frontmatter and artifact URLs are machine-neutral. Legacy `.agentic-graph-workspace/website-imports` references resolve to the same physical store.

`AGENTIC_OS_CRAWLER_ALLOW_PRIVATE_NETWORKS=1` is an explicit development override for testing a locally hosted target. It is not sent by the client and is off by default.

### Runtime flow

1. The existing start route normalizes bounds, reuses a valid supplied `YYYYMMDDTHHmmssZ` token or creates one once, and creates a typed manifest under that generation ID.
2. Headless mode seeds the root URL without static prefetch, keeping discovery inside the browser and proxy boundary.
3. A browser pool rotates requests across the configured proxy endpoints by crawl sequence.
4. Each isolated browser context blocks unsafe subresource destinations, captures the rendered DOM, and extracts links and file candidates.
5. The job appends normalized same-site links to its bounded queue and converts captured HTML through the existing artifact converter.
6. Download candidates reserve shared count and byte budgets before persistence.
7. Workspace materialization creates page documents, the existing sitemap document, and one flowchart-backed Canvas document.

### Output contract

The manifest records engine, headless state, proxy mode, proxy pool size, download bounds, page links, and downloaded artifact metadata. It never records proxy endpoints or credentials. The artifact route validates import, node, and download identifiers against the manifest before reading a stored file.

The Canvas document exposes the page relationship graph and artifact download links. It is deliberately bounded to 500 pages, 1,500 graph edges, and 24 displayed downloads per page even if future server limits grow.

### Failure and fallback behavior

- An unsafe target or redirect produces a typed node error.
- A missing browser executable produces a crawl failure with the Playwright launch error. Development setup must run `npx playwright install chromium`; a system Chrome channel is the secondary launch option.
- A file with missing or invalid size metadata, a per-file size over 25 MiB, exhausted count budget, or exhausted total-byte budget is skipped.
- A headless crawl does not silently fall back to the static HTTP crawler, because doing so would bypass the selected proxy and browser security boundary.
- Markdown conversion failure leaves the raw HTML artifact available and does not discard the successful page capture.

### Cost and token posture

The crawler makes no model calls and consumes zero model tokens. Runtime cost is local browser CPU, memory, network traffic, proxy service cost if the operator configures one, and stored artifact bytes. Hard limits cap the crawl at 500 pages, 12 workers, 500 downloaded files, 1 GiB total downloaded bytes, 100 MiB configurable per-file bytes, five file redirects, and a 120-second configurable navigation timeout. The Import URL action requests the tighter defaults of 120 downloaded files and 250 MiB total bytes; the current native crawler keeps per-file downloads at 25 MiB and navigation at 30 seconds.

### Lane topology

This increment is authoring-only. The repository has source owners and test hosts, but it has no
separately provisioned crawler mirror, public server-owned crawler runtime, delivery receipt, or
operator promotion instruction.

| Lane | Function | Mutation rights | Residency | Current state | Local rung | Delivered rung |
|---|---|---|---|---|---|---|
| Authoring | edit and exercise crawler source/tests locally | scoped source, tests, and local artifacts | developer checkout plus sibling sandbox workspace | VCCs stated; results not attached | `spec-complete` | `undocumented` |
| Mirror | not provisioned for this increment | none | not assigned | absent; no candidate evidence | `undocumented` | `undocumented` |
| Delivery | not provisioned for this increment | none | not assigned | absent; no reachable runtime evidence | `undocumented` | `undocumented` |

| Boundary | From lane | To lane | Evidence Reference | Operator instruction | Rollback statement and check | State |
|---|---|---|---|---|---|---|
| `CRAWLER-SOURCE-TO-MIRROR` | Authoring | Mirror | none; mirror is absent | `none` | retain the prior Authoring revision and local artifacts | `closed` |
| `CRAWLER-MIRROR-TO-DELIVERY` | Mirror | Delivery | none; both lanes are absent | `none` | no delivered state exists to roll back | `closed` |

### VCC and Evidence Reference register

No satisfying result is attached to this revision. The source files and registered test cases
establish invocable hosts, not completed evidence.

| VCC | End state | Named check | Constraint | Recorded result | Local rung | Delivered rung |
|---|---|---|---|---|---|---|
| `VCC-NC-1` | private-network policy, proxy parsing, storage identity, canvas/download output, invocation routing, recovery, and dependency prohibition cases pass | `npm --prefix canvas run test:ci:unit -- websiteImport.native` exits 0 | no external crawler dependency or client-owned proxy credential is introduced | not recorded | `spec-complete` | `undocumented` |
| `VCC-NC-2` | the client type/build contract accepts the retained owners | `npm --prefix canvas run check` exits 0 | no unrelated generated document changes | not recorded | `spec-complete` | `undocumented` |
| `VCC-NC-3` | a clean environment captures one rendered page and one bounded linked file through the browser path | clean-environment browser smoke records the URL, artifact digest, byte count, and terminal status | private targets remain blocked and configured bounds remain active | not recorded; no dedicated smoke host exists | `spec-complete` | `undocumented` |
| `VCC-NC-4` | an exact approved candidate and reachable crawler runtime pass live verification | protected mirror and delivery checks exit 0 | source/unit checks cannot satisfy delivery | not applicable this increment; lanes absent | `spec-complete` | `undocumented` |

### Readiness Gap Matrix

| Workstream | Local rung | Delivered rung | Gap | Priority | Exit criteria (VCC) |
|---|---|---|---|---|---|
| Source contract and bounded unit behavior | `spec-complete` | `undocumented` | focused source result is not attached | none | `VCC-NC-1` and `VCC-NC-2` gain satisfying local Evidence References |
| Clean-environment browser behavior | `spec-complete` | `undocumented` | no dedicated invocable browser smoke host or recorded result | major | add a source-owned bounded smoke host and satisfy `VCC-NC-3` |
| Mirror and delivery | `undocumented` | `undocumented` | both lanes are deliberately absent from this increment | none | keep `VCC-NC-4` out of scope, or add a follow-on PRD/TAD before provisioning either lane |

## Planning revision — reference implementation

All five roles below consume `PLAN-AGENTIC-GRAPH-NATIVE-WEB-IMPORT-CRAWLER-PRD-TAD-ADR-MVP-GTM@0.2.1`. Existing source and runtime observations retain their original revisions and scope; this documentation update renews no deployment or demand evidence. The guideline is [v2.7.0](https://github.com/huijoohwee/huijoohwee.github.io/blob/e8d2a10a8d3e5735c43edf350a22523df05fdf91/guidelines/prd-tad-adr-mvp-gtm-guidelines.md); the shared maturity rubric loads on demand.

| Role | Owning content at this revision |
|---|---|
| PRD | [Acceptance contract](agentic-graph-native-web-import-crawler-prd-tad-adr-mvp-gtm.md#acceptance-contract) |
| TAD | [Reference implementation: Technical architecture](agentic-graph-native-web-import-crawler-prd-tad-adr-mvp-gtm.md#reference-implementation-technical-architecture) |
| ADR | [Product decision](agentic-graph-native-web-import-crawler-prd-tad-adr-mvp-gtm.md#product-decision) |
| MVP | [MVP — reference implementation](agentic-graph-native-web-import-crawler-prd-tad-adr-mvp-gtm.md#mvp--reference-implementation) |
| GTM | [GTM — reference implementation](agentic-graph-native-web-import-crawler-prd-tad-adr-mvp-gtm.md#gtm--reference-implementation) |

## MVP — reference implementation

Reuse the minimum scope, acceptance conditions and component owners identified above. The demonstration must follow the documented entry, permitted action, durable outcome and readback, including its stated failure/recovery path. Use `npm run check` for its actual coverage and the named feature checks in the specification; attach exact source, command, result and authoring/mirror/delivery surface to each VCC before advancing readiness. A source locator or structural check alone proves no user outcome.

Record the observed steps and elapsed time against the existing TTV target. If no target or invocation is stated, the demonstration remains unverified until the document owner supplies it. All four experience criteria are **unassessed** in this authoring review: Core Requirements & Functionality, Innovation & Theme Alignment, Technical Execution & Integration, and Usefulness & Agentic Experience. No scored user observation is attached to this revision; the document owner must capture a timed pilot and criterion-specific evidence.

## GTM — reference implementation

Use the stated persona and pain hypothesis to test one priced pilot in the existing user environment. Keep the documented free/self-serve workflow as the comparison; additional hosting, channels or agent roles require an evidenced constraint or buyer need. Record the buyer’s workaround, frequency, accepted outcome, offered price, observed response and support minutes before ranking a commercial winner. Demand, collected payment and repeat use remain unvalidated by this documentation review; mechanism evidence keeps its narrower original scope. Measure tokens, cash expense and maintenance separately for each proposed deployment model. Feed actual pilot outcomes into a successor Context using the shared four-column planning record.

## Planning gaps — reference implementation

Source review is bounded to repository `7fb85741121d8c2886027e4a630d013ba91c1027`. Confirmed: these referenced artifacts exist at that revision: [`canvas/src/lib/websites/server/websiteImportServer.ts`](https://github.com/huijoohwee/agentic-graph/blob/7fb85741121d8c2886027e4a630d013ba91c1027/canvas/src/lib/websites/server/websiteImportServer.ts), [`canvas/src/lib/websites/server/nativeWebsiteCrawler.ts`](https://github.com/huijoohwee/agentic-graph/blob/7fb85741121d8c2886027e4a630d013ba91c1027/canvas/src/lib/websites/server/nativeWebsiteCrawler.ts), [`canvas/src/lib/websites/server/websiteImportArtifactServer.ts`](https://github.com/huijoohwee/agentic-graph/blob/7fb85741121d8c2886027e4a630d013ba91c1027/canvas/src/lib/websites/server/websiteImportArtifactServer.ts). Their existence does not confirm every behavior asserted by the specification.
Experience observations, current VCC execution and buyer/payment evidence are unverified here. This is a bounded planning update, not a full-guideline conformance verdict; historical conformance percentages above apply only to their recorded profile and revision.
