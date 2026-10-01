---
title: "Native document analysis"
doc_type: "PRD-TAD-ADR-MVP-GTM"
continuity_id: "GRAPH-NATIVE-TEXT-001"
version: "1.0.29"
date: "2026-10-01"
lang: "en-US"
prd_revision: "1.0.29"
tad_revision: "1.0.29"
adr_revision: "1.0.29"
mvp_revision: "1.0.29"
gtm_revision: "1.0.29"
owner: "agentic-graph"
frontmatter_contract: "required"
local_rung: "dev-proven"
delivered_rung: "undocumented"
lane: "authoring"
load_policy: "on-demand"
universal_scope: true
worktree_id: "device-0232231d4a19--dashboard-graph-scope"
agent_id: "codex"
---

# Native document analysis

All five roles consume GRAPH-NATIVE-TEXT-001@1.0.29. The user authorizes native enhancements,
local validation and review delivery. Merge and production effects require their own authority.

## PRD

Keyword initialization must separate media panels before first paint using shared world dimensions, preserve fixed and already separated positions, and keep nodes and edges above cluster paint and border hits. Bound initialization work and prevent overlapping community fills from obscuring graph contrast. Keyword, Frontmatter and Document Structure modes share world projection: zoom scales content and controls once; resize divides pointer deltas by painted scale. Live graph anchors own document panel positions, including same-ID anchors. Peer surfaces paint by descending area within authored layers; selection does not raise a larger surface. Named shared controls remain selectable. Rounded orthogonal edges must remain smooth in every direction, including reverse and very short routes. The visible stroke and semantic selection path must share continuous geometry; route corners must never double back or leave a false gap.

D3 2D zoom-in enlarges the entire rich media frame and zoom-out shrinks it, for default and authored sizes, matching the shared 3D and Storyboard projection contract. Content, header and controls scale once together; graph anchoring and unbounded placement persist. Pinned 3D media follows its projected graph anchor during pan, drag and zoom, including crossing viewport edges. It must not snap to a viewport border or reappear as a screen-fixed fallback when its world anchor is offscreen. Camera distance and globe-label backface rules must not hide in-view media; only the camera frustum and projected panel bounds determine visibility before the existing count budget. Empty imported image sources use the shared media empty state, never a generic rectangle. Free panels retain explicit screen anchors. Shared media controls and larger-under-smaller ordering remain authoritative.

Imported source URLs must resolve to their saved documents when selecting canvas media. Non-interactive media bodies and headers share panel dragging; native embedded controls retain their gestures. A media panel covers every graph alias for the same media, without an additional opaque mesh.

The active 3D canvas must be a named selectable media surface. Each shared media panel must keep its visible content, open/pin/resize controls and individual hit target. Larger peer panels stay beneath smaller ones during selection, movement and resizing.

Canvas nodes, edge hit paths and cluster controls must expose individual names and keyboard activation to selection tooling. Shared media panels remain the media owner; covered SVG bodies must not duplicate their hit targets. Within an authored layer, larger nodes and media panels render beneath smaller peers.

A reader needs to check why a term or relationship appears without sending a document to a service.
Document insights exposes observed source matches, contexts and navigation. Keyword Mode preserves
ranking while reporting actual occurrences separately. Dashboard retains general node, edge and
cluster metrics and adds text evidence only when the current graph carries it.

The analysis accepts plain text and an opaque source identity: no domain, filename, document type,
agent manifest or provider selects behavior. Existing workspace adapters own source resolution and
navigation. An ordinary document toolbar can open insights without website metadata.

Acceptance: Unicode normalization preserves original offsets; repeated phrase counts are exact within
declared bounds; phrases do not cross sentence/newline boundaries; user phrases and language tags
work locally; selected keyword candidates select their contexts; stale source navigation is rejected;
ordinary graphs retain a useful Dashboard without text metadata. The active source has a compact Explorer reveal icon with its complete path in the tooltip;
reveal restores its row through filters or collapsed folders without reopening the document.
Remove the duplicate active-file strip and Source Files URL form; Launch owns Import URL. Headless URL crawl starts in D3, and generated page, canvas and sitemap documents
retain that default when reopened after another renderer. Import acceptance requires persisted page,
canvas and sitemap entries in the workspace being reviewed, including after reopening it; an analysis
note containing rendered page text does not prove that website import completed.

Captured pages must remain reopenable even when raw HTML contains large application-state attributes.
The HTML preview reports its limit and offers Markdown as the reading path; full capture/export stays intact.
Opening a saved preview must not automatically start captured embedded sites or autoplay media.
Switching documents must release the previous preview while its replacement is loading.

Reveal in Finder must select the named workspace document. Browser-only files save a named copy,
including unsaved active editor content. Explicit disk provenance still reveals the original file;
imports must never substitute a crawler cache page for the selected document. Named copies and new
crawler artifacts default to the configured local `docs_` output folder. Browser-only folders must
save and reveal their named subtree, including empty folders and current editor text. Only saved
workspace entries belong in the copy; discovered pages are not downloaded by Reveal.

Source Files must show discovered pages together with prior saved crawl files. Distinct file icons
identify saved website documents and discovered pages that have not been saved. Finding pages does
not import them; the reader selects pages or folders before starting a headless crawl. Discovery must
combine rendered navigation with published sitemap URLs, rather than equating one page’s links with
the whole website. Keep exact query variants, origin/path scope and explicit crawl selection.
Clicking a saved filename opens its document without changing crawl selection. Clicking a discovered
filename opens its file actions without selecting the page. When a discovered inventory is active,
the leading icons of saved and discovered website pages select them for crawl. Ordinary file icons
retain their document-selection action. Unsaved filenames are dimmed and describe their unavailable
content. Their Import icon can explicitly crawl that page without selecting it or consuming a pending
batch selection. A successful single-page import opens that page in the editor and canvas; a failed
import reports its error without substituting another document. Existing documents remain open until
the requested content has been saved.

Importing a discovered row saves its page at that row's workspace path and changes its status to saved.
It must not create another timestamp folder, canvas or sitemap in Source Files for that single action.
Revealing sibling documents must also place them together under one stable local workspace root.
Existing saved documents and earlier capture history remain intact. An occupied import destination fails
visibly instead of overwriting content or silently choosing another filename.

