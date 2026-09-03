import { execTest, TestResult } from './testRunnerUtils'

const modParserRegistry = () => import('@/__tests__/parserRegistry.test')
const modCustomParser = () => import('@/__tests__/customParser.test')
const modCustomParserTransforms = () => import('@/__tests__/customParserTransforms.test')
const modTransformArrayPath = () => import('@/__tests__/transformArrayPath.test')
const modWildcardAgg = () => import('@/__tests__/wildcardAgg.test')
const modWildcardMinMaxAvg = () => import('@/__tests__/wildcardMinMaxAvg.test')
const modWildcardPercentile = () => import('@/__tests__/wildcardPercentile.test')
const modWildcardPercentileMethod = () => import('@/__tests__/wildcardPercentileMethod.test')
const modWildcardPercentileTukeyHazen = () => import('@/__tests__/wildcardPercentileTukeyHazen.test')
const modWildcardPercentileHF = () => import('@/__tests__/wildcardPercentileHF.test')
const modCustomParserWarnings = () => import('@/__tests__/customParserWarnings.test')
const modParserAutoApply = () => import('@/__tests__/parserAutoApply.test')
const modParserUiState = () => import('@/__tests__/parserUiState.test')
const modYamlTransforms = () => import('@/__tests__/yamlTransforms.test')
const modParserCacheCfgKey = () => import('@/__tests__/parserCacheCfgKey.test')
const modParserWorkflowPersistence = () => import('@/__tests__/parserWorkflowPersistence.test')
const modRawJsonIngestion = () => import('@/__tests__/rawJsonIngestion.test')
const modRawJsonWorkflowShapeIngestion = () => import('@/__tests__/rawJsonWorkflowShapeIngestion.test')
const modFlowchartPipelineNeutrality = () => import('@/__tests__/flowchartPipelineNeutrality.test')
const modMermaidSubgraphGroups = () => import('@/__tests__/mermaidSubgraphGroups.test')
const modMermaidSeedLayout = () => import('@/__tests__/mermaidSeedLayout.test')
const modMermaidNodeShapes = () => import('@/__tests__/mermaidNodeShapes.test')
const modMermaidFrontmatterLinks = () => import('@/__tests__/mermaidFrontmatterLinks.test')
const modMermaidFrontmatterContextLayout = () => import('@/__tests__/mermaidFrontmatterContextLayout.test')
const modGraphragTextPipeline = () => import('@/__tests__/graphragTextPipeline.test')
const modAieBookGraphRagTextPipeline = () => import('@/__tests__/aieBookGraphRagTextPipeline.test')
const modWidgetBundleImport = () => import('@/__tests__/widgetBundleImport.test')
const modStoryboardWidgetManagerAddFromWidget = () => import('@/__tests__/storyboardWidgetManagerAddFromWidget.test')
const modAgenticOsSemanticGraph = () => import('@/__tests__/agenticOsSemanticGraph.test')

