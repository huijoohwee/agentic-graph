---
title: "GeoStack Production Runtime Readiness — Places and Logistics Context (Blocked)"
graphId: "md:geostack-production-runtime-readiness-local-demo"
doc_type: "Production Runtime Readiness Audit"
date: "2026-10-29"
lang: "en-US"
kgCanvasSurfaceMode: "geospatial"
kgCanvas2dRenderer: "storyboard"
kgDocumentSemanticMode: "document"
kgFrontmatterModeEnabled: true
kgMultiDimTableModeEnabled: true
kgDocumentStructureBaselineLock: false
kgSharedRendererContract: {"version": "shared-renderer-contract/v1", "semanticIdentity": "buildScopedGraphSemanticKey", "cardPreview": "CardMediaPreview + CardMarkdownPreview", "widgetCard": "canvas:widgetCard", "richMediaPanel": "RichMediaPanel", "storyboardDisplay": "2D Renderer: Storyboard Card (default) and Widget variants", "storyboardSurfaces": ["Cards", "Widgets", "Rich Media Panels"], "edgeModel": "active graph edges from the selected source graph", "timelineSurface": "TimelineTransportControls + shared bottom-panel surface", "rendererPolicy": "frontmatter and source payloads own data; renderers project view state only"}
source_provenance: {"repository": "huijoohwee/joohwee", "revision": "59e920337b5591943f10461d45af6b76ea24e1c5", "path": "huijoohwee-docs/agentic-graph-maps-places.md", "sha256": "9e867949c5b0579c9b7a66499f1487e5b6c45c6b7e71a31ba48fcd6828839f91", "restoration": "Recovered historical map fixture; not current provider evidence."}
readiness_provenance: {"repository": "github.com/huijoohwee/joohwee","revision": "4d9e20f669817603034f65d585fb4609680ff647","path": "undocumented-draft/prd-tad-adr-mvp-gtm-geostack.md","sha256": "e5beb85c4de4fca4b168030cf134937db29f74b492827796db30fdcae9c7644d","state": "untracked draft in joohwee-geostack-prd-scratch; this digest is current, while the immutable sequence-3 START snapshot remains earlier and unchanged"}
start_provenance: {"workflow": "workflow-5c9aed04dbb28e5a6ab268d422827b07", "sequence": 3, "manifest_digest": "b727b74e957b0a4906add3fb7b91372b5a46129c72adc533b432db765c1f33f6", "planning_sha256": "384d78022c9f9487a78e9c581fad76d48f0eef9ed26a1e326b2ff9b5b7be6f8f", "protected_base": "4d9e20f669817603034f65d585fb4609680ff647", "lane": "agent/device-0232231d4a19/geostack", "authority": false, "status": "created"}
runtime_readiness: {"status": "blocked", "local_rung": "undocumented", "delivered_rung": "undocumented", "production_effect_attempted": false, "evidence_scope": "synthetic local browser and document/map preview"}
logistics_context:
  companion_seed: "agentic-graph-logistics-supply-chain-overview.md"
  runtime_entry: "canvas/src/features/supply-chain/SupplyChainOverview.tsx"
  scenario_source: "canvas/src/features/supply-chain/supplyChainScenario.ts"
  view_policy: "separate source-selected view; no merge into cafe POI GeoJSON"
  path_semantics: "synthetic schematic legs; no road routing, distance, ETA, or site reachability"
---

# GeoStack Production Runtime Readiness — Places and Logistics Context

> **Status: BLOCKED.** This seed demonstrates a narrow synthetic, local-data flow. It proves no production readiness, deployment, provider rights, zero cost, customer demand, or release authority.

## Audit snapshot