Source Files exposes file and folder actions in one icon context toolbar. Remove the row action
strip and text-menu variant; retain the existing compact icon size, accessible labels, tooltips and
disabled states. Pointer context-menu and keyboard invocation must address the same selected entry.
Files, folders, protected entries and discovered-only entries retain the same 16 icon slots and
order. Unavailable actions stay visible, greyed out and inert, with a reason in their tooltip.
Show-more and cancel actions belong in that icon row; the existing discovery action refreshes the
current inventory on its source or related folders. Counts, the crawl limit and saved/discovered
legend belong in a separate summary overlay below the toolbar overlay, with no duplicate controls
above the tree. Both panels reuse the shared AnchorOverlay component and panel styling.
The summary is hidden when a menu opens. Only an applicable discovery action or the explicit status
icon reveals it; the status icon also hides it without changing selection or starting discovery.

Website imports share the earliest existing collection folder for a host. Consolidate prior timestamp
folders on durable workspace initialization, retaining every file, distinct query variants and capture
identities. Colliding names receive the originating capture suffix; no document is discarded. Reload
must show one collection, and Reveal must use the corresponding stable workspace location.

Filtered discovery must distinguish total inventory, matching pages and displayed pages. Show more
first expands matching pages in batches of 100. When every match is displayed and other known pages
are hidden, the same icon explicitly offers to clear the filter and browse those pages. Zero matches
must remain recoverable. Selection, saved documents and discovery completeness stay unchanged.

Webpage link previews must fill their allocated media frame and retain the source link label. A loaded
thumbnail must remain visible even when a layout snapshot is unavailable. Keyboard and screen-reader
users must receive the same meaningful preview name. Keep existing explicit open and preview actions.

D3 media panels must stay centered on their graph nodes during pan, zoom and individual or cluster
dragging. Apply graph and panel geometry before the same paint, retaining readable media sizing and
existing selection, pin and resize controls. A settled canvas must do no continuous projection work.

## TAD

Repair overlapping cached or inherited Keyword panel seeds with a deterministic spatial occupancy pass after initial relaxation and before first paint; apply the same pass once when force layout settles before saving its cache. Use the explicit semantic mode instead of the legacy keyword-property detector. Reuse shared panel half-extents and bbox collision, including the settling pass, with a bounded separation-strength floor while the existing simulation cools; add no group-wide relaxation. Preserve separated cached positions and fixed anchors; stale overlapping automatic seeds must not bypass initialization. Keep cluster paint and border hits below links and nodes, and bound cumulative community fill opacity. Document panels and edge attachment bounds use shared world dimensions, center projection, frame metrics, painted-scale reader and area comparator. Resolve graph anchors before stale block coordinates and flush projection with graph updates. Preserve explicit layer and ancestor ordering while ranking peers by measured bounds. One shared smoothstep geometry owner supplies SVG and Canvas corner points. Derive both axis signs from endpoints and cap radius by adjacent segment lengths after applying softness. D3 painted and hit paths consume the same builder. Collinear routes collapse to a straight segment.
D3 2D enables the existing world-transform projection in the shared media layout loop. Resolve fallback dimensions at unit zoom; preserve authored dimensions, then apply the camera scale once to the whole frame. Reuse the 2D media path’s continuous `applyPanelBox` transform, unbounded `computePanelRect`, shared frame metrics and pointer/wheel owners. The 3D adapter supplies camera projection and camera-space depth only. Scale the whole logical panel instead of quantizing its width or refitting it to the viewport; convert resize deltas through the painted scale. Missing world positions may use an initial screen slot; culled world positions may not. Determine panel bounds once with shared sizing, intersect them with the viewport before budget selection, and retain partially visible panels without clamping. Declared image nodes retain media identity when their URL is missing or rejected; the shared empty panel owns that state.

Reuse workspace import source-URL identity for navigation, preferring the matching active capture and rejecting ambiguous alternatives. The shared media pool carries covered source node IDs through deduplication. Shared panel pointer routing owns body/header drag; 2D and 3D recovery run after the pointer owner commits and never poll or cancel a live drag on a timer. The shared SVG semantic binder owns background and root naming.

The existing semantic figure and native canvas binding also own ordinary 3D modes. Keep RichMediaPanel absolutely positioned with its shared flex frame. Reuse shared eager loading and painted-area ordering; retain explicit authored layers and stable identity ties without selection/depth/screen-position boosts.

Reuse existing SVG hit surfaces and dispatch keyboard activation through their established click handlers. Expose the scene as a named group; bind semantics at creation and presentation rebuilds. Reuse one size comparator for node ordering and the shared media layout loop, with stable identity ties and no polling or additional network work.

Shared text utilities own normalization and segmentation. Use native `Intl.Segmenter` where available,
with an original Unicode fallback that reports its policy. Browser/runtime language data may differ;
explicit language tags affect inspection segmentation. The keyword graph uses the runtime default.
GraphRAG and Keyword Mode share one mention extractor and one small original English grammar filter.
The filter is a heuristic, not a multilingual stopword corpus; negation and modal words are retained.

One evidence collector counts complete-token occurrences, sentence spread, six-span distribution and
up to three original-offset contexts. Ranking and weighted relationship strength remain distinct from
counts. Graph metadata records the analysis policy, bounds and source. Cache version 8 invalidates
older weighted-count results. Document insights scans raw source, including markup; graph evidence
describes the existing graph-analysis text. These scopes are stated in the UI.

Keyword inspection loads lazily when Document insights opens. User phrases and locale are transient
inspection controls, not document edits or a second settings store. Graph selection uses existing IDs;
navigation uses the existing source-revision guard. Optional Dashboard cards consume evidence only.
Explorer reveals the active opaque workspace path through existing search, expansion and scroll controls,
without loading the document again. Crawl startup reuses the shared D3 document preset; sitemap
frontmatter now declares the same renderer as the generated page and crawl canvas. Browser workspace
records use IndexedDB under the current origin. Changing the preview host or port selects another
local workspace; it does not migrate existing imports. Keep validation on the same preview origin,
and use the native import flow when website documents are needed in a different workspace.