export const runParserTests = async (results: TestResult[]) => {
  await execTest(results, 'parser.registryCrud', async () => {
    const mod = await modParserRegistry()
    await mod.testParserRegistryCrud()
  })
  await execTest(results, 'parser.customConversion', async () => {
    const mod = await modCustomParser()
    await mod.testCustomParserConversion()
  })
  await execTest(results, 'parser.customTransforms', async () => {
    const mod = await modCustomParserTransforms()
    await mod.testCustomParserTransforms()
  })
  await execTest(results, 'parser.arrayPath', async () => {
    const mod = await modTransformArrayPath()
    await mod.testTransformArrayPath()
  })
  await execTest(results, 'parser.wildcardAgg', async () => {
    const mod = await modWildcardAgg()
    await mod.testWildcardAggregation()
  })
  await execTest(results, 'parser.wildcardMinMaxAvg', async () => {
    const mod = await modWildcardMinMaxAvg()
    await mod.testWildcardMinMaxAvg()
  })
  await execTest(results, 'parser.wildcardPercentile', async () => {
    const mod = await modWildcardPercentile()
    await mod.testWildcardPercentile()
  })
  await execTest(results, 'parser.wildcardPercentileNearest', async () => {
    const mod = await modWildcardPercentileMethod()
    await mod.testWildcardPercentileNearest()
  })
  await execTest(results, 'parser.wildcardPercentileTukeyHazen', async () => {
    const mod = await modWildcardPercentileTukeyHazen()
    await mod.testWildcardPercentileTukeyHazen()
  })
  await execTest(results, 'parser.wildcardPercentileHF', async () => {
    const mod = await modWildcardPercentileHF()
    await mod.testWildcardPercentileHF()
  })
  await execTest(results, 'parser.typeMethodWarning', async () => {
    const mod = await modCustomParserWarnings()
    await mod.testCustomParserTypeMethodWarning()
  })
  await execTest(results, 'parser.autoSelectOnLoad', async () => {
    const mod = await modParserAutoApply()
    await mod.testParserAutoSelectOnLoad()
  })
  await execTest(results, 'parser.uiStateHydration', async () => {
    const mod = await modParserUiState()
    await mod.testParserUIStateHydration()
  })
  await execTest(results, 'parser.yamlTransformsValidation', async () => {
    const mod = await modYamlTransforms()
    await mod.testYamlTransformsValidation()
  })
  await execTest(results, 'parser.cacheCfgKey', async () => {
    const mod = await modParserCacheCfgKey()
    await mod.testParserCacheCfgKey()
  })
  await execTest(results, 'parser.workflowPresetStorage', async () => {
    const mod = await modParserWorkflowPersistence()
    await mod.testParserWorkflowPresetStorage()
  })
  await execTest(results, 'parser.rawJson.nodesArrayIngestion', async () => {
    const mod = await modRawJsonIngestion()
    await mod.testRawJsonNodesArrayIngestion()
  })
  await execTest(results, 'parser.rawJson.extendedNodesIngestion', async () => {
    const mod = await modRawJsonIngestion()
    await mod.testRawJsonExtendedNodesIngestion()
  })
  await execTest(results, 'parser.rawJson.workflowShapeIngestion', async () => {
    const mod = await modRawJsonWorkflowShapeIngestion()
    await mod.testRawJsonWorkflowShapeIngestion()
  })
  await execTest(results, 'parser.flowchart.neutralSourceMetadata', async () => {
    const mod = await modFlowchartPipelineNeutrality()
    await mod.testFlowchartNormalizeKeepsNeutralSourceMetadata()
  })
  await execTest(results, 'parser.flowchart.sideAliases', async () => {
    const mod = await modFlowchartPipelineNeutrality()
    await mod.testFlowchartNormalizeAcceptsSideAliases()
  })
  await execTest(results, 'parser.flowchart.reusesSharedPlainObjectGuard', async () => {
    const mod = await modFlowchartPipelineNeutrality()
    await mod.testFlowchartParserReusesSharedPlainObjectGuard()
  })
  await execTest(results, 'parser.flowchart.nestedClusterGapRatioObjects', async () => {
    const mod = await modFlowchartPipelineNeutrality()
    await mod.testFlowchartNormalizeReadsNestedClusterGapRatioObjects()
  })
  await execTest(results, 'parser.mermaid.subgraphParentId', async () => {
    const mod = await modMermaidSubgraphGroups()
    await mod.testMermaidSubgraphParsingAddsParentId()
  })
  await execTest(results, 'parser.mermaid.subgraphGroupDerivation', async () => {
    const mod = await modMermaidSubgraphGroups()
    await mod.testMermaidSubgraphDerivationBuildsGroups()
  })
  await execTest(results, 'parser.mermaid.seedLayoutSpreadAndCenter', async () => {
    const mod = await modMermaidSeedLayout()
    await mod.testMermaidSeedLayoutSpreadsGroupsAndCenters()
  })
  await execTest(results, 'parser.mermaid.nodeShapes', async () => {
    const mod = await modMermaidNodeShapes()
    await mod.testMermaidParserCapturesNodeShapes()
  })
  await execTest(results, 'parser.mermaid.frontmatterLinks.clickAnchorsAndBlockLinks', async () => {
    const mod = await modMermaidFrontmatterLinks()
    await mod.testMermaidFrontmatterClickAnchorsAndBlockLinks()
  })
  await execTest(results, 'parser.mermaid.frontmatterLinks.contextLayoutPositions', async () => {
    const mod = await modMermaidFrontmatterContextLayout()
    await mod.testMermaidFrontmatterContextLayoutPositionsAnchorsAndBlocks()
  })
  await execTest(results, 'parser.graphragText.pipelineBuildsGraphAcrossDomains', async () => {
    const mod = await modGraphragTextPipeline()
    await mod.testGraphRagTextPipelineBuildsGraphAcrossDomains()
  })
  await execTest(results, 'parser.graphragText.centralityConfigDisablesMetrics', async () => {
    const mod = await modGraphragTextPipeline()
    await mod.testGraphRagTextPipelineCentralityConfigDisablesMetrics()
  })
  await execTest(results, 'parser.graphragText.pipelineMatchesDemoFixture', async () => {
    const mod = await modGraphragTextPipeline()
    await mod.testGraphRagTextPipelineMatchesDemoFixture()
  })
  await execTest(results, 'parser.graphragText.pipelineExtractsFromAieBookSnippets', async () => {
    const mod = await modAieBookGraphRagTextPipeline()
    await mod.testGraphRagTextPipelineExtractsFromAieBookSnippets()
  })
  await execTest(results, 'parser.graphragText.parserSpecMatchesTxt', async () => {
    const mod = await modGraphragTextPipeline()
    await mod.testGraphRagTextParserSpecMatchesTxt()
  })
  await execTest(results, 'parser.graphragText.bestMatchPrefersGraphRagOnPlainMd', async () => {
    const mod = await modGraphragTextPipeline()
    await mod.testGraphRagTextParserSelectionPrefersGraphRagOnPlainMd()
  })
  await execTest(results, 'parser.widget.bundleParseAddsRegistryMetadata', async () => {
    const mod = await modWidgetBundleImport()
    await mod.testWidgetBundleParseProducesGraphDataWithRegistryMetadata()
  })
  await execTest(results, 'parser.widget.applyRegistryFromMetadata', async () => {
    const mod = await modWidgetBundleImport()
    await mod.testWidgetRegistryAppliedFromGraphMetadata()
  })
  await execTest(results, 'parser.widget.aiFlowImportBuildsGraphAndRegistry', async () => {
    const mod = await modWidgetBundleImport()
    await mod.testWidgetAiFlowImportBuildsGraphAndRegistry()
  })
  await execTest(results, 'parser.widget.comfyUiImportBuildsGraphAndRegistry', async () => {
    const mod = await modWidgetBundleImport()
    await mod.testWidgetComfyUiImportBuildsGraphAndRegistry()
  })
  await execTest(results, 'parser.widget.managerAddFromWidgetBuildsDraft', async () => {
    const mod = await modStoryboardWidgetManagerAddFromWidget()
    await mod.testStoryboardWidgetManagerBuildDraftFromSmartFields()
  })
  await execTest(results, 'parser.widget.managerGenerateVideoDraftUsesSsotTypeId', async () => {
    const mod = await modStoryboardWidgetManagerAddFromWidget()
    await mod.testStoryboardWidgetManagerBuildGenerateVideoDraftUsesSsotTypeId()
  })
  await execTest(results, 'parser.agenticOsSemantic.typedSigilsNoLegacyRemap', async () => {
    const mod = await modAgenticOsSemanticGraph()
    await mod.testAgenticOsSemanticGraphParsesTypedSigilsWithoutLegacyRemap()
  })
  await execTest(results, 'parser.agenticOsSemantic.queryEnginePathFilterSearch', async () => {
    const mod = await modAgenticOsSemanticGraph()
    await mod.testAgenticOsSemanticQueryEnginePathFilterSearchAncestorsDescendants()
  })
  await execTest(results, 'parser.agenticOsSemantic.workspaceActiveRendererGraph', async () => {
    const mod = await modAgenticOsSemanticGraph()
    await mod.testWorkspaceAgenticOsSemanticGraphFeedsActiveRendererGraphWithDocumentStructure()
  })
  await execTest(results, 'parser.agenticOsSemantic.suppressesKeywordRederivation', async () => {
    const mod = await modAgenticOsSemanticGraph()
    await mod.testAgenticOsSemanticGraphSuppressesKeywordReDerivationInActiveGraphOwner()
  })
  await execTest(results, 'parser.agenticOsSemantic.markdownParserMerge', async () => {
    const mod = await modAgenticOsSemanticGraph()
    await mod.testMarkdownParserMergesAgenticOsSemanticGraphIntoNeutralMarkdownGraph()
  })
  await execTest(results, 'parser.agenticOsSemantic.preservesTypedFlowBlockEdges', async () => {
    const mod = await modAgenticOsSemanticGraph()
    await mod.testMarkdownParserPreservesTypedFlowBlockEdgesWhenAgenticOsSemanticMerges()
  })
}
