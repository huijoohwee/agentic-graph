---
title: "End-to-end logistics supply chain overview"
doc_type: "PRD-TAD-ADR-MVP-GTM"
version: "1.0.0"
date: "2026-10-12"
lang: "en-US"
owner: "Product and engineering"
local_rung: "spec-complete"
delivered_rung: "undocumented"
lane: "delivery"
universal_scope: true
worktree_id: "device-cba000d3779d"
agent_id: "root"
continuity_id: "agentic-graph:supply-chain-overview"
lifecycle_status: "proposed"
---

# End-to-end logistics supply chain overview

**Continuity:** `agentic-graph:supply-chain-overview@1.0.0` binds all five section roles below. This is one locally grounded product and architecture record for a synthetic, multimodal logistics network. It covers upstream supply, production, consolidation, air/sea/rail gateways, transfer, regional distribution, delivery, recipient handoff, and returns.

## PRD — product intent and acceptance

### Problem and users

The current product need is a single, inspectable view of an end-to-end logistics journey. User acceptance feedback in this work asked for the airport, port, and other facilities to be visible in their geographic context, for asset footprints to use credible scales, and for environment and subject thumbnails to read as distinct catalog items. This is product feedback, not buyer research. The target operator (planner, dispatcher, or logistics analyst), buyer, purchase authority, frequency of the pain, and willingness to pay remain hypotheses.

### Outcome and time to value

An operator should be able to open a local scenario, understand its network at a glance, select a consignment or facility, and follow its forward and reverse events without switching to a second map. **Target TTV:** under two minutes from opening the scenario to identifying the selected consignment’s next handoff. This is a target; no observed user timing is available yet.

### Scope

- **Must:** Show the connected 12-site scenario across supplier, production, origin, airport, seaport, rail terminal, intermodal transfer, regional hub, fulfillment, delivery, recipient, and returns.
- **Must:** Show road, air, sea, rail, and reverse legs; three sample consignments; linked event histories; a port exception; and return linkage.
- **Must:** Keep map, selection, facility/consignment inspector, and shared timeline on the existing full-viewport canvas. Use its shared Geo+XR projection, map, and camera-fit contracts.
- **Must:** Distinguish regional geography and modeled facility footprints. Label synthetic site positions and operational values as illustrative.
- **Must:** Give each existing terrain/environment preset and existing subject/prop asset meaningful local catalog artwork; keep media data self-contained and available offline.
- **Should:** Provide route-mode, entity, and label filters; accessible selection controls; and a stable seeded scenario.
- **Won’t in this increment:** Connect to carrier, customs, warehouse, airline, port, or rail operations; ingest personal or shipment data; claim live status; publish a service; or claim buyer demand, savings, or revenue.

### Verifiable customer criteria (VCC)

| ID | Acceptance criterion | Evidence and status |
|---|---|---|
| VCC-01 | Opening the scenario yields 12 linked facilities, 14 legs, 3 consignments, and synthetic events spanning the complete forward and reverse chain. Selecting a facility or consignment updates the map selection, detail inspector, and timeline context together. | Scenario and view owners: `supplyChainScenario.ts`, `SupplyChainOverview.tsx`, `supplyChainViewStore.ts`. Focused graph and viewport checks passed; full interaction walk-through remains open. |
| VCC-02 | Airport, port, and regional rail facilities appear in their correct Singapore/Johor geographic context; the initial network fit keeps the three gateway locations visible in the usable map aperture when panels and timeline are open. | WGS84 source anchors and shared fit owner. First-load browser capture shows Changi, Pasir Panjang, and Kempas Baru together with Source Files visible. Narrow viewport acceptance remains open. |
| VCC-03 | Changi runway overlays preserve 4,000 × 60 m geometry and midpoint placement from published runway endpoints; port, ship, container, and rail graphics expose their modeled metre dimensions and are explicitly illustrative where not sourced. | Focused geospatial tests passed. Official runway source and modeled dimensions are listed in Evidence. |
| VCC-04 | Catalog thumbnails distinguish Singapore city from the tropical island and distinguish the existing environment kits, cast, vehicles, animals, and props without network-loaded artwork. | `xrCatalogArtworkSvg` now depicts authored tropical landmarks, aerial reference slabs, and cast details using local SVG. The shared package builds; browser spot-checks confirmed the Tropical Playground kit and Wolf performer thumbnails render at 96 × 72 with no remote asset. Full card-by-card visual review remains open. |
| VCC-05 | The supply-chain view composes with the existing full-viewport canvas and shared map controls; it introduces no second map, projection implementation, or conflicting camera owner. | `CanvasViewport.tsx`, `CanvasViewportGeospatialOverlay.tsx`, shared Geo+XR functions, and camera-fit checks. |

