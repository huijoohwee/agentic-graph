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
  runtime_entry: "canvas/src/components/CanvasViewportGeospatialOverlay.tsx"
  scenario_source: "canvas/src/features/supply-chain/supplyChainScenario.ts"
  source_mode: "deterministic synthetic local data"
  external_dependencies: []
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

## View controls

Choose a journey, filter routes by mode, filter infrastructure or resources, toggle labels, search facilities and journeys, or reset the view. Selecting a facility, resource, search result, or timeline event updates the selected journey and inspector together.

## Implementation files

- [Supply-chain overview component](../../canvas/src/features/supply-chain/SupplyChainOverview.tsx)
- [Scenario data and projection](../../canvas/src/features/supply-chain/supplyChainScenario.ts)
- [View styles](../../canvas/src/features/supply-chain/supplyChainOverview.css)
