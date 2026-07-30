---
title: "Knowgrph Agent Ready - PRD + TAD (Implementation Accurate + Enhanced)"
id: "md:knowgrph-agent-ready-prd-tad"
doc_type: "Product and Technical Specification"
version: "1.27.7"
date: "2026-07-30"
lang: "en-US"
owner: "cloudflare.pages.agent-ready.surface"
local_rung: "dev-proven"
delivered_rung: "runtime-ready"
lane: "authoring"
universal_scope: false
doc_path: "docs/documents/knowgrph-agent-ready-prd-tad.md"
companion: "docs/documents/knowgrph-agent-ready-prd-tad.companion.md"
runtime_companion: "docs/documents/knowgrph-agent-ready-prd-tad.runtime.md"
schema: "kgc-computing-flow/v1"
tags: [agent-ready, auth-md, cloudflare, dns-aid, mcp, webmcp, a2a, markdown, share-url, source-files, workspace, chat, kgc, canvas, prd, tad]
source_audit: isitagentready.com / Cloudflare Is Your Site Agent-Ready? + in-repo implementation audit
constraints:
  - solo-dev
  - tco-zero
  - foss-first
  - cloudflare-native
  - token-efficient
related:
  - prd-tad-guidelines.md
  - knowgrph-agent-ready-cloudflare-isitagentready.md
  - knowgrph-mcp/knowgrph-mcp-service-prd-tad.md
---

# Knowgrph Agent Ready - PRD + TAD (Implementation Accurate + Enhanced)

## Executive Summary

This document replaces two stale narratives at once:

- scan-style narratives that still describe Knowgrph as missing Link headers, Markdown
  negotiation, or WebMCP on `https://airvio.co/knowgrph/`
- roadmap narratives that blur the boundary between the shipped read-only Pages MCP surface and
  a larger planned remote MCP platform documented separately in
  `docs/documents/knowgrph-mcp/knowgrph-mcp-service-prd-tad.md`
- crawl-path narratives that imply agents should read Markdown-pane content from
  `huijoohwee/docs` instead of the published Editor Workspace -> Source Files -> D1 document-view
  pipeline

In the current repo, Knowgrph already ships the service-homepage agent-readiness surface on
`https://airvio.co/knowgrph/`, plus a separate in-browser MainPanel -> FloatingPanel Chat -> KGC
or literal MCP structured response -> Editor Workspace -> Canvas pipeline that is richer than the deployed read-only MCP surface but is not yet exposed
as a first-class MCP tool chain. It also ships a local long-horizon SuperAgent harness through
`knowgrph_parser`, `npm run goal:run`, and local MCP `knowgrph.superagent.run`; that local harness
is not a deployed public mutation tool.

For current remote MCP onboarding, start with
`docs/documents/knowgrph-mcp-onboarding-index.md`, then use
`docs/documents/knowgrph-mcp-install-contract.md` for the canonical
public-discovery vs control-plane endpoint boundary.
Map intent on `https://airvio.co/knowgrph/mcp`, orchestrate agents on
`https://airvio.co/knowgrph/control-plane/mcp` only for session-capable hosts,
and prove outcomes first with the source-side `README.md` or
`docs/documents/knowgrph-superagent-harness.md` offline path.

The active work is therefore not "add the first agent-ready surface." The active work is:

- keep deployed discovery owned upstream in `knowgrph`
- keep `/knowgrph/` as the canonical service homepage for agent discovery
- preserve the shipped seven-tool read-only Pages MCP contract and the app-installed browser
  WebMCP contract with 23 inspectors/reads plus three guarded browser-local controls
- publish DNS-AID service-binding records under `_agents.airvio.co` so agent discovery can start
  from DNS before falling through to HTTP `.well-known` artifacts
- keep crawler-visible Markdown reads pinned to the published D1-backed Source Files and doc-view
  routes that derive from the Editor Workspace Markdown pane
- document MainPanel `mcp` and `integrations` as thin shells over shared `SettingsView` ownership
  instead of parallel configuration systems
- document the existing FloatingPanel Chat -> LLM output -> YAML frontmatter or literal MCP structured content -> Editor Workspace -> Canvas graph
  pipeline as the only valid upstream path for future MCP-aligned pipeline work
- document the native local SuperAgent harness as a source-owned CLI/local-MCP execution surface,
  inspired by DeerFlow primitives but not copied from DeerFlow and not deployed through Pages MCP
- prevent drift between browser WebMCP, HTTP MCP, MainPanel surfaces, chat submit helpers, canvas
  parsing, storage routes, and publish sync
