import { execTest, TestResult } from './testRunnerUtils'

const modMarkdownExplorerWorkspaceFs = () => import('@/__tests__/markdownExplorerWorkspaceFs.test')
const modWorkspaceSeedReseedAfterStorageWipe = () => import('@/__tests__/workspaceSeedReseedAfterStorageWipe.test')
const modMarkdownWorkspaceSourceUrlSync = () => import('@/__tests__/markdownWorkspaceSourceUrlSync.test')
const modMarkdownWorkspaceRefreshFromUrl = () => import('@/__tests__/markdownWorkspaceRefreshFromUrl.test')
const modMarkdownFileTreeFolderClick = () => import('@/__tests__/markdownFileTreeFolderClick.test')
const modMarkdownWorkspaceViewerSsot = () => import('@/__tests__/markdownWorkspaceViewerSsot.test')
const modWorkspaceCellSelectPanelPlacement = () => import('@/__tests__/workspaceCellSelectPanelPlacement.test')
const modMarkdownWorkspaceRemotionViewerRenders = () => import('@/__tests__/markdownWorkspaceRemotionViewerRenders.test')
const modMarkdownGeoIntegrationTripDemo = () => import('@/__tests__/markdownGeoIntegrationTripDemo.test')
const modMarkdownPoiImagesRegistry = () => import('@/__tests__/markdownPoiImagesRegistry.test')
const modMarkdownApplyWithoutFrontmatter = () => import('@/__tests__/markdownApplyWithoutFrontmatter.test')
const modWebpageLayoutAscii = () => import('@/__tests__/webpageLayoutAscii.test')
const modWebpageMarkdownPostprocessRemotionPricing = () => import('@/__tests__/webpageMarkdownPostprocessRemotionPricing.test')
const modWebpageMarkdownPostprocessCardGrid = () => import('@/__tests__/webpageMarkdownPostprocessCardGrid.test')
const modUrlImportApiNativeReddit = () => import('@/__tests__/urlImportApiNativeReddit.test')
const modUrlImportAuthWallStub = () => import('@/__tests__/urlImportAuthWallStub.test')
const modUrlImportApiNativeJsonLd = () => import('@/__tests__/urlImportApiNativeJsonLd.test')
const modWorkspaceImportLargeWebpageMarkdownClip = () => import('@/__tests__/workspaceImportLargeWebpageMarkdownClip.test')
const modHtmlFallbackStripSvgAndFlex = () => import('@/__tests__/htmlFallbackStripSvgAndFlex.test')
const modMarkdownHtmlRichMediaAndGridPreview = () => import('@/__tests__/markdownHtmlRichMediaAndGridPreview.test')
const modMarkdownHtmlTableDivAndPicturePreview = () => import('@/__tests__/markdownHtmlTableDivAndPicturePreview.test')
const modMarkdownInlineHtmlRichMediaPreview = () => import('@/__tests__/markdownInlineHtmlRichMediaPreview.test')
const modMarkdownHtmlGridCalcGapPreview = () => import('@/__tests__/markdownHtmlGridCalcGapPreview.test')
const modHtmlToMarkdownUnifiedLayoutPreserve = () => import('@/__tests__/htmlToMarkdownUnifiedLayoutPreserve.test')
const modHtmlToMarkdownUnifiedUrlRewrite = () => import('@/__tests__/htmlToMarkdownUnifiedUrlRewrite.test')
const modMarkdownEmbedSnapshotPreview = () => import('@/__tests__/markdownEmbedSnapshotPreview.test')
const modMarkdownAsciiBlocksNormalize = () => import('@/__tests__/markdownAsciiBlocksNormalize.test')
const modMarkdownFlowInternalRefs = () => import('@/__tests__/markdownFlowInternalRefs.test')
const modMarkdownValidationExternalFile = () => import('@/__tests__/markdownValidationExternalFile.test')
const modMarkdownTemplateVarsInBlockquoteAndTable = () => import('@/__tests__/markdownTemplateVarsInBlockquoteAndTable.test')
const modMarkdownVariableReferences = () => import('@/__tests__/markdownVariableReferences.test')
const modMarkdownDataViewRoundTrip = () => import('@/__tests__/markdownDataViewRoundTrip.test')
const modMarkdownDataViewSourceMap = () => import('@/__tests__/markdownDataViewSourceMap.test')
const modMarkdownDataViewInlineEditParity = () => import('@/__tests__/markdownDataViewInlineEditParity.test')
const modMarkdownEdgelessLayout = () => import('@/__tests__/markdownEdgelessLayout.test')
const modFlowGroupAabbIncludesMembersWhenBoundsExplicit = () => import('@/__tests__/flowGroupAabbIncludesMembersWhenBoundsExplicit.test')
const modFlowCanvasFrontmatterFlowPortHandlesEnabledRegression = () => import('@/__tests__/flowCanvasFrontmatterFlowPortHandlesEnabledRegression.test')
const modFlowWidgetPinnedContainmentClampRegression = () => import('@/__tests__/flowWidgetPinnedContainmentClampRegression.test')
const modFlowWidgetFrontmatterPortHandlePadRegression = () => import('@/__tests__/flowWidgetFrontmatterPortHandlePadRegression.test')
const modFlowWidgetPortHandleDomAnchors = () => import('@/__tests__/flowWidgetPortHandleDomAnchors.test')
const modGraphDataTableCellSelectOverlay = () => import('@/__tests__/graphDataTableCellSelectOverlay.test')
const modMarkdownStickyHeadingScrollPadding = () => import('@/__tests__/markdownStickyHeadingScrollPadding.test')
const modMarkdownScrollUtils = () => import('@/__tests__/markdownScrollUtils.test')
const modMarkdownViewerInlineEditHeadingWysiwyg = () => import('@/__tests__/markdownViewerInlineEditHeadingWysiwyg.test')
const modMarkdownViewerInlineEditParagraphWysiwyg = () => import('@/__tests__/markdownViewerInlineEditParagraphWysiwyg.test')
const modMarkdownViewerInlineEditSurfaceParitySnapshot = () => import('@/__tests__/markdownViewerInlineEditSurfaceParitySnapshot.test')
const modMarkdownViewerInlineEditCodeBlockParityInteraction = () => import('@/__tests__/markdownViewerInlineEditCodeBlockParityInteraction.test')
const modMarkdownViewerInlineEditVariableToolbar = () => import('@/__tests__/markdownViewerInlineEditVariableToolbar.test')
const modMarkdownViewerInlineEditFirstInputNotClobbered = () => import('@/__tests__/markdownViewerInlineEditFirstInputNotClobbered.test')
const modMarkdownViewerVariableClickSsotNavigation = () => import('@/__tests__/markdownViewerVariableClickSsotNavigation.test')
const modMarkdownFrontmatterReadPropertiesView = () => import('@/__tests__/markdownFrontmatterReadPropertiesView.test')
const modMarkdownViewerMdDemoSweepLex = () => import('@/__tests__/markdownViewerMdDemoSweepLex.test')
const modMarkdownViewerInlineEditConfig = () => import('@/__tests__/markdownViewerInlineEditConfig.test')
const modMarkdownInlineEditToolbarConsolidation = () => import('@/__tests__/markdownInlineEditToolbarConsolidatesSelectionActions.test')
const modMarkdownLargeViewerInlineSelectionToolbar = () => import('@/__tests__/markdownLargeViewerInlineSelectionToolbar.test')
const modMarkdownViewerInlineEditMixedSequence = () => import('@/__tests__/markdownViewerInlineEditMixedSequence.test')
const modMarkdownViewerInlineEditCodeFenceLanguageSelector = () => import('@/__tests__/markdownViewerInlineEditCodeFenceLanguageSelector.test')
const modMarkdownViewerListInlineEditNoEdgeRows = () => import('@/__tests__/markdownViewerListInlineEditNoEdgeRows.test')
const modMarkdownViewerInlineEditTableReadOnlySurface = () => import('@/__tests__/markdownViewerInlineEditTableReadOnlySurface.test')
const modMultiDimTableGuidelines = () => import('@/__tests__/multiDimTableGuidelines.test')
const modToolbarWorkspaceSelectCollapsed = () => import('@/__tests__/toolbarWorkspaceSelectCollapsed.test')
const modGraphDataTableToolbarMenuPortal = () => import('@/__tests__/graphDataTableToolbarMenuPortal.test')
const modOverlayZIndexOrdering = () => import('@/__tests__/overlayZIndexOrdering.test')
const modEditorWorkspaceSelectExitsMultiDimMode = () => import('@/__tests__/editorWorkspaceSelectExitsMultiDimMode.test')
const modWorkspaceResizerHandlersAttachAfterMount = () => import('@/__tests__/workspaceResizerHandlersAttachAfterMount.test')
const modDocumentModeSelectMultiDimIsCanvasMode = () => import('@/__tests__/documentModeSelectMultiDimIsCanvasMode.test')