### Success measures and experiments

- **Product:** time to first correct facility/consignment explanation; task completion for locating the next handoff and explaining a return; facility visibility at supported viewport sizes; count of catalog assets whose thumbnail is semantically distinct from its neighbors.
- **Targets:** TTV under 2 minutes; all 12 facilities visible after initial network fit; all five VCCs accepted. Baselines and observed results are not yet available.
- **Market learning:** Conduct timed walkthroughs with logistics planners and record their current tools, frequency of handoff exceptions, acceptable data connection, and price response. Do not infer willingness to pay from local implementation or user comments.

## TAD — architecture and data boundaries

### Existing component owners

| Component | Responsibility in this increment | Existing owner |
|---|---|---|
| View route and composition | Opt-in query route, lazy feature mount, shared canvas composition | `canvas/src/components/CanvasViewport.tsx`; `canvas/src/features/canvas/canvasQueryBootstrapSearch.ts` |
| Scenario and projection | Seeded facility, leg, resource, consignment, and event records; time projection | `canvas/src/features/supply-chain/supplyChainScenario.ts` |
| User state and panels | Selection, route/entity filters, labels, map overlay, journey and inspector | `canvas/src/features/supply-chain/SupplyChainOverview.tsx`; `supplyChainViewStore.ts`; `supplyChainOverview.css` |
| Geospatial graph | Facility nodes, route edges, resource positions, local metre footprints | `canvas/src/features/supply-chain/supplyChainGeospatialGraph.ts`; `CanvasViewportGeospatialOverlay.tsx` |
| Map and camera | Basemap canvas, common feature projection, visible-aperture fitting and overlay padding | `gympgrph`; `grph-shared` Geo+XR utilities |
| Media catalog | Environment and subject/prop card and sprite art | `grph-shared/src/geospatial/xrCatalogArtwork.ts`; `canvas/src/features/command-menu/XrMediaCatalogThumbs.tsx` |
| Workspace source | Local overview seed and opt-in workspace file | `supplyChainOverviewSource.ts`; `canvas/src/features/workspace-fs/workspaceFs.ts`; `docs/workspace-seeds/agentic-graph-logistics-supply-chain-overview.md` |

### System flows

1. **Interaction:** operator opens the opt-in route → selects a sample or facility → shared store changes selection/filter/time → map, inspector, and timeline render the same selection.
2. **Scenario data:** fixed local seed → scenario projector clamps playback time and derives current/next events and active legs → view presents synthetic progress.
3. **Geospatial rendering:** facility/route/resource records → existing graph overlay adds GeoJSON nodes, lines, and metre-sized polygons → shared projection and map renderer draw them in the base canvas.
4. **Media rendering:** existing catalog asset ID/label/color → shared local SVG function → catalog card or sprite; no remote model or image fetch is required for this artwork.
5. **External facts:** public aviation, hydrographic, and rail-location evidence informs selected map anchors or dimensions → code records the source-backed fact separately from illustrative assets and synthetic operations.

### Boundaries and quality

Scenario facts are deterministic and local to the browser session. No production credentials, personal data, live telemetry, external writes, autonomous decisions, or AI calls are part of this increment. The basemap may use its existing tile/style configuration; this feature adds no new tile service or asset endpoint. Missing map tiles must not change scenario identity or event state.

Coordinates use WGS84 `[longitude, latitude]`. Changi runway plan-view polygons use published 4,000 × 60 m dimensions and midpoint coordinates derived from official runway endpoints. The airport facility pin uses the published aerodrome reference point. The Pasir Panjang point is a representative pin inside the mapped terminal area, not a surveyed facility centroid. The Kempas Baru point uses the published station location. Terminal yards, quay, vessel, stacks, rail platform/tracks, capacities, routes, and simulated events remain modeled scenario geometry unless separately marked source-backed.

All feature IDs are prefixed `supply-chain:` and stay separate from user-authored graph data. The map remains owned by the existing shared canvas; common local-metre projection and viewport-occlusion utilities remain the sole map/Geo+XR owners. Existing workspace-indexing/search paths load the scenario source. Import or identity conflict must fail closed through those existing source-resolution rules.

### Five operational flows

| Flow | Input → output | Failure behavior |
|---|---|---|
| User interaction | Route, click/key selection, filters → selected facility/consignment and synchronized view | Unknown ID leaves selection unchanged; no network mutation. |
| Data | Versioned seed → bounded deterministic projections | Invalid/missing event references are visible as local data defects; do not invent live state. |
| Control | Timeline playhead → current, next, active, and completed scenario state | Clamp time to scenario duration; pause/stop remain local controls. |
| External facts | Public source evidence → source-backed anchors/dimensions | Unknown site geometry is labelled representative or illustrative. |
| Media | Asset ID → shared inline SVG thumbnail | Unknown IDs use the established generic fallback; no remote dependency is added. |