- forbid stale architecture claims that the full remote MCP pipeline, auth, monetization, or graph
  mutation platform is already deployed when those capabilities remain planned elsewhere

## Scope

### Product scope

Make `https://airvio.co/knowgrph/` discoverable to agents, browser-resident tools, and
Cloudflare-based crawlers without introducing a parallel architecture, duplicate deploy owner, or
stale downstream patches.

Crawler-visible Markdown pane content must resolve from the published Editor Workspace -> Source
Files -> storage-worker D1 document routes, not from repo-local docs trees such as
`$GITHUB_ROOT/huijoohwee/docs`.

### Deployment topology

```text
Dev SSOT
  $GITHUB_ROOT/knowgrph
    -> npm run pages:build-sync

Prod static mirror
  $GITHUB_ROOT/huijoohwee/content/knowgrph
    -> mirrored app payload only

Prod Pages route owner
  $GITHUB_ROOT/huijoohwee/functions/knowgrph/[[path]].js
    -> generated from cloudflare/pages/knowgrph-agent-ready.mjs

Prod Pages root config
  $GITHUB_ROOT/huijoohwee/{_headers,_redirects,.well-known/*}

Cloudflare Pages
  https://airvio.co/knowgrph/
```

### Critical correction

`huijoohwee/content/knowgrph` is not the complete deploy authority for agent-readiness. It is a
mirrored artifact tree. The deployed discovery and route behavior is jointly owned by:

- `knowgrph/cloudflare/pages/knowgrph-agent-ready.mjs`
- `knowgrph/scripts/sync-pages-knowgrph.mjs`
- `huijoohwee/functions/knowgrph/[[path]].js`
- `huijoohwee/_headers`
- `huijoohwee/_redirects`

## Product Goals

Knowgrph must:

- expose machine-readable discovery metadata without requiring HTML scraping
- expose a valid A2A Agent Card at the standard well-known path
- expose DNS-AID ServiceMode SVCB records for the Knowgrph index, MCP endpoint, and A2A descriptor
  under the Cloudflare-managed `airvio.co` zone
- keep HTML as the default human response on `/knowgrph/`
- return Markdown for agent requests on `/knowgrph/` when `Accept: text/markdown`
- expose seven read-only published HTTP/HTML MCP tools, plus bounded app-installed browser tools
  that inspect or explicitly control only the open local Camera, Animation, and XR scene runtimes
- keep the default published workspace readable without requiring a caller-supplied `workspaceId`
- keep MainPanel `mcp` and MainPanel `integrations` aligned to the same upstream settings and chat
  routing owners instead of diverging into duplicate surfaces
- keep MainPanel `commerce` aligned to the shared Agentic Commerce route and semantic-key owner
  instead of duplicating payment, Web3, governance, proof, or trace readiness in the browser UI
- preserve one canonical document identity and path contract across Editor Workspace, Source Files,
  FloatingPanel Chat, frontmatter or structured-surface validation, canvas parsing, storage routes, and agent surfaces
- preserve one canonical KGC contract where the LLM output starts at YAML frontmatter and uses
  `flow.subgraphs` as the sole grouping authoring surface
- prevent stale or conflicting Cloudflare control surfaces, mirror-owned route logic, apex-root PWA
  drift, and duplicate MCP-only chat-to-canvas pipelines

## Non-Goals

Knowgrph does not currently aim to:

- expose write-capable published HTTP/HTML MCP tools or unbounded browser mutation tools
- expose the user's unsaved local browser draft directly as a deployed Cloudflare document
- move full Knowgrph route ownership or app identity onto the apex homepage `https://airvio.co/`
- introduce a second agent-ready implementation path outside `knowgrph`
- preserve legacy or conflicting architecture descriptions through compatibility aliases
- emulate DNS-AID through TXT records, HTTP-only aliases, or app-local code in place of real DNS
  records

