import { execTest, TestResult } from './testRunnerUtils'

const modSchema = () => import('@/__tests__/schema.test')
const modLayoutPositioning = () => import('@/__tests__/layoutPositioning.test')
const modLayoutDatasetKeyStable = () => import('@/__tests__/layoutDatasetKeyStable.test')
const modCanvas3dMode = () => import('@/__tests__/canvas3dMode.test')
const modCanvasXrSessionPolicy = () => import('@/__tests__/canvasXrSessionPolicy.test')
const modCanvasXrPanelSurface = () => import('@/__tests__/canvasXrPanelSurface.test')
const modCanvasXrSharedSurfaceOwnership = () => import('@/__tests__/canvasXrSharedSurfaceOwnership.test')
const modXrAgenticEcsComposition = () => import('@/__tests__/xrAgenticEcsComposition.test')
const modXrMotionReferencePackage = () => import('@/__tests__/xrMotionReferencePackage.test')
const modXrCameraMoves = () => import('@/__tests__/xrCameraMoves.test')
const modXrShootWorkflow = () => import('@/__tests__/xrShootWorkflow.test')
const modXrAnimationRuntime = () => import('@/__tests__/xrAnimationRuntime.test')
const modMotionControlRuntime = () => import('@/__tests__/motionControlRuntime.test')
const modMotionControlStartStopRace = () => import('@/__tests__/motionControlStartStopRace.test')
const modMotionCaptureLifecycleFailure = () => import('@/__tests__/motionCaptureLifecycleFailure.test')
const modMotionControlSmoothing = () => import('@/__tests__/motionControlSmoothing.test')
const modMotionControlBoundingBox = () => import('@/__tests__/motionControlBoundingBox.test')
const modMotionControlMultiObjectIdentification = () => import('@/__tests__/motionControlMultiObjectIdentification.test')
const modMotionControlCleanRoomBoundary = () => import('@/__tests__/motionControlCleanRoomBoundary.test')
const modMotionControlCapturePlatform = () => import('@/__tests__/motionControlCapturePlatform.test')
const modMotionCaptureSnapshotStability = () => import('@/__tests__/motionCaptureSnapshotStability.test')
const modMotionCaptureResearchIntegrity = () => import('@/__tests__/motionCaptureResearchIntegrity.test')
const modMotionControlCaptureInvocation = () => import('@/__tests__/motionControlCaptureInvocation.test')
const modMotionCapturePeerRuntime = () => import('@/__tests__/motionCapturePeerRuntime.test')
const modXrKeyboardChoreography = () => import('@/__tests__/xrKeyboardChoreography.test')
const modXrSubjectMotionConstraints = () => import('@/__tests__/xrSubjectMotionConstraints.test')
const modXrLegacyPositionWriterConstraints = () => import('@/__tests__/xrLegacyPositionWriterConstraints.test')
const modXrMotionControlAcceptanceConstraints = () => import('@/__tests__/xrMotionControlAcceptanceConstraints.test')
const modXrPhysicsPlayheadOwnership = () => import('@/__tests__/xrPhysicsPlayheadOwnership.test')
const modXrPhysicsHomeSceneAuthorityContract = () => import('@/__tests__/xrPhysicsHomeSceneAuthorityContract.test')
const modXrPhysicsRuntime = () => import('@/__tests__/xrPhysicsRuntime.test')
const modXrPhysicsTuning = () => import('@/__tests__/xrPhysicsTuning.test')
const modXrArPlacementRuntime = () => import('@/__tests__/xrArPlacementRuntime.test')
const modWorkspaceImportXrSpatialCaptureIngestion = () => import('@/__tests__/workspaceImportXrSpatialCaptureIngestion.test')
const modWorkspaceImportXrSpatialCaptureLaunchUrl = () => import('@/__tests__/workspaceImportXrSpatialCaptureLaunchUrl.test')
const modWorkspaceImportXrSpatialCaptureRuntime = () => import('@/__tests__/workspaceImportXrSpatialCaptureRuntime.test')
const modModelAssetRenderPayloadCache = () => import('@/__tests__/modelAssetRenderPayloadCache.test')
const modSpatialCaptureRenderPerformance = () => import('@/__tests__/spatialCaptureRenderPerformance.test')
const modGaussianSplatEditorModel = () => import('@/__tests__/gaussianSplatEditorModel.test')
const modGaussianSplatEditorSurface = () => import('@/__tests__/gaussianSplatEditorSurface.test')
const modVideoSequenceTimelinePreset = () => import('@/__tests__/videoSequenceTimelinePreset.test')
const modCanvasViewDisplayControls = () => import('@/__tests__/canvasViewDisplayControls.test')
const modCanvasViewCardWidgetDisplayControls = () => import('@/__tests__/canvasViewCardWidgetDisplayControls.test')
const modXrAssetConversion = () => import('@/__tests__/xrAssetConversionHarness.test')
const modPmfVoxelImport = () => import('@/__tests__/pmfVoxelImport.test')
const modPmfVoxelVisibility = () => import('@/__tests__/pmfVoxelVisibility.test')
const modVoxelCameraPose = () => import('@/__tests__/voxelCameraPose.test')