| Field | Evidence |
|---|---|
| PRD | Local untracked draft at `undocumented-draft/prd-tad-adr-mvp-gtm-geostack.md`; SHA-256 is in `readiness_provenance`. |
| Graph source | Base `7723d9ebe3a6d1b75a7dfb2addd2f0fe0738fdf2`; branch `agent/device-0232231d4a19/geostack-poi-directory-mvp`. |
| Historical browser check (superseded placement) | On 2026-10-28, the live Vite UI at `127.0.0.1:4176` used an isolated local store with this canonical seed selected. The then-current Main Toolbar → Settings → Maps placement loaded the embedded 4,397-byte fixture. With exact-point approval off, the panel showed 0 points, 1 region, and 6 withheld; after local exact-point approval and reselecting the file, it showed 6 points, 1 region, and 0 withheld. Search returned the Central result, selection highlighted `synthetic:demo-central` in the SVG, and all five category filters returned results (2 `f&b`, 1 each for the other categories). This old placement is superseded by the FloatingPanel Geo placement below. No production readback. |
| Latest browser verification | On 2026-10-28, the live Vite UI at `127.0.0.1:5173` used the canonical `/docs/workspace-seeds/agentic-graph-maps-places.md` source. FloatingPanel → Geo → Nearby Places → Local POI Directory showed six synthetic place records and metadata for 6 places / 1 coarse region immediately, without selecting a file or creating operator attestations. Searching `Central` returned `Synthetic Demo Place Central`; the `f&b` filter returned two records. Selecting Central from the map, then South from the directory, and East from the map kept the directory result, shared-map feature, and existing Rich Media widget aligned; the page retained exactly one MapLibre canvas. Map affordances are native buttons in one named `section[role=group]`; points occluded by the source editor are excluded from hit testing. Main Toolbar, FloatingPanel header, Rich Media widget header, and Timeline header each measured 38 px. The 360 × 203 px Rich Media default keeps a 16:9 ratio. On 2026-10-29, FloatingPanel’s fixed 360 px default width measured 360 px at both 1113 × 952 and 1280 × 720 viewports. The directory contains no separate map or attribution badge; the Maps Hub retains its settings with no duplicate directory. The default embedded preview creates no provenance manifest. Local browser evidence only; no production readback. |
| Data | One embedded synthetic GeoJSON FeatureCollection is the sole fixture for the active places map and the file-import walkthrough below: six demo points (two `f&b`, one each of the other four supported categories) and one coarse region. Historical cafe coordinates remain non-geospatial text in the reference. The separate logistics seed owns its deterministic facility, consignment, event, and leg records. |
| Logistics | Existing `SupplyChainOverview` shows 12 synthetic facilities, mode-filtered path connectors, three sample consignments, and the shared BottomPanel Timeline. The connectors are schematic links, not navigable routes or cafe-specific access evidence. |
| Latest logistics UI verification | Canonical `/docs/workspace-seeds/agentic-graph-logistics-supply-chain-overview.md` selected in the live local Graph preview. The existing map showed the synthetic facility network; its existing BottomPanel Timeline showed the Network events lane. Seeking `SC-2051 · Port review hold` selected that journey and moved the shared playhead to 04:22. Switching back to this places source removed the logistics view. VCC-12 passes for local composition and source separation only; no route geometry, ETA, optimization, cafe-candidate join, or production behavior is proven. |
| Readiness | Local and delivered rungs are both `undocumented`. |
| Effects | None attempted: no merge, deploy, provider request, rollback, or production readback. |

## Local synthetic demo

The map demo uses this single embedded FeatureCollection with six synthetic exact points (two `f&b`, and one each for `shop`, `store`, `plantation`, and `property`) and one coarse synthetic region. This makes every supported category selectable in the existing filter. One point also carries an intentionally unknown `internalNote` field so the allowlist flow can show that it is dropped. The selected document's explicit GeoJSON is the active map source: it replaces retained geographic graph nodes, edges, and area overlays from earlier selections while preserving unrelated graph content. The map does not read archived cafe scores. Labels are fictitious and do not identify businesses or recommend a site.

The live browser workspace also contains older `/notes` copies of these documents. They are imported browser-store artifacts, not canonical inputs to this demo; the live verification selected the Graph-owned `/docs/workspace-seeds/` seed. Do not join historical cafe scores or markers into the active GeoJSON layer.

To inspect path and distribution context, select [the existing supply-chain overview seed](agentic-graph-logistics-supply-chain-overview.md) as a separate source. Its current `SupplyChainOverview` renders synthetic road, rail, air, sea, last-mile, and reverse-flow legs with facility/resource filters and the shared Timeline. Return to this places seed for the existing Nearby Places → Local POI Directory. Keep the two source documents independent: no route line, facility, consignment, ETA, or distribution score is injected into cafe GeoJSON or the directory panel.