## Current Implementation Status
| Capability | Status | Canonical owner | Remaining gap |
|---|---|---|---|
| Link headers on service homepage | Implemented | `cloudflare/pages/knowgrph-agent-ready.mjs` | Headers exist on `/knowgrph/`; apex `/` remains intentionally excluded |
| Link headers on root homepage | Implemented | `scripts/sync-pages-knowgrph.mjs` + `huijoohwee/_headers` | Root `/` advertises Knowgrph discovery without moving route ownership out of `knowgrph` |
| Auth.md agent registration metadata | Implemented | `cloudflare/pages/knowgrph-agent-ready.mjs` + `scripts/check-auth-md.mjs` | `/auth.md` is Markdown, Protected Resource Metadata points agents at the site-owned authorization-server metadata, and that metadata includes `agent_auth`; registration remains user-mediated through the existing auth boundary |
| DNS-AID records | Implemented | `scripts/dns-aid-records.mjs` + `scripts/publish-dns-aid-cloudflare.mjs` + `scripts/check-dns-aid-cloudflare.mjs` | `_index._agents.airvio.co`, `_mcp._agents.airvio.co`, and `_a2a._agents.airvio.co` return DNSSEC-authenticated ServiceMode SVCB records |
| Markdown negotiation on homepage | Implemented | `cloudflare/pages/knowgrph-agent-ready.mjs` + `cloudflare/pages/root-agent-ready-index.mjs` | Accept parsing is intentionally narrow to `text/markdown` |
| Markdown negotiation on shared published docs | Implemented | `cloudflare/pages/knowgrph-agent-ready.mjs` + `cloudflare/workers/knowgrph-storage/wrangler.toml` + `scripts/sync-pages-knowgrph.mjs` | Pages server-side shared-doc and MCP storage reads use the storage worker `workers.dev` origin to avoid custom-domain self-fetch rewrites |
| Knowgrph health endpoint | Implemented | `cloudflare/pages/knowgrph-agent-ready.mjs` | App-scoped route stays the canonical status surface |
| A2A Agent Card | Implemented | `cloudflare/pages/knowgrph-agent-ready.mjs` | Card advertises current machine interfaces; it does not imply a full new task runtime |
| Browser WebMCP tool registration | Implemented | `canvas/src/features/agent-ready/webMcpRuntime.ts` + `canvas/src/features/agent-ready/knowgrphAgentReadyToolContract.mjs` | App runtime installs 28 tools: 24 read-only retrieval/inspection tools plus guarded `control_local_camera`, `control_local_animation`, `control_local_motion_control`, and `control_local_xr_scene` mutations of the open browser-local runtime; Motion Control inspection returns status, summarized pose, and strict scene-authored object/physics records, never camera frames, camera box coordinates, or camera-derived identities. The separate three-tool Agentic ECS stdio session is intentionally absent from browser WebMCP. |
| Browser WebMCP lifecycle hardening | Implemented | `canvas/src/features/agent-ready/webMcpLifecycle.mjs` + `canvas/src/features/agent-ready/webMcpRuntime.ts` | Runtime and fallback expose `provideContext`, `registerTool`, readable `tools`, and paired `document.modelContext`/`navigator.modelContext` late binding; contexts with both APIs receive one canonical `provideContext({ tools })` publication instead of duplicate registration |
| Browser-local workspace document inspector | Implemented | `canvas/src/features/agent-ready/webMcpRuntime.ts` + `canvas/src/hooks/useGraphStore.ts` | Exposed only in the app-installed browser runtime; not part of the shared deployed Pages HTTP/HTML tool contract |
| Browser-local canvas topology inspector | Implemented | `canvas/src/features/agent-ready/webMcpRuntime.ts` + `canvas/src/features/agent-ready/localCanvasTopologyInspection.ts` | Reuses active-view derivation and graph-topology helpers in the app runtime only; not part of the shared deployed Pages HTTP/HTML tool contract |
| Browser-local canvas snapshot inspector | Implemented | `canvas/src/features/agent-ready/webMcpRuntime.ts` + `canvas/src/features/agent-ready/localCanvasSnapshotInspection.ts` | Reuses the store-owned canvas SVG snapshot seam in the app runtime only; not part of the shared deployed Pages HTTP/HTML tool contract |
| Browser-local 3d camera pose inspector | Implemented | `canvas/src/features/agent-ready/webMcpRuntime.ts` + `canvas/src/features/agent-ready/localThreeCameraPoseInspection.ts` | Reuses the store-owned 3d camera pose seam in the app runtime only; not part of the shared deployed Pages HTTP/HTML tool contract |
| Browser-local 3d layout-position inspector | Implemented | `canvas/src/features/agent-ready/webMcpRuntime.ts` + `canvas/src/features/agent-ready/localThreeLayoutPositionsInspection.ts` | Reuses the store-owned 3d layout-position seam in the app runtime only, with a bounded sampled payload; not part of the shared deployed Pages HTTP/HTML tool contract |
| Browser-local 2d zoom/viewport inspector | Implemented | `canvas/src/features/agent-ready/webMcpRuntime.ts` + `canvas/src/features/agent-ready/local2dZoomViewportInspection.ts` | Reuses the keyed 2d zoom-state seam in the app runtime only, with renderer-aware active-view key resolution; not part of the shared deployed Pages HTTP/HTML tool contract |
| Browser-local Source Files snapshot inspector | Implemented | `canvas/src/features/agent-ready/webMcpRuntime.ts` + `canvas/src/features/agent-ready/localSourceFilesSnapshotInspection.ts` | Reuses the in-memory Source Files runtime snapshot, active workspace path, and existing composition/storage signatures in the app runtime only; not part of the shared deployed Pages HTTP/HTML tool contract |
| HTML fallback WebMCP injection | Implemented | `cloudflare/pages/knowgrph-agent-ready.mjs` + `cloudflare/pages/root-agent-ready-index.mjs` | Inline fallback stays contract-equal with the seven-tool read-only published contract; root `/` no longer meta-refreshes during scanner execution |
| HTTP MCP transport | Implemented | `cloudflare/pages/knowgrph-agent-ready.mjs` | Tool surface is read-only only, by design |
| Shared tool-schema contract | Implemented | `canvas/src/features/agent-ready/knowgrphAgentReadyToolContract.mjs` | Future published tools must extend this shared upstream contract; browser-only tools may opt in explicitly without leaking into Pages MCP |
| MainPanel Integrations hub | Implemented | `canvas/src/features/panels/MainPanel.tsx` + `canvas/src/features/panels/views/IntegrationsHubView.tsx` + `canvas/src/features/panels/views/SettingsView.tsx` | Integrations is a thin `SettingsView` specialization, not a second routing owner |
| MainPanel MCP hub | Implemented | `canvas/src/features/panels/MainPanel.tsx` + `canvas/src/features/panels/views/McpHubView.tsx` + `canvas/src/features/panels/views/SettingsView.tsx` | MCP is also a thin `SettingsView` specialization, not a separate chat pipeline |
| MainPanel Commerce hub | Implemented | `grph-shared/src/payments/agenticCommerceSsot.ts` + `canvas/src/features/panels/views/CommerceHubView.tsx` | Commerce is the canonical payment/agent-buyable operator surface; route readiness is read from `AGENTIC_COMMERCE_MAIN_PANEL_READINESS`, keyed by `buildAgenticCommerceMainPanelReadiness`, and published to browser-local agent inspection |
| Chat integration routing and presets | Implemented | `canvas/src/features/panels/views/useSettingsChatAssist.tsx` + `canvas/src/features/panels/views/settingsView.constants.ts` | Future MCP deep links must reuse the same chat routing, model, and open-panel helpers |
| FloatingPanel chat submit pipeline | Implemented | `canvas/src/features/chat/floatingPanelChat/useFloatingPanelChatSubmit.ts` + coordinator helpers | Browser-local today; not yet exposed as a first-class WebMCP or HTTP MCP tool chain |
| KGC and literal MCP structured-surface validation | Implemented | `canvas/src/features/chat/floatingPanelChat/floatingPanelChatKgcAttempt.ts` + `canvas/src/features/chat/chatMarkdownValidation.ts` + recovery helpers | Wrapper prose and parallel grouping aliases are rejected or stripped upstream; renderable literal MCP `structuredContent` finalizes without KGC retry |
| Chat finalize -> canvas apply | Implemented | `canvas/src/features/chat/floatingPanelChat/useFinalizeAssistantSuccess.ts` + `canvas/src/features/chat/chatKgcCanvasApply.ts` | Writes canonical workspace KGC or projected MCP structured response first, then applies to graph through existing store actions |
| Frontmatter-flow parse priority and graph composition | Implemented | `canvas/src/features/parsers/default.ts` + `canvas/src/features/parsers/markdownFrontmatterFlowGraph.*` | `tryParseMarkdownFrontmatterFlowGraph()` remains first parse priority for structured KGC Markdown |
| Subgraph/group projection | Implemented | `canvas/src/lib/graph/subgraphs.ts` + `canvas/src/components/GraphCanvas/layout/graphGroups.ts` | `flow.subgraphs` remains the sole authoring surface; rendered groups are downstream projection only |
| API catalog | Implemented | `cloudflare/pages/knowgrph-agent-ready.mjs` | `status` relation now targets `/knowgrph/health` |
| OpenAPI document | Implemented | `cloudflare/pages/knowgrph-agent-ready.mjs` | Health, MCP, and storage reads are documented from the existing route owner |
| Agent Skills index | Implemented | `cloudflare/pages/knowgrph-agent-ready.mjs` | Index is intentionally minimal |
| Default workspace markdown doc route | Implemented | `cloudflare/workers/knowgrph-storage/index.ts` | Published default workspace only |
| Source Files index and `llms.txt` | Implemented | `cloudflare/workers/knowgrph-storage/crawler.ts` | Service doc remains intentionally compact |
| Crawler-visible Markdown pane path | Implemented | `cloudflare/workers/knowgrph-storage/crawler.ts` + `cloudflare/workers/knowgrph-storage/index.ts` | Agents read published Editor Workspace Markdown through D1-backed Source Files index and doc-view routes, not from repo-local docs directories |
| Local long-horizon SuperAgent harness | Implemented locally | `knowgrph_parser/superagent_harness.py`, `knowgrph_parser/superagent_plan.py`, `knowgrph_parser/superagent_tools.py`, `mcp/server.js`, `mcp/local-tool-contract.js` | CLI/local MCP only; not a deployed Pages/WebMCP mutation service; DeerFlow is conceptual inspiration only |
| Publish sync and Pages control-file hygiene | Implemented | `scripts/sync-pages-knowgrph.mjs` | Must keep mirror non-authoritative |
| PWA base-path correctness | Implemented | `canvas/index.html` and Pages root config | Must keep `%BASE_URL%manifest.webmanifest` invariant |
| Full remote MCP pipeline platform from the separate MCP service PRD/TAD | Planned extension | `docs/documents/knowgrph-mcp/knowgrph-mcp-service-prd-tad.md` | Must not be documented here as already shipped on the Pages agent-ready surface |
| Agentic OS Canvas UI and cross-repo build/control dashboard | Follow-on Track C | `docs/documents/knowgrph-mcp/knowgrph-mcp-agentic-os-prd-tad.md` + [`knowgrph-agentic-os-follow-on-prd-tad.md`](knowgrph-agentic-os-follow-on-prd-tad.md) | Dry-run plan **implemented** (`knowgrph.agentic_canvas_os.plan`); Canvas Storyboard render + live lanes → follow-on Track C; HITL/live deploy → Tracks A/B |