## ADR — shared-canvas rendering and source-backed geography

### Decision

Render this network as a feature overlay in the existing full-viewport canvas. Reuse its Geo+XR projection, geospatial overlay, shared viewport-occlusion camera-fit contract, workspace seed, and local media catalog. Keep the scenario data and UI modular under `features/supply-chain`. Put catalog artwork in the existing shared `grph-shared` owner and improve existing assets in place. Anchor real gateway locations to authoritative public geography; mark synthetic regional sites and modeled facility footprints as illustrative.

### Alternatives considered

- A second map and camera: rejected because it duplicates projection and camera ownership and risks disagreement between map and XR surfaces.
- A separate feature-local coordinate/projection utility: rejected because the shared Geo+XR projection already owns this conversion.
- Live logistics integrations or a network-loaded 3D catalog: deferred because the current user need is a locally reviewable scenario, and no service, data-sharing, licensing, cost, or operating contract has been established.
- A free/open geospatial renderer could be evaluated if the existing shared renderer cannot meet a measured requirement. It is not introduced as a second renderer in this increment.

### Consequences and recovery

This choice preserves current canvas behavior and avoids duplicate infrastructure. The scenario remains synthetic and cannot be used as an operational source of truth. Catalog illustration is lightweight and self-contained but is not photorealistic 3D media. If visible-aperture framing fails, revert only the shared fit change and retain the feature data; if a catalog asset is misleading, correct that existing artwork entry and preserve the asset ID contract. Revisit the renderer decision only with a recorded unmet VCC and a comparable cost/accessibility/performance evaluation.

## MVP — smallest evidenced end-to-end slice

### Slice

Open the opt-in seeded view; draw the 12-site, 14-leg multimodal and reverse network on the existing map; follow one selected air consignment from origin through delivery and a linked return; inspect a sea hold and rail journey; select facilities; and use the shared timeline. Source-backed gateway placement and metre-based runway footprint render together with distinctly illustrated existing XR catalog assets. No operational integrations or publishing are included.

### Dependency order

1. Shared canvas, workspace source resolver, and Geo+XR projection are present.
2. Versioned deterministic scenario and view store are loaded.
3. Existing overlay maps scenario IDs to map nodes, edges, positions, and area/line features.
4. Shared map fits its usable aperture after overlays and panels are measured.
5. Existing catalog resolves local SVG artwork by stable asset ID.
6. Focused source checks and browser acceptance confirm the VCCs before any release decision.

### MVP evidence and known gaps

The local implementation exists in the paths named above. Four focused geospatial graph assertions pass for source-backed gateway anchors, metre-based footprints, full runway and port bounds, and route endpoints. The canvas workspace check passes TypeScript and all three local Vite browser-smoke runtime checks. A first-load browser capture shows the airport, port, and rail gateways together on the shared map with the Source Files Explorer visible. The shared package builds, and browser spot-checks confirmed local SVG thumbnails for the Tropical Playground kit and Wolf performer. Narrow viewport and full card-by-card acceptance remain open. No independent evaluator, user study, live-data contract, or deployment receipt exists.

## GTM — learning and first-value path

### Position and first-dollar hypothesis

**Hypothesis:** a logistics control-tower team may value a configurable network walkthrough that makes upstream, gateway, delivery, and return handoffs easier to inspect. The first candidate offer is a time-bounded scenario-mapping and workflow review for a single operator team. This is an unvalidated hypothesis; the current synthetic demo proves neither a market nor an outcome for a real operator.

### Experiment and guardrails

After the local demo is accepted, recruit a small set of planners/operators for a timed walkthrough. Ask each to identify a facility, explain a mode transfer, locate an exception, and follow a return. Record task time, errors, current workaround, data/security needs, and whether they request a paid follow-up. Test price only after identifying the buyer and measurable pain. Stop or narrow the offer if participants do not complete the workflow faster or cannot use synthetic/local data for evaluation.

No price, TAM/SAM/SOM, sales cycle, conversion, retention, support capacity, gross margin, or revenue is established. Defer a financial model and external launch claim until buyer interviews, priced pilot evidence, delivery-cost measurement, and an authorized release/deploy plan exist.

## C01–C16 coverage record

Disposition is coverage only. `covered` means a grounded local decision or artifact exists; it does not assert market validation, production readiness, or deployment. Deferred rows name an owner, prerequisite, and revisit trigger.