The shared HTML preview budget is 500,000 UTF-8 bytes, checked before hashing, rewriting or sanitizing
and again after iframe markup injection. Preview fetches reject excessive Content-Length and streamed
bytes, cancel the body, and use separate cache keys from full-source reads. Limit failures do not trigger
a live-site fallback. Captures default to stripping source scripts; an explicit policy still takes precedence.
Equivalent import identifiers keep the same load; a source change aborts the previous request.

Reveal captures the selected path, source and text before lazy loading. The local host compares a
derived mirror with the requested revision. Named copies share the stable `docs_/revealed/current`
root and retain their workspace paths, so independently revealed siblings appear in the same disk
folder. The existing content-addressed snapshots remain revision backups, not Finder destinations.
A bounded sidecar records each managed file's last content digest. Unchanged copies can update to the
requested editor revision; edited, moved or replaced copies fail visibly and remain intact.
Browser-only folders use this same copy owner: load unopened text, validate every requested file
before writing, then stage complete files and atomically replace each leaf. Preserve unrequested
local additions. Folder promotion is serialized and fail-loud; it is not a filesystem-wide transaction.
Explicit local folders still reveal their existing directory. No file contents may be silently omitted.
Folder copies reject duplicate, case/Unicode-colliding and file-as-parent paths. Bound each copy to
1,000 entries including inferred folders and 500,000 UTF-8 bytes including the request envelope;
larger copies fail visibly and require a smaller folder or the existing export flow.
The crawler shares the default output-root resolver while retaining explicit store overrides. GET
requests can resolve an existing generation in the earlier sandbox; new writes use the current root.
Explicit reuse of a generation in the earlier root is rejected, and incomplete current generations
never borrow old artifacts. No existing capture is moved or rewritten.
The shared JSON request limit is 500,000 UTF-8 bytes; larger documents use the existing export flow.

The shared strip-policy sandbox wraps captured iframe/object/embed content in inert templates.
A native disclosure activates one embedded panel at a time; closing or replacing it removes its
browsing context. Audio and video use controls with preload disabled and autoplay removed. Explicit
script-enabled pages retain authored behavior. Preview state is bound to semantic request identity,
so an old document is cleared during debounce as well as network work; stale completions stay ignored.

Discovery reads explicit HTTP(S) navigation attributes on rendered anchors, areas and scripted
cards, including absolute URL tooltips. It does not infer paths from labels or serialize embedded
application state. The existing sitemap collector also reads robots declarations, scope/root sitemap
locations, recursive indexes and XML sitemap references inside urlsets. XML entities, namespaces, CDATA
and gzip are supported through native code. Cross-origin references/redirects and credentialed URLs are
rejected; metadata is deduplicated and cycles terminate. No sitemap document becomes a page entry.
The existing origin/path and network guards remain authoritative. Bound discovery
to 20,000 candidate elements and 2,000 unique URLs. Sitemap expansion adds at most 24 metadata
requests, four seconds per request, 12 seconds total, four MiB per response after decompression and
eight MiB total (robots: 256 KiB). Cancellation closes browser work and aborts metadata requests.
Report partial discovery for bounds or unreadable published metadata; absent optional sitemap
locations are normal. Site coverage remains bounded, not a guarantee of every page.
The tree initially projects 100 matching discovered pages, extends by 100 on request, and searches
the complete inventory. Previously saved copies stay visible even when discovery is filtered. Keep
500 as the selected-crawl limit. Discovery and selection reuse the existing local draft; successful
imports clear selection while retaining discovery, including imports started from Launch. Cancel
settles the pending selection and aborts discovery but preserves its inventory and saved-file rows.
Both flows persist through document switches and restart without automatically crawling. Remove
the transient-session variant; Launch callbacks execute only on explicit live confirmation. Replacing
the source begins a new bounded inventory. Stale completions cannot replace a newer session.

The file tree and inline selection toolbar share AnchorOverlay positioning, portal, dismissal and
panel styling. AnchorOverlay accepts either an element or a pointer point; one viewport clamp and
focus-restoration owner handles both. Existing source, discovery, import, cloud and file action
handlers remain authoritative. Discovered-only entries expose source/discovery actions without
enabling saved-file operations. Missing callbacks, folder-only limitations, protected entries and
read-only state become availability reasons in the existing action builder. Disabled callbacks are
guarded as well as disabled in the DOM; no per-kind menu or alternate overlay is created. Saved/discovered status icons stay in the tree.
The file tree exposes a neutral context-details slot in a second AnchorOverlay anchored below its toolbar. Source Files supplies the
existing discovery summary lazily in this slot after an applicable icon is clicked. Menu-local
disclosure state resets on each context target; it never changes the persistent discovery session.
A shared dismissal group keeps both panels open during interaction within either; Escape and
outside clicks dismiss both. The summary does not steal focus from the invoking toolbar icon. The existing website-action owner handles paging,
refresh and cancel, with applicability derived from the current tree projection rather than names.
Unrelated rows retain grey discovery slots. Paging changes visibility without changing selection.
The tree checks its existing saved-entry projection at filename activation. Unsaved names invoke the
shared file toolbar; saved names keep the document-open callback. Leading website file controls
toggle the existing page selection when an inventory is active. No additional selection state or
overlay owner is introduced.

A discovered row imports through the existing session and workspace runtime. Validate session identity,
membership and idle state before admitting work; lock repeated clicks and retain unrelated selection.
Use the exact selected URL and a matching page limit, with no extra discovery. Single-page activation
resolves only from page-writer provenance, never the crawl summary or sitemap with the same source URL.
Missing requested output fails visibly. Import progress belongs in the existing opt-in summary overlay.

The discovered-row action passes an optional exact workspace destination through the existing import
contract. It is valid only for one explicitly selected URL and is never sent to the crawl server.
The existing writer matches that URL, creates the page at the destination atomically, and skips
collection summary creation. The native capture keeps its independent import identifier and artifact
metadata. Workspace storage owns an opt-in exact-create collision policy; ordinary file creation
retains its existing naming policy. Failed or stale captures never materialize a saved page.

