import { runJsonLdTests } from './runners/runJsonLdTests'
import { runMarkdownTests } from './runners/runMarkdownTests'
import { runParserTests } from './runners/runParserTests'
import { runNodeOnlyInteractionTests } from './runners/runNodeOnlyInteractionTests'
import { runSchemaTests } from './runners/runSchemaTests'
import { execTest, TestResult } from './runners/testRunnerUtils'
import { initGraphDataTablePerfHarness, readGraphDataTablePerfHarness } from './perf/graphDataTableSelectionPerf'
import { TEST_CASES_PRE_PARSER } from './registry/preParserCases'
import { ALL_POST_PARSER_CASES } from './registry/postParserCases'
import type { TestCaseTuple } from './runner/testRunnerTypes'

const execTuple = async (results: TestResult[], tuple: TestCaseTuple) => {
  const [name, importPath, exportName] = tuple
  await execTest(results, name, async () => {
    const resolvedPath =
      typeof importPath === 'string' && importPath.startsWith('@/__tests__/')
        ? `../__tests__/${importPath.slice('@/__tests__/'.length)}`
        : importPath
    const mod = (await import(resolvedPath)) as Record<string, unknown>
    const fn = mod[exportName]
    if (typeof fn !== 'function') {
      throw new Error(`Missing test export: ${resolvedPath} -> ${exportName}`)
    }
    await (fn as () => void | Promise<void>)()
  })
}