```geojson
{
  "type": "FeatureCollection",
  "attribution": "Synthetic demonstration data; no real businesses or site recommendation.",
  "features": [
    {
      "type": "Feature",
      "id": "synthetic:demo-north",
      "properties": {
        "name": "Synthetic Demo Place North",
        "category": "f&b",
        "region": "Synthetic Demo Area",
        "source": "geostack-synthetic-demo",
        "source_ref": "demo-north",
        "updated": "2026-10-28",
        "license_ref": "generated-demo-data",
        "precision": "exact",
        "kgCategory": "poi",
        "kgLabelVisible": true,
        "kgColor": "#ea580c"
      },
      "geometry": { "type": "Point", "coordinates": [103.847, 1.296] }
    },
    {
      "type": "Feature",
      "id": "synthetic:demo-central",
      "properties": {
        "name": "Synthetic Demo Place Central",
        "category": "shop",
        "region": "Synthetic Demo Area",
        "source": "geostack-synthetic-demo",
        "source_ref": "demo-central",
        "updated": "2026-10-28",
        "license_ref": "generated-demo-data",
        "precision": "exact",
        "kgCategory": "poi",
        "kgLabelVisible": true,
        "kgColor": "#ea580c",
        "internalNote": "Drop this unknown demo-only field."
      },
      "geometry": { "type": "Point", "coordinates": [103.852, 1.286] }
    },
    {
      "type": "Feature",
      "id": "synthetic:demo-south",
      "properties": {
        "name": "Synthetic Demo Place South",
        "category": "f&b",
        "region": "Synthetic Demo Area",
        "source": "geostack-synthetic-demo",
        "source_ref": "demo-south",
        "updated": "2026-10-28",
        "license_ref": "generated-demo-data",
        "precision": "exact",
        "kgCategory": "poi",
        "kgLabelVisible": true,
        "kgColor": "#ea580c"
      },
      "geometry": { "type": "Point", "coordinates": [103.843, 1.277] }
    },
    {
      "type": "Feature",
      "id": "synthetic:demo-east",
      "properties": {
        "name": "Synthetic Demo Place East",
        "category": "store",
        "region": "Synthetic Demo Area",
        "source": "geostack-synthetic-demo",
        "source_ref": "demo-east",
        "updated": "2026-10-28",
        "license_ref": "generated-demo-data",
        "precision": "exact",
        "kgCategory": "poi",
        "kgLabelVisible": true,
        "kgColor": "#ea580c"
      },
      "geometry": { "type": "Point", "coordinates": [103.86, 1.3] }
    },
    {
      "type": "Feature",
      "id": "synthetic:demo-west",
      "properties": {
        "name": "Synthetic Demo Place West",
        "category": "plantation",
        "region": "Synthetic Demo Area",
        "source": "geostack-synthetic-demo",
        "source_ref": "demo-west",
        "updated": "2026-10-28",
        "license_ref": "generated-demo-data",
        "precision": "exact",
        "kgCategory": "poi",
        "kgLabelVisible": true,
        "kgColor": "#ea580c"
      },
      "geometry": { "type": "Point", "coordinates": [103.835, 1.285] }
    },
    {
      "type": "Feature",
      "id": "synthetic:demo-harbor",
      "properties": {
        "name": "Synthetic Demo Place Harbor",
        "category": "property",
        "region": "Synthetic Demo Area",
        "source": "geostack-synthetic-demo",
        "source_ref": "demo-harbor",
        "updated": "2026-10-28",
        "license_ref": "generated-demo-data",
        "precision": "exact",
        "kgCategory": "poi",
        "kgLabelVisible": true,
        "kgColor": "#ea580c"
      },
      "geometry": { "type": "Point", "coordinates": [103.855, 1.27] }
    },
    {
      "type": "Feature",
      "id": "synthetic:demo-region",
      "properties": {
        "name": "Synthetic Demo Area",
        "category": "Region",
        "role": "region",
        "region": "Synthetic Demo Area",
        "source": "geostack-synthetic-demo",
        "source_ref": "demo-region",
        "updated": "2026-10-28",
        "license_ref": "generated-demo-data",
        "precision": "coarse",
        "kgFillColor": "#2563eb",
        "kgFillOpacity": 0.2,
        "kgStrokeColor": "#2563eb",
        "kgStrokeWidth": 2,
        "kgStrokeOpacity": 0.8
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[103.83, 1.26], [103.87, 1.26], [103.87, 1.31], [103.83, 1.31], [103.83, 1.26]]]
      }
    }
  ]
}
```