Collection migration uses one conditional database transaction over the observed records. Competing
writes invalidate the plan; bounded retries reread before planning, and failure retains the original
records without a shadow-memory success. Durable previous-path metadata repairs source provenance,
selection restoration and shadow caches on restart. Only generated sitemap local links are remapped;
captured document bodies and immutable server artifacts remain intact. Subsequent imports resolve the
same collection root from existing captured documents and retain colliding capture summaries. Replaying
the same capture reuses its output paths and conditionally updates its summaries; different captures
retain earlier document bytes.

The selection-session owner derives matching, visible and remaining counts once through a shared
pagination helper. The existing toolbar and summary consume that result. The more action clears an
exhausted filter only when its label explicitly says so, resets the display bound to 100, and persists
the cleared query through the existing draft. Pagination performs no network or import work and is
inert during import or when the inventory is exhausted. Saved history remains independently visible.

The shared webpage snapshot surface owns its full-width/full-height box for Markdown and canvas
consumers. Caller classes and styles remain supported. Interactive thumbnails use the source label as
their accessible name; paragraph rendering passes its existing extracted label, falling back to the
hostname. Existing image, layout, fallback and network lifecycle owners remain unchanged.

The existing shared media layout loop owns node anchoring. D3 opts out of independent panel collision
placement, previous-screen-center retention and pixel rounding; it uses the existing matrix box writer.
Coalesce projection requests in one microtask after graph geometry updates, consuming pending RAF
work through the shared flush contract. Retain the existing sizing bounds with one-pixel size steps.

## ADR

Repair the existing scene, physics and layer owners; no screen-space panel redistribution, new renderer, background task or dependency. Reuse the bbox force in both initialization and presentation updates; panel-only collision must remain active when disjoint layout disables general collision. Remove the document overlay’s unused collective-fit branch, hidden drag decoration and retained stale exclusions. Image/video paragraphs stay eligible for the shared media owner; only actual document panels suppress their graph bodies. A panel with its own graph ID must use the same live lookup and drag owner as an aliased panel. Persist graph panel resize through node properties. Remove duplicated smoothstep corner arithmetic from SVG and Canvas paths. Bend magnitude may tune rounding, but bend polarity must not reverse travel direction. Preserve existing layer ownership and semantic edge controls; no new renderer, dependency or background work.

Enable shared world projection for D3 2D rather than scaling chrome inside a screen-fixed authored frame. Resolve fallback size at unit zoom to avoid double scaling; keep screen-layout consumers on their existing sizing contract. Remove the 3D-only viewport clamp, 16 px size steps and fallback for culled world anchors. Keep one logical media frame and project it through the existing shared matrix-placement owner. This preserves subpixel motion and makes resized panels track zoom. Native 3D controls keep camera ownership; no parallel renderer or dependency. Remove the fixed-distance and globe-label backface filters from media layout: neither represents media visibility. Use camera projection and shared panel bounds, keeping count limits. Retire the two distance controls from the settings registry; persisted store fields remain compatibility data only. Missing image sources resolve to an empty image spec without relaxing URL validation or exposing a rejected-source open action. The existing shared empty-media owner renders a visible semantic status and icon, replacing hidden decorative placeholder blocks.

Extend existing navigation, media-pool and pointer owners. Do not map an arbitrary URL to the active file, strip distinguishing query parameters, add a renderer-specific media variant, or let recovery erase an uncommitted release. Panel drags start at the visible panel center, including clamped panels; pinned drags retain world depth. Recovery runs after native event dispatch, beyond capture-phase microtask checkpoints. Keep explicit layer priority and larger-under-smaller peer ordering.

Remove the 3D-only overlap stacking passes and duplicate eager-media loader. Apply the common area comparator within authored layer peers; retain native WebGL gesture ownership and the shared HTML media controls. No parallel renderer, domain rule or new dependency.

Keep semantic SVG buttons and the existing RichMediaPanel rather than adding a second HTML graph renderer. Preserve authored node layer priority and cluster ancestry; use painted area before identity ties. Size-based media ranks update through the existing layout flush, preserving the previous motion repair.

- Finder reveals a stable named copy tree; content hashes identify private revision backups only.
  Preserve old hash directories, share one save owner for files and folders, and reject local-edit
  conflicts before updating managed copies. No automatic migration or deletion of historical exports.

- Separate workspace placement from capture generation identity. Reuse the projected row path and
  existing file writer; do not move historical imports or invent a second tree alias or write owner.
  Use atomic exact creation to preserve another tab's file if the destination is occupied.

- Reuse AnchorOverlay for the discovery toolbar and a separate summary panel beneath it; remove
  the inline controls and reveal the summary only on applicable icon clicks. Keep one session owner, existing compact glyphs, and accessible disabled action slots.

- Native, original implementation: no Stanza, spaCy, NLTK, model, corpus, copied rules or new dependency.
  General concepts of segmentation, phrase ranking and concordance inspire behavior only.
- Remove the embedded NLTK stopword list and duplicate mention/sentence extraction implementations.
  Existing exported names remain aliases only where existing consumers require the contract.
- Preserve literal counts independently of ranking. Heuristic relationships and co-occurrence are
  labeled as such; neither is named-entity recognition, dependency parsing or causal evidence.
- Retain graph-wide Dashboard scope; Mission evidence is optional and never the required source.
- The active source control applies to every workspace file; source names and domains never select
  visibility behavior. Renderer defaults belong to the crawl workflow and generated artifact contract.
- Distinguish absent workspace records from filtered or clipped rows before changing Explorer.
  Inspect the original workspace without modifying it; importing into another workspace creates
  independent documents and preserves the original records. No implicit cross-origin storage bridge.
- Named snapshots implement the user-selected save-and-reveal policy for all browser-only files and folders.
  Existing provenance and canonical repository sources remain authoritative; capture metadata never
  redirects reveal. Copies are local exports and do not become a second editable workspace authority.
- Runtime validation inputs stay outside the repository; regression fixtures are independent examples.
- Extend the existing sitemap/network owners, with no provider API, package, site rule, embedded state
  extraction or automatic page import. Preserve the shared toolbar/summary and selection owners.