## Commerce

MainPanel Commerce is part of the browser-local agent-readiness path. It is not a second payment
registry, a storefront, or a duplicate worker. The canonical Commerce contract lives in
`grph-shared/src/payments/agenticCommerceSsot.ts` as `AGENTIC_COMMERCE_MAIN_PANEL_READINESS`.

That shared owner provides the section list, row semantic keys, route paths, signal rows, route
count, and top-level readiness semantic key through `buildAgenticCommerceMainPanelReadiness`.
`CommerceHubView` renders those rows directly and publishes the same snapshot into
`browserLocalSurfaceSnapshots`, so WebMCP inspection reads the same ACP discovery, UCP profile,
MPP OpenAPI, x402 middleware probes, checkout, Stripe webhook, Base RPC/EAS, OpenBOX, proof, and trace
readiness surface that the operator sees.

`knowgrph.inspect_local_mainpanel_chat_canvas_pipeline` treats MainPanel `mcp`, `integrations`,
and `commerce` as the valid browser-local entry surfaces for the E2E readiness path. The tool does
not claim that Commerce mutates payments through WebMCP or HTTP MCP. It only exposes read-only
Commerce readiness next to Settings chat readiness, mounted Editor Workspace state, FloatingPanel
Chat state, workspace frontmatter/KGC or MCP structured-surface validation, and active Canvas
topology.

`agentReady.localMainPanelChatCanvasPipeline.entryTabs` verifies the three valid entry tabs
against the same ready FloatingPanel Chat, workspace, and Canvas fixture. The companion
`agentReady.localMainPanelChatCanvasPipeline.rejectsLegacyPayments` guard keeps stale
`payments` tab state visible as an issue instead of remapping it into Commerce.

The forbidden states are:

- top-level `payments` and `commerce` tabs rendered in parallel
- browser-local route strings that duplicate `AGENTIC_COMMERCE_ROUTE_PATHS` or
  `STRIPE_PAYMENT_ROUTE_PATHS`
- UI-side proof recomputation, fake settlement state, or hardcoded seller/project identifiers
- compatibility aliases that remap stale payment tab names into the Commerce route
## Companion Files

| File | Scope |
|---|---|
| `knowgrph-agent-ready-prd-tad.companion.md` | Source-of-truth owners, forbidden architecture, and corrected requirements. |
| `knowgrph-agent-ready-prd-tad.runtime.md` | Technical architecture, route contract, component inventory, guardrails, validation, and deployment sequence. |
