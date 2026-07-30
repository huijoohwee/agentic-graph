---
title: "Knowgrph Technical Architecture"
id: "md:knowgrph-technical-architecture"
doc_type: "Generated Registry Surface"
version: "1.0.0"
date: "2026-07-30"
lang: "en-US"
owner: "docs.generated.technical-architecture-registry"
local_rung: "dev-proven"
delivered_rung: "runtime-ready"
lane: "authoring"
universal_scope: false
doc_path: "docs/knowgrph-technical-architecture.md"
canonical_docs_root: "docs/documents"
generator_owner: "canvas/src/cli/lint-doc.ts"
---
# Knowgrph Technical Architecture

## Generated Registry Contract
The opening YAML frontmatter block remains the machine SSOT for this generated registry surface. Canonical architecture prose and behavior ownership live under `docs/documents/`; update source docs or generator inputs there, keep registry rows generator-owned from `canvas/src/cli/lint-doc.ts`, and use `docs/documents/knowgrph-settings-document.md`, `docs/documents/knowgrph-chat-ai-markdown-pipeline-document.md`, and `docs/documents/knowgrph-llm-prompt-contract-prd-tad.md` as canonical owner maps instead of inferring runtime decisions from stale generated rows.

## Settings Registry
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
| `chatKnowgrphStorageMode` | string | localStorage | `kg:chat:chatKnowgrph:storageMode` | `ui.chat` |
| `chatKnowgrphWorkspacePath` | string | localStorage | `kg:chat:chatKnowgrph:workspacePath` | `ui.chat` |
| `chatKnowgrphCloudUrl` | string | localStorage | `kg:chat:chatKnowgrph:cloudUrl` | `ui.chat` |
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
| `KG_INPUT_PATH` | string | backendEnv |  |  |
| `KG_OUTPUT_DIR` | string | backendEnv |  |  |
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

<!-- SETTINGS_REGISTRY_TABLE_END -->