The preview limit replaces heuristic multi-megabyte shrinking, which left large attributes untouched.
It applies uniformly to every source. No dependencies, domain exceptions, copied code or model assets
are introduced. The existing raw-artifact retrieval limit is unchanged for capture/export consumers.

- Consolidate action presentation in the existing file tree and overlay owners. Remove the
  bespoke menu positioning/dismissal and inline action strip; add no replacement menu framework.

- Reuse the session import dispatcher for explicit per-page imports. Keep the batch chooser pending
  and preserve its selection; unavailable content is presented as unavailable, not a new workspace file.
  Bind single-page editor/canvas activation to the saved page output and propagate runtime failures.

Use a durable collection migration instead of hiding older capture folders in the tree. The first
collection retains its identity; capture timestamps remain metadata and filename suffixes where
needed. This keeps one physical workspace owner while preserving every prior capture. Do not merge
hosts or collapse query variants based on matching titles.

Reuse the existing more slot with an explicit clear-filter action after matching results are exhausted.
A permanently disabled icon leaves known pages unreachable through that action; silently ignoring the
filter makes search misleading. The chosen label communicates the state transition without adding a
second toolbar. Revisit if readers cannot predict it; rollback the helper and both UI consumers together.

Repair sizing in the shared surface rather than adding a Markdown-only replacement. Its absolutely
positioned children require a nonzero containing box; otherwise a successfully loaded favicon can
appear blank. When no page image or layout is available, place the fallback icon beside its label
so overlay text cannot cover it in narrow frames. Preserve the authored link identity instead of
substituting a generic media-type label.

Use the live graph transform and node center as the placement authority. Separate collision relaxation
and a trailing animation frame can detach a panel from its node. Preserve the shared layout owner and
readability limits; do not add another renderer or a permanent animation loop.

## MVP

Keyword-layout increment: Initial 30-minute budget and 15-minute extension exceeded during live initialization/cooling diagnosis. Scope expanded to eight production modules within the 15 KB source cap, with no dependency or background loop. Nineteen focused checks and TypeScript pass. The spatial pass separates 16/128/512 initial panels deterministically in about 0.4/7.4/40.6 ms locally, preserving fixed and separated peers. It runs after initial relaxation and once at final settlement; existing collision and settling owners reuse the shared panel footprints. After a clean reload and native Keyword activation, all 16 panels settle with zero overlaps versus 61 overlapping pairs in the baseline. Active force animation can still temporarily cross panels (13 pairs in the early live sample); final cached positions remain separated. Cluster paint and border hits precede edges/nodes, and 22 overlapping community fills compose to at most the configured 8% opacity. Require exact-source affected validation before review publication; production and device-wide performance remain unproven. Roll back scene, force and layer changes together. Document-surface increment: initial 30-minute/six-module budget expanded to ten production modules and 18 KB changed-source cap after live evidence exposed image-paragraph ownership conflicts and inverse edge bounds; allow 15 minutes for final validation. Implemented shared projection/resize, live same-ID anchors, current-mode exclusions and peer area ordering. Fifteen focused checks, typecheck and source hygiene pass. Native UI zoom grows panels 25% and returns exactly in Document Structure (58.10→72.63 px), Keyword (81.29→101.61 px) and Frontmatter (51.51→64.38 px). A 40 px resize at 18.53% zoom changes logical width 320→536 and lowers the larger panel’s rank, with camera transform unchanged. The three reported routes retain painted paths and visible endpoint owners. Require exact-source affected validation before review publication; production remains unproven. Roll back projection, ownership and endpoint-bound changes together. Edge-routing increment: initial 25-minute budget, at most four production modules and 12 KB source changes, plus validation. Reproduce reverse-corner backtracking, then cover all quadrants, short/collinear/coincident endpoints, curve hints and SVG/Canvas parity with domain-neutral fixtures. Fifteen focused checks and typecheck pass. Live inspection after reload confirms 75 painted paths match 75 semantic hit paths, with no reversed corners; the reported edge exists and supports selection. Its enclosing selection box includes empty space outside the route. Require affected validation before review publication. Roll back the shared geometry and adapters together.

D3 media zoom-direction increment: initial 20-minute budget extended ten minutes for a typed resize-fixture correction and final validation; at most four production modules and 10 KB source changes. Reproduce the authored frame remaining fixed under zoom, then verify default and authored sizes grow/shrink proportionally, with shared chrome, stable graph centers, offscreen placement, gesture release and no idle writes. Use existing regression owners and native live zoom controls; run the affected gate before review publication. Roll back the hook and shared fallback sizing together. Implemented in three production modules using the existing projection and painted-scale reader; resize deltas remain in logical units. Twenty focused checks pass, including a regression demonstrated failing before the fallback fix. Live native D3 zoom changed an authored panel from 92.75 × 52.19 px at 21% to 115.94 × 65.23 px at 26%, then back exactly, preserving its 439 px logical width and shared chrome. Storyboard also enlarged by 25% and returned exactly. Source hygiene passed; final affected validation must bind the corrected fixture and complete revision before review publication. Production remains unproven.

Navigation/drag repair: at most eight production modules and 18 KB production changes. Initial 25-minute implementation budget exceeded after live reproduction exposed 2D callback churn and native 3D release ordering; final validation/review budget is 15 minutes. Cover URL identity/ambiguity, body/header drag with control exclusions, native release recovery, stable rerenders and deduplicated media coverage. Twenty focused checks and typecheck pass. Live 2D body drag commits 70/-45 px without changing the canvas transform; source selection reveals saved Markdown without a missing-file alert. Live 3D unpinned drag commits 80/50 px; a clamped pinned panel moves its center 100/60 px. Named shared panels retain larger-under-smaller order. Require hygiene and an exact-source native affected receipt before review publication. Roll back owner changes together without altering saved documents.

