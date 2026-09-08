import { execTest, TestResult } from './testRunnerUtils'

export const runNodeOnlyInteractionTests = async (results: TestResult[]) => {
    const modPointerDrag = await import('../../__tests__/pointerDragUnstickOnAnyPointerDownRegression.test')
    await execTest(results, 'ui.pointerDrag.unstickOnAnyPointerDown', modPointerDrag.testPointerDragUnsticksOnAnyPointerDown)
    await execTest(results, 'ui.pointerDrag.watchdogTimeout', modPointerDrag.testPointerDragHasWatchdogTimeout)
    await execTest(results, 'ui.pointerDrag.coalescesMoveHandlersOnAnimationFrames', modPointerDrag.testPointerDragCoalescesMoveHandlersOnAnimationFrames)

    const modPointerDragTarget = await import('../../__tests__/pointerDragTargetElementResolutionRegression.test')
    await execTest(
      results,
      'ui.pointerDrag.targetElementResolution.composedPathFallback',
      modPointerDragTarget.testPointerDragResolvesElementTargetFromComposedPath,
    )

    const modPointerDragDocEl = await import('../../__tests__/pointerDragDocumentElementCaptureFallbackRegression.test')
    await execTest(
      results,
      'ui.pointerDrag.pointerCapture.documentElementFallback',
      modPointerDragDocEl.testPointerDragFallsBackToDocumentElementForPointerCapture,
    )

    const modPointerDragViewportReset = await import('../../__tests__/pointerDragUnstickResetsViewportControllersRegression.test')
    await execTest(
      results,
      'ui.pointerDrag.unstick.resetsViewportControllers',
      modPointerDragViewportReset.testPointerDragUnstickResetsViewportControllersWhenActive,
    )

    const modPointerDragInstall = await import('../../__tests__/pointerDragInstallsUnstickAndIframeBlockRegression.test')
    await execTest(
      results,
      'ui.pointerDrag.unstick.installsAndIframeBlock',
      modPointerDragInstall.testPointerDragInstallsUnstickAndTogglesIframeBlockClass,
    )

    const modOverlayUnstick = await import('../../__tests__/useOverlayInteractions2dUnstickRegression.test')
    await execTest(
      results,
      'ui.overlayInteractions2d.cancelsOnPointerDownAndVisibility',
      modOverlayUnstick.testOverlayInteractions2dCancelsOnPointerDownAndVisibilityChange,
    )
    await execTest(results, 'ui.overlayInteractions2d.watchdogTimeout', modOverlayUnstick.testOverlayInteractions2dHasWatchdogTimeout)

    const modGraphCanvasDragPointerCapture = await import('../../__tests__/graphCanvasNodeDragPointerCaptureRegression.test')
    await execTest(
      results,
      'ui.graphCanvas.drag.pointerCaptureAndFailsafe',
      modGraphCanvasDragPointerCapture.testGraphCanvasDragSetsPointerCaptureAndHasFailsafePointerDown,
    )

    const modGraphCanvasRootOverlayHideSet = await import('../../__tests__/graphCanvasRootOverlayHideSetPrefersPlannedOverMountedRegression.test')
    await execTest(
      results,
      'ui.graphCanvasRoot.overlays.hideSet.prefersPlanned',
      modGraphCanvasRootOverlayHideSet.testGraphCanvasRootPrefersPlannedOverlayHideSet,
    )

    const modThreeTableAllowed = await import('../../__tests__/threeGraphAllowsTableOverlaysInMultiDimRegression.test')
    await execTest(
      results,
      'ui.threeGraph.tableOverlays.allowedInMultiDim',
      modThreeTableAllowed.testThreeGraphAllowsTableOverlaysEvenInMultiDimMode,
    )

    const modVoxelSeed = await import('../../__tests__/voxelSeedGroundPlane.test')
    await execTest(
      results,
      'three.voxel.seed.snappedXyGroundPlane.fullStackJson',
      modVoxelSeed.testVoxelModeSeedsOntoSnappedXyGroundPlaneFromFullStackJson,
    )


    const modD3ScenePreserve = await import('../../__tests__/d3SceneRebuildPreservesSimPositionsRegression.test')
    await execTest(
      results,
      'ui.d3Scene.rebuild.preservesSimPositions',
      modD3ScenePreserve.testD3SceneRebuildPreservesSimulationPositions,
    )


    const modGraphCanvasRootPanelOnlyUngated = await import('../../__tests__/graphCanvasRootPanelOnlyHideNotGatedByMarkdownRegression.test')
    await execTest(
      results,
      'ui.graphCanvasRoot.panelOnly.hide.ungated',
      modGraphCanvasRootPanelOnlyUngated.testGraphCanvasRootPanelOnlyHideIsNotGatedByMarkdownOverlayEnabled,
    )

    const modD3PresentationOverlayKey = await import('../../__tests__/d3PresentationUpdatesIncludeMediaOverlayKeyRegression.test')
    await execTest(
      results,
      'ui.d3Presentation.key.includesMediaOverlay',
      modD3PresentationOverlayKey.testD3PresentationUpdatesKeyIncludesMediaOverlayIds,
    )

    const modStrictOverlapSettled = await import('../../__tests__/strictOverlapDoesNotRunWhenSettledRegression.test')
    await execTest(
      results,
      'ui.physics2d.strictOverlap.noLateJumps',
      modStrictOverlapSettled.testStrictOverlapDoesNotRunWhenSettled,
    )

    const modGraphCanvasRootGraphBlockPanelFallback = await import('../../__tests__/graphCanvasRootGraphBlockPanelDoesNotDropMissingPositionsRegression.test')
    await execTest(
      results,
      'ui.graphCanvasRoot.graphBlockPanel.offscreenFallback',
      modGraphCanvasRootGraphBlockPanelFallback.testGraphCanvasRootGraphBlockPanelDoesNotDropNodesWithoutPositions,
    )

    const modWorkspaceOverlayContract = await import('../../__tests__/workspaceEditorOverlayPointerContract.test')
    await execTest(
      results,
      'ui.workspaceEditor.overlay.pointerContract.noBlockingScrim',
      modWorkspaceOverlayContract.testWorkspaceEditorOverlayDoesNotInstallBlockingScrim,
    )
    await execTest(
      results,
      'ui.graphDataTable.overlay.pointerContract.noFullscreenScrim',
      modWorkspaceOverlayContract.testGraphDataTableOverlayDoesNotUseFullscreenScrim,
    )
    await execTest(
      results,
      'ui.workspaceEditor.overlay.designCanvas.noLayoutMutation',
      modWorkspaceOverlayContract.testWorkspaceEditorOverlayDoesNotMutateDesignCanvasLayout,
    )
    await execTest(
      results,
      'ui.workspaceEditor.overlay.canvasViewport.noShrink',
      modWorkspaceOverlayContract.testWorkspaceEditorOverlayDoesNotShrinkCanvasViewport,
    )
    await execTest(
      results,
      'ui.workspaceEditor.overlay.resizeHandle.dragDirection',
      modWorkspaceOverlayContract.testWorkspaceEditorOverlayResizeHandleDragDirection,
    )
    await execTest(
      results,
      'ui.workspaceEditor.overlay.defaultSplit.halfViewport',
      modWorkspaceOverlayContract.testWorkspaceEditorOverlayDefaultSplitInitializesAtHalfViewport,
    )

    const modLaunchImportContract = await import('../../__tests__/launchImportFallbackFileListSnapshotContract.test')
    await execTest(
      results,
      'ui.toolbar.launch.import.fallback.snapshotsFileList',
      modLaunchImportContract.testLaunchImportFallbackSnapshotsFileListBeforeClearingInput,
    )
    await execTest(
      results,
      'ui.toolbar.launch.newMarkdown.sharedDocsCreator',
      modLaunchImportContract.testLaunchDropdownNewMarkdownUsesSharedDocsCreator,
    )
    await execTest(
      results,
      'ui.toolbar.launch.home.canonicalAirvioOrigin',
      modLaunchImportContract.testLaunchDropdownHomeUsesCanonicalAirvioOrigin,
    )
    await execTest(
      results,
      'ui.workspaceEditor.overlay.d3SceneLayoutWrites.gated',
      modWorkspaceOverlayContract.testWorkspaceEditorOverlayGatesD3SceneLayoutWrites,
    )

    const modWorkspaceCanvasPaneOpenGuard = await import('../../__tests__/workspaceCanvasPaneOpenEditorGuard.test')
    await execTest(
      results,
      'ui.workspaceEditor.overlay.canvasPaneOpen.explicitCloseRespected',
      modWorkspaceCanvasPaneOpenGuard.testWorkspaceCanvasPaneOpenCanCloseWhileEditorMode,
    )

    const modMarkdownWorkspaceGraphDataChurn = await import('../../__tests__/markdownWorkspaceAvoidsGraphDataChurnRegression.test')
    await execTest(
      results,
      'ui.markdownWorkspace.avoidsGraphDataChurnSubscriptions',
      modMarkdownWorkspaceGraphDataChurn.testMarkdownWorkspaceAvoidsGraphDataIdentityChurnSubscriptions,
    )

    const modComposedWritebackManual = await import('../../__tests__/composedPositionWritebackIsManualRegression.test')
    await execTest(
      results,
      'store.composedPositionWriteback.manualOnly',
      modComposedWritebackManual.testComposedPositionWritebackIsManualOnly,
    )

    const modDetailsMenuPortal = await import('../../__tests__/detailsMenuPortalNoFullscreenBlockerRegression.test')
    await execTest(
      results,
      'ui.detailsMenu.portal.noFullscreenBlocker',
      modDetailsMenuPortal.testDetailsMenuPortalDoesNotInstallBlockingFullscreenLayer,
    )

    const modMarquee = await import('../../__tests__/marqueeSelectionClearsOnBlurRegression.test')
    await execTest(results, 'ui.d3.marqueeSelection.failsafeCancels', modMarquee.testMarqueeSelectionHasGlobalCancelFailsafe)

    const modArrayPatch = await import('../../__tests__/sharedArrayPatchHelpersRegression.test')
    await execTest(results, 'ui.shared.arrayPatchHelpers.basic', modArrayPatch.testPatchArrayHelpersBehaveAndAvoidUnnecessaryCopies)

    const modOverlayCursor = await import('../../__tests__/overlayDragCursorTrackingRegression.test')
    await execTest(results, 'ui.overlay.drag.cursorTracking.noSnapDuringMove.d3', modOverlayCursor.testOverlayHeaderDragDisablesGridSnapDuringMove)
    await execTest(results, 'ui.overlay.drag.edgeTracking.d3.xySyncedDuringDrag', modOverlayCursor.testOverlayHeaderDragKeepsNodeXySyncedDuringDrag)
    await execTest(results, 'ui.overlay.drag.coalescesMoves.rafValueScheduler', modOverlayCursor.testOverlayInteractions2dUsesRafValueSchedulerForDragMoves)
    await execTest(results, 'ui.overlay.drag.edgeTracking.d3.forcesTickRedraw', modOverlayCursor.testOverlayHeaderDragForcesTickRedrawDuringDrag)
    await execTest(results, 'ui.overlay.drag.cursorTracking.noSnapDuringMove.flow', modOverlayCursor.testFlowCanvasOverlayHeaderDragDisablesGridSnapDuringMove)
    await execTest(results, 'ui.overlay.drag.cursorTracking.noSnapDuringMove.design', modOverlayCursor.testDesignCanvasOverlayHeaderDragDisablesGridSnapDuringMove)
    await execTest(results, 'ui.overlay.pan.cursorTracking.ignoresSpeedMultipliers', modOverlayCursor.testOverlayPanIgnoresSpeedMultipliersForCursorTracking)
    await execTest(results, 'ui.overlay.schedule.includesMarkdownOverlays', modOverlayCursor.testGraphCanvasRootOverlayScheduleIncludesMarkdownOverlays)
    await execTest(results, 'ui.overlay.edges.panelNodes.pixelConstantPadOut', modOverlayCursor.testPanelNodeEdgeEndpointsUsePixelConstantPadOut)

    const modStoryboardFixedCardPerf = await import('../../__tests__/storyboardFixedCardOverlayPerformanceRegression.test')
    await execTest(results, 'ui.storyboard.fixedCardOverlay.skipsNoopTransformWrites', modStoryboardFixedCardPerf.testStoryboardFixedCardOverlaySkipsNoopTransformWrites)

    const modRichMediaEditorDrag = await import('../../__tests__/richMediaPanelEditorModeDragRegression.test')
    await execTest(results, 'ui.richMediaPanel.d3Overlay.wheelForwardsBeforeScrollableBody', modRichMediaEditorDrag.testD3RichMediaOverlayForwardsWheelBeforeScrollableBody)

    const modRichMediaOpenWidgetExclusion = await import('../../__tests__/storyboardWidgetRichMediaPanelOpenWidgetExclusionRegression.test')
    await execTest(
      results,
      'ui.storyboardWidget.richMediaPanel.openWidgetEligibility.includesPanels',
      modRichMediaOpenWidgetExclusion.testStoryboardWidgetOpenWidgetEligibilityIncludesRichMediaPanels,
    )
    await execTest(
      results,
      'ui.storyboardWidget.richMediaPanel.overlayIds.keepExplicitPanels',
      modRichMediaOpenWidgetExclusion.testDeriveOpenWidgetOverlayNodeIdsKeepsRichMediaPanelsWhenExplicitlyOpened,
    )
    await execTest(
      results,
      'ui.storyboardWidget.richMediaPanel.remove.closesCanonicalFloatingPanelIds',
      modRichMediaOpenWidgetExclusion.testStoryboardWidgetRemoveClosesCanonicalRichMediaPanelIds,
    )
    await execTest(
      results,
      'ui.richMediaPanel.overlayRemove.resolvesCanonicalOpenWidgetIds',
      modRichMediaOpenWidgetExclusion.testFlowCanvasRichMediaOverlayRemoveResolvesCanonicalOpenWidgetIds,
    )
    await execTest(
      results,
      'ui.storyboardWidget.cardOverlayRemove.resolvesCanonicalCardIds',
      modRichMediaOpenWidgetExclusion.testStoryboardCardOverlayRemoveResolvesCanonicalCardIds,
    )
    await execTest(
      results,
      'ui.graphOverlay.remove.clearsPendingProjectionBeforeAuthorities',
      modRichMediaOpenWidgetExclusion.testGraphOverlayRemovalClearsPendingProjectionBeforeSourceAndDraft,
    )
    await execTest(
      results,
      'ui.storyboardWidget.remove.publishesDraftImmediately',
      modRichMediaOpenWidgetExclusion.testStoryboardWidgetRemovalPublishesDraftStateImmediately,
    )
    await execTest(
      results,
      'ui.storyboardWidget.richMediaPanel.graphState.noStoreGraphFallback',
      modRichMediaOpenWidgetExclusion.testFlowCanvasGraphStateDoesNotFallbackToStoreGraphForStoryboardWidgetWhenOverrideIsEmpty,
    )
    await execTest(
      results,
      'ui.storyboardWidget.richMediaPanel.storyboardCanvasOwnedPanels.hideFlowBackingOverlay',
      modRichMediaOpenWidgetExclusion.testStoryboardCardSurfaceSuppressesCanvasOwnedRichMediaBackingOverlay,
    )
    await execTest(
      results,
      'ui.storyboardWidget.richMediaPanel.blankPanel.usesPanelOverlay',
      modRichMediaOpenWidgetExclusion.testBlankRichMediaPanelUsesPanelOverlayInsteadOfFlowNodeGlyph,
    )
    await execTest(
      results,
      'ui.storyboardWidget.richMediaPanel.blankPanels.keepOverlayOwnership',
      modRichMediaOpenWidgetExclusion.testBlankRichMediaPanelsStayOverlayOwnedBesideMeaningfulPanel,
    )
    await execTest(
      results,
      'ui.storyboardWidget.richMediaPanel.sharedSurface.suppressesDuplicateOverlays',
      modRichMediaOpenWidgetExclusion.testStoryboardSharedSurfaceSuppressesOpenRichMediaWidgetDuplicateOverlay,
    )

    const modGdtDrag = await import('../../__tests__/graphDataTableDragUsesSharedPointerDragRegression.test')
    await execTest(results, 'ui.graphDataTable.drag.usesSharedPointerDrag', modGdtDrag.testGraphDataTableDoesNotInstallGlobalMouseDragListeners)
    await execTest(results, 'ui.graphDataTable.frozenDrag.usesSharedPointerDrag', modGdtDrag.testFrozenAreaDragUsesSharedPointerDrag)

    const modFloatingPanels = await import('../../__tests__/floatingPanelsUseSharedPointerDragRegression.test')
    await execTest(results, 'ui.toolMenu.drag.usesSharedPointerDrag', modFloatingPanels.testToolMenuDragUsesSharedPointerDrag)
    await execTest(results, 'ui.spotlight.drag.usesSharedPointerDrag', modFloatingPanels.testSpotlightCardDragUsesSharedPointerDrag)
    await execTest(results, 'ui.floatingPanel.defaultGeometry.commandPanelAligned', modFloatingPanels.testFloatingPanelDefaultGeometryMatchesCanvasCommandPanel)

    const modAuxDrags = await import('../../__tests__/canvasAuxDragsUseSharedPointerDragRegression.test')
    await execTest(results, 'ui.minimap.drag.usesSharedPointerDrag', modAuxDrags.testMinimapDragUsesSharedPointerDrag)
    await execTest(results, 'ui.preview.zoomPanViewport.usesSharedPointerDrag', modAuxDrags.testPreviewZoomPanViewportUsesSharedPointerDrag)
    await execTest(results, 'ui.preview.mermaid.codeblockPan.usesSharedPointerDrag', modAuxDrags.testMermaidCodeblockPanUsesSharedPointerDrag)

    const modRecovery = await import('../../__tests__/interactionRecoveryResetsViewportControllersRegression.test')
    await execTest(results, 'ui.interactionRecovery.resetsViewportControllers', modRecovery.testInteractionRecoveryResetsViewportControllers)
    await execTest(results, 'ui.flow.viewportController.exposedForRecovery', modRecovery.testFlowCanvasRegistersViewportControllerDestroy)

    const modMainPanelChurn = await import('../../__tests__/mainPanelDragNoChurnRegression.test')
    await execTest(results, 'ui.mainPanel.drag.noChurn', modMainPanelChurn.testMainPanelDragUsesSharedPointerDragAndRaf)

    const modMediaAnchor = await import('../../__tests__/mediaAnchorUsesFxFyFallbackRegression.test')
    await execTest(results, 'ui.mediaAnchor.fxFyFallback', modMediaAnchor.testReadNodeCenterWorld2dFallsBackToFxFy)

    const modHoverTooltip = await import('../../__tests__/hoverTooltipNonBlockingRegression.test')
    await execTest(results, 'ui.hoverTooltip.nonInteractiveDefault', modHoverTooltip.testGraphHoverTooltipIsNonInteractiveByDefault)
    await execTest(results, 'ui.hoverTooltip.canvasRootExplicitInteractivity', modHoverTooltip.testGraphCanvasRootDeclaresHoverTooltipInteractivity)
    await execTest(results, 'ui.hoverTooltip.sharedPanelFrameSurface', modHoverTooltip.testGraphHoverTooltipReusesSharedPanelFrameSurface)
    await execTest(results, 'ui.hoverTooltip.sharedDragResizeInteraction', modHoverTooltip.testGraphHoverTooltipReusesSharedDragResizeInteraction)
    await execTest(results, 'ui.hoverTooltip.sharedSemanticKey', modHoverTooltip.testGraphHoverTooltipUsesSharedSemanticKey)
    await execTest(results, 'ui.hoverTooltip.rendersSharedPanelFrameSurface', modHoverTooltip.testGraphHoverTooltipRendersSharedPanelFrameSurface)
    await execTest(results, 'ui.hoverTooltip.pinnedPanelDragResize', modHoverTooltip.testGraphHoverTooltipPinnedPanelCanDragAndResize)
    await execTest(results, 'ui.hoverTooltip.bridgesPointerGapToPanel', modHoverTooltip.testGraphHoverTooltipBridgesPointerGapToPanel)

    const modThreeOverlayUnstick = await import('../../__tests__/threeOverlayDragUnstickRegression.test')
    await execTest(results, 'ui.three.overlayDrag.globalFailsafe', modThreeOverlayUnstick.testThreeGraphHasOverlayDragGlobalFailsafe)

    const modThreeGroupResizeUnstick = await import('../../__tests__/threeGroupResizeUnstickRegression.test')
    await execTest(results, 'ui.three.groupResize.globalFailsafe', modThreeGroupResizeUnstick.testThreeGroupResizeHasGlobalPointerFailsafe)

    const modXrViewportControlsOwnership = await import('../../__tests__/xrViewportControlsOwnership.test')
    await execTest(
      results,
      'ui.three.xrObjectDrag.synchronousViewportOwnership',
      modXrViewportControlsOwnership.testXrObjectInputOwnershipPublishesSynchronously,
    )
    await execTest(
      results,
      'ui.three.xrObjectDrag.suppressesOrbitControls',
      modXrViewportControlsOwnership.testThreeObjectDragSuppressesOrbitControlsBeforePointerMove,
    )
    await execTest(
      results,
      'ui.three.objectDrag.synchronousViewportOwnership',
      modXrViewportControlsOwnership.testThreeObjectInputOwnershipPublishesSynchronously,
    )
    await execTest(
      results,
      'ui.three.xrObjectDrag.pointerOwnership',
      modXrViewportControlsOwnership.testXrViewportDragTerminationHonorsPointerOwnership,
    )
    await execTest(
      results,
      'ui.three.objectDrag.blocksNativeCameraHandlers',
      modXrViewportControlsOwnership.testThreeObjectPointerEventsBlockNativeCameraHandlers,
    )
    await execTest(
      results,
      'ui.three.objectDrag.locksCameraPoseUntilRelease',
      modXrViewportControlsOwnership.testThreeObjectCameraPoseRemainsLockedUntilRelease,
    )
    await execTest(
      results,
      'ui.three.viewportGesture.synchronousOwnership',
      modXrViewportControlsOwnership.testThreeViewportGestureOwnershipPublishesSynchronously,
    )
    await execTest(
      results,
      'ui.three.viewportGesture.ownershipSpansSettledCommit',
      modXrViewportControlsOwnership.testThreeViewportOwnershipSpansSettledCameraCommit,
    )

    const modSelectionNoDup = await import('../../__tests__/selectionNoDuplicateTocFocusRegression.test')
    await execTest(results, 'ui.selection.noDuplicateTocFocusOnRepeatedSelect', modSelectionNoDup.testSelectingSameNodeDoesNotDispatchDuplicateTocFocus)

    const modWorkspaceAutoOpenGate = await import('../../__tests__/canvasSelectionAutoOpenGatedByActiveRegression.test')
    await execTest(
      results,
      'ui.workspace.selection.canonicalizesDocsMirrorAliases',
      modWorkspaceAutoOpenGate.testCanvasSelectionSyncCanonicalizesDocsMirrorAliases,
    )
    await execTest(
      results,
      'ui.workspace.selection.doesNotAutoOpenWhenInactive',
      modWorkspaceAutoOpenGate.testCanvasSelectionDoesNotAutoOpenWorkspaceWhenInactive,
    )
    await execTest(
      results,
      'ui.workspaceAutoOpen.skipsWhenSelectionSourceChangesToEditor',
      modWorkspaceAutoOpenGate.testCanvasSelectionSyncSkipsWhenLiveSelectionSourceChangesToEditor,
    )


}