export const runMarkdownTests = async (results: TestResult[]) => {
  await execTest(results, 'workspaceFs.seedAndCrud', async () => {
    const mod = await modMarkdownExplorerWorkspaceFs()
    await mod.testWorkspaceFsSeedAndCrud()
  })
  await execTest(results, 'workspaceFs.seed.reseedsAfterStorageWipe', async () => {
    const mod = await modWorkspaceSeedReseedAfterStorageWipe()
    await mod.testWorkspaceEnsureSeedReseedsAfterStorageWipeWhenNotUserCleared()
  })
  await execTest(results, 'markdownExplorer.outlineAndBacklinks', async () => {
    const mod = await modMarkdownExplorerWorkspaceFs()
    await mod.testMarkdownOutlineAndBacklinks()
  })
  await execTest(results, 'markdownFileTree.folderClickKeepsSelection', async () => {
    const mod = await modMarkdownFileTreeFolderClick()
    await mod.testMarkdownFileTreeFolderClickDoesNotClearSelection()
  })
  await execTest(results, 'markdownFileTree.excludesLegacyRootsKeepsCanonicalArtifacts', async () => {
    const mod = await modMarkdownFileTreeFolderClick()
    await mod.testMarkdownFileTreeExcludesLegacyRootsAndKeepsCanonicalArtifacts()
  })
  await execTest(results, 'markdown.geospatial.tripDemoRegistersGeoDataset', async () => {
    const mod = await modMarkdownGeoIntegrationTripDemo()
    await mod.testMarkdownTripDemoJsonFenceRegistersAsGeoDataset()
  })
  await execTest(results, 'markdown.geospatial.tripDemoLoadsGraphData', async () => {
    const mod = await modMarkdownGeoIntegrationTripDemo()
    await mod.testMarkdownTripDemoJsonFenceLoadsGraphData()
  })
  await execTest(results, 'markdown.geospatial.tripDemoMmdRegistersGeoDataset', async () => {
    const mod = await modMarkdownGeoIntegrationTripDemo()
    await mod.testMarkdownTripDemoMmdJsonFenceRegistersAsGeoDataset()
  })
  await execTest(results, 'markdown.geospatial.tripDemoMmdLoadsGraphData', async () => {
    const mod = await modMarkdownGeoIntegrationTripDemo()
    await mod.testMarkdownTripDemoMmdJsonFenceLoadsGraphData()
  })
  await execTest(results, 'markdown.geospatial.markdownUrlEmbedsGeoJsonLoadsAsDataset', async () => {
    const mod = await modMarkdownGeoIntegrationTripDemo()
    await mod.testGeospatialDatasetLoaderParsesEmbeddedGeoJsonFromMarkdownUrl()
  })
  await execTest(results, 'markdown.geospatial.tripDemoMmdOverlayCacheInvalidatesBySemanticSourceContent', async () => {
    const mod = await modMarkdownGeoIntegrationTripDemo()
    await mod.testTripDemoMmdOverlayGraphDataInvalidatesSourceFileCacheBySemanticContent()
  })
  await execTest(results, 'markdown.geospatial.tripDemoMmdOverlayCacheInvalidatesDirectModeByParsedSourceGraph', async () => {
    const mod = await modMarkdownGeoIntegrationTripDemo()
    await mod.testTripDemoMmdOverlayGraphDataInvalidatesDirectModeCacheByParsedSourceGraph()
  })
  await execTest(results, 'markdown.geospatial.tripDemoMmdOverlaySkipsDisabledSourceFiles', async () => {
    const mod = await modMarkdownGeoIntegrationTripDemo()
    await mod.testTripDemoMmdOverlayGraphDataSkipsDisabledSourceFiles()
  })
  await execTest(results, 'markdown.geospatial.tripDemoMmdOverlaySkipsGeoLayerDisabledSourceFiles', async () => {
    const mod = await modMarkdownGeoIntegrationTripDemo()
    await mod.testTripDemoMmdOverlayGraphDataSkipsGeoLayerDisabledSourceFiles()
  })
  await execTest(results, 'markdown.geospatial.overlayDedupesDuplicateEmbeddedGeoJsonBlocks', async () => {
    const mod = await modMarkdownGeoIntegrationTripDemo()
    await mod.testGeospatialOverlayGraphDataDedupesDuplicateEmbeddedGeoJsonBlocks()
  })
  await execTest(results, 'markdown.geospatial.overlayDedupesDuplicateMarkdownTablePoints', async () => {
    const mod = await modMarkdownGeoIntegrationTripDemo()
    await mod.testGeospatialOverlayGraphDataDedupesDuplicateMarkdownTablePoints()
  })
  await execTest(results, 'markdown.geospatial.prefersExactSourcePathMatch', async () => {
    const mod = await modMarkdownGeoIntegrationTripDemo()
    await mod.testGeospatialOverlayGraphDataPrefersExactSourcePathMatch()
  })
  await execTest(results, 'markdown.geospatial.resolvesSourceFileFromGraphIdPath', async () => {
    const mod = await modMarkdownGeoIntegrationTripDemo()
    await mod.testGeospatialOverlayGraphDataResolvesSourceFileFromGraphIdPath()
  })
  await execTest(results, 'markdown.mediaRegistry.poiImagesEnrichMatchingNodes', async () => {
    const mod = await modMarkdownPoiImagesRegistry()
    await mod.testMarkdownPoiImagesRegistryEnrichesMatchingNodes()
  })
  await execTest(results, 'markdown.applyWithoutFrontmatterBuildsGraph', async () => {
    const mod = await modMarkdownApplyWithoutFrontmatter()
    await mod.testMarkdownApplyWithoutFrontmatterBuildsGraph()
  })
  await execTest(results, 'markdown.flow.internalRefs.resolveToFlowNodes', async () => {
    const mod = await modMarkdownFlowInternalRefs()
    await mod.testMarkdownFlowInternalRefsResolveToFlowNodes()
  })
  await execTest(results, 'markdown.validation.externalFile.parsesAndLinks', async () => {
    const mod = await modMarkdownValidationExternalFile()
    await mod.testMarkdownValidationExternalFileParsesAndLinksGraphElements()
  })
  await execTest(results, 'flow.groupAabb.explicitBoundsRemainStable', async () => {
    const mod = await modFlowGroupAabbIncludesMembersWhenBoundsExplicit()
    await mod.testFlowGroupAabbExpandsExplicitBoundsToContainMembers()
  })
  await execTest(results, 'flow.groupAabb.overlayOnlyMembersRemainVisible', async () => {
    const mod = await modFlowGroupAabbIncludesMembersWhenBoundsExplicit()
    await mod.testFlowGroupAabbUsesOverlayOnlyMemberBounds()
  })
  await execTest(results, 'flow.groupPaint.visibleAtFittedZoom', async () => {
    const mod = await modFlowGroupAabbIncludesMembersWhenBoundsExplicit()
    await mod.testFlowGroupPaintRemainsVisibleAtFittedZoom()
  })
  await execTest(results, 'flow.frontmatterFlow.portHandles.enabled', async () => {
    const mod = await modFlowCanvasFrontmatterFlowPortHandlesEnabledRegression()
    await mod.testFlowCanvasFrontmatterFlowEnablesPortHandles()
  })
  await execTest(results, 'flow.widget.pinned.clampsToContainmentGroup', async () => {
    const mod = await modFlowWidgetPinnedContainmentClampRegression()
    await mod.testFlowWidgetPinnedClampsToContainmentGroup()
  })
  await execTest(results, 'flow.widget.frontmatter.padAccountsForPortHandles', async () => {
    const mod = await modFlowWidgetFrontmatterPortHandlePadRegression()
    await mod.testFlowWidgetFrontmatterPadAccountsForPortHandles()
  })
  await execTest(results, 'flow.widget.portHandles.domAnchors', async () => {
    const mod = await modFlowWidgetPortHandleDomAnchors()
    await mod.testFlowWidgetPortHandleDomAnchorsPresent()
  })
  await execTest(results, 'markdown.templateVars.blockquoteAndTable', async () => {
    const mod = await modMarkdownTemplateVarsInBlockquoteAndTable()
    await mod.testMarkdownTemplateVarsExtractFromBlockquotesAndTables()
  })
  await execTest(results, 'markdown.templateVars.declareAndFallbackResolution', async () => {
    const mod = await modMarkdownTemplateVarsInBlockquoteAndTable()
    await mod.testMarkdownTemplateVarDeclarationAndFallbackResolution()
  })
  await execTest(results, 'markdown.templateVars.utils.parseAndCollect', async () => {
    const mod = await modMarkdownVariableReferences()
    await mod.testMarkdownVariableReferencesParsesDeclarationRefAndFallback()
    await mod.testMarkdownVariableReferencesCollectSuggestionsFromFrontmatterAndDraft()
    await mod.testMarkdownVariableReferencesBuildTokenByMode()
  })
  await execTest(results, 'markdown.dataView.infersGroupAndTitleColumns', async () => {
    const mod = await modMarkdownDataViewRoundTrip()
    await mod.testMarkdownDataViewInfersGroupAndTitleColumns()
  })
  await execTest(results, 'markdown.dataView.editsRoundTripToMarkdownTable', async () => {
    const mod = await modMarkdownDataViewRoundTrip()
    await mod.testMarkdownDataViewEditsRoundTripToMarkdownTable()
  })
  await execTest(results, 'markdown.dataView.inlineEdit.textCell.parityAndCommit', async () => {
    const mod = await modMarkdownDataViewInlineEditParity()
    await mod.testMarkdownDataViewInlineEditTextCellPreservesTdSurfaceAndCommits()
  })
  await execTest(results, 'markdown.dataView.inlineEdit.longTextCell.boundedPreview', async () => {
    const mod = await modMarkdownDataViewInlineEditParity()
    await mod.testMarkdownDataViewInlineEditLongTextCellsRenderBoundedPreviewAndEditFullValue()
  })
  await execTest(results, 'markdown.dataView.inlineEdit.largeTable.progressiveRows', async () => {
    const mod = await modMarkdownDataViewInlineEditParity()
    await mod.testMarkdownDataViewInlineEditLargeTablesRenderProgressiveRowWindow()
  })
  await execTest(results, 'markdown.dataViewSourceMap.rowIndexParsing', async () => {
    const mod = await modMarkdownDataViewSourceMap()
    await mod.testMarkdownDataViewRowIndexParsing()
  })
  await execTest(results, 'markdown.dataViewSourceMap.rowLineMapping', async () => {
    const mod = await modMarkdownDataViewSourceMap()
    await mod.testMarkdownDataViewRowLineMappingClampsToTable()
  })
  await execTest(results, 'markdown.edgeless.layoutDerivesBlocks', async () => {
    const mod = await modMarkdownEdgelessLayout()
    await mod.testMarkdownEdgelessLayoutDerivesBlocksWithStableIds()
  })
  await execTest(results, 'markdownWorkspace.sourceUrlSync', async () => {
    const mod = await modMarkdownWorkspaceSourceUrlSync()
    await mod.testMarkdownWorkspaceSyncsSourceUrlFromWorkspaceIndex()
  })
  await execTest(results, 'markdownWorkspace.refreshFromUrl', async () => {
    const mod = await modMarkdownWorkspaceRefreshFromUrl()
    await mod.testMarkdownWorkspaceRefreshFromUrlUpdatesActiveDocumentAndGraphStore()
  })
  await execTest(results, 'markdownWorkspace.viewer.ssot', async () => {
    const mod = await modMarkdownWorkspaceViewerSsot()
    await mod.testMarkdownWorkspaceViewerUsesMarkdownPreviewSsot()
  })
  await execTest(results, 'workspace.editor.cellSelectPanelPlacement.ssot', async () => {
    const mod = await modWorkspaceCellSelectPanelPlacement()
    mod.testWorkspaceCellSelectPanelPlacementDefaultsAndPersists()
  })
  await execTest(results, 'ui.graphDataTable.cellSelectOverlay.multiSelectEdits', async () => {
    const mod = await modGraphDataTableCellSelectOverlay()
    await mod.testGraphDataTableCellSelectOverlayEditsMultiSelectProperties()
  })
  await execTest(results, 'markdown.viewer.scrollPaddingTop.avoidsStickyOverlap', async () => {
    const mod = await modMarkdownStickyHeadingScrollPadding()
    mod.testMarkdownStickyHeadingScrollPaddingComputesCascadeHeight()
    mod.testMarkdownStickyHeadingScrollPaddingIsZeroWithoutHeadings()
  })
  await execTest(results, 'markdown.viewer.scrollToLine.respectsScrollPaddingTop', async () => {
    const mod = await modMarkdownScrollUtils()
    mod.testMarkdownScrollUtilsRespectsScrollPaddingTop()
    mod.testMarkdownScrollUtilsClampsTargetTopToZero()
  })
  await execTest(results, 'markdown.viewer.inlineEdit.heading.wysiwygPreservesHeight', async () => {
    const mod = await modMarkdownViewerInlineEditHeadingWysiwyg()
    await mod.testMarkdownViewerInlineEditHeadingUsesHtmlEditingAndPreservesHeight()
  })
  await execTest(results, 'markdown.viewer.inlineEdit.paragraph.wysiwyg.noBlockInsideP', async () => {
    const mod = await modMarkdownViewerInlineEditParagraphWysiwyg()
    await mod.testMarkdownViewerInlineEditParagraphDoesNotInsertBlockElementsIntoP()
  })
  await execTest(results, 'markdown.viewer.inlineEdit.paragraph.wysiwyg.plainTextNoEscapeMutation', async () => {
    const mod = await modMarkdownViewerInlineEditParagraphWysiwyg()
    await mod.testMarkdownViewerInlineEditParagraphPlainTextCommitDoesNotEscapeMarkdownChars()
  })
  await execTest(results, 'markdown.viewer.inlineEdit.surfaceParitySnapshot', async () => {
    const mod = await modMarkdownViewerInlineEditSurfaceParitySnapshot()
    await mod.testMarkdownViewerInlineEditSurfaceParitySnapshotAppliesReadSurfaceStyles()
  })
  await execTest(results, 'markdown.viewer.inlineEdit.codeBlock.surfaceParity', async () => {
    const mod = await modMarkdownViewerInlineEditCodeBlockParityInteraction()
    await mod.testMarkdownViewerInlineEditCodeBlockKeepsSurfaceLayoutParity()
  })
  await execTest(results, 'markdown.viewer.inlineEdit.codeBlock.asciiTypographyParity', async () => {
    const mod = await modMarkdownViewerInlineEditCodeBlockParityInteraction()
    await mod.testMarkdownViewerInlineEditAsciiCodeBlockKeepsCompactTypographyParity()
  })
  await execTest(results, 'markdown.viewer.inlineEdit.codeBlock.gutterSpacingParity', async () => {
    const mod = await modMarkdownViewerInlineEditCodeBlockParityInteraction()
    await mod.testMarkdownViewerInlineEditCodeBlockGutterLayoutKeepsSpacingParity()
  })
  await execTest(results, 'markdown.viewer.inlineEdit.codeBlock.toggleWordWrap.readEditParity', async () => {
    const mod = await modMarkdownViewerInlineEditCodeBlockParityInteraction()
    await mod.testMarkdownViewerCodeFenceToggleWordWrapUpdatesReadAndEditSurface()
  })
  await execTest(results, 'markdown.viewer.inlineEdit.codeBlock.toggleWordWrap.offDisablesEditWrap', async () => {
    const mod = await modMarkdownViewerInlineEditCodeBlockParityInteraction()
    await mod.testMarkdownViewerCodeFenceToggleWordWrapOffDisablesWrapInEditSurface()
  })
  await execTest(results, 'markdown.viewer.inlineEdit.codeBlock.noSyntheticBottomGap', async () => {
    const mod = await modMarkdownViewerInlineEditCodeBlockParityInteraction()
    await mod.testMarkdownViewerCodeFenceEditOpenDoesNotInjectSyntheticBottomGap()
  })
  await execTest(results, 'markdown.viewer.inlineEdit.codeBlock.singleClick.caretAtClickPosition', async () => {
    const mod = await modMarkdownViewerInlineEditCodeBlockParityInteraction()
    await mod.testMarkdownViewerCodeFenceSingleClickOpensCaretNearClickPosition()
  })
  await execTest(results, 'markdown.viewer.inlineEdit.codeBlock.singleClick.caretRespectsVerticalLinePosition', async () => {
    const mod = await modMarkdownViewerInlineEditCodeBlockParityInteraction()
    await mod.testMarkdownViewerCodeFenceSingleClickRespectsVerticalLinePosition()
  })
  await execTest(results, 'markdown.viewer.inlineEdit.codeBlock.toggleWordWrap.noEditOpen', async () => {
    const mod = await modMarkdownViewerInlineEditCodeBlockParityInteraction()
    await mod.testMarkdownViewerCodeFenceToggleWordWrapDoesNotOpenInlineEditor()
  })
  await execTest(results, 'markdown.viewer.inlineEdit.codeFence.languageSelector.updatesFenceInfo', async () => {
    const mod = await modMarkdownViewerInlineEditCodeFenceLanguageSelector()
    await mod.testMarkdownViewerCodeFenceLanguageSelectorUpdatesFenceInfoAndKeepsMetadata()
  })
  await execTest(results, 'markdown.viewer.inlineEdit.codeFence.languageSelector.autoModeNoEditorToggle', async () => {
    const mod = await modMarkdownViewerInlineEditCodeFenceLanguageSelector()
    await mod.testMarkdownViewerCodeFenceLanguageSelectorAllowsAutoModeWithoutOpeningInlineEditor()
  })
  await execTest(results, 'markdown.viewer.inlineEdit.codeFence.copyButton.explicitForbidOnly', async () => {
    const mod = await modMarkdownViewerInlineEditCodeFenceLanguageSelector()
    await mod.testMarkdownViewerCodeFenceCopyButtonRespectsExplicitForbidOnly()
  })
  await execTest(results, 'markdown.viewer.inlineEdit.variableToolbar.atInvokeAndApply', async () => {
    const mod = await modMarkdownViewerInlineEditVariableToolbar()
    await mod.testMarkdownViewerInlineEditVariableToolbarInvokesWithAtAndAppliesReference()
  })
  await execTest(results, 'markdown.viewer.inlineEdit.variableToolbar.deleteUpdatesFrontmatter', async () => {
    const mod = await modMarkdownViewerInlineEditVariableToolbar()
    await mod.testMarkdownViewerInlineEditVariableToolbarDeleteUpdatesFrontmatter()
  })
  await execTest(results, 'markdown.viewer.inlineEdit.firstInput.notClobbered', async () => {
    const mod = await modMarkdownViewerInlineEditFirstInputNotClobbered()
    await mod.testMarkdownViewerInlineEditFirstInputIsNotClobberedByInitialization()
  })
  await execTest(results, 'markdown.viewer.variableClick.ssotNavigation', async () => {
    const mod = await modMarkdownViewerVariableClickSsotNavigation()
    await mod.testMarkdownViewerVariableClickNavigatesToSsotLine()
  })
  await execTest(results, 'markdown.frontmatter.read.propertiesClickableChips', async () => {
    const mod = await modMarkdownFrontmatterReadPropertiesView()
    await mod.testMarkdownFrontmatterReadRendersClickablePropertyChips()
  })
  await execTest(results, 'markdown.viewer.sweep.mdDemo.lexesAndLineRanges', async () => {
    const mod = await modMarkdownViewerMdDemoSweepLex()
    mod.testMarkdownViewerMdDemoSweepLexesAndHasLineRanges()
  })
  await execTest(results, 'markdown.multiDimTable.guidelines.backtickJsonArrays', async () => {
    const mod = await modMultiDimTableGuidelines()
    mod.testMultiDimTableGuidelinesBacktickJsonArraysAreRespected()
  })
  await execTest(results, 'markdown.multiDimTable.guidelines.externalFile.sampleTable', async () => {
    const mod = await modMultiDimTableGuidelines()
    mod.testMultiDimTableGuidelinesExternalFileParsesSampleTableWhenPresent()
  })
  await execTest(results, 'toolbar.workspaceSelect.visibleWhenCollapsed', async () => {
    const mod = await modToolbarWorkspaceSelectCollapsed()
    mod.testToolbarAlwaysExpandedWithoutCollapseControls()
  })
  await execTest(results, 'graphTable.toolbar.menus.portalToAvoidClipping', async () => {
    const mod = await modGraphDataTableToolbarMenuPortal()
    mod.testGraphDataTableToolbarUsesPortalMenusToAvoidClipping()
  })
  await execTest(results, 'ui.overlay.zIndex.ordering', async () => {
    const mod = await modOverlayZIndexOrdering()
    mod.testAnchorOverlayZIndexIsAboveFloatingPanels()
  })
  await execTest(results, 'toolbar.workspaceSelect.exitsMultiDimMode', async () => {
    const mod = await modEditorWorkspaceSelectExitsMultiDimMode()
    mod.testEditorWorkspaceSelectExitsMultiDimModeWhenSelectingEditor()
  })
  await execTest(results, 'toolbar.documentMode.multiDim.isCanvasMode', async () => {
    const mod = await modDocumentModeSelectMultiDimIsCanvasMode()
    mod.testDocumentModeSelectMultiDimIsCanvasModeOnly()
  })
  await execTest(results, 'workspace.resizers.attachHandlers.afterMount', async () => {
    const mod = await modWorkspaceResizerHandlersAttachAfterMount()
    mod.testWorkspaceResizerHandlersAttachAfterMount()
  })
  await execTest(results, 'markdown.viewer.inlineEdit.config.imagesTasksHrTable', async () => {
    const mod = await modMarkdownViewerInlineEditConfig()
    mod.testMarkdownViewerInlineEditConfigSupportsImagesTasksHrTable()
  })
  await execTest(results, 'markdown.viewer.inlineEdit.toolbar.singleSourceOwner', async () => {
    const mod = await modMarkdownInlineEditToolbarConsolidation()
    mod.testInlineSelectionToolbarHasOneSourceOwnerAndSharedSurfaces()
  })
  await execTest(results, 'markdown.viewer.inlineEdit.toolbar.centralizedSelectionActions', async () => {
    const mod = await modMarkdownInlineEditToolbarConsolidation()
    await mod.testInlineEditToolbarMoreMenuIncludesCentralizedSelectionActions()
  })
  await execTest(results, 'markdown.viewer.inlineEdit.toolbar.versionedRichMediaWorkspaceViewer', async () => {
    const mod = await modMarkdownInlineEditToolbarConsolidation()
    await mod.testVersionedRichMediaWorkspaceViewerReusesInlineSelectionToolbar()
  })
  await execTest(results, 'markdown.viewer.inlineEdit.toolbar.largeViewer', async () => {
    const mod = await modMarkdownLargeViewerInlineSelectionToolbar()
    await mod.testLargeMarkdownViewerKeepsInlineSelectionToolbar()
  })
  await execTest(results, 'markdown.viewer.inlineEdit.mixedBlockSequence.inlineCodeAndLists', async () => {
    const mod = await modMarkdownViewerInlineEditMixedSequence()
    await mod.testMarkdownViewerInlineEditMixedBlockSequencePreservesInlineCodeAndListMarkers()
  })
  await execTest(results, 'markdown.viewer.inlineEdit.taskList.compactBracketSyntax', async () => {
    const mod = await modMarkdownViewerInlineEditMixedSequence()
    await mod.testMarkdownViewerInlineEditTaskListCompactBracketSyntaxParsesAndCommits()
  })
  await execTest(results, 'markdown.viewer.inlineEdit.blockquote.blankLines.keepQuotePrefix', async () => {
    const mod = await modMarkdownViewerInlineEditMixedSequence()
    await mod.testMarkdownViewerInlineEditBlockquoteBlankLinesPreserveQuotePrefixes()
  })
  await execTest(results, 'markdown.viewer.inlineEdit.callout.tripleBlank.editOneKeepsOthers', async () => {
    const mod = await modMarkdownViewerInlineEditMixedSequence()
    await mod.testMarkdownViewerInlineEditCalloutThreeBlankLinesKeepsUneditedQuoteRows()
  })
  await execTest(results, 'markdown.viewer.inlineEdit.callout.tripleContent.editOneKeepsOthers', async () => {
    const mod = await modMarkdownViewerInlineEditMixedSequence()
    await mod.testMarkdownViewerInlineEditCalloutThreeContentLinesEditOneKeepsOtherContentLines()
  })
  await execTest(results, 'markdown.viewer.inlineEdit.callout.clickBlur.noEditNoMutation', async () => {
    const mod = await modMarkdownViewerInlineEditMixedSequence()
    await mod.testMarkdownViewerInlineEditCalloutClickBlurWithoutEditDoesNotMutate()
  })
  await execTest(results, 'markdown.viewer.inlineEdit.callout.admonitionBody.openParityNoMutation', async () => {
    const mod = await modMarkdownViewerInlineEditMixedSequence()
    await mod.testMarkdownViewerInlineEditAdmonitionCalloutBodyOpenKeepsPerLineParity()
  })
  await execTest(results, 'markdown.viewer.inlineEdit.blockquote.trailingBlankLine.openParityNoMutation', async () => {
    const mod = await modMarkdownViewerInlineEditMixedSequence()
    await mod.testMarkdownViewerInlineEditBlockquoteTrailingBlankLineDoesNotCollapseRows()
  })
  await execTest(results, 'markdown.viewer.inlineEdit.blockquote.typography.keepsUiFontClass', async () => {
    const mod = await modMarkdownViewerInlineEditMixedSequence()
    await mod.testMarkdownViewerInlineEditBlockquoteTypographyKeepsUiFontClass()
  })
  await execTest(results, 'markdown.viewer.inlineEdit.blockquote.runtimeParityProbe.mismatchDiagnostics', async () => {
    const mod = await modMarkdownViewerInlineEditMixedSequence()
    await mod.testMarkdownViewerInlineEditRuntimeParityProbeReportsMismatch()
  })
  await execTest(results, 'markdown.viewer.inlineEdit.blockquote.rangeClamp.contiguousQuoteLines', async () => {
    const mod = await modMarkdownViewerInlineEditMixedSequence()
    await mod.testMarkdownViewerInlineEditBlockquoteRangeClampsToContiguousQuoteLines()
  })
  await execTest(results, 'markdown.viewer.inlineEdit.blockquote.trailingNewline.noExtraRow', async () => {
    const mod = await modMarkdownViewerInlineEditMixedSequence()
    await mod.testMarkdownViewerInlineEditBlockquoteTrailingNewlineDoesNotCreateExtraRow()
  })
  await execTest(results, 'markdown.viewer.inlineEdit.blockquote.multiLine.openNoTrailingRow', async () => {
    const mod = await modMarkdownViewerInlineEditMixedSequence()
    await mod.testMarkdownViewerInlineEditBlockquoteMultiLineOpenDoesNotAddTrailingRow()
  })
  await execTest(results, 'markdown.viewer.inlineEdit.blockquote.multiLine.sourceTrailingNewline.openNoTrailingRow', async () => {
    const mod = await modMarkdownViewerInlineEditMixedSequence()
    await mod.testMarkdownViewerInlineEditBlockquoteMultiLineWithSourceTrailingNewlineOpenDoesNotAddTrailingRow()
  })
  await execTest(results, 'markdown.viewer.inlineEdit.blockquote.trimTrailingEmptyInlineWrapperRow', async () => {
    const mod = await modMarkdownViewerInlineEditMixedSequence()
    await mod.testMarkdownViewerInlineEditBlockquoteTrimsTrailingEmptyInlineWrapperRow()
  })
  await execTest(results, 'markdown.viewer.inlineEdit.blockquote.gutterDisabled.openBlur.noMutation', async () => {
    const mod = await modMarkdownViewerInlineEditMixedSequence()
    await mod.testMarkdownViewerInlineEditBlockquoteGutterDisabledOpenBlurDoesNotMutate()
  })
  await execTest(results, 'markdown.viewer.inlineEdit.blockquote.gutterDisabled.trailingNewline.noMutation', async () => {
    const mod = await modMarkdownViewerInlineEditMixedSequence()
    await mod.testMarkdownViewerInlineEditBlockquoteGutterDisabledTrailingNewlineDoesNotMutate()
  })
  await execTest(results, 'markdown.viewer.inlineEdit.callout.rangeClamp.contiguousQuoteLines', async () => {
    const mod = await modMarkdownViewerInlineEditMixedSequence()
    await mod.testMarkdownViewerInlineEditAdmonitionCalloutRangeClampsToContiguousQuoteLines()
  })
  await execTest(results, 'markdown.viewer.inlineEdit.list.ordered.noEdgeRows', async () => {
    const mod = await modMarkdownViewerListInlineEditNoEdgeRows()
    await mod.testMarkdownViewerInlineEditOrderedListHasNoEdgeRows()
  })
  await execTest(results, 'markdown.viewer.inlineEdit.list.unordered.noEdgeRows', async () => {
    const mod = await modMarkdownViewerListInlineEditNoEdgeRows()
    await mod.testMarkdownViewerInlineEditUnorderedListHasNoEdgeRows()
  })
  await execTest(results, 'markdown.viewer.inlineEdit.list.mdDemo01.noEdgeRows', async () => {
    const mod = await modMarkdownViewerListInlineEditNoEdgeRows()
    await mod.testMarkdownViewerInlineEditMdDemo01ListHasNoEdgeRows()
  })
  await execTest(results, 'markdown.viewer.inlineEdit.list.fence.editAsIs', async () => {
    const mod = await modMarkdownViewerListInlineEditNoEdgeRows()
    await mod.testMarkdownViewerInlineEditListWithFenceUsesEditAsIs()
  })
  await execTest(results, 'markdown.viewer.inlineEdit.list.nestedQuestion.renderedParity', async () => {
    const mod = await modMarkdownViewerListInlineEditNoEdgeRows()
    await mod.testMarkdownViewerNestedListQuestionKeepsRenderedEditSurfaceParity()
  })
  await execTest(results, 'markdown.viewer.inlineEdit.table.noGenericTextSurface', async () => {
    const mod = await modMarkdownViewerInlineEditTableReadOnlySurface()
    await mod.testMarkdownViewerInlineEditTableDoesNotOpenGenericContentEditableSurface()
  })
  await execTest(results, 'markdownWorkspace.viewer.remotionRichMedia', async () => {
    const mod = await modMarkdownWorkspaceRemotionViewerRenders()
    await mod.testMarkdownWorkspaceViewerRendersRemotionArtifactRichMedia()
  })
  await execTest(results, 'markdown.webpageLayoutAscii.extractsTextFence', async () => {
    const mod = await modWebpageLayoutAscii()
    await mod.testWebpageLayoutAsciiExtractsTextFence()
  })
  await execTest(results, 'markdown.webpageLayoutAscii.extractsMockupBeforeLegend', async () => {
    const mod = await modWebpageLayoutAscii()
    await mod.testWebpageLayoutAsciiExtractsMockupBeforeLegend()
  })
  await execTest(results, 'markdown.webpageLayoutAscii.upsertPreservesBody', async () => {
    const mod = await modWebpageLayoutAscii()
    await mod.testWebpageLayoutAsciiUpsertPreservesBodyOutsideFence()
  })
  await execTest(results, 'markdown.webpageLayoutAscii.upsertPreservesLegendTail', async () => {
    const mod = await modWebpageLayoutAscii()
    await mod.testWebpageLayoutAsciiUpsertPreservesLegendTail()
  })
  await execTest(results, 'markdown.webpageLayoutAscii.upsertCreatesFence', async () => {
    const mod = await modWebpageLayoutAscii()
    await mod.testWebpageLayoutAsciiUpsertCreatesFenceWhenMissing()
  })
  await execTest(results, 'markdown.asciiBlocks.normalize.wrapsPipeAndBoxDrawing', async () => {
    const mod = await modMarkdownAsciiBlocksNormalize()
    await mod.testMarkdownNormalizeAsciiBlocksWrapsPipeLayoutAndBoxDrawing()
  })
  await execTest(results, 'markdown.asciiBlocks.previewLex.asciiLangTokens', async () => {
    const mod = await modMarkdownAsciiBlocksNormalize()
    await mod.testMarkdownPreviewLexNormalizesAsciiBlocksToAsciiLangCodeTokens()
  })
  await execTest(results, 'markdown.asciiBlocks.normalize.wrapsLooseBoxDrawingSection', async () => {
    const mod = await modMarkdownAsciiBlocksNormalize()
    await mod.testMarkdownNormalizeAsciiBlocksWrapsLooseBoxDrawingSectionFromRemotionLikePricing()
  })
  await execTest(results, 'markdown.webpagePostprocess.remotionPricingAscii', async () => {
    const mod = await modWebpageMarkdownPostprocessRemotionPricing()
    await mod.testWebpageMarkdownPostprocessRemotionPricingToAsciiTable()
  })
  await execTest(results, 'markdown.urlImport.apiNative.reddit', async () => {
    const mod = await modUrlImportApiNativeReddit()
    await mod.testUrlImportApiNativeRedditConvertsListingJsonToMarkdown()
  })
  await execTest(results, 'markdown.urlImport.apiNative.jsonLd', async () => {
    const mod = await modUrlImportApiNativeJsonLd()
    await mod.testUrlImportApiNativeJsonLdExtractsAndRendersMarkdown()
  })
  await execTest(results, 'markdown.urlImport.apiNative.jsonLd.mudahPrefersApiNative', async () => {
    const mod = await modUrlImportApiNativeJsonLd()
    await mod.testUrlImportApiNativeJsonLdPrefersApiNativeForMudah()
  })
  await execTest(results, 'markdown.urlImport.apiNative.jsonLd.importModeWebpageProxy', async () => {
    const mod = await modUrlImportApiNativeJsonLd()
    await mod.testUrlImportApiNativeJsonLdImportModeUsesSharedWebpageProxy()
  })
  await execTest(results, 'markdown.urlImport.refresh.markdown.parsesMudahText', async () => {
    const mod = await modUrlImportApiNativeJsonLd()
    await mod.testUrlImportRefreshMarkdownParsesMudahTextFromHtml()
  })
  await execTest(results, 'workspace.importUrl.webpageMarkdown.clipsLarge', async () => {
    const mod = await modWorkspaceImportLargeWebpageMarkdownClip()
    await mod.testWorkspaceImportLargeWebpageMarkdownIsClipped()
  })
  await execTest(results, 'html.fallback.stripSvgAndFlex', async () => {
    const mod = await modHtmlFallbackStripSvgAndFlex()
    await mod.testHtmlFallbackStripsInlineSvgAndKeepsHeadingText()
  })
  await execTest(results, 'markdown.urlImport.authWall.xHome.noHydrationStub', async () => {
    const mod = await modUrlImportAuthWallStub()
    await mod.testUrlImportAuthWallImportAvoidsHydrationStubForXHome()
  })
  await execTest(results, 'markdown.urlImport.authWall.linkedinFeed.noHydrationStub', async () => {
    const mod = await modUrlImportAuthWallStub()
    await mod.testUrlImportAuthWallImportAvoidsHydrationStubForLinkedInFeed()
  })
  await execTest(results, 'markdown.webpagePostprocess.remotionPricingBlobAscii', async () => {
    const mod = await modWebpageMarkdownPostprocessRemotionPricing()
    await mod.testWebpageMarkdownPostprocessHandlesCollapsedRemotionPricingBlob()
  })
  await execTest(results, 'markdown.webpagePostprocess.cardsToTable', async () => {
    const mod = await modWebpageMarkdownPostprocessCardGrid()
    await mod.testWebpageMarkdownPostprocessCoalescesPlainCardBlocksIntoMarkdownTable()
  })
  await execTest(results, 'markdown.webpagePostprocess.plainLinesToBullets', async () => {
    const mod = await modWebpageMarkdownPostprocessCardGrid()
    await mod.testWebpageMarkdownPostprocessNormalizesPlainListsIntoBullets()
  })
  await execTest(results, 'markdown.webpagePostprocess.navLinksToTable', async () => {
    const mod = await modWebpageMarkdownPostprocessCardGrid()
    await mod.testWebpageMarkdownPostprocessCoalescesNavLinksToTable()
  })
  await execTest(results, 'markdown.webpagePostprocess.htmlGridNavToTable', async () => {
    const mod = await modWebpageMarkdownPostprocessCardGrid()
    await mod.testWebpageMarkdownPostprocessCoalescesHtmlGridNavIntoTable()
  })
  await execTest(results, 'markdown.preview.htmlVideoAndGrid', async () => {
    const mod = await modMarkdownHtmlRichMediaAndGridPreview()
    await mod.testMarkdownPreviewRendersHtmlVideoAutoplayAndGridSpans()
  })
  await execTest(results, 'markdown.preview.htmlTableDivAndPicture', async () => {
    const mod = await modMarkdownHtmlTableDivAndPicturePreview()
    await mod.testMarkdownPreviewRendersHtmlTableDivAndPictureSources()
  })
  await execTest(results, 'markdown.preview.inlineHtmlRichMedia', async () => {
    const mod = await modMarkdownInlineHtmlRichMediaPreview()
    await mod.testMarkdownPreviewRendersInlineHtmlRichMedia()
  })
  await execTest(results, 'markdown.preview.htmlGridCalcGapImportant', async () => {
    const mod = await modMarkdownHtmlGridCalcGapPreview()
    await mod.testMarkdownPreviewRendersHtmlGridWithCalcGapImportant()
  })
  await execTest(results, 'markdown.preview.webpageSnapshotEmbeds', async () => {
    const mod = await modMarkdownEmbedSnapshotPreview()
    await mod.testMarkdownPreviewRendersWebpageSnapshotForStandaloneLinkAndScriptEmbed()
    await mod.testMarkdownPreviewRendersStandaloneYouTubeShortUrlInLargeDocumentMode()
    await mod.testMarkdownPreviewBudgetsRepeatedLargeDocumentYouTubeSnapshots()
    await mod.testMarkdownPreviewRendersLinkedYouTubeThumbnailImage()
  })
  await execTest(results, 'markdown.preview.pipelinePreservesGridHtml', async () => {
    const mod = await modHtmlToMarkdownUnifiedLayoutPreserve()
    await mod.testHtmlToMarkdownUnifiedPreservesGridSectionsAsHtml()
  })
  await execTest(results, 'markdown.htmlToMdUnified.urlRewrite', async () => {
    const mod = await modHtmlToMarkdownUnifiedUrlRewrite()
    await mod.testHtmlToMarkdownUnifiedRewritesSrcsetPosterAndDataSrc()
  })
}