3D semantic-media increment: three production modules, under 12 KB production changes, initial 20-minute implementation budget plus validation. Check size order during selection/drag/resize, visible flex content, one named canvas owner in each active mode, and live hit targets after reload. Seven focused checks and typecheck pass. Live 3D inspection confirms native canvas naming, visible 72–252 px media heights, larger-under-smaller ranks, individual panel hits and keyboard pin/unpin through the shared controls. The native affected gate is required before review publication. Roll back these owner changes together; preserve documents and panel state.

D3 semantic-layer increment: six production modules, up to 12 KB production changes, no dependencies. Initial implementation budget 20 minutes plus validation. Verify named hit targets, keyboard/modifier routing, no duplicate covered media targets, descending area, resize reranking, and live browser hit tests. Thirteen focused checks passed, including the earlier media-motion checks. Live reload exposed individual node/edge buttons and all ten shared media panels; keyboard activation reached an individual node. Resize reranking and settled no-op writes are verified by behavioral tests. Full device/assistive-technology parity remains unproven.

D3-media-motion increment: up to four production modules, under 8 KB source changes, no dependencies.
Verify fractional pan, zoom, node and cluster movement, no-op frames and cleanup with synthetic inputs.
Measure panel-to-node alignment in the reported live document and after reload. Rollback the shared
layout policy and D3 scheduling together; retain document bytes and media interaction controls.
Ten focused checks pass, including pan/zoom, node/cluster anchor tracking, no-op writes, cancellation
and pointer-up before the last RAF. Live DOM checks found 34–341 px of pre-fix anchor drift across ten
panels; corrected panels remain within 0.001 px of their nodes after canvas pan, zoom controls and
direct header dragging. Pin controls remain available. Browser reload and native affected validation
are required before review delivery; this is bounded local evidence, not a frame-rate or device-parity claim.

Webpage-preview increment: two production modules, under 5 KB added source, no dependencies. Verify
meaningful accessible names for standalone links and embedded previews, and use the live browser to
check the reported thumbnail fills its frame at narrow width and after reload. Existing media actions
must remain available. Rollback both shared-surface sizing and paragraph-label changes together.
The focused Markdown snapshot group and shared-media contract check pass, covering source labels,
Enter/Space open actions and existing embedded/video behavior. Live UI confirmed the reported loaded
favicon had a zero-height owner before the fix; afterward the shared surface filled its narrow frame,
with no icon/label overlap. Reload preserved both corrected previews and all 46 saved files. No live
iframe was introduced. The native affected gate must pass before review publication.

Filtered-pagination increment: three production modules, under 5 KB added source, no dependencies.
Verify matching and unfiltered pagination, zero results, exhausted inventory, import locking, retained
selection and absence of network work. Live verification must reproduce the reported filtered state,
clear it through the shared icon, load the next batch and preserve saved-file count after reload.
Twenty-nine focused discovery/selection checks pass, including zero-match recovery, import locking,
selection preservation and zero pagination fetches. Live shared-toolbar activation recovered the
reported 1,100-page inventory from three filtered matches to 100 and then 200 shown. Reload retained
all 45 saved files, the cleared filter and the single collection folder; the summary remained hidden
until icon activation. The repository affected gate must pass before review publication.

Collection consolidation increment: nine production modules, under 20 KB added source, no dependencies.
Acceptance requires concurrent migration and reload coverage, intact file bytes, collision-safe names,
working source links and selection restoration, plus live one-folder/import/Reveal verification.
Rollback the migration consumer and collection-aware writer together; retain the migrated records,
previous-path provenance, legacy storage backup and immutable capture artifacts.
Nineteen collection/import checks, five icon-menu checks and five IndexedDB checks pass. Live UI
migration retained all 44 saved files in one timestamp folder. One further explicit import added
exactly one page, and reload retained 45 files in the same collection. Both older imported pages
opened their own content. The shared summary appeared on icon activation; filename opening retained
selection while the leading icon changed it. Folder Reveal produced one stable collection subtree;
existing stable copies retained their bytes, inode and modification time. Native affected validation
gates review publication; protected integration and production remain separate effects.

In-place import and reveal follow-up: eleven production modules, less than 20 KB added source, no dependencies.
Verify exact placement, query variants, capture provenance, absence of new workspace summaries,
failed capture behavior, and concurrent destination collision in memory and persisted storage.
Rollback reverts the optional destination and exact-create contracts together; saved files and raw
captures remain readable using their existing metadata. Twenty-eight focused import/session regressions and the persisted cross-tab exact-create check pass.
The retained preview imported one runtime-supplied page at its existing discovered path: Source Files
increased from 43 to 44, the saved page opened with its expected heading, and the original three
import folders remained without another timestamp, canvas or sitemap. Earlier saved copies remain
untouched. Ten reveal regressions pass, including sibling placement, file/folder destination reuse, unchanged
copy reuse, revision backups, local edits, moved files, symlinks and folder-wide conflict preflight.
The retained preview revealed both reported sibling documents into the same `revealed/current`
folder. Their bytes match the previous separate copies, and both previous hash directories remain.
The repository affected gate must pass before review publication.

Discovery follow-up: five production modules, under 20 KB added source, plus regression tests and this
contract. Tests cover rendered/sitemap merging, nested and cyclic indexes, nonstandard urlset children,
XML escaping, gzip expansion, origin/path/credential boundaries, URL/request limits, cancellation and
zero artifact writes. Runtime-only external validation checks increased inventory without selecting or
importing pages. Rollback reverts discovery/metadata changes together; preserve saved artifacts and drafts.

Bounds: 60,000 characters, 12,000 tokens, 800 evidence labels, 12 tokens per phrase, three contexts
per phrase; inspection shows up to 24 phrases. Partial final words are discarded, and truncation is
visible. Context display uses bounded source lines. Existing graph node/edge budgets remain in force.
Initial implementation budget: 16 production modules, less than 30 KB added source, no packages or assets.
Visibility/default follow-up: at most six production modules and 12 KB added source, plus tests and docs.
No service is contacted during analysis; loading the application and optional source import are
separate operations. Cold offline application installation and full linguistic-model parity are out of scope.

