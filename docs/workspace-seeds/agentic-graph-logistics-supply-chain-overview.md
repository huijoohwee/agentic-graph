---
title: "End-to-end Logistics Supply Chain Overview"
doc_type: "Workspace Demo"
status: "local-synthetic-scenario"
publish_scope: "local-only"
kgCanvasSurfaceMode: "geo-xr"
kgCanvasRenderMode: "3d"
kgCanvas3dMode: "xr"
supply_chain_overview:
  schema: "agentic-graph-logistics-network/v1"
  activation: "select-this-source-file"
  runtime_entry: "canvas/src/features/supply-chain/SupplyChainOverview.tsx"
  scenario_source: "canvas/src/features/supply-chain/supplyChainScenario.ts"
  asset_library_entry: "FloatingPanel → Media → Assets → 3D for XR"
  timeline_owner: "BottomPanel → Timeline / GanttTimelineTransportPanel"
  source_mode: "deterministic synthetic local data"
  offline_map_fallback: "local SVG schematic; no remote map tiles"
  online_basemap: "configured public style may require network access"
---

# End-to-end logistics supply chain

Select this source file to open the network overview. The view follows a shipment across origin, transport gateways, regional operations, delivery, and returns. Selecting another source file restores its regular canvas view; select this file again to return.

## Network coverage

The scenario contains twelve connected facilities: materials supplier, assembly site, origin consolidation, air cargo terminal, seaport terminal, rail freight terminal, intermodal transfer, regional distribution hub, fulfillment center, delivery station, recipient destination, and returns inspection.

Road, air, sea, and rail legs connect three sample consignments. One air journey includes a linked reverse flow. An ocean journey includes a port-review event so exception state is visible during replay.

## Local scenario contract

- Scenario seed: `network-sample-01`
- Revision: `1.0.0`
- Facility, route, journey, event, and resource identifiers remain stable within the scenario.
- Values are synthetic and remain local to the browser session.
- The shared timeline drives the map, current journey, event markers, and resource states.
- Offline mode uses a local schematic, so the scenario and Timeline remain interactive without map tiles.
- The 3D assets control opens the existing Media library in 3D for XR mode. Reuse its Terrain / Environment Kits and Subjects & Props instead of creating another asset catalog.

## View controls

Choose a journey, filter routes by mode, filter infrastructure or resources, toggle labels, search facilities and journeys, or reset the view. Selecting a facility, resource, search result, or timeline event updates the selected journey and inspector together. Use **3D assets** to open the shared FloatingPanel library and reuse local terrain, environment, subject, and prop assets.

The BottomPanel Timeline remains the shared read-only Gantt transport. Seeking or replaying it changes the selected journey and event state; no separate supply-chain clock is introduced.

## Implementation files

- [Supply-chain overview component](../../canvas/src/features/supply-chain/SupplyChainOverview.tsx)
- [Scenario data and projection](../../canvas/src/features/supply-chain/supplyChainScenario.ts)
- [View styles](../../canvas/src/features/supply-chain/supplyChainOverview.css)