### Local feature walkthrough

This walkthrough is synthetic and local. For file import, copy the GeoJSON block above to a local UTF-8 file named `geostack-synthetic-demo.geojson`; the embedded Markdown block itself is the single fixture source. The sample metadata documents synthetic data only and must not be copied onto a real dataset.

1. **Map and coarse area — PRD-MAP-01.** Select this canonical `/docs/workspace-seeds/agentic-graph-maps-places.md` source. The selected document's explicit GeoJSON is the active overlay source and replaces geographic graph nodes, edges, and area overlays from the prior selection while preserving unrelated graph content. This fixture contains six named synthetic points and one translucent coarse region over Singapore. At overview zoom, only one point label was legible in the live main map; point-label legibility at that scale remains an open visual check. The existing Local POI Directory reads this same embedded FeatureCollection as a read-only preview on first open and shows its six synthetic places and coarse-region context without file selection or operator attestations.
2. **Local import and precision — PRD-DATA-04 / PRD-PIN-02.** Open **Main Toolbar → FloatingPanel → Geo** and expand **Nearby Places → Local POI Directory**. The embedded source preview is already visible; expand **Load operator-reviewed local GeoJSON** to use the separate file-import flow. Before choosing a file, enter source `geostack-synthetic-demo`, license `generated-demo-data`, and attribution `Synthetic demonstration data; no real businesses or site recommendation.` Check the rights and public-fields attestations and approve the coarse region. Leave exact points unchecked, then select the local file. Expected result: 0 points, 1 region, 6 withheld. Approve exact points and select the file again; approvals are captured at file selection. Expected result: 6 points and 1 region. This local attestation is not public-release permission.
3. **Search and selection — PRD-SRCH-03.** Search for `Synthetic Demo Place Central`, then select its result; the shared Geo map selects and fits the matching active graph feature `synthetic:demo-central`. Choose each category (`f&b`, `shop`, `store`, `plantation`, `property`) to see matching directory records: two for `f&b`, one for each other category. The main map remains the only map surface and retains the coarse region as context. Search works against either the embedded source preview or an explicitly imported local file. An imported record is selected on the main map only when its ID exists in the active map source; there is no remote search or geocoder.
4. **Attribution and manifest — PRD-DATA-04.** The embedded preview shows attribution and the 6-place / 1-region counts, with no operator attestation or manifest. After an explicit local file import, read the manifest's point/region/withheld counts, byte sizes, and input/output SHA-256 prefixes. Download **Download allowlisted GeoJSON** and **Download provenance manifest**. The intentional `internalNote` is absent from normalized output. Both files are local downloads; they do not publish or deploy the dataset.
5. **Reproducible local build — PRD-DATA-04.** From the Graph repository root, run the CLI against the saved file. The first output withholds exact points; to include them, add `--approve-exact-points` and use a different, new `--out` directory. Choose a fresh output directory for each run; the CLI refuses to overwrite output and makes no network requests. Expected manifests: default exact-point withholding gives 0 points / 1 region / 6 withheld; local exact-point approval gives 6 / 1 / 0.

   ```bash
   node --import tsx scripts/geostack-local-geojson-build.mjs \
     --input=/tmp/geostack-synthetic-demo.geojson \
     --out=/tmp/geostack-demo-withheld \
     --source=geostack-synthetic-demo \
     --license=generated-demo-data \
     --attribution='Synthetic demonstration data; no real businesses or site recommendation.' \
     --attest-rights --attest-public-fields --approve-region-polygons
   ```

   To compare a local exact-point preview, repeat with a fresh output directory and add `--approve-exact-points`:

   ```bash
   node --import tsx scripts/geostack-local-geojson-build.mjs \
     --input=/tmp/geostack-synthetic-demo.geojson \
     --out=/tmp/geostack-demo-exact \
     --source=geostack-synthetic-demo \
     --license=generated-demo-data \
     --attribution='Synthetic demonstration data; no real businesses or site recommendation.' \
     --attest-rights --attest-public-fields --approve-region-polygons --approve-exact-points
   ```