Validation owners: `nativeDocumentAnalysis.test.ts` checks Unicode offsets, fallback behavior, bounds,
literal counts, explicit network rejection and optional Dashboard evidence; the panel test checks phrase
controls, graph selection, source navigation and stale rejection. The collaboration contract selects
these tests with existing keyword, signal, Dashboard and runtime-input guards. Type checking and
affected checks gate delivery. An externally supplied rendered page is used only as a temporary local
input; an independent occurrence counter and blocked fetch verify the analysis without a golden corpus.
`activeWorkspaceSourceVisibility.test.tsx` exercises repeated reveal through filters and collapsed folders,
duplicate basenames, Unicode paths and editor preservation. `websiteImportRendererDefaults.test.ts`
checks all generated artifact defaults and crawl startup after conflicting document modes.
Runtime recovery validation used the native headless import with two explicitly selected pages. Both
page documents plus the crawl canvas and sitemap appeared in Source Files and survived reopening
the same preview. D3 remained selected, and the library page opened through the tree. The original workspace still contained its
older imports. This establishes local workspace persistence, not cloud sync or Production delivery.
Recovery follow-up: zero production modules or dependency changes; evidence and requirements only.
Crash follow-up: four production modules, fewer than 15 KB added source, plus tests/docs. Regression
checks cover header/stream cancellation, UTF-8 limits, cache isolation, sync/async builders, normal
HTML, explicit script policy, metadata stability and late completion after switching sources.
The external validation capture was 16,903,271 bytes; both preview builders returned a 2,759-byte
notice, and a before/after SHA-256 check confirmed that the stored capture was unchanged.
The same browser origin reopened with 37 Source Files and the affected page displayed the limit
notice while its Markdown remained available. This is local preview evidence only.

Reveal and output-location follow-up budget: eight production modules, fewer than 14 KB added source, plus tests/docs.
Regression owners cover exact paths, current and inactive document text, repeated clicks, Unicode,
empty content, concurrent copies, changed revisions, edited copies, symlinks, size bounds, host failures,
origin restrictions and native file/folder commands. `websiteImportStorageDefaults.test.ts` verifies
new artifact placement, explicit overrides, legacy reads and generation ownership across the root change. No packages or source-specific rules are added.
Live validation on the retained preview selected the imported article by its workspace filename in
Finder under the configured `docs_/revealed` folder. The original captured Markdown retained its SHA-256 digest.
The browser driver has a pointer offset in this session; native Finder selection, rather than the
automation locator alone, supplies the target evidence.

Rollback: revert this source change, retaining user documents and existing generic Dashboard behavior.
Invalidate keyword caches again if their semantics change; never reinterpret old cached frequencies.
For the visibility/default follow-up, revert the Explorer control, crawl startup and sitemap additions;
existing imported documents retain their stored frontmatter. Keep the task lane while its local preview
or review delivery needs it. Native re-import creates a separate timestamped folder; recovery rollback
can remove that new folder through workspace controls while retaining the original workspace.

Crash rollback: revert the preview budget and hook changes without deleting captures or workspace
records. Reopening unbounded captures can reproduce the renderer failure, so prefer Markdown first.

Reveal rollback: revert the client and local host protocol together. Preserve saved copies and browser
workspace records; removing a copy is a separate explicit file operation. Before reverting the crawler
default, retain the configured docs_ store override so newly created captures remain addressable.

Preview lifecycle follow-up: three production modules, fewer than 8 KB added source, no dependency.
Eight focused regressions pass. Full affected checks, including TypeScript and browser smoke, pass.
Generic regression tests cover inert initial frames, explicit activation, replacement/close disposal,
paused media, explicit allow-policy behavior and release of loaded previews during pending requests.
The browser log recorded an unresponsive page before the reported crash. After manual reload, opening
the captured library stalled an automation read; its Markdown contained 606 image references. The
article preview also mounted a captured autoplay iframe despite strip policy. These observations
identify resource-loading gaps; they do not prove that one gap explains every renderer failure.
The live article uses the new embed gate and 37 Source Files remain. Repeated library opening still
timed out through browser automation before recovering. The user confirmed both imported documents
open without crashing after the patch, but switching remains slow. This is a bounded recovery observation;
rendering-performance improvement and elimination of all possible renderer failures are not established.
Rollback the template gating and identity binding together if needed, retaining captures, named copies,
workspace records, the earlier HTML byte budget and configured docs_ output defaults.

Website discovery increment: six production modules and fewer than 15 KB source changes, no new
dependency or website-specific rule. Seventeen focused crawler/tree/session regressions pass, including
explicit card URLs, pagination beyond 500 discovered pages, filtered access to later entries, the
500-page import limit, saved-history retention, folder reveal/collapse, and retained discovery after
confirmation. Live discovery at the reviewed origin found 477 pages instead of three; expanding the
list showed 200 entries while retaining four saved website-file icons. No import job or saved-file mutation occurred during
this discovery check. A finite discovery list is not proof of complete website coverage.
Rollback the discovery/UI increment together; retain saved files, browser records and crawler artifacts.

Folder reveal increment: four production modules, fewer than 10 KB source changes, no dependency.
Twelve focused regressions pass, covering nested and empty folders, current unsaved text, exclusion
of unrelated paths, repeat identity, atomic concurrent copies, traversal, collisions, byte/entry bounds,
symlink rejection and preservation of edited or moved copies. The menu, local endpoint and disk-copy
owners share the same validation path. Live folder Reveal created a named subtree containing all
four saved imported documents (233,504 bytes) under the configured local output; unopened files were
read from workspace storage. Discovered pages were not copied. The desktop window selection was
not independently inspected in this check. Rollback client and host folder support together; retain all
existing copies, workspace documents and crawler artifacts.

Icon-menu increment: six production modules, fewer than 15 KB source changes, no dependencies.
Fourteen focused regressions pass for icon labels, preserved sizes, exact reveal/copy targets,
read-only actions, pointer/keyboard access, viewport placement, focus restoration and import selection.
The existing responsive-menu and inline-edit toolbar contracts cover shared-owner behavior.
The retained preview shows one portaled icon toolbar and no inline file action strip; Escape restores
the invoking row without opening a document. Native affected checks gate review publication.
Rollback these presentation changes together, preserving documents, saved copies and discovery drafts.

