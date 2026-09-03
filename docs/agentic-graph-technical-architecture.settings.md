---
title: "Reference implementation: agentic-graph Settings Registry Continuation"
id: "md:agentic-graph-technical-architecture-settings"
doc_type: "Generated Registry Surface"
version: "1.0.0"
date: "2026-07-30"
lang: "en-US"
owner: "docs.generated.settings-registry-continuation"
local_rung: "spec-complete"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
guideline_version: "1.7.0"
parent: "docs/agentic-graph-technical-architecture.md"
parent_version: "1.1.0"
generator_owner: "canvas/src/cli/lint-doc.ts"
---

# Reference implementation: agentic-graph Settings Registry Continuation

## Generated Registry Contract

This is part 2 of the settings-registry projection started in
[the technical architecture registry](agentic-graph-technical-architecture.md).
Canonical behavior remains owned by source and authored documents. The
generator applies the same stable row boundary on every run; neither part is a
separate settings authority.

## Settings Registry — Part 2

<!-- SETTINGS_REGISTRY_CONTINUATION_TABLE_START -->

| Setting key | Type | Source | LS key (if any) | Owner |
| ----------- | ---- | ------ | ------------ | ----- |
| `zoomToSelectionMode` | boolean | store |  |  |
| `zoomDurationFitMs` | number | store | `kg:ui:zoom:durationFitMs` | `ui.workspace` |
| `zoomDurationSelectionMs` | number | store | `kg:ui:zoom:durationSelectionMs` | `ui.workspace` |
| `wheelZoomCtrlMetaBoostMultiplier` | number | store | `kg:ui:zoom:wheelCtrlMetaBoostMultiplier` | `ui.workspace` |
| `canvasInteractionSpeedMultiplier` | number | store | `kg:ui:interaction:speedMultiplier` | `ui.workspace` |
| `canvasPanSpeedMultiplier` | number | store | `kg:ui:pan:speedMultiplier` | `ui.workspace` |
| `flowWheelZoomSpeedMultiplier` | number | store | `kg:render:flow:wheelZoomSpeedMultiplier` | `render.prefs` |
| `flowWheelZoomIncrementMultiplier` | number | store | `kg:render:flow:wheelZoomIncrementMultiplier` | `render.prefs` |
| `flowWheelZoomSmoothMinDurationMs` | number | store | `kg:render:flow:wheelZoomSmoothMinDurationMs` | `render.prefs` |
| `flowWheelZoomSmoothMaxDurationMs` | number | store | `kg:render:flow:wheelZoomSmoothMaxDurationMs` | `render.prefs` |
| `orchestratorTraversalDelayMs` | number | localStorage | `kg:orchestrator:traversalDelayMs` | `orchestrator.prefs` |
| `graph.behavior.selectMode` | string | store |  |  |
| `graph.behavior.createMode` | string | store |  |  |
| `schemaDeriveCacheCapacity` | number | store | `kg:perf:schemaDeriveCacheCapacity` | `schema.deriveCache` |
| `schema.behavior.hover.content.type` | boolean | store |  |  |
| `schema.behavior.hover.content.id` | boolean | store |  |  |
| `schema.behavior.hover.content.properties` | boolean | store |  |  |
| `schema.layout.groups.nestedPaddingStep` | number | store |  |  |
| `schema.layout.flow.pack.paddingPxDocument` | number | store |  |  |
| `schema.layout.flow.pack.paddingPxKeyword` | number | store |  |  |
| `schema.layout.flow.collisionCaps.nodePaddingXMax` | number | store |  |  |
| `schema.layout.flow.collisionCaps.nodePaddingYMax` | number | store |  |  |
| `schema.layout.flow.collisionCaps.groupExtraGapPxMax` | number | store |  |  |
| `schema.layout.flow.collisionCaps.maxShiftPx` | number | store |  |  |
| `schema.layout.flow.overlay.collisionGapPx` | number | store |  |  |
| `schema.layout.edges.type` | string | store |  |  |
| `schema.layout.edges.opacity` | number | store |  |  |
| `schema.layout.edges.opacityUnderGroups` | number | store |  |  |
| `graphHoverPreview.showNodeId` | boolean | store |  |  |
| `graphHoverPreview.showNodeName` | boolean | store |  |  |
| `graphHoverPreview.showNodeLabel` | boolean | store |  |  |
| `graphHoverPreview.showNodeDescription` | boolean | store |  |  |
| `graphHoverPreview.showNodeProperties` | boolean | store |  |  |
| `graphHoverPreview.showEdgeId` | boolean | store |  |  |
| `graphHoverPreview.showEdgeLabel` | boolean | store |  |  |
| `graphHoverPreview.showEdgeWeight` | boolean | store |  |  |
| `graphHoverPreview.showEdgeProperties` | boolean | store |  |  |
| `three.camera.autoClip` | boolean | store |  |  |
| `three.camera.autoClipNearFactor` | number | store |  |  |
| `three.camera.autoClipFarFactor` | number | store |  |  |
| `three.iframeOverlay.sizeScaleFactor` | number | store |  |  |
| `three.graph.edgeRenderer` | string | store |  |  |
| `three.voxel.districts.enabled` | boolean | store |  |  |
| `three.voxel.districts.paddingCells` | number | store |  |  |
| `three.voxel.districts.opacity` | number | store |  |  |
| `three.voxel.bridges.tubeRadius` | number | store |  |  |
| `three.voxel.bridges.opacity` | number | store |  |  |
| `three.voxel.bridges.pulseStrength` | number | store |  |  |
| `three.voxel.bridges.particles.enabled` | boolean | store |  |  |
| `three.voxel.bridges.particles.density` | number | store |  |  |
| `three.voxel.bridges.particles.speed` | number | store |  |  |
| `three.graph.shaderLineWidthPx` | number | store |  |  |
| `three.selection.selectedNodeGlowIntensity` | number | store |  |  |
| `three.selection.dimmedNodeOpacity` | number | store |  |  |
| `three.selection.dimmedEdgeOpacity` | number | store |  |  |
| `three.selection.selectedEdgeWidth` | number | store |  |  |
| `three.camera.backgroundColor` | string | store |  |  |
| `three.camera.fogColor` | string | store |  |  |
| `three.camera.fogNear` | number | store |  |  |
| `three.camera.fogFar` | number | store |  |  |
| `three.camera.dampingFactor` | number | store |  |  |
| `three.camera.rotateSpeed` | number | store |  |  |
| `three.camera.zoomSpeed` | number | store |  |  |
| `three.camera.panSpeed` | number | store |  |  |
| `three.graph.linkDirectionalArrowLength` | number | store |  |  |
| `three.graph.linkOpacity` | number | store |  |  |
| `three.graph.linkCurvature` | number | store |  |  |
| `three.graph.linkCurveRotation` | number | store |  |  |
| `three.graph.linkDirectionalParticles` | number | store |  |  |
| `three.graph.linkDirectionalParticleSpeed` | number | store |  |  |
| `three.graph.nodeSizingFormula` | string | store |  |  |
| `three.graph.edgeWidthFormula` | string | store |  |  |
| `three.graph.layerOpacityByLayer.1` | number | store |  |  |
| `three.graph.layerOpacityByLayer.2` | number | store |  |  |
| `three.graph.layerOpacityByLayer.3` | number | store |  |  |
| `three.graph.nodeMotionIntensity` | number | store |  |  |
| `three.graph.minimapOpacity` | number | store |  |  |
| `three.graph.starfieldEnabled` | boolean | store |  |  |
| `three.graph.starfieldCount` | number | store |  |  |
| `three.graph.starfieldRadius` | number | store |  |  |
| `three.graph.starfieldOpacity` | number | store |  |  |
| `three.graph.starfieldColor` | string | store |  |  |
| `three.layout.sphereRadius` | number | store |  |  |
| `three.layout.seed` | number | store |  |  |
| `three.layout.minSpacing` | number | store |  |  |
| `three.layout.voxelAnimationEnabled` | boolean | store |  |  |
| `three.layout.voxelSeedScaleFactor` | number | store |  |  |
| `three.layout.voxelGridScaleFactor` | number | store |  |  |
| `three.layout.voxelLayerSpacing` | number | store |  |  |
| `three.layout.voxelLayerPlateOpacity` | number | store |  |  |
| `three.layout.voxelLayerPlateRiseDurationMs` | number | store |  |  |
| `three.layout.voxelLayerPlateRiseStaggerMs` | number | store |  |  |
| `three.layout.voxelClusterPulseStrength` | number | store |  |  |
| `three.layout.voxelEdgeHoverOpacity` | number | store |  |  |
| `three.layout.voxelIntroDelayMs` | number | store |  |  |
| `three.layout.voxelIntroDurationMs` | number | store |  |  |
| `three.layout.voxelDefaultYawDeg` | number | store |  |  |
| `three.layout.voxelDefaultTiltDeg` | number | store |  |  |
| `three.layout.voxelDefaultDistanceFactor` | number | store |  |  |
| `three.layout.voxelDefaultTargetLift` | number | store |  |  |
| `three.layout.voxelGhostOpacity` | number | store |  |  |
| `three.layout.voxelTopCapEmissiveIntensity` | number | store |  |  |
| `three.layout.voxelClusterLightIntensity` | number | store |  |  |
| `three.layout.voxelHubPulseStrength` | number | store |  |  |
| `three.layout.voxelConceptFloatStrength` | number | store |  |  |
| `three.layout.voxelIdleAutoRotateDelayMs` | number | store |  |  |
| `three.layout.voxelIdleAutoRotateSpeed` | number | store |  |  |
| `three.layout.voxelLabelsEnabled` | boolean | store |  |  |
| `three.layout.voxelLabelOpacity` | number | store |  |  |
| `three.layout.voxelLabelFontSizePx` | number | store |  |  |
| `three.layout.voxelLabelMaxChars` | number | store |  |  |
| `three.layout.voxelLabelShowOnHoverOnly` | boolean | store |  |  |
| `three.layout.voxelLabelLift` | number | store |  |  |
| `three.globe.effectsEnabled` | boolean | store |  |  |
| `three.globe.particleCount` | number | store |  |  |
| `three.globe.atmosphereOpacity` | number | store |  |  |
| `three.globe.gridDensity` | number | store |  |  |
| `three.globe.orbitRingCount` | number | store |  |  |
| `three.globe.toolNodeCount` | number | store |  |  |
| `three.globe.arcCount` | number | store |  |  |
| `three.globe.arcTravelerCount` | number | store |  |  |
| `three.globe.hubOrbitEnabled` | boolean | store |  |  |
| `three.globe.hubOrbitStrength` | number | store |  |  |
| `three.globe.hubOrbitSpeed` | number | store |  |  |
| `three.globe.hubOrbitRadiusFactor` | number | store |  |  |
| `three.globe.sphereEllipsoidX` | number | store |  |  |
| `three.globe.sphereEllipsoidY` | number | store |  |  |
| `three.globe.sphereEllipsoidZ` | number | store |  |  |
| `three.globe.labelDepthFade` | boolean | store |  |  |
| `three.globe.labelBackfaceCulling` | boolean | store |  |  |
| `three.media.iframeOverlay.poolMax` | number | store |  |  |
| `three.media.iframeOverlay.maxVisibleDefault` | number | store |  |  |
| `three.media.iframeOverlay.maxVisibleCompact` | number | store |  |  |
| `three.media.iframeOverlay.maxDistanceDefault` | number | store |  |  |
| `three.media.iframeOverlay.maxDistanceCompact` | number | store |  |  |
| `three.media.iframeOverlay.baseWidthRatioDefault` | number | store |  |  |
| `three.media.iframeOverlay.baseWidthRatioCompact` | number | store |  |  |
| `three.media.iframeOverlay.baseWidthMinPxDefault` | number | store |  |  |
| `three.media.iframeOverlay.baseWidthMinPxCompact` | number | store |  |  |
| `three.media.iframeOverlay.baseWidthMaxPxDefault` | number | store |  |  |
| `three.media.iframeOverlay.baseWidthMaxPxCompact` | number | store |  |  |
| `three.preset.presentation3d` | boolean | store |  |  |
| `CLICK_URL` | string | env |  |  |
| `PUBLIC_FALLBACK_JSON` | string | env |  |  |
| `AG_INPUT_PATH` | string | backendEnv |  |  |
| `AG_OUTPUT_DIR` | string | backendEnv |  |  |
| `max-lines` | number | eslint |  |  |
| `search.exa.mcp.serverKey` | string | localStorage |  |  |
| `search.exa.mcp.remoteUrl` | string | localStorage |  |  |
| `search.exa.mcp.toolProfile` | string | localStorage |  |  |
| `search.exa.mcp.enabledTools` | json | localStorage |  |  |
| `search.exa.mcp.connectionMode` | string | localStorage |  |  |
| `search.exa.mcp.startupTimeoutMs` | number | localStorage |  |  |
| `search.exa.mcp.maxResults` | number | localStorage |  |  |
| `search.exa.mcp.fetchContentLimit` | number | localStorage |  |  |
| `search.exa.mcp.requireFetchReview` | boolean | localStorage |  |  |
| `search.feishuBase.mcp.serverKey` | string | localStorage |  |  |
| `search.feishuBase.mcp.connectionMode` | string | localStorage |  |  |
| `search.feishuBase.mcp.authBoundary` | string | localStorage |  |  |
| `search.feishuBase.mcp.docsUrl` | string | localStorage |  |  |
| `search.feishuBase.mcp.phase` | string | localStorage |  |  |
| `search.feishuBase.mcp.phase2Status` | string | localStorage |  |  |
| `search.feishuBase.mcp.phase3Status` | string | localStorage |  |  |
| `openai.mcp.serverLabel` | string | localStorage |  |  |
| `openai.mcp.serverUrl` | string | localStorage |  |  |
| `openai.mcp.transport` | string | localStorage |  |  |
| `openai.mcp.allowedTools` | json | localStorage |  |  |
| `openai.mcp.requireApproval` | string | localStorage |  |  |
| `openai.mcp.responsesModel` | string | localStorage |  |  |
| `openai.mcp.authMode` | string | localStorage |  |  |
| `openai.mcp.apiKeyEnv` | string | localStorage |  |  |
| `openai.mcp.vectorStoreEnv` | string | localStorage |  |  |
| `openai.mcp.serverPort` | number | localStorage |  |  |
| `openai.mcp.requireToolReview` | boolean | localStorage |  |  |
| `operatorDeploy.mcp.endpoint` | string | localStorage |  |  |
| `operatorDeploy.mcp.frontendUrl` | string | localStorage |  |  |
| `operatorDeploy.mcp.mode` | string | localStorage |  |  |
| `operatorDeploy.mcp.liveClientsEnabled` | boolean | localStorage |  |  |
| `operatorDeploy.mcp.cloudDeployApproved` | boolean | localStorage |  |  |
| `payments.stripe.mode` | string | localStorage |  |  |
| `payments.stripe.secretKey` | string | backendEnv |  |  |
| `payments.stripe.publishableKey` | string | localStorage |  |  |
| `payments.stripe.webhookSecret` | string | backendEnv |  |  |
| `payments.stripe.accountId` | string | localStorage |  |  |
| `payments.paywallEnabled` | boolean | localStorage |  |  |
| `payments.stripe.checkoutUrl` | string | store |  |  |
| `payments.stripe.mcp.serverKey` | string | localStorage |  |  |
| `payments.stripe.mcp.remoteUrl` | string | localStorage |  |  |
| `payments.stripe.mcp.connectionMode` | string | localStorage |  |  |
| `payments.stripe.mcp.localCommand` | string | localStorage |  |  |
| `payments.stripe.mcp.localArgs` | json | localStorage |  |  |
| `payments.stripe.mcp.startupTimeoutMs` | number | localStorage |  |  |
| `payments.stripe.mcp.requireConfirmation` | boolean | localStorage |  |  |

<!-- SETTINGS_REGISTRY_CONTINUATION_TABLE_END -->

## Verification Condition

| VCC | Condition | Invocable check | Expected result | Evidence |
|---|---|---|---|---|
| `VCC-GEN-SETTINGS-02` | This continuation and part 1 form a duplicate-free settings projection and each stays below 600 lines. | `npm --prefix canvas run test:ci:unit -- chat.responseContract.docs.agenticOsPromptContractCanonical` | The focused case reports a non-zero test count and exits 0. | None recorded in this document |