const runNodeOnlyUiTests = async (results: TestResult[]) => {
  if (!(typeof window === 'undefined' || typeof document === 'undefined')) return

  const bootstrap =
    typeof document === 'undefined' ? (await import('@/tests/lib/jsdomHarness')).initJsdomHarness() : null
  if (bootstrap) {
    const w = bootstrap.dom.window as unknown as { URL?: { createObjectURL?: unknown } }
    if (w.URL && typeof w.URL.createObjectURL !== 'function') {
      ;(w.URL as unknown as { createObjectURL: () => string }).createObjectURL = () => 'blob:kg-test'
    }
  }

  try {
    const modShowOnCanvas = await import('../__tests__/markdownPreviewShowOnCanvas.test')
    await execTest(results, 'ui.markdown.preview.showOnCanvas', modShowOnCanvas.testMarkdownPreviewShowOnCanvasSelectsExpectedNode)
    await execTest(results, 'ui.markdown.preview.nativeContextMenuNoLegacyBubble', modShowOnCanvas.testMarkdownPreviewUsesNativeContextMenuWithoutLegacySelectionBubble)
    await execTest(
      results,
      'ui.markdown.preview.tokenCacheDoesNotCrossDocPath',
      modShowOnCanvas.testMarkdownPreviewTokenCacheDoesNotCrossDocumentPath,
    )
    await execTest(
      results,
      'ui.markdown.preview.viewModeSwitchDoesNotCrossDocPath',
      modShowOnCanvas.testMarkdownPreviewViewModeSwitchDoesNotCrossDocumentPath,
    )
    await execTest(
      results,
      'ui.markdown.preview.selectionHighlightsOtherSameText',
      modShowOnCanvas.testMarkdownPreviewSelectionHighlightsOtherSameText,
    )
    await execTest(
      results,
      'ui.markdown.preview.selectionHighlightsOtherSameSentence',
      modShowOnCanvas.testMarkdownPreviewSelectionHighlightsOtherSameSentence,
    )
    await execTest(
      results,
      'ui.markdown.preview.sentenceDragSelectionSurvivesPeerHighlightRender',
      modShowOnCanvas.testMarkdownPreviewSentenceDragSelectionSurvivesPeerHighlightRender,
    )

    const modSelectionScrollHighlight = await import('../__tests__/markdownSelectionScrollHighlight.test')
    await execTest(
      results,
      'ui.markdown.workspace.selectionScrollHighlight',
      modSelectionScrollHighlight.testCanvasSelectionScrollsAndHighlightsMarkdown,
    )

    const modCollapsible = await import('../__tests__/collapsibleDefaults.test')
    await execTest(
      results,
      'ui.collapsibleDefaultsCompactAndAnchoredToLsKeys',
      modCollapsible.testCollapsibleDefaultsCompactAndAnchoredToLsKeys,
    )

    const modStandaloneRewrite = await import('../__tests__/htmlCanvasStandaloneRewrite.test')
    await execTest(
      results,
      'ui.export.htmlCanvas.standaloneRewriteRewritesAllUrlAttrs',
      modStandaloneRewrite.testStandaloneSvgRewriteRewritesAllUrlAttrs,
    )

    const modSvgInject = await import('../__tests__/svgSnapshotMarkdownBlocksInject.test')
    await execTest(
      results,
      'ui.export.svgSnapshot.injectLiveMarkdownBlocks',
      modSvgInject.testInjectLiveMarkdownDesignBlocksIntoSvgMarkupEmbedsForeignObject,
    )

    await execTest(
      results,
      'ui.export.svgSnapshot.injectLiveMarkdownBlocksAnchored',
      modSvgInject.testInjectLiveMarkdownDesignBlocksIntoSvgMarkupAnchoredUsesNodeCenter,
    )

    const modSvgNodePos = await import('../__tests__/svgNodePos.test')
    await execTest(
      results,
      'ui.export.svgNodePos.extractNodePosByIdFromSvgMarkup',
      modSvgNodePos.testExtractNodePosByIdFromSvgMarkupReadsNodesAndEdges,
    )

    const modFlowCanvasFilter = await import('../__tests__/flowCanvasGraphFilterForOverlays.test')
    await execTest(
      results,
      'ui.flowCanvas.graphFilter.keepsOverlayNodes',
      modFlowCanvasFilter.testFlowCanvasDoesNotFilterGraphForOverlays,
    )
    await execTest(
      results,
      'ui.storyboardWidget.frontmatter.overlayIds.sharedEligibleNodes',
      modFlowCanvasFilter.testFrontmatterFlowOverlayIdsIncludeSharedEligibleNodes,
    )
    await execTest(
      results,
      'ui.storyboardWidget.frontmatter.overlayIds.fallbackEligibleNodes',
      modFlowCanvasFilter.testFrontmatterFlowOverlayIdsFallbackToEligibleNodesWithoutCanonicalCollective,
    )

    const modFlowCanvasBlank = await import('../__tests__/flowCanvasBlankClickClearsSelectionRegression.test')
    await execTest(
      results,
      'ui.flowCanvas.blankClick.clearsSelection',
      modFlowCanvasBlank.testFlowCanvasBlankPointerDownClearsSelection,
    )

    const modMdGraphBlocks = await import('../__tests__/markdownDesignLayoutGraphBlocks.test')
    await execTest(
      results,
      'ui.export.markdownDesignLayout.graphBlocks',
      modMdGraphBlocks.testDeriveMarkdownDesignLayoutFromGraphBlocksBuildsBlocks,
    )

    const modSvgEdgeGeom = await import('../__tests__/svgEdgeGeometry.test')
    await execTest(
      results,
      'ui.export.svgEdgeGeometry.ensureSvgHasEdgeGeometry',
      modSvgEdgeGeom.testEnsureSvgHasEdgeGeometryInjectsLines,
    )

    const modHtmlViewerEdgeMeta = await import('../__tests__/graphHtmlViewerEdgeMetaNormalize.test')
    await execTest(
      results,
      'ui.export.htmlViewer.normalizesEdgeMetaAndNodePos',
      modHtmlViewerEdgeMeta.testBuildGraphHtmlViewerNormalizesEdgeEndpointsAndNodePosFromSvg,
    )

    const modHtmlViewerPrefersMedia = await import('../__tests__/graphHtmlViewerPreferredMediaNodes.test')
    await execTest(
      results,
      'ui.export.htmlViewer.prefersVisibleMediaNodes',
      modHtmlViewerPrefersMedia.testBuildGraphHtmlViewerPrefersVisibleMediaNodes,
    )

    const modDatasetRev = await import('../__tests__/layoutDatasetKeyRevFallback.test')
    await execTest(results, 'layout.datasetKey.revFallbackUsesRevision', modDatasetRev.testLayoutDatasetKeyRevFallbackUsesRevision)

    await runNodeOnlyInteractionTests(results)

    const modDesignUnstick = await import('../__tests__/designCanvasGlobalUnstickRegression.test')
    await execTest(results, 'ui.design.globalUnstickFailsafe', modDesignUnstick.testDesignCanvasInstallsGlobalUnstickFailsafe)

    const modComposedCrudSync = await import('../__tests__/sourceFilesComposedCrudSyncRegression.test')
    await execTest(
      results,
      'ui.sourceFiles.compose.crudSync.updateNodeWritesBackToLayer',
      modComposedCrudSync.testComposedUpdateNodeSyncsToSourceFileAndRecomposes,
    )
    await execTest(
      results,
      'ui.sourceFiles.compose.crudSync.addNodePrefersActiveMarkdownSourceLayer',
      modComposedCrudSync.testComposedAddNodePrefersActiveMarkdownDocumentSourceFile,
    )
    await execTest(
      results,
      'ui.sourceFiles.compose.crudSync.addNodeSeedsActiveMarkdownSourceLayerWhenMissingGraph',
      modComposedCrudSync.testComposedAddNodeSeedsActiveMarkdownDocumentWhenGraphMissing,
    )
    await execTest(
      results,
      'ui.sourceFiles.compose.crudSync.addNodeSeedsActiveMarkdownSourceLayerWithoutPreexistingComposedGraph',
      modComposedCrudSync.testAddNodeSeedsActiveMarkdownDocumentWithoutPreexistingComposedGraph,
    )

    const modPins = await import('../__tests__/nodePositionCommitClearsPinsRegression.test')
    await execTest(
      results,
      'ui.graph.updateNode.positionCommitClearsPins',
      modPins.testUpdateNodePositionCommitClearsFxFyPins,
    )
    await execTest(
      results,
      'ui.sourceFiles.compose.positionCommitClearsPins',
      modPins.testComposedPositionCommitClearsFxFyPinsInViewAndSourceFiles,
    )

    const modPaneGate = await import('../__tests__/workspacePaneInactiveGatesBackgroundChurnRegression.test')
    await execTest(
      results,
      'ui.workspacePane.gatesMarkdownWorkspaceWhenInactive',
      modPaneGate.testEmbeddedEditorShellPassesActiveToMarkdownWorkspace,
    )
    await execTest(
      results,
      'ui.workspacePane.canvasToolbarStartsAtPaneBoundary',
      modPaneGate.testWorkspaceOpenCanvasToolbarDoesNotCoverEditorPaneControls,
    )

    const modMarkdownEditorQuickBar = await import('../__tests__/markdownEditorPaneGrammarQuickBar.test')
    await execTest(
      results,
      'ui.markdown.workspace.editorQuickBar.seedsSigilsAtCaret',
      modMarkdownEditorQuickBar.testMarkdownEditorPaneGrammarQuickBarSeedsSigilsAtTheCaret,
    )

    const modComposedPosDebounce = await import('../__tests__/sourceFilesComposedPositionDebounceRegression.test')
    await execTest(
      results,
      'ui.sourceFiles.compose.position.debouncedWriteBack',
      modComposedPosDebounce.testComposedPositionUpdateIsDebouncedToSourceFiles,
    )
    await execTest(
      results,
      'ui.sourceFiles.compose.import.skipsTransientEdgeOnlyOverwrite',
      modComposedPosDebounce.testComposedGraphSkipsTransientEdgeOnlyOverwriteWhenPendingTextParses,
    )

    const modTableDragChurn = await import('../__tests__/graphDataTableRepeatedDragNoLayoutThrashRegression.test')
    await execTest(
      results,
      'ui.graphDataTable.drag.reorderAvoidsPerMoveMeasure',
      modTableDragChurn.testGraphDataTableHeaderReorderDoesNotMeasureAllHeaderCellsOnEveryPointerMove,
    )
    await execTest(
      results,
      'ui.graphDataTable.drag.frozenIndicatorRafThrottled',
      modTableDragChurn.testGraphDataTableFrozenAreaDragIsRafThrottled,
    )
    await execTest(
      results,
      'ui.markdownDesignOverlay.drag.blockRafThrottled',
      modTableDragChurn.testMarkdownDesignOverlayBlockDragIsRafThrottled,
    )
    await execTest(
      results,
      'ui.markdownPreview.layout.noSynchronousRootMeasure',
      modTableDragChurn.testMarkdownPreviewViewerDoesNotMeasureLayoutAfterStyleWrites,
    )

    const modComposedPosNoChurn = await import('../__tests__/sourceFilesComposedPositionWritebackAvoidsComposeChurnRegression.test')
    await execTest(
      results,
      'ui.sourceFiles.compose.position.writebackUpdatesSourceLayerKeys',
      modComposedPosNoChurn.testComposedPositionWritebackUpdatesSourceLayerKeysInGraphDataMetadata,
    )

    const modZoomCommitRev = await import('../__tests__/zoomCommitIgnoresRevisionOnlyChangesRegression.test')
    await execTest(
      results,
      'ui.zoom.commit.ignoresRevisionOnlyChange',
      modZoomCommitRev.testZoomCommitDoesNotWriteWhenOnlyGraphDataRevisionChanges,
    )

    const modCoalescedScheduler = await import('../__tests__/coalescedScheduler.test')
    await execTest(
      results,
      'util.coalescedScheduler.coalescesLatestCallback',
      modCoalescedScheduler.testCoalescedSchedulerCoalescesLatestCallback,
    )
    await execTest(
      results,
      'util.coalescedScheduler.cancelPreventsCallback',
      modCoalescedScheduler.testCoalescedSchedulerCancelPreventsCallback,
    )
    await execTest(
      results,
      'util.workspaceSyncScheduler.suppressesRepeatedSignature',
      modCoalescedScheduler.testWorkspaceSyncSchedulerSuppressesRepeatedSignature,
    )
    await execTest(
      results,
      'util.workspaceSyncScheduler.runsLatestPerTaskUnderSharedKey',
      modCoalescedScheduler.testWorkspaceSyncSchedulerRunsLatestPerTaskUnderSharedKey,
    )
    await execTest(
      results,
      'util.workspaceSyncScheduler.flushNotDelayedByLaterTask',
      modCoalescedScheduler.testWorkspaceSyncSchedulerDoesNotDelayExistingFlushForLaterTask,
    )
    await execTest(
      results,
      'util.workspaceSyncScheduler.cancelDoesNotResetSignatureDedupe',
      modCoalescedScheduler.testWorkspaceSyncSchedulerCancelDoesNotResetSignatureDedupe,
    )
    await execTest(
      results,
      'util.workspaceSyncScheduler.scopeKeyKeepsLatestAcrossTaskKeysWithinSameFlush',
      modCoalescedScheduler.testWorkspaceSyncSchedulerScopeKeyKeepsLatestAcrossTaskKeysWithinSameFlush,
    )

    const modWorkspaceSourceIndex = await import('../__tests__/workspaceSourceIndexCoalescedWrites.test')
    await execTest(
      results,
      'ui.workspace.sourceIndex.coalescesWrites',
      modWorkspaceSourceIndex.testWorkspaceSourceIndexCoalescesWrites,
    )

    const modGraphRecordSync = await import('../__tests__/graphRecordDbSyncDedupeRegression.test')
    await execTest(
      results,
      'ui.graphRecord.dbSync.noModuleGlobalGuards',
      modGraphRecordSync.testGraphRecordDbSyncDoesNotUseModuleGlobalKeyGuards,
    )
    await execTest(
      results,
      'ui.graphRecord.dbSync.selectionInspectorUsesWorkspaceSyncMode',
      modGraphRecordSync.testGraphRecordSelectionInspectorUsesWorkspaceSyncModeOnly,
    )
    const modSourceFilesIngestStaleGuard = await import('../__tests__/sourceFilesIngestStaleGuard.test')
    await execTest(
      results,
      'ui.sourceFiles.ingest.staleParseGuard',
      modSourceFilesIngestStaleGuard.testSourceFilesIngestUsesParseJobGuardForStaleAsyncResults,
    )
    await execTest(
      results,
      'ui.sourceFiles.ingest.dedupesPendingSameText',
      modSourceFilesIngestStaleGuard.testSourceFilesIngestDedupesPendingParsesForSameTextHash,
    )
    await execTest(
      results,
      'workspace.selection.switch.passiveSameTextKeepsFrontmatterPreset',
      modSourceFilesIngestStaleGuard.testPassiveSameTextSourceSyncDoesNotDisableActiveFrontmatterSwitchPreset,
    )
    const modLazyLoadingGates = await import('../__tests__/lazyLoadingGatesRegression.test')
    await execTest(
      results,
      'ui.lazyLoading.gates.heavyFeatureSurfaces',
      modLazyLoadingGates.testHeavyFeatureSurfacesUseTargetedLazyLoadingGates,
    )
    const modOverlayInteractions = await import('../__tests__/overlayInteractions2dCleanupRegression.test')
    await execTest(
      results,
      'ui.overlayInteractions2d.cleanupCancelsActiveDrags',
      modOverlayInteractions.testOverlayInteractions2dCleanupCancelsActiveDrags,
    )

    const modOverlayPanelBox = await import('../__tests__/overlayPanelsUseTransformBoxRegression.test')
    await execTest(
      results,
      'ui.overlayPanels.d3RichMedia.usesTransformBox',
      modOverlayPanelBox.testD3RichMediaOverlayDoesNotForceLeftTopPanelBox,
    )
    await execTest(
      results,
      'ui.overlayPanels.markdownDesign.usesTransformBox',
      modOverlayPanelBox.testMarkdownDesignOverlayDoesNotForceLeftTopPanelBox,
    )

    const modFlowOverlayDrag = await import('../__tests__/storyboardWidgetOverlayDragUsesRafLatestSchedulerRegression.test')
    await execTest(
      results,
      'ui.storyboardWidget.widget.drag.rafLatestScheduler',
      modFlowOverlayDrag.testStoryboardWidgetEditorUsesRafLatestSchedulerForDrags,
    )

    const modWebMcpRuntime = await import('../__tests__/webMcpRuntime.test')
    const modWebMcpLifecycle = await import('../__tests__/webMcpLifecycle.test')
    await execTest(
      results,
      'agentReady.webMcpRuntime.fallbackRetry.truthfulReadiness',
      modWebMcpLifecycle.testWebMcpFallbackReadinessSurvivesHostRetryExhaustion,
    )
    const modWebMcpRuntimeReset = await import('../__tests__/webMcpRuntimeReset.test')
    await execTest(
      results,
      'agentReady.webMcpRuntime.fallbackReset.sameDocumentReinstall',
      modWebMcpRuntimeReset.testWebMcpRuntimeResetDetachesOwnedFallbackForSameDocumentReinstall,
    )
    await execTest(
      results,
      'agentReady.webMcpRuntime.lateBinding.sameOriginStoragePaths',
      modWebMcpRuntime.testWebMcpRuntimeLateBindsAndUsesSameOriginStoragePaths,
    )
    await execTest(
      results,
      'agentReady.webMcpRuntime.provideContext.toolSet',
      modWebMcpRuntime.testWebMcpRuntimeProvidesContextWhenRegisterToolIsUnavailable,
    )

    const modAgentReadyHtmlFallback = await import('../__tests__/agentReadyWebMcpHtmlFallback.test')
    await execTest(
      results,
      'agentReady.webMcpHtmlFallback.injection.requiresLifecycleContract',
      modAgentReadyHtmlFallback.testAgentReadyHtmlInjectionRequiresLifecycleContractNotToolNameCoincidence,
    )
    await execTest(
      results,
      'agentReady.webMcpHtmlFallback.lateBinding.sameOriginStoragePaths',
      modAgentReadyHtmlFallback.testAgentReadyHtmlWebMcpFallbackLateBindsAndUsesSameOriginStoragePaths,
    )
  } finally {
    bootstrap?.restore()
  }
}