Action-availability increment: four production modules, fewer than 15 KB source changes.
Regression coverage compares complete file/folder action order, invokes disabled controls and
callbacks to verify they are inert, retains disabled discovery slots and checks exact folder reveal.
Local review uses the retained browser origin; affected validation gates review publication.
Rollback the availability rules with the stable-slot rendering; retain all document and import state.

Discovery-retention increment: five production modules, fewer than 15 KB source changes, no dependencies.
Nineteen focused regressions pass, including Launch completion, cancellation during refresh, late
response rejection, document switches, offline restart, distinct saved/discovered icons, removal of
the duplicate URL form and active-path strip, and repeated reveal through filtered/collapsed folders.
Native affected validation gates review publication. Rollback these session and presentation changes
together; preserve saved files, discovery drafts, named copies and crawler artifacts.

Discovery-overlay increment: five production modules, fewer than 15 KB source changes, no dependencies.
Regression coverage verifies separate shared overlays with an explicitly opened summary beneath the icons, matching-page
pagination, unchanged selection, related-folder refresh, disabled unrelated-file actions, and
retained cancellation/restart behavior. Live preview preserves 477 pages, 200 shown and 100 selected
while moving the controls. Native affected validation gates publication. Rollback this presentation
increment together; retain the discovery session, browser documents and saved crawl artifacts.

File-activation increment: three production modules, no dependency. Focused regression coverage checks
saved filename opening, unchanged crawl selection, discovered filename actions and icon-only selection
for saved and unsaved website pages. Native affected validation gates publication. Rollback this event-routing change while
retaining discovery drafts and saved files.

Discovered-page import increment: five production modules, under 10 KB added source, no dependency.
Thirty-one focused regressions pass, covering direct import, retained selection, duplicate-click
exclusion, failures/retry, URL-specific content activation and unsaved filename dimming. Live preview
imported the reported discovered page: Source Files increased from 37 to 40, including its page,
canvas and sitemap documents; the saved page and its heading opened in the viewer and outline.
The test used runtime input only, with no domain rule or repository fixture for the reported website.
The affected gate exposed a pre-existing fixed-tick assertion against a lazy-loaded Rich Media Viewer;
its test now waits for the required heading with a five-second ceiling and retains the original
content/editing assertions. Native affected validation gates review publication. Rollback these
owner changes together; retain saved documents and discovery drafts. No production or complete-site
claim is implied.

## GTM

Keyword initialization serves readers opening dense documents locally; measure actual initialization and overlap reduction without claiming device-wide performance. Reuse existing controls and free local computation. Document-surface changes reuse existing mode and media controls, add no network work or dependencies, and roll back through the projection and ordering owners together. Edge-routing repair ships through the existing canvas controls. Communicate verified geometry and live selection results; do not claim device parity or production delivery from a local browser check.
The local interaction repair serves readers arranging imported media alongside a graph. Value is predictable manipulation with existing controls, without service costs or additional background work. Previous distant-media visibility and shared empty-panel interaction were verified locally; D3 2D now grows and shrinks whole frames through the shared owner, with measured native zoom proof and no new service or background loop. Device-wide frame-rate parity and production delivery remain unproven; the next bounded action is final affected validation and review delivery by the implementation owner.

Deliver a local, free/FOSS interaction repair to existing document and graph readers. No new service, plan, addon or background crawl. Review evidence must distinguish local checks, live gestures and provider CI; no production-performance or deployment claim follows from local success.

Visible and individually targetable 3D media lets readers inspect imported content without leaving the graph. Measure successful thumbnail viewing and shared-control activation locally; no account, paid service or demonstrated revenue claim.

Selection tooling and keyboard users can identify individual canvas items while small overlapping media remain reachable. Validate on the current document before review delivery; no new service cost or demonstrated revenue claim.

Initial user: a reader checking repeated themes and evidence in a local document. The near-built path
reuses existing preview, graph and Dashboard controls. First value is a counted phrase with a source
jump, requiring no account, paid plan or model download. Measure successful source jumps and time
to verify a term before expanding linguistic features. A source-path tooltip and consistent crawl
renderer reduce the time spent finding the document behind a graph. Measure successful reopening of
imported documents in the reviewed workspace, separately from successful text analysis. Willingness to pay and revenue are unvalidated.

A bounded HTML notice keeps the workspace responsive while readers continue in Markdown; measure successful reopening without losing captured sources.

Named local copies let readers locate and use the document shown in Source Files without navigating capture-cache internals. Measure successful first reveal; no paid service or account is required.

Saved embeds load on request, reducing work when readers switch documents. Measure successful document switches and responsive preview controls.

Browse discovered pages and saved crawl files in one tree. Status icons and retained discovery reduce repeated import setup; completion and time savings remain measured per source.

Folder copies extend first reveal to grouped browser documents, using the same configured local output and no account or service.

A single icon action surface frees filename width and makes file operations consistent. Measure
successful action completion through pointer and keyboard access; no account or paid tier is required.

A stable action order lets readers recognize the same controls across files and folders; explicit
disabled states explain capability limits without moving icons.

Discovery controls and status share the existing context menu, freeing tree space while preserving
selected pages. Measure successful discovery actions without lost selection or repeated setup.

A reader can import a discovered page where they find it and immediately verify its saved content.
Measure successful page opening rather than menu availability; no paid service or account is added.

Saving at the discovered row removes the extra navigation after a page import. Measure successful
in-place opening and duplicate-folder count; capture history remains independently addressable.

One collection per website reduces repeat navigation. Measure duplicate timestamp folders after
reload and successful opening of migrated pages; no account, service charge or revenue claim is added.

Explicit filter recovery reduces repeated refresh attempts while readers browse already discovered
pages. Measure successful access to the next batch without a new fetch; pricing and revenue remain
unvalidated, and no account or paid service is introduced.

Readable webpage thumbnails and source labels reduce failed navigation from imported documents.
Measure visible media and successful existing open actions; no paid service or new fetch is introduced.

Anchored media helps readers retain graph context while navigating imported documents. Measure
panel-to-node alignment and completed gestures; no service, account or paid dependency is added.