export const runSchemaTests = async (results: TestResult[]) => {
  await execTest(results, 'schema.validateDefaults', async () => {
    const mod = await modSchema()
    await mod.testValidateSchemaFillsDefaults()
  })
  await execTest(results, 'schema.behaviorDefaults', async () => {
    const mod = await modSchema()
    await mod.testValidateSchemaBehaviorDefaults()
  })
  await execTest(results, 'schema.typeCRUD', async () => {
    const mod = await modSchema()
    await mod.testAddRenameRemoveNodeType()
  })
  await execTest(results, 'schema.nodePropertyCRUD', async () => {
    const mod = await modSchema()
    await mod.testUpsertRemoveNodeProperty()
  })
  await execTest(results, 'schema.alphaDecayClamp', async () => {
    const mod = await modSchema()
    await mod.testClampAlphaDecay()
  })
  await execTest(results, 'schema.collisionRadiusClamp', async () => {
    const mod = await modSchema()
    await mod.testClampCollisionRadiusUsesSharedBounds()
  })
  await execTest(results, 'schema.semanticNodeRadiusUsesProps', async () => {
    const mod = await modSchema()
    await mod.testRenderNodeRadiusSemanticRespectsNodeSizeAndImportance()
  })
  await execTest(results, 'layout.positioning.cacheKeyAndSkip', async () => {
    const mod = await modLayoutPositioning()
    await mod.testLayoutPositioningSkipsReseedOnToggle()
  })
  await execTest(results, 'layout.positioning.cacheKeyUsesRenderVariant', async () => {
    const mod = await modLayoutPositioning()
    await mod.testLayoutPositioningCacheKeyUsesRenderVariant()
  })
  await execTest(results, 'layout.positioning.variantChangeForcesLayout', async () => {
    const mod = await modLayoutPositioning()
    await mod.testLayoutPositioningForcesLayoutWhenVariantChanges()
  })
  await execTest(results, 'layout.datasetKey.stableAcrossRevision', async () => {
    const mod = await modLayoutDatasetKeyStable()
    await mod.testLayoutDatasetKeyStableAcrossRevision()
  })
  await execTest(results, 'canvas.3dMode.geospatialGuard', async () => {
    const mod = await modCanvas3dMode()
    await mod.testVoxelModeRejectsGeospatialMode()
  })
  await execTest(results, 'canvas.viewSelection.xrSurfaceMode', async () => {
    const mod = await modCanvasXrSharedSurfaceOwnership()
    await mod.testXrModeNormalizesAndCanvasViewSelectionActivatesSurface()
  })
  await execTest(results, 'canvas.xrMode.storeActivationSharedOwner', async () => {
    const mod = await modCanvasXrSharedSurfaceOwnership()
    await mod.testCanvasStoreRoutesXrActivationThroughSharedOwner()
  })
  await execTest(results, 'canvas.xrMode.nativeSessionPolicy', async () => {
    const mod = await modCanvasXrSessionPolicy()
    await mod.testXrSessionPolicyPrefersNativeArWithoutProviderDependency()
  })
  await execTest(results, 'canvas.xrMode.panelSurface', async () => {
    const mod = await modCanvasXrPanelSurface()
    await mod.testXrModeUsesCanonicalFloatingPanel()
  })
  await execTest(results, 'canvas.xrMode.sharedSurfaceOwnershipBoundaries', async () => {
    const mod = await modCanvasXrSharedSurfaceOwnership()
    await mod.testXrSceneSurfaceOwnershipSourceBoundaries()
  })
  await execTest(results, 'canvas.xrMode.agenticEcsCompositionBoundary', async () => {
    const mod = await modXrAgenticEcsComposition()
    await mod.testXrAgenticEcsCompositionBoundaryRemainsExplicit()
  })
  await execTest(results, 'canvas.xrMode.motionReferencePackage', async () => {
    const mod = await modXrMotionReferencePackage()
    await mod.testXrMotionReferencePackageIsNativeDeterministicAndGraphBacked()
  })
  await execTest(results, 'canvas.xrMode.cameraMoves', async () => {
    const mod = await modXrCameraMoves()
    await mod.testXrCameraMovesRideSubjectsAndExport()
  })
  await execTest(results, 'canvas.xrMode.shootWorkflow', async () => {
    const mod = await modXrShootWorkflow()
    await mod.testXrShootWorkflowMarksRigsRetimeAndExports()
  })
  await execTest(results, 'canvas.xrMode.animationRuntime', async () => {
    const mod = await modXrAnimationRuntime()
    await mod.testXrAnimationRuntimeIsNativeInvocableAndExportable()
  })
  await execTest(results, 'canvas.xrMode.motionControlRuntime', async () => {
    const mod = await modMotionControlRuntime()
    await mod.testMotionControlRuntimeIsLiteRtInvocableAndXrReady()
  })
  await execTest(results, 'canvas.xrMode.motionControlStartStopRace', async () => {
    const mod = await modMotionControlStartStopRace()
    await mod.testMotionControlExplicitStopCancelsConcurrentStart()
  })
  await execTest(results, 'canvas.xrMode.motionControlSmoothing', async () => {
    const mod = await modMotionControlSmoothing()
    await mod.testMotionControlSmoothingIsInferenceRateInvariant()
  })
  await execTest(results, 'canvas.xrMode.motionControlWebMcpRuntime', async () => {
    const mod = await modMotionControlRuntime()
    await mod.testMotionControlWebMcpReusesCanonicalXrTargets()
  })
  await execTest(results, 'canvas.xrMode.motionControlBoundingBoxRuntime', async () => {
    const mod = await modMotionControlBoundingBox()
    await mod.testMotionControlBoundingBoxReusesTrackedRoiAndDefaultsOff()
  })
  await execTest(results, 'canvas.xrMode.motionControlBoundingBoxInvocation', async () => {
    const mod = await modMotionControlBoundingBox()
    await mod.testMotionControlBoundingBoxIsStrictlyInvocableWithoutCamera()
  })
  await execTest(results, 'canvas.xrMode.motionControlMultiObjectIdentification', async () => {
    const mod = await modMotionControlMultiObjectIdentification()
    await mod.testMotionControlBoundingBoxIdentifiesAllAuthoredXrSubjects()
  })
  await execTest(results, 'canvas.xrMode.motionControlCleanRoomBoundary', async () => {
    const mod = await modMotionControlCleanRoomBoundary()
    await mod.testMotionControlProductionRemainsCleanRoomAndDependencyFree()
  })
  await execTest(results, 'canvas.xrMode.motionControlCapturePlatform', async () => {
    const mod = await modMotionControlCapturePlatform()
    await mod.testMotionCapturePlatformIsProviderNeutralBoundedAndEvidenceGraded()
  })
  await execTest(results, 'canvas.xrMode.motionCaptureSnapshotStability', async () => {
    const mod = await modMotionCaptureSnapshotStability()
    await mod.testMotionCaptureUiSnapshotsStayStableForReactExternalStores()
  })
  await execTest(results, 'canvas.xrMode.motionCaptureLifecycleFailure', async () => {
    const mod = await modMotionCaptureLifecycleFailure()
    await mod.testMotionCaptureLifecycleTeardownIsFailureSafe()
  })
  await execTest(results, 'canvas.xrMode.motionCaptureResearchIntegrity', async () => {
    const mod = await modMotionCaptureResearchIntegrity()
    await mod.testMotionCaptureResearchGradePreservesRecordingLocalEvidence()
  })
  await execTest(results, 'canvas.xrMode.motionControlCaptureInvocation', async () => {
    const mod = await modMotionControlCaptureInvocation()
    await mod.testMotionCaptureInvocationAndWebMcpConvergeWithoutPayloadDisclosure()
  })
  await execTest(results, 'canvas.xrMode.motionCapturePeerRuntime', async () => {
    const mod = await modMotionCapturePeerRuntime()
    await mod.testMotionCapturePeerRuntimeSharesOnlyBoundedDerivedObservations()
  })
  await execTest(results, 'canvas.xrMode.keyboardChoreography', async () => {
    const mod = await modXrKeyboardChoreography()
    await mod.testXrKeyboardChoreographySharesBrowserAndMcpMotion()
  })
  await execTest(results, 'canvas.xrMode.subjectMotionConstraints', async () => {
    const mod = await modXrSubjectMotionConstraints()
    await mod.testXrSubjectMotionIsFootprintCollisionAndPhysicsAware()
  })
  await execTest(results, 'canvas.xrMode.legacyPositionWriterConstraints', async () => {
    const mod = await modXrLegacyPositionWriterConstraints()
    await mod.testXrLegacyPositionWritersAreConstrainedAndAtomic()
  })
  await execTest(results, 'canvas.xrMode.motionControl.acceptanceConstraints', async () => {
    const mod = await modXrMotionControlAcceptanceConstraints()
    await mod.testXrMotionControlAcceptanceConstraints()
  })
  await execTest(results, 'canvas.xrMode.physics.playheadOwnership', async () => {
    const mod = await modXrPhysicsPlayheadOwnership()
    await mod.testXrPhysicsPlayheadHydrationPreservesActiveOwnership()
  })
  await execTest(results, 'canvas.xrMode.physics.homeSceneAuthority', async () => {
    const mod = await modXrPhysicsHomeSceneAuthorityContract()
    await mod.testXrPhysicsHomeSceneAuthorityRejectsFallbackVariants()
  })
  await execTest(results, 'canvas.xrMode.physics.sourceIdentityLifecycle', async () => {
    const mod = await modXrSubjectMotionConstraints()
    await mod.testXrPhysicsHydrationUsesFullSourceIdentity()
  })
  await execTest(results, 'canvas.xrMode.animation.constrainedMoveObject', async () => {
    const mod = await modXrSubjectMotionConstraints()
    await mod.testXrAnimationMcpReportsConstrainedMoveObjectResolution()
  })
  await execTest(results, 'canvas.xrMode.animation.constrainedActionPath', async () => {
    const mod = await modXrSubjectMotionConstraints()
    await mod.testXrAnimationActionPathsRespectPhysicsAndSceneGeometry()
  })
  await execTest(results, 'canvas.xrMode.physics.nativeDeterministicRuntime', async () => {
    const mod = await modXrPhysicsRuntime()
    await mod.testXrPhysicsRuntimeIsNativeDeterministicAndDataDriven()
  })
  await execTest(results, 'canvas.xrMode.physics.rateInvariantContactDrag', async () => {
    const mod = await modXrPhysicsTuning()
    await mod.testXrPhysicsTuningIsRateInvariantAndRotationAware()
  })
  await execTest(results, 'canvas.xrMode.arPlacement.sessionLifecycle', async () => {
    const mod = await modXrArPlacementRuntime()
    await mod.testXrArPlacementRuntimeIsSessionScopedAndRaceSafe()
  })
  await execTest(results, 'canvas.xrMode.arPlacement.failClosedFrames', async () => {
    const mod = await modXrArPlacementRuntime()
    await mod.testXrArPlacementRuntimeRejectsInvalidAndForeignFrames()
  })
  await execTest(results, 'workspace.import.xrSpatialCapture.localPlyManifestCache', async () => {
    const mod = await modWorkspaceImportXrSpatialCaptureIngestion()
    await mod.testWorkspaceImportXrStandalonePlyLocalUsesSourceManifestCache()
  })
  await execTest(results, 'workspace.import.xrSpatialCapture.localPlyRuntimePendingPayload', async () => {
    const mod = await modWorkspaceImportXrSpatialCaptureIngestion()
    await mod.testWorkspaceImportXrStandalonePlyLocalRuntimeLoadsPendingPayload()
  })
  await execTest(results, 'workspace.import.xrSpatialCapture.localPlyRuntimeBrowserCache', async () => {
    const mod = await modWorkspaceImportXrSpatialCaptureIngestion()
    await mod.testWorkspaceImportXrStandalonePlyLocalRuntimeLoadsBrowserCacheFallback()
  })
  await execTest(results, 'workspace.import.xrSpatialCapture.localPlyRuntimeOperatorSourceRoot', async () => {
    const mod = await modWorkspaceImportXrSpatialCaptureIngestion()
    await mod.testWorkspaceImportXrStandalonePlyLocalRuntimeLoadsOperatorSourceRoot()
  })
  await execTest(results, 'workspace.import.xrSpatialCapture.urlPlyManifestCache', async () => {
    const mod = await modWorkspaceImportXrSpatialCaptureIngestion()
    await mod.testWorkspaceImportXrStandalonePlyUrlUsesCachedManifestWithoutPayloadFetch()
  })
  await execTest(results, 'workspace.import.xrSpatialCapture.urlPlyHeadMimeHint', async () => {
    const mod = await modWorkspaceImportXrSpatialCaptureLaunchUrl()
    await mod.testWorkspaceImportXrStandalonePlyUrlUsesHeadMimeHintForExtensionlessAssets()
  })
  await execTest(results, 'workspace.import.xrSpatialCapture.genericUrlSkipsSpatialProbe', async () => {
    const mod = await modWorkspaceImportXrSpatialCaptureLaunchUrl()
    await mod.testWorkspaceImportXrStandaloneGenericUrlSkipsSpatialHeadProbe()
  })
  await execTest(results, 'workspace.import.xrSpatialCapture.launchUrlBridgeFallback', async () => {
    const mod = await modWorkspaceImportXrSpatialCaptureLaunchUrl()
    await mod.testLaunchImportUrlFallsBackWhenBridgeCreatesNoWorkspacePath()
  })
  await execTest(results, 'workspace.import.xrSpatialCapture.launchLocalFilesBridgeFallback', async () => {
    const mod = await modWorkspaceImportXrSpatialCaptureLaunchUrl()
    await mod.testLaunchImportLocalFilesFallsBackWhenBridgeRejects()
  })
  await execTest(results, 'workspace.import.xrSpatialCapture.launchUrlFallbackXrMode', async () => {
    const mod = await modWorkspaceImportXrSpatialCaptureLaunchUrl()
    await mod.testLaunchImportUrlFallbackActivatesXrModeForStandalonePlyUrl()
  })
  await execTest(results, 'workspace.import.xrSpatialCapture.launchLocalFilesFallbackXrMode', async () => {
    const mod = await modWorkspaceImportXrSpatialCaptureLaunchUrl()
    await mod.testLaunchImportLocalFilesFallbackActivatesXrModeForStandalonePlyFile()
  })
  await execTest(results, 'workspace.import.xrSpatialCapture.launchFormats', async () => {
    const mod = await modWorkspaceImportXrSpatialCaptureLaunchUrl()
    await mod.testWorkspaceImportXrStandalonePlyLaunchImportFormatsStayAdvertised()
  })
  await execTest(results, 'workspace.import.xrSpatialCapture.noLegacyModelExports', async () => {
    const mod = await modWorkspaceImportXrSpatialCaptureIngestion()
    await mod.testWorkspaceImportXrStandalonePlyDoesNotAdvertiseGltfGlbExports()
  })
  await execTest(results, 'workspace.import.xrSpatialCapture.spatialRendererNoGraphFallback', async () => {
    const mod = await modWorkspaceImportXrSpatialCaptureIngestion()
    await mod.testWorkspaceImportXrStandalonePlyUsesSpatialRendererInsteadOfGraphFallback()
  })
  await execTest(results, 'workspace.import.xrSpatialCapture.runtimeCacheBudget', async () => {
    const mod = await modWorkspaceImportXrSpatialCaptureIngestion()
    await mod.testWorkspaceImportXrStandalonePlyRuntimeCachesBudgetedLoads()
  })
  await execTest(results, 'workspace.import.xrSpatialCapture.noValidationAssetHardcodes', async () => {
    const mod = await modWorkspaceImportXrSpatialCaptureIngestion()
    await mod.testWorkspaceImportXrStandalonePlyManifestForbidsValidationAssetHardcodes()
  })
  await execTest(results, 'workspace.import.xrSpatialCapture.plyParserGeometryColor', async () => {
    const mod = await modWorkspaceImportXrSpatialCaptureIngestion()
    await mod.testWorkspaceImportXrStandalonePlyParserPreservesGeometryAndColor()
  })
  await execTest(results, 'workspace.import.xrSpatialCapture.plyParserFidelityDefaults', async () => {
    const mod = await modWorkspaceImportXrSpatialCaptureRuntime()
    await mod.testWorkspaceImportXrStandalonePlyParserHandlesEndianSamplingAndPartialGaussianRows()
  })
  await execTest(results, 'workspace.import.xrSpatialCapture.runtimeCacheDedupPrune', async () => {
    const mod = await modWorkspaceImportXrSpatialCaptureRuntime()
    await mod.testWorkspaceImportXrStandalonePlyRuntimeDedupesAndBoundsParsedLoadCache()
  })
  await execTest(results, 'workspace.import.xrSpatialCapture.adaptiveRenderBudget', async () => {
    const mod = await modWorkspaceImportXrSpatialCaptureRuntime()
    await mod.testWorkspaceImportXrStandalonePlyRuntimeUsesAdaptiveRenderBudget()
  })
  await execTest(results, 'workspace.import.xrSpatialCapture.boundedGaussianSortCadence', async () => {
    const mod = await modSpatialCaptureRenderPerformance()
    await mod.testSpatialCaptureRenderStageUsesBoundedGaussianSortCadence()
  })
  await execTest(results, 'canvas.xrMode.gaussianSplatEditorModel', async () => {
    const mod = await modGaussianSplatEditorModel()
    await mod.testGaussianSplatEditorModelInspectsFiltersAndExports()
  })
  await execTest(results, 'canvas.xrMode.gaussianSplatEditorRuntime', async () => {
    const mod = await modGaussianSplatEditorModel()
    await mod.testGaussianSplatEditorRuntimePreservesSceneDrafts()
  })
  await execTest(results, 'canvas.xrMode.gaussianSplatEditorVisibilitySortParity', async () => {
    const mod = await modGaussianSplatEditorModel()
    await mod.testGaussianSplatEditorVisibilityPreservesSourceOrderAfterDegenerateSort()
  })
  await execTest(results, 'canvas.xrMode.gaussianSplatEditorSurface', async () => {
    const mod = await modGaussianSplatEditorSurface()
    await mod.testGaussianSplatEditorSurfaceIsWiredAndCleanRoom()
  })
  await execTest(results, 'workspace.import.xrSpatialCapture.workerParserTransfer', async () => {
    const mod = await modWorkspaceImportXrSpatialCaptureRuntime()
    await mod.testWorkspaceImportXrStandalonePlyRuntimeUsesTransferBackedWorkerParser()
  })
  await execTest(results, 'canvas.viewSelection.shared3dSurfaceModeOwner', async () => {
    const mod = await modCanvasXrSharedSurfaceOwnership()
    await mod.testCanvasSurfaceMode3dSelectionUsesSharedOwner()
  })
  await execTest(results, 'canvas.frontmatter.xrSharedPanelSurfaceOwner', async () => {
    const mod = await modCanvasXrSharedSurfaceOwnership()
    await mod.testXrSurfaceFrontmatterPresetActivatesXrCanvasMode()
  })
  await execTest(results, 'canvas.frontmatter.draftWorkspaceSeedNonRuntime', async () => {
    const mod = await modCanvasXrSharedSurfaceOwnership()
    await mod.testDraftWorkspaceSeedFrontmatterExitsXrAndClosesPanels()
  })
  await execTest(results, 'canvas.renderSettings.xrModeSelect', async () => {
    const mod = await modCanvas3dMode()
    await mod.testRenderSettings3dModeSelectPreservesXrMode()
  })
  await execTest(results, 'canvas.frontmatter.videoSequenceTimelineStoryboardPreset', async () => {
    const mod = await modVideoSequenceTimelinePreset()
    await mod.testVideoSequenceTimelinePresetRespectsExplicitStoryboardRenderer()
  })
  await execTest(results, 'canvas.frontmatter.panelRoutingPreset', async () => {
    const mod = await modVideoSequenceTimelinePreset()
    await mod.testCanvasFrontmatterPresetAppliesExplicitPanelRouting()
  })
  await execTest(results, 'canvas.frontmatter.strybldrGanttRoutingSerialization', async () => {
    const mod = await modVideoSequenceTimelinePreset()
    await mod.testStrybldrSerializerEmitsBottomPanelGanttRouting()
  })
  await execTest(results, 'canvas.viewDisplayControls.gridSnap.all2dRenderers', async () => {
    const mod = await modCanvasViewDisplayControls()
    await mod.testAll2dRenderersExposeSharedGridSnapDisplayControls()
  })
  await execTest(results, 'canvas.viewDisplayControls.boardLayout.all2dRenderers', async () => {
    const mod = await modCanvasViewDisplayControls()
    await mod.testAll2dRenderersExposeSharedBoardLayoutDisplayControl()
  })
  await execTest(results, 'canvas.viewDisplayControls.aspectRatio.all2dRenderers', async () => {
    const mod = await modCanvasViewDisplayControls()
    await mod.testAll2dRenderersExposeSharedAspectRatioDisplayControl()
  })
  await execTest(results, 'canvas.xrMode.glbAssetRenderGate', async () => {
    const mod = await modCanvas3dMode()
    await mod.testXrModeRendersGlbAssetDocumentsWithoutWebxrSessionGate()
  })
  await execTest(results, 'canvas.xrMode.graphSpatialStage', async () => {
    const mod = await modCanvas3dMode()
    await mod.testXrModeGraphSceneUsesDistinctSpatialStageInsteadOfPlain3dGlobe()
  })
  await execTest(results, 'canvas.xrMode.gltfAssetRenderGate', async () => {
    const mod = await modCanvas3dMode()
    await mod.testXrModeRendersGltfAssetDocumentsWithoutWebxrSessionGate()
  })
  await execTest(results, 'canvas.xrMode.flatModelFacingStability', async () => {
    const mod = await modCanvas3dMode()
    await mod.testXrModePreservesFlatModelFacingInsteadOfAutoRotatingAway()
  })
  await execTest(results, 'canvas.xrMode.modelAssetDocumentScopedRenderIdentity', async () => {
    const mod = await modCanvas3dMode()
    await mod.testXrModeModelAssetSwitchUsesDocumentScopedRenderIdentity()
  })
  await execTest(results, 'canvas.xrMode.modelAssetCameraXyzReset', async () => {
    const mod = await modCanvas3dMode()
    await mod.testXrModeModelAssetSwitchResetsCameraXyzCoordinates()
  })
  await execTest(results, 'canvas.xrMode.gltfIngestParseRenderPipeline', async () => {
    const mod = await modCanvas3dMode()
    await mod.testXrModeGltfIngestParseRenderPipelineUsesNeutralPayload()
  })
  await execTest(results, 'canvas.xrMode.modelAssetRenderPayloadCache', async () => {
    const mod = await modModelAssetRenderPayloadCache()
    await mod.testModelAssetRenderPayloadCachesPendingLocalGlbReads()
  })
  await execTest(results, 'canvas.xrMode.modelAssetRenderPayloadRevisionIdentity', async () => {
    const mod = await modModelAssetRenderPayloadCache()
    await mod.testModelAssetRenderPayloadDoesNotReuseSameLengthRevision()
  })
  await execTest(results, 'canvas.xrAsset.pngToSvgHarness.vtracerZeroToken', async () => {
    const mod = await modXrAssetConversion()
    await mod.testXrPngToSvgHarnessUsesVTracerAndZeroTokenCost()
  })
  await execTest(results, 'canvas.xrAsset.pngToSvgHarness.inputFallbacks', async () => {
    const mod = await modXrAssetConversion()
    await mod.testXrPngToSvgHarnessFallsBackBeforeToolExecution()
  })
  await execTest(results, 'canvas.xrAsset.pngToSvgHarness.pathBudget', async () => {
    const mod = await modXrAssetConversion()
    await mod.testXrPngToSvgHarnessFallsBackForPathBudget()
  })
  await execTest(results, 'canvas.xrAsset.pngTextureFidelity.glbAndGltf', async () => {
    const mod = await modXrAssetConversion()
    await mod.testXrPngToGlbAndGltfEmbedSourceTextureFidelity()
  })
  await execTest(results, 'canvas.xrAsset.generatedImageModel.centeredXyzCoordinates', async () => {
    const mod = await modXrAssetConversion()
    await mod.testXrGeneratedImageModelUsesCenteredXyzCoordinates()
  })
  await execTest(results, 'canvas.xrAsset.svgToGlbCompiler.unsafeSvgGuard', async () => {
    const mod = await modXrAssetConversion()
    await mod.testXrSvgToGlbCompilerRejectsUnsafeSvg()
  })
  await execTest(results, 'canvas.xrAsset.svgToGlbCompiler.manifestInspect', async () => {
    const mod = await modXrAssetConversion()
    await mod.testXrSvgToGlbCompilerProducesValidXrManifest()
  })
  await execTest(results, 'workspace.import.xrImage.localSvgToGlbAndGltf', async () => {
    const mod = await modXrAssetConversion()
    await mod.testXrImageLocalSvgImportCreatesSourceFilesAndModelArtifacts()
  })
  await execTest(results, 'workspace.import.xrImage.urlPngToGlbAndGltf', async () => {
    const mod = await modXrAssetConversion()
    await mod.testXrImageUrlPngImportCreatesSourceFilesAndModelArtifacts()
  })
  await execTest(results, 'workspace.import.xrImage.absoluteUrlPngFilename', async () => {
    const mod = await modXrAssetConversion()
    await mod.testXrImageUrlAbsolutePngImportPreservesLocalFilename()
  })
  await execTest(results, 'workspace.import.xrImage.absoluteUrlPngUnicodeFilename', async () => {
    const mod = await modXrAssetConversion()
    await mod.testXrImageUrlAbsolutePngImportPreservesUnicodeFilename()
  })
  await execTest(results, 'workspace.import.xrImage.githubBlobPngFilename', async () => {
    const mod = await modXrAssetConversion()
    await mod.testXrImageUrlGithubBlobPngImportNormalizesAndPreservesFilename()
  })
  await execTest(results, 'canvas.viewSelection.voxelGeospatialGuard', async () => {
    const mod = await modCanvas3dMode()
    await mod.testCanvasViewSelectionBlocksVoxelDuringGeospatialMode()
  })
  await execTest(results, 'canvas.viewSelection.rendererOptionsStaySelectable', async () => {
    const mod = await modCanvas3dMode()
    await mod.testCanvasViewRendererOptionsStaySelectableAcrossInactiveVoxelState()
  })
  await execTest(results, 'canvas.viewSelection.mobileFirstGroupedOrder', async () => {
    const mod = await modCanvas3dMode()
    await mod.testCanvasViewMenuKeepsMobileFirstGroupedOrder()
  })
  await execTest(results, 'canvas.viewSelection.timelineDisplayControl', async () => {
    const mod = await modCanvas3dMode()
    await mod.testCanvasViewTimelineToggleUsesSharedViewModeOption()
  })
  await execTest(results, 'canvas.viewSelection.minimapDisplayControl', async () => {
    const mod = await modCanvasViewDisplayControls()
    await mod.testStoryboardMinimapDisplayControlIsDisabled()
  })
  await execTest(results, 'canvas.viewSelection.cardWidgetDisplayControls', async () => {
    const mod = await modCanvasViewCardWidgetDisplayControls()
    await mod.testCardWidgetDisplayControlsAreRendererNeutral()
  })
  await execTest(results, 'canvas.viewSelection.rendererActivates2dSurface', async () => {
    const mod = await modCanvas3dMode()
    await mod.testCanvasViewRendererSelectionActivates2dSurface()
  })
  await execTest(results, 'canvas.viewSelection.storyboardWidgetLayoutRebalance', async () => {
    const mod = await modCanvas3dMode()
    await mod.testStoryboardWidgetLayoutMenuRequestsBalancedRebalance()
  })
  await execTest(results, 'canvas.3dMode.persistedGeospatialGuard', async () => {
    const mod = await modCanvas3dMode()
    await mod.testCanvas3dModeSetterRejectsVoxelWhileGeospatialModeIsPersisted()
  })
  await execTest(results, 'canvas.geospatialPreference.ignoresLegacyUnversionedTrue', async () => {
    const mod = await modCanvas3dMode()
    await mod.testGeospatialOverlayPreferenceIgnoresLegacyUnversionedTrue()
  })
  await execTest(results, 'schema.tabEnterText', async () => {
    const mod = await modSchema()
    await mod.testSchemaTabEnterText()
  })
  await execTest(results, 'schema.persistenceWrites', async () => {
    const mod = await modSchema()
    await mod.testSchemaPersistenceWrites()
  })
  await execTest(results, 'schema.resetImportTextSync', async () => {
    const mod = await modSchema()
    await mod.testResetImportSchemaTabTextSync()
  })
  await execTest(results, 'schema.resetImportApplyModifiedTextSync', async () => {
    const mod = await modSchema()
    await mod.testResetImportSchemaTabApplyModifiedSync()
  })
  await execTest(results, 'schema.uiApplyUsesLatestStoreSchema', async () => {
    const mod = await modSchema()
    await mod.testSchemaUiApplyUsesLatestStoreSchema()
  })
  await execTest(results, 'schema.uiApplyRegistrationGuardsAgainstImportRace', async () => {
    const mod = await modSchema()
    await mod.testSchemaUiApplyRegistrationGuardsAgainstImportRace()
  })
  await execTest(results, 'schema.parseSchemaTextRejectsInvalidJson', async () => {
    const mod = await modSchema()
    await mod.testParseSchemaTextRejectsInvalidJson()
  })

  await execTest(results, 'io.pmfVoxel.import.siblingRepoOptional', async () => {
    const mod = await modPmfVoxelImport()
    await mod.testPmfVoxelImportFromSiblingRepoIfPresent()
  })
  await execTest(results, 'io.pmfVoxel.resolvers.preferImportedLayerMetadata', async () => {
    const mod = await modPmfVoxelImport()
    await mod.testPmfVoxelResolversPreferImportedLayerMetadata()
  })
  await execTest(results, 'io.pmfVoxel.adapter.reusesSharedPlainObjectGuard', async () => {
    const mod = await modPmfVoxelImport()
    await mod.testGraphIoAdapterReusesSharedPlainObjectGuardForPmfDetection()
  })
  await execTest(results, 'io.pmfVoxel.parser.reusesSharedPlainObjectGuard', async () => {
    const mod = await modPmfVoxelImport()
    await mod.testPmfVoxelParserReusesSharedPlainObjectGuard()
  })
  await execTest(results, 'io.pmfVoxel.parseRoute', async () => {
    const mod = await modPmfVoxelVisibility()
    await mod.testPmfJsonRoutesToPmfVoxelParser()
  })
  await execTest(results, 'io.pmfVoxel.multilayerVisibility', async () => {
    const mod = await modPmfVoxelVisibility()
    await mod.testPmfVoxelPositionsUseMultipleLayerHeights()
  })
  await execTest(results, 'three.voxelCamera.defaultConfig', async () => {
    const mod = await modVoxelCameraPose()
    await mod.testVoxelCameraDefaultsAreStable()
  })
  await execTest(results, 'three.voxelCamera.buildIntroPose', async () => {
    const mod = await modVoxelCameraPose()
    await mod.testVoxelCameraBuildsValidIntroPoses()
  })
}
