---
title: "Reference implementation: agentic-graph Technical Architecture"
id: "md:agentic-graph-technical-architecture"
doc_type: "Generated Registry Surface"
version: "1.1.0"
date: "2026-07-30"
lang: "en-US"
owner: "docs.generated.technical-architecture-registry"
local_rung: "spec-complete"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
guideline_version: "1.7.0"
doc_path: "docs/agentic-graph-technical-architecture.md"
canonical_docs_root: "docs/documents"
generator_owner: "canvas/src/cli/lint-doc.ts"
---
# Reference implementation: agentic-graph Technical Architecture

## Generated Registry Contract
The opening YAML frontmatter block remains the machine SSOT for this generated registry surface. Canonical architecture prose and behavior ownership live under `docs/documents/`; update source docs or generator inputs there, keep registry rows generator-owned from `canvas/src/cli/lint-doc.ts`, and use `docs/documents/agentic-graph-settings-document.md`, `docs/documents/agentic-graph-chat-ai-markdown-pipeline-document.md`, and `docs/documents/agentic-graph-llm-prompt-contract-prd-tad.md` as canonical owner maps instead of inferring runtime decisions from stale generated rows.

## Settings Registry — Part 1

The generated registry is split at a stable row boundary so each artifact stays
modular. Continue with
[part 2](agentic-graph-technical-architecture.settings.md); both parts are refreshed
by the same generator and together form one projection.

<!-- SETTINGS_REGISTRY_TABLE_START -->

