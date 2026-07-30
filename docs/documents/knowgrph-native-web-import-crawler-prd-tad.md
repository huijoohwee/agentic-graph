---
title: "Reference implementation: Knowgrph Native Web Import Crawler — PRD/TAD"
id: "md:knowgrph-native-web-import-crawler-prd-tad"
doc_type: "Product and Technical Specification"
version: "0.2.0"
date: "2026-07-30"
lang: "en-US"
guideline_version: "1.7.0"
owner: "docs.native-web-import-crawler"
local_rung: "spec-complete"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
doc_path: "docs/documents/knowgrph-native-web-import-crawler-prd-tad.md"
scope: "Native enhancement of existing Import URL, local-file import, Canvas projection, and live invocation owners"
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
---

# Reference implementation: Knowgrph Native Web Import Crawler

## Product decision

Enhance the existing website-import job instead of adding a second crawler stack. The Import URL globe action starts a server-owned headless crawl, materializes extracted pages through the existing Markdown workspace owner, creates a Canvas projection document, and exposes bounded HTML and downloaded-file artifacts. Import local files remains owned by the existing corpus import path, which already resolves source units and applies corpus-backed imports to Canvas.

The external crawler project is a capability reference only. The implementation uses the repository's existing Playwright dependency and native Node.js modules. It does not copy or depend on the reference project.

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
- Proxy rotation is enabled when `KNOWGRPH_CRAWLER_PROXY_URLS` contains valid HTTP, HTTPS, SOCKS4, or SOCKS5 proxy URLs; the pool is bounded to crawler concurrency.
- When no proxy pool is configured, runtime metadata reports direct mode rather than claiming rotation occurred.
- Loopback, link-local, RFC1918, carrier-grade NAT, unique-local IPv6, and resolved private addresses are blocked by default.
- Userinfo-bearing target URLs are rejected by the chat invocation. Redirects used for file retrieval are checked at every hop.
- The dependency manifests contain no Apify or Crawlee dependency.
- Headless HTML capture and direct PDF download pass real Chromium smoke proof.
- Physical crawler artifacts are stored under the sibling `sandbox/knowgrph-workspace` root. New manifests use portable `knowgrph-workspace/...` logical paths, while existing dot-prefixed paths remain readable through the shared resolver.
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

The client may request `browserMode=headless`, proxy rotation, asset downloads, a maximum page count, concurrency, download count, total download bytes, and an existing valid UTC generation token. It cannot provide proxy URLs or credentials. Server proxy endpoints come only from `KNOWGRPH_CRAWLER_PROXY_URLS`, with one URL per comma or line.

The default physical store is the sibling `sandbox` checkout, resolved from the repository root without a developer-specific absolute path. `KNOWGRPH_WORKSPACE_STORE_ROOT` may override that root for another local environment. The portable logical output setting is `knowgrph-workspace/website-imports`, so workspace frontmatter and artifact URLs are machine-neutral. Legacy `.knowgrph-workspace/website-imports` references resolve to the same physical store.

`KNOWGRPH_CRAWLER_ALLOW_PRIVATE_NETWORKS=1` is an explicit development override for testing a locally hosted target. It is not sent by the client and is off by default.

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