export const runAllTests = async () => {
  const results: TestResult[] = []

  await runMarkdownTests(results)
  await runSchemaTests(results)
  await runJsonLdTests(results)

  const modKgcTurn = await import('./smoke/kgcTurnGeneration.smoke')
  await execTest(
    results,
    'chat.kgc.turnGeneration.parseable',
    modKgcTurn.testKgcTurnGenerationIsParseableAndStable,
  )

  const modFitAll = await import('../__tests__/fitAllTransformCentersWhenNoCoordsRegression.test')
  await execTest(
    results,
    'ui.fitAllTransform.centersWhenNoCoords',
    modFitAll.testFitAllTransformCentersWhenNoNodesHaveCoords,
  )

  const modPinnedZoom = await import('../__tests__/zoomPinnedAllowsManualRequestsRegression.test')
  await execTest(
    results,
    'ui.zoom.pinned.allowsManualRequests',
    modPinnedZoom.testZoomPinnedDoesNotBlockManualZoomRequests,
  )

  const modOverlayZoomDirection = await import('../__tests__/storyboardWidgetOverlayZoomDirectionRegression.test')
  await execTest(
    results,
    'ui.storyboardWidget.overlay.zoomDirection.widgetScaleMonotonic',
    modOverlayZoomDirection.testStoryboardWidgetCollectiveScaleDoesNotReverseZoomDirection,
  )
  await execTest(
    results,
    'ui.storyboardWidget.overlay.zoomDirection.richMediaScaleMonotonic',
    modOverlayZoomDirection.testStoryboardWidgetRichMediaCollectiveSizingDoesNotReverseZoomDirection,
  )
  await execTest(
    results,
    'ui.flowWidget.zoomLayout.proportionalScreenProjection',
    modOverlayZoomDirection.testStoryboardWidgetOverlayZoomUsesProportionalScreenProjection,
  )
    await execTest(
      results,
      'ui.flowWidget.zoomLayout.proportionalMetricProbe',
      modOverlayZoomDirection.testStoryboardWidgetOverlayMetricProbeScalesProportionallyAcrossZoom,
    )

    const modOverlayOffscreenRecovery = await import('../__tests__/storyboardWidgetOverlayOffscreenRecoveryRegression.test')
    await execTest(
      results,
      'ui.storyboardWidget.overlay.offscreenRecovery.usesOverlayCollectiveViewportState',
      modOverlayOffscreenRecovery.testStoryboardWidgetRuntimeUsesOverlayCollectiveViewportStateForRecovery,
    )
    await execTest(
      results,
      'ui.storyboardWidget.overlay.fitRecentering.clampsOverlayBoundsIntoVisibleViewport',
      modOverlayOffscreenRecovery.testStoryboardWidgetFitRecenteringClampsOverlayBoundsIntoVisibleViewport,
    )
    await execTest(
      results,
      'ui.storyboardWidget.overlay.offscreenRecovery.frontmatterLandingUsesNeutralSeedZoomWhenWorkspaceBlocked',
      modOverlayOffscreenRecovery.testStoryboardWidgetRuntimeSceneUsesNeutralSeedZoomForWorkspaceBlockedFrontmatterLanding,
    )
    await execTest(
      results,
      'ui.storyboardWidget.overlay.offscreenRecovery.skipsStaleStoreZoomFallbackForWorkspaceBlockedPinnedWidgets',
      modOverlayOffscreenRecovery.testStoryboardWidgetOverlayPlacementRuntimeSkipsStaleStoreZoomFallbackForWorkspaceBlockedPinnedWidgets,
    )
    await execTest(
      results,
      'ui.storyboardWidget.overlay.offscreenRecovery.autoSeedTransformRejectsPoisonedLastUsable',
      modOverlayOffscreenRecovery.testStoryboardWidgetRuntimeSceneNeutralizesPoisonedTransformForAutoSeededWidgets,
    )
    await execTest(
      results,
      'ui.storyboardWidget.overlay.offscreenRecovery.frontmatterWidgetsPreferAutoSeedWorldPos',
      modOverlayOffscreenRecovery.testStoryboardWidgetRuntimeScenePrefersAutoSeedWorldPosForWorkspaceBlockedFrontmatterWidgets,
    )

    const modWorkspaceVisibleViewportRecovery = await import('../__tests__/storyboardWidgetWorkspaceVisibleViewportRecovery.test')
    await execTest(
      results,
      'ui.storyboardWidget.workspaceRecovery.rejectsHugeCenteredCollective',
      modWorkspaceVisibleViewportRecovery.testStoryboardWidgetWorkspaceRecoveryRejectsHugeCenteredCollective,
    )
    await execTest(
      results,
      'ui.storyboardWidget.workspaceRecovery.fitsGenericOverlayBounds',
      modWorkspaceVisibleViewportRecovery.testStoryboardWidgetWorkspaceRecoveryFitsGenericOverlayBoundsIntoVisibleViewport,
    )
    await execTest(
      results,
      'ui.storyboardWidget.workspaceRecovery.semanticKeyNoDocumentHardcodes',
      modWorkspaceVisibleViewportRecovery.testStoryboardWidgetWorkspaceRecoveryUsesSemanticKeyAndForbidsDocumentHardcodes,
    )

    const modWorkspaceVisibleViewportD3Fit = await import('../__tests__/workspaceVisibleViewportD3FitRegression.test')
    await execTest(
      results,
      'ui.d3.workspaceVisibleViewport.subtractsLeftOccluder',
      modWorkspaceVisibleViewportD3Fit.testWorkspaceVisibleViewportSubtractsLeftOccluderForD3Fit,
    )
    await execTest(
      results,
      'ui.d3.workspaceVisibleViewport.fullyOccludedFallback',
      modWorkspaceVisibleViewportD3Fit.testWorkspaceVisibleViewportFallsBackWhenCanvasIsFullyOccluded,
    )
    await execTest(
      results,
      'ui.d3.viewportFitNodes.keepsVisibleMediaOverlayNodes',
      modWorkspaceVisibleViewportD3Fit.testGraphCanvasViewportFitNodesKeepsVisibleMediaOverlayNodes,
    )
    await execTest(
      results,
      'ui.d3.workspaceVisibleViewport.sharedOccluderContract',
      modWorkspaceVisibleViewportD3Fit.testD3WorkspaceVisibleViewportFitUsesSharedOccluderContract,
    )

    const modCanvasViewportHeavyRuntimeIntent = await import('../__tests__/canvasViewportHeavyRuntimeIntentGate.test')
    await execTest(
      results,
      'canvas.viewport.mobileHeavyRuntimeIntent.surfaceResolution',
      modCanvasViewportHeavyRuntimeIntent.testCanvasViewportHeavyRuntimeIntentSurfaceResolution,
    )
    await execTest(
      results,
      'canvas.viewport.mobileHeavyRuntimeIntent.sourceGate',
      modCanvasViewportHeavyRuntimeIntent.testCanvasViewportSourceWiresHeavyRuntimeIntentGate,
    )

  const modMinimapBounds = await import('../__tests__/minimapBoundsIgnoreMissingCoordsRegression.test')
  await execTest(
    results,
    'ui.minimap.bounds.ignoresMissingCoords',
    modMinimapBounds.testMinimapBoundsIgnoresMissingNodeCoords,
  )

  for (const tuple of TEST_CASES_PRE_PARSER) {
    await execTuple(results, tuple)
  }

  await runParserTests(results)

  for (const tuple of ALL_POST_PARSER_CASES) {
    await execTuple(results, tuple)
    if (tuple[0] === 'graph.subgraph.crud.clusterKindDerivesStyle') {
      await runNodeOnlyUiTests(results)
    }
  }

  return results
}

declare global {
  interface Window {
    knowgrphRunTests?: typeof runAllTests
    knowgrphInitGraphDataTablePerf?: () => void
    knowgrphReadGraphDataTablePerf?: () => {
      count: number
      avgMs: number
      p95Ms: number
      maxMs: number
    }
  }
}

if (
  typeof window !== 'undefined' &&
  typeof document !== 'undefined' &&
  import.meta &&
  (import.meta as ImportMeta).env &&
  (import.meta as ImportMeta).env.DEV
) {
  window.knowgrphRunTests = runAllTests
  window.knowgrphInitGraphDataTablePerf = initGraphDataTablePerfHarness
  window.knowgrphReadGraphDataTablePerf = readGraphDataTablePerfHarness
}