| ID | Status | Source/evidence and next check | Owner |
|---|---|---|---|
| C01 Purpose, customer, pain | covered | PRD records user feedback and marks operator/buyer pain as a hypothesis; interview a planner before baseline. | Product |
| C02 Market and timing | deferred | No independently sized market; gather segment/geography evidence before positioning. | Product |
| C03 Offer and alternatives | deferred | First-dollar service is a hypothesis; compare manual alternatives and price with buyers. | Product |
| C04 Product and experience | covered | VCC-01–05 and local route/selection/map/media owners; complete accessible narrow-viewport and media-catalog walkthrough. | Product and engineering |
| C05 Architecture and data | covered | TAD component map, local seed and five data/control boundaries; refresh on interface changes. | Engineering |
| C06 Quality, security, and AI | covered | Synthetic/local-only boundary; no AI or personal data. Review privacy and operational threat model before integrations. | Engineering |
| C07 Decisions and tradeoffs | covered | ADR records shared-canvas decision, rejected duplicate owners, consequences, and recovery. | Engineering |
| C08 Smallest validated slice | covered | MVP slice and local checks are bounded; complete Media-panel and narrow-viewport acceptance evidence. | Product and engineering |
| C09 Acquisition through retention | deferred | No channel or repeat-use evidence; run operator walkthrough and paid-follow-up experiment. | Product |
| C10 Business operations | deferred | No service/support model; estimate support and scenario-authoring effort before pilot offer. | Operations |
| C11 Organization and obligations | deferred | No entity, contract, data rights, or jurisdiction review for a real deployment; resolve before external data use. | Operations and legal reviewer |
| C12 Financial viability | deferred | No cost, price, margin, or cash-flow evidence; measure pilot delivery cost and obtain price responses. | Finance |
| C13 Capital and milestones | deferred | No funding decision or ask; revisit only if a validated delivery path requires capital. | Product |
| C14 ADLC execution | deferred | Local lane and checks are recorded, but release/deploy/rollback receipts and cost attribution do not exist. Capture them only after an authorized release transition. | Delivery |
| C15 Audience projections | deferred | No pitch, business plan, or financial model prepared; create only after evidence is joined at this continuity revision. | Product |
| C16 Learning and next increment | covered | Next increment is timed operator and viewport/media acceptance; continue only if VCCs pass, otherwise narrow by the observed failure. | Product and engineering |

**Coverage count:** 7/16 covered; 9/16 deferred; 0/16 not applicable. Deferred market, operations, legal, financial, and release evidence is not counted as product readiness.

## Evidence references

- Source files at this worktree revision: `canvas/src/features/supply-chain/SupplyChainOverview.tsx`, `supplyChainScenario.ts`, `supplyChainGeospatialGraph.ts`, `supplyChainViewStore.ts`, `supplyChainOverview.css`, `canvas/src/components/CanvasViewport.tsx`, `CanvasViewportGeospatialOverlay.tsx`, `grph-shared/src/geospatial/xrCatalogArtwork.ts`, and the shared `gympgrph` geospatial camera-fit owners.
- Scenario identifiers and local seed: `scenario.network-sample-01@1.0.0`; `docs/workspace-seeds/agentic-graph-logistics-supply-chain-overview.md`.
- Source-backed airport evidence: Singapore Aeronautical Information Publication, Changi runway physical characteristics and coordinates, [current AIP aerodrome data](https://aim-sg.caas.gov.sg/aim-content/uploads/aip/17-SEP-2026/AIP/2026-09-03-000000/pdf/SG-AD-2-WSSS.pdf). Verify official runway dimensions, bearing, and endpoint pairs before changing modeled runway geometry.
- Port-area evidence: the official hydrographic authority lists WGS84 chart coverage for Pasir Panjang Terminal on [chart 4034](https://www.mpa.gov.sg/port-marine-ops/marine-services/charts-tidal-info-atons-and-hydrography/dual-badged-nautical-charts). The scenario point is representative within that charted area, not a surveyed centroid.
- Rail-location evidence: the rail operator’s [Kempas Baru station location notice](https://www.ktmb.com.my/assets/pdf/2024/kempas-baru-view.pdf) publishes the current station coordinate. Modeled freight handling remains synthetic.
- Local checks executed in this session: four focused supply-chain geospatial graph tests passed; `npm run check --workspace=@agentic-graph/canvas` passed the linked shared package builds, Canvas TypeScript check, and three local Vite browser-smoke runtime tests. Browser first-load verification confirmed Source Files stays visible and airport, port, and rail anchors fit together. `npm run check:plan` emitted an advisory local affected-check plan (`authority: false`); it did not execute CI partitions or grant release authority. The exact affected checks and native release lifecycle remain in progress.
- Release evidence: none. No protected-main integration, deployment, production verification, buyer commitment, or collected payment is represented by this record.