6. **Loaded-data offline behavior — PRD-MAP-01 / VCC-09.** In the production-static preview, load the file first, then disconnect the network and repeat local search/selection. The loaded directory and its local search remain available; the existing main map may lose remote basemap tiles. Restore the network afterward. Do not reload the page: persistent offline reload and offline tiles are outside this acceptance.
7. **Separate distribution context — PRD-LOG-11.** Select [the existing supply-chain overview seed](agentic-graph-logistics-supply-chain-overview.md). Inspect its 12 synthetic facilities, transport-mode filters, three sample consignments, schematic road/rail/air/sea/last-mile/reverse-flow legs, and existing shared BottomPanel Timeline; seek `SC-2051 · Port review hold` to move the event playhead to 04:22. Return to this places source; the logistics view is removed. These records do not join to the cafe points.

| PRD item | What this demo shows | Boundary / current evidence |
|---|---|---|
| `PRD-MAP-01`, `PRD-PIN-02` | Six-point synthetic GeoJSON and coarse region on the reused main map; directory category filtering and matching-feature selection | Does not prove private-data generalization or low-zoom acceptance on a named phone. One main-map label was legible at overview zoom; label overlap remains to be checked. |
| `PRD-SRCH-03` | Local name/category search, result selection, accessible SVG feature highlight | Synthetic interaction observed; `f&b` returned 2 and each other category 1; 300 ms limit is not timed. |
| `PRD-DATA-04` | Local file, operator attestations, exact-point withholding, closed allowlist, attribution, deterministic manifest and CLI | Synthetic fixture only; rights-cleared operator data remains pending. |
| `PRD-DEP-05` | Existing Graph release owner is the only delivery path | This walkthrough does not integrate, release, deploy, or authorize an effect. |
| `PRD-REG-06` | Fixture is far below the 500,000-byte input limit | No new lazy chunk is warranted by this fixture; strict generated chunk cap still fails elsewhere in the current build. |
| `PRD-PLT-07` | `plantation` is searchable as a supported place category | No confidence-labeled land-use layer is implemented. |
| `PRD-GATE-08`, `PRD-RTE-09`, `PRD-NAT-10` | Explicit defer/no scope | No visitor unlock, routing, directions, autocomplete, native app, or persistent offline tile pack. Operator exact-point approval is only for this local preview. |
| `PRD-LOG-11` | Existing logistics seed, schematic transport modes, distribution stages, and shared Timeline in a separate source | No route geometry, ETA, cost, optimization, service coverage, or cafe-candidate join. |

The active map overlay and directory panel reuse the existing maps surface; no second map or cafe-ranking panel is created. Do not merge the logistics source, historical scores, or archived cafe markers into the directory's active feature collection.

The observations below are synthetic local evidence only. The precision, search, and map-label observations were rechecked with the six-point fixture during this edit; the keyboard/mobile and offline rows refer to an earlier independent three-point fixture.

| Check | Observation |
|---|---|
| Precision | Current six-point fixture: with exact approval off, 0 points / 1 region / 6 withheld; after explicit local approval and reselecting the file, 6 points / 1 region / 0 withheld. |
| Allowlist | Unknown property removed from generated output; local manifest available. |
| Search | `Synthetic Demo Place Central` returned one result; selection selected `synthetic:demo-central` in the shared main map. Category counts: `f&b` 2; `shop`, `store`, `plantation`, and `property` 1 each. |
| Mobile/keyboard | Search, Tab through category control, and Enter selection worked at 390×844. Screen-reader and physical-phone checks remain open. |
| Same-session offline | After load, disconnect caused zero new requests; search and SVG still worked. Network restored. Offline reload/storage was not tested. |
| Proxy routes | Static `/__grabmaps_proxy` and `/__fetch_remote` returned 404; dev GrabMaps proxy returned 403. Neither route is proven. |
| Logistics source | The canonical supply-chain seed renders the existing synthetic facility/path view and shared event Timeline. Seeking the `SC-2051` port-review event updates that same panel to 04:22; switching to the places source removes the logistics overlay. The two views remain source-selected and separate. No cafe-candidate routing or distribution score is supported. |