| Setting key | Type | Source | LS key (if any) | Owner |
| ----------- | ---- | ------ | ------------ | ----- |
| `startup.openWorkflowPanel` | boolean | localStorage |  |  |
| `uiOverlayOpacity` | number | store | `kg:ui:overlayOpacity` | `ui.overlayOpacity` |
| `uiPanelOpacity` | number | store | `kg:ui:panelOpacity` | `ui.panelOpacity` |
| `uiToolbarOpacity` | number | store | `kg:ui:toolbarOpacity` | `ui.toolbarOpacity` |
| `selectionFlashDurationMs` | number | store |  |  |
| `selectionFlashOpacity` | number | store |  |  |
| `uiIconScale` | string | store |  |  |
| `uiPanelTextFontClass` | string | store |  |  |
| `uiPanelKeyValueTextSizeClass` | string | store |  |  |
| `uiPanelKeyValueInputClass` | string | store |  |  |
| `uiPanelMonospaceTextClass` | string | store |  |  |
| `uiPanelRowDensityDefaultClass` | string | store |  |  |
| `uiHeaderRowHeightClass` | string | store |  |  |
| `uiHeaderRowPaddingClass` | string | store |  |  |
| `uiSectionHeaderRowHeightClass` | string | store |  |  |
| `uiSectionHeaderRowPaddingClass` | string | store |  |  |
| `uiIconFormat` | string | store |  |  |
| `uiIconStrokeWidth` | number | store |  |  |
| `uiIconColorClass` | string | store |  |  |
| `uiIconHoverBgClass` | string | store |  |  |
| `uiIconButtonPaddingClass` | string | store |  |  |
| `uiIconPillClass` | string | store |  |  |
| `uiIconPillLegendTextSizeClass` | string | store |  |  |
| `uiIconPillBadgeTextSizeClass` | string | store |  |  |
| `uiIconBadgeChipClass` | string | store |  |  |
| `uiIconBadgeChipTextSizeClass` | string | store |  |  |
| `uiPanelMicroLabelTextSizeClass` | string | store |  |  |
| `uiIconAnimationEnabled` | boolean | store |  |  |
| `themeMode` | string | store | `kg:ui:themeMode` | `ui.theme` |
| `floatingPanelWidthRatio` | number | localStorage | `kg:ui:floatingPanelWidthRatio` | `ui.floatingPanel` |
| `floatingPanelZIndex` | number | localStorage | `kg:ui:floatingPanelZIndex` | `ui.floatingPanel` |
| `enableLaunchSpotlight` | boolean | store |  |  |
| `spotlight.margin` | number | store |  |  |
| `spotlight.nearTopThreshold` | number | store |  |  |
| `chatProvider` | string | localStorage | `kg:chat:provider` | `ui.chat` |
| `chatAuthMode` | string | localStorage | `kg:chat:authMode` | `ui.chat` |
| `chatEndpointUrl` | string | localStorage | `kg:chat:endpointUrl` | `ui.chat` |
| `chatApiKey` | string | store |  |  |
| `byteplusImageModel` | string | localStorage | `kg:integrations:byteplusImage:model` |  |
| `byteplusImageSize` | string | localStorage | `kg:integrations:byteplusImage:size` |  |
| `byteplusImageOutputFormat` | string | localStorage | `kg:integrations:byteplusImage:outputFormat` |  |
| `byteplusImageResponseFormat` | string | localStorage | `kg:integrations:byteplusImage:responseFormat` |  |
| `byteplusImageOptimizePromptOptions` | string | localStorage | `kg:integrations:byteplusImage:optimizePromptOptions` |  |
| `byteplusImageAspectRatio` | number | localStorage | `kg:integrations:byteplusImage:aspectRatio` |  |
| `byteplusImageStream` | boolean | localStorage | `kg:integrations:byteplusImage:stream` |  |
| `byteplusImageWatermark` | boolean | localStorage | `kg:integrations:byteplusImage:watermark` |  |
| `byteplusImageSeed` | number | localStorage | `kg:integrations:byteplusImage:seed` |  |
| `byteplusImageGuidanceScale` | number | localStorage | `kg:integrations:byteplusImage:guidanceScale` |  |
| `byteplusVideoModel` | string | localStorage | `kg:integrations:byteplusVideo:model` |  |
| `byteplusVideoContentJson` | json | localStorage | `kg:integrations:byteplusVideo:contentJson` |  |
| `byteplusVideoResolution` | string | localStorage | `kg:integrations:byteplusVideo:resolution` |  |
| `byteplusVideoRatio` | string | localStorage | `kg:integrations:byteplusVideo:ratio` |  |
| `byteplusVideoDuration` | number | localStorage | `kg:integrations:byteplusVideo:duration` |  |
| `byteplusVideoGenerateAudio` | boolean | localStorage | `kg:integrations:byteplusVideo:generateAudio` |  |
| `byteplusVideoDraft` | boolean | localStorage | `kg:integrations:byteplusVideo:draft` |  |
| `byteplusVideoCameraFixed` | boolean | localStorage | `kg:integrations:byteplusVideo:cameraFixed` |  |
| `byteplusVideoImageUrlUrl` | string | localStorage | `kg:integrations:byteplusVideo:contentImageUrlUrlMode` |  |
| `geminiVideoModel` | string | localStorage | `kg:integrations:geminiVideo:model` |  |
| `geminiVideoAspectRatio` | string | localStorage | `kg:integrations:geminiVideo:aspectRatio` |  |
| `geminiVideoResolution` | string | localStorage | `kg:integrations:geminiVideo:resolution` |  |
| `geminiVideoDurationSeconds` | string | localStorage | `kg:integrations:geminiVideo:durationSeconds` |  |
| `geminiVideoPersonGeneration` | string | localStorage | `kg:integrations:geminiVideo:personGeneration` |  |
| `chatModel` | string | localStorage | `kg:chat:model` | `ui.chat` |
| `chatTemperature` | number | localStorage | `kg:chat:temperature` | `ui.chat` |
| `chatMaxCompletionTokens` | number | localStorage | `kg:chat:maxCompletionTokens` | `ui.chat` |
| `chatServiceTier` | string | localStorage | `kg:chat:serviceTier` |  |
| `chatStream` | boolean | localStorage | `kg:chat:stream` |  |
| `chatMessagesJson` | json | localStorage | `kg:chat:messagesJson` |  |
| `chatReasoningEffort` | string | localStorage | `kg:chat:reasoningEffort` |  |
| `chatThinkingType` | string | localStorage | `kg:chat:thinkingType` |  |
| `chatThinkingJson` | json | localStorage | `kg:chat:thinkingJson` |  |
| `chatFrequencyPenalty` | number | localStorage | `kg:chat:frequencyPenalty` |  |
| `chatPresencePenalty` | number | localStorage | `kg:chat:presencePenalty` |  |
| `chatTopP` | number | localStorage | `kg:chat:topP` |  |
| `chatLogprobs` | boolean | localStorage | `kg:chat:logprobs` |  |
| `chatTopLogprobs` | number | localStorage | `kg:chat:topLogprobs` |  |
| `chatParallelToolCalls` | boolean | localStorage | `kg:chat:parallelToolCalls` |  |
| `chatStopJson` | json | localStorage | `kg:chat:stopJson` |  |
| `chatStreamOptionsJson` | json | localStorage | `kg:chat:streamOptionsJson` |  |
| `chatResponseFormatJson` | json | localStorage | `kg:chat:responseFormatJson` |  |
| `chatLogitBiasJson` | json | localStorage | `kg:chat:logitBiasJson` |  |
| `chatToolsJson` | json | localStorage | `kg:chat:toolsJson` |  |
| `chatToolChoiceJson` | json | localStorage | `kg:chat:toolChoiceJson` |  |
| `chatGraphSummaryMaxTokens` | number | localStorage | `kg:chat:context:graphSummaryMaxTokens` | `ui.chat` |
| `chatGuidelineDigestMaxTokens` | number | localStorage | `kg:chat:context:guidelineDigestMaxTokens` | `ui.chat` |
| `chatSystemPrompt` | string | localStorage | `kg:chat:systemPrompt` | `ui.chat` |
| `chatStorageTarget` | string | localStorage | `kg:chat:storage:target` | `ui.chat` |
| `chatLocalStorageRootPath` | string | localStorage | `kg:chat:storage:localRootPath` | `ui.chat` |
| `chatAgenticGraphStorageMode` | string | localStorage | `kg:chat:chatAgenticGraph:storageMode` | `ui.chat` |
| `chatAgenticGraphWorkspacePath` | string | localStorage | `kg:chat:chatAgenticGraph:workspacePath` | `ui.chat` |
| `chatAgenticGraphCloudUrl` | string | localStorage | `kg:chat:chatAgenticGraph:cloudUrl` | `ui.chat` |
| `chatHistoryStorageMode` | string | localStorage | `kg:chat:history:storageMode` | `ui.chat` |
| `chatHistoryWorkspacePath` | string | localStorage | `kg:chat:history:workspacePath` | `ui.chat` |
| `chatHistoryCloudUrl` | string | localStorage | `kg:chat:history:cloudUrl` | `ui.chat` |
| `chatContextScope` | string | localStorage | `kg:chat:contextScope` | `ui.chat` |
| `integrationConfigsJson` | string | localStorage | `kg:integrations:configs` | `ui.chat` |
| `canvasSnapEnabled` | boolean | store |  |  |
| `canvasSnapGridSize` | number | store |  |  |
| `canvasGridVisible` | boolean | store |  |  |
| `canvasGridMinorAlpha` | number | store |  |  |
| `canvasGridMajorAlpha` | number | store |  |  |
| `canvasGridMinorWidthPx` | number | store |  |  |
| `canvasGridMajorWidthPx` | number | store |  |  |
| `canvasGridMinorStroke` | string | store |  |  |
| `canvasGridMajorStroke` | string | store |  |  |
| `canvasGridVariant` | string | store |  |  |
| `canvasGridMajorEvery` | number | store |  |  |
| `canvasGridDotRadiusPx` | number | store |  |  |
| `markdownWordWrap` | boolean | localStorage | `kg:ui:markdown:wordWrap` | `ui.bottomSurface` |
| `markdownTextHighlight` | boolean | localStorage | `kg:ui:markdown:textHighlight` | `ui.bottomSurface` |
| `autoEnableGeospatialOnGeoImport` | boolean | store |  |  |
| `maps.grabmaps.authMode` | string | store |  |  |
| `maps.grabmaps.apiKey` | string | store |  |  |
| `maps.grabmaps.directions.endpointUrl` | string | store |  |  |
| `maps.grabmaps.directions.originLng` | number | store |  |  |
| `maps.grabmaps.directions.originLat` | number | store |  |  |
| `maps.grabmaps.directions.destinationLng` | number | store |  |  |
| `maps.grabmaps.directions.destinationLat` | number | store |  |  |
| `maps.grabmaps.directions.overview` | string | store |  |  |
| `maps.grabmaps.directions.latFirst` | boolean | store |  |  |
| `maps.grabmaps.directions.alternatives` | boolean | store |  |  |
| `maps.grabmaps.directions.steps` | boolean | store |  |  |
| `maps.grabmaps.directions.language` | string | store |  |  |
| `maps.grabmaps.directions.units` | string | store |  |  |
| `maps.grabmaps.directions.waypoints` | json | store |  |  |
| `maps.grabmaps.directions.annotations` | json | store |  |  |
| `maps.grabmaps.directions.extraParams` | json | store |  |  |
| `maps.grabmaps.basemap.styleUrl` | string | store |  |  |
| `maps.grabmaps.mcp.serverKey` | string | localStorage |  |  |
| `maps.grabmaps.mcp.command` | string | localStorage |  |  |
| `maps.grabmaps.mcp.args` | json | localStorage |  |  |
| `maps.grabmaps.mcp.env` | json | localStorage |  |  |
| `maps.grabmaps.mcp.startupTimeoutMs` | number | localStorage |  |  |
| `maps.grabmaps.mcp.discovery.chatModel` | string | localStorage |  |  |
| `maps.grabmaps.mcp.searchPlaces.query` | string | localStorage |  |  |
| `maps.grabmaps.mcp.searchPlaces.country` | string | localStorage |  |  |
| `maps.grabmaps.mcp.searchPlaces.lat` | number | localStorage |  |  |
| `maps.grabmaps.mcp.searchPlaces.lon` | number | localStorage |  |  |
| `maps.grabmaps.mcp.searchPlaces.radius` | number | localStorage |  |  |
| `maps.grabmaps.mcp.searchPlaces.limit` | number | localStorage |  |  |
| `maps.grabmaps.mcp.getDirections.origin` | string | localStorage |  |  |
| `maps.grabmaps.mcp.getDirections.destination` | string | localStorage |  |  |
| `maps.grabmaps.mcp.getDirections.waypoints` | json | localStorage |  |  |
| `maps.grabmaps.mcp.nearbySearch.lat` | number | localStorage |  |  |
| `maps.grabmaps.mcp.nearbySearch.lon` | number | localStorage |  |  |
| `maps.grabmaps.mcp.nearbySearch.radius` | number | localStorage |  |  |
| `maps.grabmaps.mcp.nearbySearch.limit` | number | localStorage |  |  |
| `maps.grabmaps.mcp.nearbySearch.rankBy` | string | localStorage |  |  |
| `maps.grabmaps.mcp.nearbySearch.language` | string | localStorage |  |  |
| `maps.grabmaps.mcp.nearbySearch.category` | string | localStorage |  |  |
| `browser.apiNative.mcp.serverKey` | string | localStorage |  |  |
| `browser.apiNative.mcp.command` | string | localStorage |  |  |
| `browser.apiNative.mcp.args` | json | localStorage |  |  |
| `browser.apiNative.mcp.env` | json | localStorage |  |  |
| `browser.apiNative.mcp.startupTimeoutMs` | number | localStorage |  |  |
| `browser.apiNative.mcp.runtimeUrl` | string | localStorage |  |  |
| `browser.apiNative.mcp.defaultIntent` | string | localStorage |  |  |
| `browser.apiNative.mcp.targetUrl` | string | localStorage |  |  |
| `browser.apiNative.mcp.dryRun` | boolean | localStorage |  |  |
| `browser.apiNative.mcp.confirmUnsafe` | boolean | localStorage |  |  |
| `browser.apiNative.mcp.confirmThirdPartyTerms` | boolean | localStorage |  |  |
| `browser.apiNative.mcp.confirmCookieImport` | boolean | localStorage |  |  |
| `flowchart.dataSource` | string | store |  |  |
| `flowchart.pollIntervalSec` | number | store |  |  |
| `flowchart.metric.nodeSize` | string | store |  |  |
| `flowchart.metric.nodeGlow` | string | store |  |  |
| `flowchart.metric.nodePulse` | string | store |  |  |
| `flowchart.metric.nodeBorder` | string | store |  |  |
| `flowchart.metric.edgeOpacity` | string | store |  |  |
| `flowchart.show.specificityBadges` | boolean | store |  |  |
| `flowchart.show.gapScoreInLabel` | boolean | store |  |  |
| `flowchart.show.clusterGapRatio` | boolean | store |  |  |
| `monacoLanguageJsonEnabled` | boolean | store |  |  |
| `monacoLanguageJsonLoadMode` | string | store |  |  |
| `monacoLanguageSqlEnabled` | boolean | store |  |  |
| `monacoLanguageSqlLoadMode` | string | store |  |  |
| `monacoLanguageYamlEnabled` | boolean | store |  |  |
| `monacoLanguageYamlLoadMode` | string | store |  |  |
| `monacoWorkerJsonEnabled` | boolean | store |  |  |
| `monacoWorkerJsonLoadMode` | string | store |  |  |
| `monacoHoverEnabled` | boolean | store |  |  |
| `monacoLinksEnabled` | boolean | store |  |  |
| `monacoQuickSuggestionsEnabled` | boolean | store |  |  |
| `monacoSuggestOnTriggerCharactersEnabled` | boolean | store |  |  |
| `monacoParameterHintsEnabled` | boolean | store |  |  |
| `monacoLineNumbersEnabled` | boolean | store |  |  |
| `monacoFoldingEnabled` | boolean | store |  |  |
| `monacoMinimapEnabled` | boolean | store |  |  |
| `monacoSelectionHighlightEnabled` | boolean | store |  |  |
| `monacoOccurrencesHighlightEnabled` | boolean | store |  |  |
| `monacoGuidesEnabled` | boolean | store |  |  |
| `monacoBracketPairColorizationEnabled` | boolean | store |  |  |
| `monacoCodeLensEnabled` | boolean | store |  |  |
| `monacoLightbulbEnabled` | boolean | store |  |  |
| `monacoInlayHintsEnabled` | boolean | store |  |  |
| `monacoWordBasedSuggestionsEnabled` | boolean | store |  |  |
| `monacoInlineSuggestEnabled` | boolean | store |  |  |
| `monacoAcceptSuggestionOnEnterEnabled` | boolean | store |  |  |
| `monacoDragAndDropEnabled` | boolean | store |  |  |
| `monacoDropIntoEditorEnabled` | boolean | store |  |  |
| `monacoColorDecoratorsEnabled` | boolean | store |  |  |
| `monacoUnicodeHighlightEnabled` | boolean | store |  |  |
| `monacoMatchBracketsEnabled` | boolean | store |  |  |
| `monacoRenderLineHighlightEnabled` | boolean | store |  |  |
| `monacoGlyphMarginEnabled` | boolean | store |  |  |
| `monacoOverviewRulerLanesEnabled` | boolean | store |  |  |
| `monacoLineDecorationsWidthEnabled` | boolean | store |  |  |
| `monacoRenderWhitespaceEnabled` | boolean | store |  |  |
| `monacoRenderControlCharactersEnabled` | boolean | store |  |  |
| `monacoSmoothScrollingEnabled` | boolean | store |  |  |
| `monacoScrollBeyondLastLineEnabled` | boolean | store |  |  |
| `monacoMouseWheelZoomEnabled` | boolean | store |  |  |
| `monacoCursorBlinkingEnabled` | boolean | store |  |  |
| `monacoCursorSmoothCaretAnimationEnabled` | boolean | store |  |  |
| `monacoWordWrapEnabled` | boolean | store |  |  |
| `monacoWrappingIndentEnabled` | boolean | store |  |  |
| `monacoWrappingStrategyEnabled` | boolean | store |  |  |
| `monacoCursorWidthEnabled` | boolean | store |  |  |
| `monacoCursorStyleEnabled` | boolean | store |  |  |
| `monacoCursorSurroundingLinesEnabled` | boolean | store |  |  |
| `monacoCursorSurroundingLinesStyleEnabled` | boolean | store |  |  |
| `monacoCursorHeightEnabled` | boolean | store |  |  |
| `monacoStickyScrollEnabled` | boolean | store |  |  |
| `monacoSelectionClipboardEnabled` | boolean | store |  |  |
| `monacoCopyWithSyntaxHighlightingEnabled` | boolean | store |  |  |
| `monacoOccurrencesHighlightDelayEnabled` | boolean | store |  |  |
| `monacoFormatOnPasteEnabled` | boolean | store |  |  |
| `monacoFormatOnTypeEnabled` | boolean | store |  |  |
| `monacoAutoClosingBracketsEnabled` | boolean | store |  |  |
| `monacoAutoClosingQuotesEnabled` | boolean | store |  |  |
| `monacoAutoIndentEnabled` | boolean | store |  |  |
| `monacoAutoSurroundEnabled` | boolean | store |  |  |
| `monacoMatchOnWordStartOnlyEnabled` | boolean | store |  |  |
| `monacoFindSeedSearchStringFromSelectionEnabled` | boolean | store |  |  |
| `monacoFindCursorMoveOnTypeEnabled` | boolean | store |  |  |
| `monacoFindFindOnTypeEnabled` | boolean | store |  |  |
| `monacoFindLoopEnabled` | boolean | store |  |  |
| `monacoAutoClosingDeleteEnabled` | boolean | store |  |  |
| `monacoAutoClosingCommentsEnabled` | boolean | store |  |  |
| `monacoEmptySelectionClipboardEnabled` | boolean | store |  |  |
| `monacoColumnSelectionEnabled` | boolean | store |  |  |
| `monacoWordSeparatorsEnabled` | boolean | store |  |  |
| `monacoMultiCursorModifierEnabled` | boolean | store |  |  |
| `monacoMultiCursorMergeOverlappingEnabled` | boolean | store |  |  |
| `monacoMultiCursorPasteEnabled` | boolean | store |  |  |
| `monacoAutoClosingOvertypeEnabled` | boolean | store |  |  |
| `monacoMouseStyleEnabled` | boolean | store |  |  |
| `monacoRenderFinalNewlineEnabled` | boolean | store |  |  |
| `monacoAccessibilitySupportEnabled` | boolean | store |  |  |
| `monacoScrollbarUseShadowsEnabled` | boolean | store |  |  |
| `monacoScrollbarAlwaysConsumeMouseWheelEnabled` | boolean | store |  |  |
| `monacoHorizontalScrollbarSizeEnabled` | boolean | store |  |  |
| `monacoVerticalScrollbarSizeEnabled` | boolean | store |  |  |
| `monacoMouseWheelScrollSensitivityEnabled` | boolean | store |  |  |
| `workspace.surface.padding.top` | number | localStorage |  |  |
| `workspace.surface.padding.right` | number | localStorage |  |  |
| `workspace.surface.padding.bottom` | number | localStorage |  |  |
| `workspace.surface.padding.left` | number | localStorage |  |  |
| `workspace.surface.margin.top` | number | localStorage |  |  |
| `workspace.surface.margin.right` | number | localStorage |  |  |
| `workspace.surface.margin.bottom` | number | localStorage |  |  |
| `workspace.surface.margin.left` | number | localStorage |  |  |
| `workspace.surface.gap` | number | localStorage |  |  |
| `workspace.split.divider.gap` | number | localStorage |  |  |
| `print.portrait.pageMargin.top` | number | localStorage |  |  |
| `print.portrait.pageMargin.right` | number | localStorage |  |  |
| `print.portrait.pageMargin.bottom` | number | localStorage |  |  |
| `print.portrait.pageMargin.left` | number | localStorage |  |  |
| `print.portrait.rootPadding.top` | number | localStorage |  |  |
| `print.portrait.rootPadding.right` | number | localStorage |  |  |
| `print.portrait.rootPadding.bottom` | number | localStorage |  |  |
| `print.portrait.rootPadding.left` | number | localStorage |  |  |
| `print.landscape.pageMargin.top` | number | localStorage |  |  |
| `print.landscape.pageMargin.right` | number | localStorage |  |  |
| `print.landscape.pageMargin.bottom` | number | localStorage |  |  |
| `print.landscape.pageMargin.left` | number | localStorage |  |  |
| `print.landscape.rootPadding.top` | number | localStorage |  |  |
| `print.landscape.rootPadding.right` | number | localStorage |  |  |
| `print.landscape.rootPadding.bottom` | number | localStorage |  |  |
| `print.landscape.rootPadding.left` | number | localStorage |  |  |
| `workspace.sync.docsMirror.rootPath` | string | localStorage |  |  |
| `workspace.sync.seed.enabled` | boolean | localStorage |  |  |
| `workspace.sync.seed.pollMs` | number | localStorage |  |  |
| `workspace.sync.seed.idleMaxMs` | number | localStorage |  |  |
| `workspace.sync.autoRefresh.enabled` | boolean | localStorage |  |  |
| `workspace.sync.sourceFiles.docsOnly` | boolean | localStorage |  |  |
| `workspace.sync.sourceFiles.debounceMs` | number | localStorage |  |  |
| `workspace.import.defaultSourceUrl` | string | localStorage |  |  |
| `workspace.import.shareExportRootPath` | string | localStorage |  |  |
| `workspace.import.videoDownload.outputDir` | string | localStorage |  |  |
| `pdfImportIncludeImages` | boolean | store | `kg:import:pdf:includeImages` | `import.pdf` |
| `pdfImportMaxPages` | number | store | `kg:import:pdf:maxPages` | `import.pdf` |
| `pdfImportMaxPdfBytes` | number | store | `kg:import:pdf:maxPdfBytes` | `import.pdf` |
| `pdfImportFetchTimeoutMs` | number | store | `kg:import:pdf:fetchTimeoutMs` | `import.pdf` |
| `pdfImportUploadTimeoutMs` | number | store | `kg:import:pdf:uploadTimeoutMs` | `import.pdf` |
| `pdfImportConvertTimeoutMs` | number | store | `kg:import:pdf:convertTimeoutMs` | `import.pdf` |
| `pdfImportStreamDecodeCacheMaxBytes` | number | store | `kg:import:pdf:streamDecodeCacheMaxBytes` | `import.pdf` |
| `pdfImportContentStreamMaxDecodeBytes` | number | store | `kg:import:pdf:contentStreamMaxDecodeBytes` | `import.pdf` |
| `pdfImportPageContentMaxBytes` | number | store | `kg:import:pdf:pageContentMaxBytes` | `import.pdf` |
| `pdfImportCmapMaxBytes` | number | store | `kg:import:pdf:cmapMaxBytes` | `import.pdf` |
| `pdfImportMaxToUnicodeStreamBytes` | number | store | `kg:import:pdf:maxToUnicodeStreamBytes` | `import.pdf` |
| `pdfImportToUnicodeMaxDecodeBytes` | number | store | `kg:import:pdf:toUnicodeMaxDecodeBytes` | `import.pdf` |
| `pdfImportImageStreamMaxDecodeBytes` | number | store | `kg:import:pdf:imageStreamMaxDecodeBytes` | `import.pdf` |
| `pdfImportMaxTextContentBytesPerPage` | number | store | `kg:import:pdf:maxTextContentBytesPerPage` | `import.pdf` |
| `pdfImportMaxTextStreamBytes` | number | store | `kg:import:pdf:maxTextStreamBytes` | `import.pdf` |
| `pdfImportMaxFormXObjectBytes` | number | store | `kg:import:pdf:maxFormXObjectBytes` | `import.pdf` |
| `pdfImportMaxFormXObjectStreamBytes` | number | store | `kg:import:pdf:maxFormXObjectStreamBytes` | `import.pdf` |
| `pdfImportMaxFormXObjectCount` | number | store | `kg:import:pdf:maxFormXObjectCount` | `import.pdf` |
| `pdfImportEmbedImages` | boolean | store | `kg:import:pdf:embedImages` | `import.pdf` |
| `pdfImportMaxExtractedImagesPerPage` | number | store | `kg:import:pdf:maxExtractedImagesPerPage` | `import.pdf` |
| `pdfImportMaxEmbeddedImagesPerPage` | number | store | `kg:import:pdf:maxEmbeddedImagesPerPage` | `import.pdf` |
| `pdfImportMaxEmbeddedTotalBytes` | number | store | `kg:import:pdf:maxEmbeddedTotalBytes` | `import.pdf` |
| `pdfImportMaxEmbeddedAssetBytes` | number | store | `kg:import:pdf:maxEmbeddedAssetBytes` | `import.pdf` |
| `pdfImportReconstructTables` | boolean | store | `kg:import:pdf:reconstructTables` | `import.pdf` |
| `pdfImportTableMinColumns` | number | store | `kg:import:pdf:tableMinColumns` | `import.pdf` |
| `pdfImportTableMinRows` | number | store | `kg:import:pdf:tableMinRows` | `import.pdf` |
| `pdfImportTableMaxRows` | number | store | `kg:import:pdf:tableMaxRows` | `import.pdf` |
| `pdfImportProvider` | string | store | `kg:import:pdf:provider` | `import.pdf` |
| `pdfImportDoclingEndpoint` | string | store | `kg:import:pdf:doclingEndpoint` | `import.pdf` |
| `pdfImportProviderFallbackToNative` | boolean | store | `kg:import:pdf:providerFallbackToNative` | `import.pdf` |
| `pdfImportOcrEnabled` | boolean | store | `kg:import:pdf:ocr:enabled` | `import.pdf` |
| `pdfImportOcrMode` | string | store | `kg:import:pdf:ocr:mode` | `import.pdf` |
| `youtubeTranscriptOutputDir` | string | store |  |  |
| `youtubeTranscriptOutputFormat` | string | store |  |  |
| `webpageImportIncludeImages` | boolean | store |  |  |
| `webpageImportView` | string | store |  |  |
| `webpageViewerScriptPolicy` | string | store |  |  |
| `webpageArtifactFidelityMaxLevel` | number | store |  |  |
| `websiteImportDiscoverSitemap` | boolean | store |  |  |
| `websiteImportGenerateWebpageArtifactDocs` | boolean | store |  |  |
| `websiteImportMaxPages` | number | store |  |  |
| `websiteImportConcurrency` | number | store |  |  |
| `websiteImportOutputDirRel` | string | store |  |  |
| `viewport.fitFillRatio` | number | store |  |  |
| `viewport.fitReferenceWidth` | number | store |  |  |
| `viewport.fitReferenceHeight` | number | store |  |  |
| `flow.frontmatter.initialFitFillRatio` | number | store |  |  |
| `flow.frontmatter.overlayFitProxyScale.phone` | number | store |  |  |
| `flow.frontmatter.overlayFitProxyScale.tablet` | number | store |  |  |
| `flow.frontmatter.overlayFitProxyScale.laptop` | number | store |  |  |
| `flow.frontmatter.overlayFitProxyScale.desktop` | number | store |  |  |
| `schema.layout.forces.physics2dChargeScale` | number | store |  |  |
| `schema.layout.forces.physics2dCollideStrengthScale` | number | store |  |  |
| `schema.layout.forces.physics2dBboxStrengthScale` | number | store |  |  |
| `schema.layout.forces.physics2dVelocityDecayBias` | number | store |  |  |
| `schema.layout.forces.physics2dMaxSpeedScale` | number | store |  |  |
| `schema.layout.forces.physics2dStrictOverlapScale` | number | store |  |  |
| `schema.layout.forces.physics2dLabelNudgeScale` | number | store |  |  |
| `schema.layout.forces.physics2dDragChargeScale` | number | store |  |  |
| `schema.layout.forces.physics2dDragDistanceMaxPx` | number | store |  |  |
| `schema.zoom.minScale` | number | store |  |  |
| `schema.layout.forces.radarSpokeDistancePx` | number | store |  |  |
| `schema.layout.forces.radarFlowDistancePx` | number | store |  |  |
| `schema.layout.forces.radarFlowCurveBend` | number | store |  |  |
| `schema.layout.forces.radarFlowOrbitShift` | number | store |  |  |
| `schema.layout.forces.radarFlowArrowLengthPx` | number | store |  |  |
| `schema.layout.forces.radarFlowArrowHalfWidthPx` | number | store |  |  |
| `schema.layout.forces.radarSpokeStrengthScale` | number | store |  |  |
| `schema.layout.forces.radarFlowStrengthScale` | number | store |  |  |
| `schema.layout.forces.radarNodeCharge` | number | store |  |  |
| `schema.layout.forces.radarHubCharge` | number | store |  |  |
| `schema.layout.forces.radialOrbitEnabled` | boolean | store |  |  |
| `schema.layout.forces.radialOrbitSpeedDeg` | number | store |  |  |
| `schema.layout.forces.radialOrbitSize` | number | store |  |  |
| `schema.layout.forces.radialOrbitRingGapPx` | number | store |  |  |
| `schema.layout.forces.radialOrbitDepthSpeedScale` | number | store |  |  |
| `schema.layout.forces.radialOrbitMode` | string | store |  |  |
| `schema.zoom.maxScale` | number | store |  |  |
| `zoom.labelScaleMode2d` | string | store |  |  |
| `zoom.labelScaleExponent2d` | number | store |  |  |
| `zoom.labelScaleClampMin2d` | number | store |  |  |
| `zoom.labelScaleClampMax2d` | number | store |  |  |
| `zoom.strokeScaleMode2d` | string | store |  |  |
| `zoom.strokeScaleExponent2d` | number | store |  |  |
| `zoom.strokeScaleClampMin2d` | number | store |  |  |
| `zoom.strokeScaleClampMax2d` | number | store |  |  |
| `historyDebounceMs` | number | store |  |  |
| `keyword.source.maxLines` | number | store |  |  |
| `keyword.source.maxChars` | number | store |  |  |
| `keyword.graph.previewDebounceMs` | number | store |  |  |
| `keyword.graph.fullDebounceMs` | number | store |  |  |
| `keyword.graph.edgesPerNode` | number | store |  |  |
| `keyword.graph.maxEdges` | number | store |  |  |
| `keyword.graph.mentionEdgesPerSourceNode` | number | store |  |  |
| `codeHighlightDurationMs` | number | store |  |  |
| `codeSelectThrottleMs` | number | store |  |  |
| `codeHighlightUntilClick` | boolean | store |  |  |
| `enableTabSync` | boolean | store |  |  |
| `enableVirtualTables` | boolean | store |  |  |
| `multiDimTableModeEnabled` | boolean | store |  |  |
| `import.json.workspaceTarget` | string | localStorage |  |  |
| `canvasRenderMode` | string | store |  |  |
| `canvas3dMode` | string | store | `kg:render:3dMode` | `render.prefs` |
| `viewportControlsPreset` | string | store | `kg:ui:viewport:controlsPreset` | `ui.workspace` |
| `infiniteCanvasInteractionMode` | string | store | `kg:ui:canvas:interactionMode` | `ui.workspace` |
| `canvasWorkspaceSyncMode` | string | store | `kg:ui:canvas:workspaceSyncMode` | `ui.workspace` |
| `storyboardWidgetSelectionOnDrag` | boolean | store | `kg:ui:storyboardWidget:selectionOnDrag` | `ui.workspace` |
| `storyboardWidgetOverlayWheelProxyEnabled` | boolean | store | `kg:ui:storyboardWidget:overlayWheelProxyEnabled` | `ui.workspace` |
| `viewPinned` | boolean | store |  |  |
| `fitToScreenMode` | boolean | store |  |  |

<!-- SETTINGS_REGISTRY_TABLE_END -->

## Verification Condition

| VCC | Condition | Invocable check | Expected result | Evidence |
|---|---|---|---|---|
| `VCC-GEN-SETTINGS-01` | Both generated parts retain one unique projection of every settings row and remain below 600 lines. | `npm --prefix canvas run test:ci:unit -- chat.responseContract.docs.kgcPromptContractCanonical` | The focused case reports a non-zero test count and exits 0. | None recorded in this document |