## Build and verification

| Check | Result and limit |
|---|---|
| Build | `AG_SKIP_DOCS_UPDATE=1 npm run build --workspace=@agentic-graph/canvas` passed on the candidate. This is not release/deployment proof. |
| Local GeoJSON build | The 4,397-byte fixture produced 705-byte normalized output with 0 points / 1 region / 6 withheld by default, and 3,574-byte output with 6 / 1 / 0 under local exact-point approval. Two exact-point CLI runs produced byte-identical GeoJSON and manifests; `internalNote` was absent. Synthetic-only; no rights or release proof. |
| Chunk hygiene | Strict 500 KiB cap remains exceeded: KaTeX 523.12 kB, mermaid-cose 525.51 kB, app entry 563.56 kB, MapLibre 988.35 kB, Mermaid ELK 1,479.57 kB, Monaco 2,791.88 kB. |
| Focused tests | Four focused supply-chain facility/path checks passed. Full Graph product suite was not run. |
| Typecheck | Canvas typecheck remains non-green on workspace-wide missing-`jsdom` and typed-array compatibility diagnostics. A filtered follow-up found no diagnostics in the changed files; the overall typecheck did not pass. |
| Documentation checks | `npm run workspace-seeds:authority` and Canvas `doc:lint` passed; `git diff --check` passed. |
| Offline install | Service worker precaches 107 assets / 7,363.81 KiB. Registration does not prove offline reload. |
| GeoStack chunks | Maps Hub 30,026 B; SVG map 3,799 B. Shared chunk, first-paint, and cold-install budgets remain open. |

## Production blockers

- VCC-01/03/07/10/11 remain open: phone/performance, provider cost, protected release, screen-reader/device, and production continuity proof.
- All four buyer pain hypotheses remain unvalidated; no interviews, payment, or $1 offer evidence.
- Only synthetic runtime data was exercised. Data rights, provider terms, hard USD 0 cap, quota-deny behavior, and secret scan are unverified.
- The logistics overview's schematic has not been shown to calculate route geometry, street distance, travel time, delivery cost, optimization, or cafe-to-distributor coverage. Current cafe logistics recommendations remain unsupported.
- The candidate is local to its scratch branch; there is no protected integration receipt, exact production candidate, or production authorization.
- No live readback, rollback predecessor, telemetry receipt, offline reload, or physical-device evidence exists.
- The KaTeX chunk fails the PRD's strict 500 KiB cap; app, MapLibre, and Monaco chunks also exceed it.

## Release boundary

Use the existing Graph protected release owner. The current PRD digest is recorded above, but a START against the active scope reused its immutable sequence-3 workflow and did not rebind this later draft revision. Bind a fresh exact plan snapshot before further implementation or RELEASE; then close named VCC, data-rights, provider-cost, bundle, and integration gates. DEPLOY requires an exact integrated candidate, current human authorization, live readback, and retained rollback predecessor. This document grants no effect authority.

## Existing Maps Hub panel and separate logistics view

FloatingPanel Geo reuses one Nearby Places panel and its Local POI Directory beside the existing Geo settings. The Maps Hub remains the settings surface and does not mount a duplicate directory. The embedded map block powers the active map overlay and the directory's read-only list; selecting an active-source result selects that feature on the existing main map. The directory has no separate map preview or attribution badge and still accepts operator-reviewed local GeoJSON through its separate import flow. The supply-chain seed separately reuses `SupplyChainOverview`, its deterministic scenario, and the shared BottomPanel Timeline. Candidate scoring, rent/customer assumptions, DCF output, provider search, duplicate map hosts, and archived location markers are excluded from this demo. The path lines show modeled connectivity only; they are not pathfinding results, service coverage, or a recommendation for any cafe location.

For the historical methodology, non-decision location scores, and current runtime recommendation, see [the map reference](agentic-graph-maps-places-reference.md). It does not change the blocked readiness status above.
