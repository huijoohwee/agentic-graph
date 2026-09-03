import {
  STRIPE_PAYMENT_SERVER_RUNTIME_SCOPE,
  STRIPE_PAYMENT_SERVER_SECRET_ENV_SUMMARY,
} from 'grph-shared/payments/stripePaymentSsot'
import {
  OPENAI_MCP_DEFAULT_API_KEY_ENV,
  OPENAI_MCP_DEFAULT_VECTOR_STORE_ENV,
} from 'grph-shared/openai/openaiMcpSsot'

const WORKSPACE_LAYOUT_SETTING_KEYS = [
  'workspace.surface.padding.top',
  'workspace.surface.padding.right',
  'workspace.surface.padding.bottom',
  'workspace.surface.padding.left',
  'workspace.surface.margin.top',
  'workspace.surface.margin.right',
  'workspace.surface.margin.bottom',
  'workspace.surface.margin.left',
  'workspace.surface.gap',
  'workspace.split.divider.gap',
] as const

const WORKSPACE_PRINT_SETTING_KEYS = [
  'print.portrait.pageMargin.top',
  'print.portrait.pageMargin.right',
  'print.portrait.pageMargin.bottom',
  'print.portrait.pageMargin.left',
  'print.portrait.rootPadding.top',
  'print.portrait.rootPadding.right',
  'print.portrait.rootPadding.bottom',
  'print.portrait.rootPadding.left',
  'print.landscape.pageMargin.top',
  'print.landscape.pageMargin.right',
  'print.landscape.pageMargin.bottom',
  'print.landscape.pageMargin.left',
  'print.landscape.rootPadding.top',
  'print.landscape.rootPadding.right',
  'print.landscape.rootPadding.bottom',
  'print.landscape.rootPadding.left',
] as const

const WORKSPACE_LAYOUT_FALLBACK_DETAILS = Object.fromEntries(
  WORKSPACE_LAYOUT_SETTING_KEYS.map(key => [
    key,
    {
      area: 'Workspace',
      responsibility: `Workspace surface spacing token (${key.split('.').slice(-2).join(' ')})`,
      notes: 'Unit: rem',
    },
  ]),
)

const WORKSPACE_PRINT_FALLBACK_DETAILS = Object.fromEntries(
  WORKSPACE_PRINT_SETTING_KEYS.map(key => [
    key,
    {
      area: 'Workspace',
      responsibility: `PDF print layout token (${key.split('.').slice(0, 3).join(' ')} ${key.split('.').slice(-1)[0]})`,
      notes: 'Unit: mm',
    },
  ]),
)

export const FALLBACK_DETAILS: Record<string, { area?: string; responsibility?: string; notes?: string }> = {
  ...WORKSPACE_LAYOUT_FALLBACK_DETAILS,
  ...WORKSPACE_PRINT_FALLBACK_DETAILS,
  'workspace.sync.seed.enabled': {
    area: 'Workspace Storage Sync',
    responsibility: 'Enable periodic workspace seed/docs sync into local workspace FS',
  },
  'workspace.sync.docsMirror.rootPath': {
    area: 'Workspace Storage Sync',
    responsibility: 'Absolute filesystem root for the Source Files docs mirror',
    notes: 'Defaults to VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT when no MainPanel override is saved.',
  },
  'workspace.sync.seed.pollMs': {
    area: 'Workspace Storage Sync',
    responsibility: 'Polling interval for workspace seed/docs sync',
    notes: 'Unit: ms, clamped to [1000, 60000]',
  },
  'workspace.sync.seed.idleMaxMs': {
    area: 'Workspace Storage Sync',
    responsibility: 'Max adaptive backoff interval for workspace seed/docs sync when no updates are detected',
    notes: 'Unit: ms, clamped to [1000, 300000]',
  },
  'workspace.sync.autoRefresh.enabled': {
    area: 'Workspace Storage Sync',
    responsibility: 'Auto-refresh editor workspace when workspace FS changes',
  },
  'workspace.sync.sourceFiles.docsOnly': {
    area: 'Source File Management',
    responsibility: 'Constrain automated Source Files hydration to canonical workspace mirror roots such as /docs and the configured chat storage root',
    notes: 'Default automated paths are the configured docs mirror plus the configured chat workspace root; Import local files remains manual-only.',
  },
  'workspace.sync.sourceFiles.debounceMs': {
    area: 'Source File Management',
    responsibility: 'Debounce interval before Source Files rematerialization after workspace FS updates',
    notes: 'Unit: ms, clamped to [100, 10000]; applies to automated docs mirror and workspace-FS refreshes.',
  },
  'workspace.import.defaultSourceUrl': {
    area: 'Source File Management',
    responsibility: 'Default remote source URL for source-file bootstrap without using hidden local imports',
    notes: 'Local filesystem paths and Cloudflare dashboard D1 URLs normalize to the configured storage base URL.',
  },
  'workspace.import.shareExportRootPath': {
    area: 'Import / Export',
    responsibility: 'Workspace mirror root used by Import URL share artifact exports',
    notes: 'Accepts workspace-like roots such as /docs_ and also normalizes sibling absolute filesystem paths under the current workspace mirror base root.',
  },
  'payments.stripe.mode': { area: 'Stripe Payment API', responsibility: 'Stripe mode label (test vs live)' },
  'payments.stripe.secretKey': { area: 'Stripe Payment API', responsibility: 'Stripe secret key (server-side)', notes: `Keep secret keys server-side only; configure ${STRIPE_PAYMENT_SERVER_SECRET_ENV_SUMMARY} on the payment server runtime.` },
  'payments.stripe.publishableKey': { area: 'Stripe Payment API', responsibility: 'Stripe publishable key (client-side)' },
  'payments.stripe.webhookSecret': { area: 'Stripe Payment API', responsibility: 'Stripe webhook signing secret', notes: `Server-managed only; used by the payment server runtime to verify webhook signatures. ${STRIPE_PAYMENT_SERVER_RUNTIME_SCOPE}` },
  'payments.stripe.accountId': { area: 'Stripe Payment API', responsibility: 'Stripe account id (optional, Connect)' },
  autoEnableGeospatialOnGeoImport: { area: 'Geo', responsibility: 'Auto-enable Geospatial Mode after Geo imports' },
  'maps.grabmaps.authMode': { area: 'GrabMaps', responsibility: 'GrabMaps auth mode (server-managed default or explicit BYOK)' },
  'maps.grabmaps.apiKey': { area: 'GrabMaps', responsibility: 'GrabMaps BYOK API key (memory-only)' },
  'maps.grabmaps.directions.endpointUrl': { area: 'GrabMaps Directions Request', responsibility: 'Directions endpoint URL' },
  'maps.grabmaps.directions.originLng': { area: 'GrabMaps Directions Request', responsibility: 'Origin longitude' },
  'maps.grabmaps.directions.originLat': { area: 'GrabMaps Directions Request', responsibility: 'Origin latitude' },
  'maps.grabmaps.directions.destinationLng': { area: 'GrabMaps Directions Request', responsibility: 'Destination longitude' },
  'maps.grabmaps.directions.destinationLat': { area: 'GrabMaps Directions Request', responsibility: 'Destination latitude' },
  'maps.grabmaps.directions.overview': { area: 'GrabMaps Directions Request', responsibility: 'Route geometry overview level' },
  'maps.grabmaps.directions.latFirst': { area: 'GrabMaps Directions Request', responsibility: 'Coordinate order toggle (lat_first)' },
  'maps.grabmaps.directions.alternatives': { area: 'GrabMaps Directions Request', responsibility: 'Request alternative routes (if supported)' },
  'maps.grabmaps.directions.steps': { area: 'GrabMaps Directions Request', responsibility: 'Request per-step instructions (if supported)' },
  'maps.grabmaps.directions.language': { area: 'GrabMaps Directions Request', responsibility: 'Language code (if supported)' },
  'maps.grabmaps.directions.units': { area: 'GrabMaps Directions Request', responsibility: 'Units preference (if supported)' },
  'maps.grabmaps.directions.waypoints': { area: 'GrabMaps Directions Request', responsibility: 'Waypoints JSON array (shape endpoint-dependent)' },
  'maps.grabmaps.directions.annotations': { area: 'GrabMaps Directions Request', responsibility: 'Annotations JSON array (shape endpoint-dependent)' },
  'maps.grabmaps.directions.extraParams': { area: 'GrabMaps Directions Request', responsibility: 'Extra params JSON object (forward-compat)' },
  'maps.grabmaps.basemap.styleUrl': { area: 'GrabMaps', responsibility: 'GrabMaps basemap style.json URL' },
  'maps.grabmaps.mcp.serverKey': { area: 'GrabMaps MCP Configuration', responsibility: 'MCP server key under mcpServers' },
  'maps.grabmaps.mcp.command': { area: 'GrabMaps MCP Configuration', responsibility: 'MCP launcher command' },
  'maps.grabmaps.mcp.args': { area: 'GrabMaps MCP Configuration', responsibility: 'MCP launcher args JSON array' },
  'maps.grabmaps.mcp.env': { area: 'GrabMaps MCP Configuration', responsibility: 'MCP launcher env JSON object' },
  'maps.grabmaps.mcp.startupTimeoutMs': { area: 'GrabMaps MCP Configuration', responsibility: 'MCP startup timeout in milliseconds' },
  'maps.grabmaps.mcp.discovery.chatModel': { area: 'GrabMaps MCP Configuration', responsibility: 'GrabMaps Chat Discovery Widget model id' },
  'maps.grabmaps.mcp.searchPlaces.query': { area: 'GrabMaps MCP Configuration', responsibility: 'search_places query string' },
  'maps.grabmaps.mcp.searchPlaces.country': { area: 'GrabMaps MCP Configuration', responsibility: 'search_places ISO 3166-1 alpha-3 country bias' },
  'maps.grabmaps.mcp.searchPlaces.lat': { area: 'GrabMaps MCP Configuration', responsibility: 'search_places latitude anchor' },
  'maps.grabmaps.mcp.searchPlaces.lon': { area: 'GrabMaps MCP Configuration', responsibility: 'search_places longitude anchor' },
  'maps.grabmaps.mcp.searchPlaces.radius': { area: 'GrabMaps MCP Configuration', responsibility: 'search_places MCP-only contextual bias radius' },
  'maps.grabmaps.mcp.searchPlaces.limit': { area: 'GrabMaps MCP Configuration', responsibility: 'search_places max result count' },
  'maps.grabmaps.mcp.getDirections.origin': { area: 'GrabMaps MCP Configuration', responsibility: 'get_directions origin string' },
  'maps.grabmaps.mcp.getDirections.destination': { area: 'GrabMaps MCP Configuration', responsibility: 'get_directions destination string' },
  'maps.grabmaps.mcp.getDirections.waypoints': { area: 'GrabMaps MCP Configuration', responsibility: 'get_directions waypoints JSON array' },
  'maps.grabmaps.mcp.nearbySearch.lat': { area: 'GrabMaps MCP Configuration', responsibility: 'nearby_search latitude anchor' },
  'maps.grabmaps.mcp.nearbySearch.lon': { area: 'GrabMaps MCP Configuration', responsibility: 'nearby_search longitude anchor' },
  'maps.grabmaps.mcp.nearbySearch.radius': { area: 'GrabMaps MCP Configuration', responsibility: 'nearby_search radius in kilometres' },
  'maps.grabmaps.mcp.nearbySearch.limit': { area: 'GrabMaps MCP Configuration', responsibility: 'nearby_search max POI count' },
  'maps.grabmaps.mcp.nearbySearch.rankBy': { area: 'GrabMaps MCP Configuration', responsibility: 'nearby_search sort mode (distance or popularity)' },
  'maps.grabmaps.mcp.nearbySearch.language': { area: 'GrabMaps MCP Configuration', responsibility: 'nearby_search language for place names' },
  'maps.grabmaps.mcp.nearbySearch.category': { area: 'GrabMaps MCP Configuration', responsibility: 'nearby_search POI category' },
  'browser.apiNative.mcp.serverKey': { area: 'API-Native Browser MCP Configuration', responsibility: 'MCP server key inside mcpServers for the browser/API runtime' },
  'browser.apiNative.mcp.command': { area: 'API-Native Browser MCP Configuration', responsibility: 'MCP launcher command for the browser/API runtime' },
  'browser.apiNative.mcp.args': { area: 'API-Native Browser MCP Configuration', responsibility: 'MCP launcher args JSON array for the browser/API runtime' },
  'browser.apiNative.mcp.env': { area: 'API-Native Browser MCP Configuration', responsibility: 'MCP launcher env JSON object for the browser/API runtime' },
  'browser.apiNative.mcp.startupTimeoutMs': { area: 'API-Native Browser MCP Configuration', responsibility: 'MCP startup timeout in milliseconds' },
  'browser.apiNative.mcp.runtimeUrl': { area: 'API-Native Browser MCP Configuration', responsibility: 'Local browser API runtime URL for agentic-graph MCP bridge calls' },
  'browser.apiNative.mcp.defaultIntent': { area: 'API-Native Browser MCP Configuration', responsibility: 'Default natural-language browser task intent' },
  'browser.apiNative.mcp.targetUrl': { area: 'API-Native Browser MCP Configuration', responsibility: 'Default target URL for browser/API route resolution' },
  'browser.apiNative.mcp.dryRun': { area: 'API-Native Browser MCP Configuration', responsibility: 'Default browser API execution dry-run flag' },
  'browser.apiNative.mcp.confirmUnsafe': { area: 'API-Native Browser MCP Configuration', responsibility: 'Unsafe browser API execution confirmation flag' },
  'browser.apiNative.mcp.confirmThirdPartyTerms': { area: 'API-Native Browser MCP Configuration', responsibility: 'Third-party terms confirmation flag for policy-sensitive browser API routes' },
  'browser.apiNative.mcp.confirmCookieImport': { area: 'API-Native Browser MCP Configuration', responsibility: 'Cookie import confirmation flag for auth cookie storage access' },
  'openai.mcp.serverLabel': { area: 'OpenAI MCP Server Configuration', responsibility: 'Responses API MCP tool server_label' },
  'openai.mcp.serverUrl': { area: 'OpenAI MCP Server Configuration', responsibility: 'Remote MCP server_url for ChatGPT Apps and Responses API' },
  'openai.mcp.transport': { area: 'OpenAI MCP Server Configuration', responsibility: 'Remote MCP transport for the custom server' },
  'openai.mcp.allowedTools': { area: 'OpenAI MCP Server Configuration', responsibility: 'Responses API allowed_tools JSON array' },
  'openai.mcp.requireApproval': { area: 'OpenAI MCP Server Configuration', responsibility: 'Responses API require_approval mode' },
  'openai.mcp.responsesModel': { area: 'OpenAI MCP Server Configuration', responsibility: 'Responses API model used to test the MCP server' },
  'openai.mcp.authMode': { area: 'OpenAI MCP Server Configuration', responsibility: 'ChatGPT app auth mode for the remote MCP server' },
  'openai.mcp.apiKeyEnv': { area: 'OpenAI MCP Server Configuration', responsibility: `Server-side OpenAI API key env var name (${OPENAI_MCP_DEFAULT_API_KEY_ENV})`, notes: 'Stores the environment variable name only; never stores the API key value.' },
  'openai.mcp.vectorStoreEnv': { area: 'OpenAI MCP Server Configuration', responsibility: `Server-side vector store id env var name (${OPENAI_MCP_DEFAULT_VECTOR_STORE_ENV})` },
  'openai.mcp.serverPort': { area: 'OpenAI MCP Server Configuration', responsibility: 'Local development FastMCP SSE server port' },
  'openai.mcp.requireToolReview': { area: 'OpenAI MCP Server Configuration', responsibility: 'Require review of custom MCP tool parameters and untrusted content' },
  uiPanelOpacity: { area: 'Global Translucency', responsibility: 'Main Panel opacity' },
  uiToolbarOpacity: { area: 'Global Translucency', responsibility: 'Toolbar opacity' },
  chatMaxCompletionTokens: {
    area: 'Chat',
    responsibility: 'Maximum completion tokens per response (provider-compatible key)',
    notes: 'Used for max_tokens/max_completion_tokens depending on provider/model. Defaults to 2× the prior baseline.',
  },
  chatGraphSummaryMaxTokens: {
    area: 'Chat',
    responsibility: 'Max tokens for packContext.graph_summary (approx)',
  },
  chatGuidelineDigestMaxTokens: {
    area: 'Chat',
    responsibility: 'Max tokens for packContext.guideline_digest (approx)',
  },
  canvasSnapEnabled: { area: 'Canvas Grid', responsibility: 'Snap-to-grid enabled (affects dragging, resizing, nudging)' },
  canvasSnapGridSize: { area: 'Canvas Grid', responsibility: 'Snap grid size (world units)', notes: 'Alt disables snapping while dragging. Arrow nudges follow the grid when enabled.' },
  canvasGridVisible: { area: 'Canvas Grid', responsibility: 'Show/hide the infinite canvas grid background' },
  canvasGridVariant: { area: 'Canvas Grid', responsibility: 'Grid background variant (dots or lines)' },
  canvasGridMajorEvery: { area: 'Canvas Grid', responsibility: 'Every N minor steps, draw a major grid' },
  canvasGridDotRadiusPx: { area: 'Canvas Grid', responsibility: 'Dot radius (px) when variant=dots' },
  historyDebounceMs: { area: 'Editor Behavior & Timing', responsibility: 'Debounce history' },
  codeHighlightDurationMs: { area: 'Editor Behavior & Timing', responsibility: 'Code highlight duration' },
  codeSelectThrottleMs: { area: 'Editor Behavior & Timing', responsibility: 'Code→Canvas selection throttle' },
  codeHighlightUntilClick: { area: 'Editor Behavior & Timing', responsibility: 'Highlight until click' },
  uiIconScale: {
    area: 'UI Density: Icons',
    responsibility: 'Global icon scale (toolbar, panels, bottom surface)',
    notes: 'Options: compact (smaller icons, denser UI) or default (larger icons, more spacious). Applied via getIconSizeClass across HeaderActions, Toolbar, SearchPanel, History panels, Launch Spotlight status, Help/Workflow headers, Help Icon Library legend, and bottom-surface toolbars.',
  },
  uiIconFormat: {
    area: 'UI Density: Icons',
    responsibility: 'Global icon format (default vs minimal styling)',
  },
  uiIconStrokeWidth: {
    area: 'UI Density: Icons',
    responsibility: 'Global Lucide icon stroke width',
  },
  uiIconColorClass: {
    area: 'UI Density: Icons',
    responsibility: 'Base Tailwind class for icon color',
  },
  uiIconHoverBgClass: {
    area: 'UI Density: Icons',
    responsibility: 'Base Tailwind class for icon hover background',
  },
  uiIconButtonPaddingClass: {
    area: 'UI Density: Icons',
    responsibility: 'Base Tailwind class for icon button padding',
  },
  uiIconPillClass: {
    area: 'UI Density: Icons',
    responsibility: 'Base Tailwind class for icon legend pills (scope, origin, visibility, field types)',
  },
  uiIconPillLegendTextSizeClass: {
    area: 'UI Density: Icons',
    responsibility: 'Tailwind class for legend pill text size',
  },
  uiIconPillBadgeTextSizeClass: {
    area: 'UI Density: Icons',
    responsibility: 'Tailwind class for badge and inline pill text size',
  },
  uiIconBadgeChipClass: {
    area: 'UI Density: Icons',
    responsibility: 'Base Tailwind class for small schema/property badge chips',
  },
  uiIconBadgeChipTextSizeClass: {
    area: 'UI Density: Icons',
    responsibility: 'Tailwind class for badge chip text size',
  },
  uiPanelKeyValueTextSizeClass: {
    area: 'UI Density: Panels',
    responsibility: 'Tailwind class for panel key/value text size',
  },
  uiPanelMicroLabelTextSizeClass: {
    area: 'UI Density: Panels',
    responsibility: 'Tailwind class for panel micro-label helper text size',
  },
  uiPanelTextFontClass: {
    area: 'UI Density: Panels',
    responsibility: 'Tailwind class for panel key/value text font',
  },
  uiPanelKeyValueInputClass: {
    area: 'UI Density: Panels',
    responsibility: 'Tailwind class for panel key/value numeric input shell',
  },
  uiPanelRowDensityDefaultClass: {
    area: 'UI Density: Panels',
    responsibility: 'Tailwind class for default panel row padding (density="default")',
  },
  uiPanelMonospaceTextClass: {
    area: 'UI Density: Panels',
    responsibility: 'Tailwind class for panel monospace text in Graph JSON, Parser, Schema, and Markdown editors',
  },
  monacoLanguageJsonEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable Monaco JSON language support',
    notes: 'When disabled, JSON Monaco surfaces fall back to plaintext.',
  },
  monacoLanguageJsonLoadMode: {
    area: 'Editor: Monaco',
    responsibility: 'Load mode for Monaco JSON language support',
  },
  monacoLanguageSqlEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable Monaco SQL language support',
    notes: 'When disabled, SQL Monaco surfaces fall back to plaintext.',
  },
  monacoLanguageSqlLoadMode: {
    area: 'Editor: Monaco',
    responsibility: 'Load mode for Monaco SQL language support',
  },
  monacoLanguageYamlEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable Monaco YAML language support',
    notes: 'When disabled, YAML Monaco surfaces fall back to plaintext.',
  },
  monacoLanguageYamlLoadMode: {
    area: 'Editor: Monaco',
    responsibility: 'Load mode for Monaco YAML language support',
  },
  monacoWorkerJsonEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable Monaco JSON worker',
  },
  monacoWorkerJsonLoadMode: {
    area: 'Editor: Monaco',
    responsibility: 'Load mode for Monaco JSON worker',
  },
  monacoHoverEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable Monaco hover tooltips',
  },
  monacoLinksEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable Monaco clickable links',
  },
  monacoQuickSuggestionsEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable Monaco quick suggestions',
  },
  monacoSuggestOnTriggerCharactersEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable Monaco suggest-on-trigger-characters behavior',
  },
  monacoParameterHintsEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable Monaco parameter hints',
  },
  monacoLineNumbersEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Show Monaco line numbers',
  },
  monacoFoldingEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable Monaco code folding',
  },
  monacoMinimapEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Show Monaco minimap',
  },
  monacoSelectionHighlightEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable Monaco selection highlight matches',
  },
  monacoOccurrencesHighlightEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable Monaco symbol occurrence highlighting',
  },
  monacoGuidesEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable Monaco indentation and bracket guides',
  },
  monacoBracketPairColorizationEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable Monaco bracket pair colorization',
  },
  monacoCodeLensEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable Monaco code lens overlays',
  },
  monacoLightbulbEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable Monaco lightbulb code-action affordance',
  },
  monacoInlayHintsEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable Monaco inlay hints',
  },
  monacoWordBasedSuggestionsEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable Monaco word-based suggestions',
  },
  monacoInlineSuggestEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable Monaco inline suggestions',
  },
  monacoAcceptSuggestionOnEnterEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable Monaco accept-suggestion-on-enter behavior',
  },
  monacoDragAndDropEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable Monaco drag-and-drop editing gestures',
  },
  monacoDropIntoEditorEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable Monaco drop-into-editor behavior',
  },
  monacoColorDecoratorsEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable Monaco color decorators',
  },
  monacoUnicodeHighlightEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable Monaco unicode highlighting',
  },
  monacoMatchBracketsEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable Monaco bracket matching emphasis',
  },
  monacoRenderLineHighlightEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable Monaco active line highlight',
  },
  monacoGlyphMarginEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable Monaco glyph margin',
  },
  monacoOverviewRulerLanesEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable Monaco overview ruler lanes',
  },
  monacoLineDecorationsWidthEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable Monaco line decorations width gutter',
  },
  monacoRenderWhitespaceEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable Monaco whitespace rendering markers',
  },
  monacoRenderControlCharactersEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable Monaco control-character rendering markers',
  },
  monacoSmoothScrollingEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable Monaco smooth scrolling',
  },
  monacoScrollBeyondLastLineEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable Monaco scrolling beyond the last line',
  },
  monacoMouseWheelZoomEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable Monaco mouse-wheel zoom',
  },
  monacoCursorBlinkingEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable Monaco cursor blinking',
  },
  monacoCursorSmoothCaretAnimationEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable Monaco smooth caret animation',
  },
  monacoWordWrapEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable Monaco word wrap override',
  },
  monacoWrappingIndentEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable Monaco wrapped-line indentation',
  },
  monacoWrappingStrategyEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable Monaco advanced wrapping strategy',
  },
  monacoCursorWidthEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable wider Monaco cursor width',
  },
  monacoCursorStyleEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable alternate Monaco cursor style',
  },
  monacoCursorSurroundingLinesEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable Monaco cursor surrounding lines',
  },
  monacoCursorSurroundingLinesStyleEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable Monaco cursor surrounding lines style',
  },
  monacoCursorHeightEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable taller Monaco cursor height',
  },
  monacoStickyScrollEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable Monaco sticky scroll',
  },
  monacoSelectionClipboardEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable Monaco selection clipboard integration',
  },
  monacoCopyWithSyntaxHighlightingEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable Monaco copy with syntax highlighting',
  },
  monacoOccurrencesHighlightDelayEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable Monaco longer occurrences highlight delay',
  },
  monacoFormatOnPasteEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable Monaco format-on-paste behavior',
  },
  monacoFormatOnTypeEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable Monaco format-on-type behavior',
  },
  monacoAutoClosingBracketsEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable Monaco auto-closing brackets',
  },
  monacoAutoClosingQuotesEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable Monaco auto-closing quotes',
  },
  monacoAutoIndentEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable Monaco auto-indent behavior',
  },
  monacoAutoSurroundEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable Monaco auto-surround behavior',
  },
  monacoMatchOnWordStartOnlyEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable Monaco match-on-word-start-only search behavior',
  },
  monacoFindSeedSearchStringFromSelectionEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable Monaco find seed-from-selection behavior',
  },
  monacoFindCursorMoveOnTypeEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable Monaco find cursor-move-on-type behavior',
  },
  monacoFindFindOnTypeEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable Monaco find-on-type behavior',
  },
  monacoFindLoopEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable Monaco find loop behavior',
  },
  monacoAutoClosingDeleteEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable Monaco auto-closing delete behavior',
  },
  monacoAutoClosingCommentsEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable Monaco auto-closing comments',
  },
  monacoEmptySelectionClipboardEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable Monaco empty-selection clipboard behavior',
  },
  monacoColumnSelectionEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable Monaco column selection',
  },
  monacoWordSeparatorsEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable Monaco default word separators',
  },
  monacoMultiCursorModifierEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable Monaco alternate multi-cursor modifier',
  },
  monacoMultiCursorMergeOverlappingEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable Monaco multi-cursor overlap merging',
  },
  monacoMultiCursorPasteEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable Monaco multi-cursor spread paste',
  },
  monacoAutoClosingOvertypeEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable Monaco auto-closing overtype behavior',
  },
  monacoMouseStyleEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable Monaco default mouse cursor style',
  },
  monacoRenderFinalNewlineEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable Monaco final newline rendering',
  },
  monacoAccessibilitySupportEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable Monaco accessibility support',
  },
  monacoScrollbarUseShadowsEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable Monaco scrollbar shadows',
  },
  monacoScrollbarAlwaysConsumeMouseWheelEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable Monaco scrollbar mouse-wheel consumption',
  },
  monacoHorizontalScrollbarSizeEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable larger Monaco horizontal scrollbar size',
  },
  monacoVerticalScrollbarSizeEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable larger Monaco vertical scrollbar size',
  },
  monacoMouseWheelScrollSensitivityEnabled: {
    area: 'Editor: Monaco',
    responsibility: 'Enable higher Monaco mouse-wheel scroll sensitivity',
  },
  uiHeaderRowHeightClass: {
    area: 'UI Density: Headers',
    responsibility: 'Responsive class for primary header row min-height',
  },
  uiHeaderRowPaddingClass: {
    area: 'UI Density: Headers',
    responsibility: 'Tailwind class for primary header row padding',
  },
  uiSectionHeaderRowHeightClass: {
    area: 'UI Density: Headers',
    responsibility: 'Responsive class for section header row min-height',
  },
  uiSectionHeaderRowPaddingClass: {
    area: 'UI Density: Headers',
    responsibility: 'Tailwind class for section header row padding',
  },
  uiIconAnimationEnabled: {
    area: 'UI Density: Icons',
    responsibility: 'Enable toolbar launch/3D icon animation',
  },
  pdfImportIncludeImages: {
    area: 'Import: PDF',
    responsibility: 'Include extracted PDF images in Markdown output',
  },
  pdfImportEmbedImages: {
    area: 'Import: PDF',
    responsibility: 'Embed eligible images as data: URIs (bounded)',
  },
  'schema.layout.forces.physics2dChargeScale': {
    area: 'Graph Physics 2D',
    responsibility: 'Scale auto-tuned D3 many-body repulsion (when schema.layout.forces.charge is unset)',
  },
  'schema.layout.forces.physics2dCollideStrengthScale': {
    area: 'Graph Physics 2D',
    responsibility: 'Scale auto-tuned node-node collision strength',
  },
  'schema.layout.forces.physics2dBboxStrengthScale': {
    area: 'Graph Physics 2D',
    responsibility: 'Scale bbox/group-bbox collision strength (nodes, groups, rich-media boxes)',
  },
  'schema.layout.forces.physics2dVelocityDecayBias': {
    area: 'Graph Physics 2D',
    responsibility: 'Bias velocityDecay (damping) to reduce sudden motion',
  },
  'schema.layout.forces.physics2dMaxSpeedScale': {
    area: 'Graph Physics 2D',
    responsibility: 'Scale per-tick max speed clamp (limits drastic jumps)',
  },
  'schema.layout.forces.physics2dStrictOverlapScale': {
    area: 'Graph Physics 2D',
    responsibility: 'Scale strict overlap correction (post-layout relax for nodes/groups)',
  },
  'schema.layout.forces.physics2dLabelNudgeScale': {
    area: 'Graph Physics 2D',
    responsibility: 'Scale group label-label nudge relaxation',
  },
  'schema.layout.forces.physics2dDragChargeScale': {
    area: 'Graph Physics 2D',
    responsibility: 'Scale drag-time charge softening while dragging',
  },
  'schema.layout.forces.physics2dDragDistanceMaxPx': {
    area: 'Graph Physics 2D',
    responsibility: 'Cap drag-time charge distanceMax (localizes repulsion during dragging)',
  },
  pdfImportMaxExtractedImagesPerPage: {
    area: 'Import: PDF',
    responsibility: 'Max images extracted per page (0 disables extraction)',
  },
  pdfImportMaxEmbeddedImagesPerPage: {
    area: 'Import: PDF',
    responsibility: 'Max images embedded/linked per page in Markdown',
  },
  pdfImportMaxEmbeddedTotalBytes: {
    area: 'Import: PDF',
    responsibility: 'Max total embedded image bytes per conversion',
  },
  pdfImportMaxEmbeddedAssetBytes: {
    area: 'Import: PDF',
    responsibility: 'Max bytes per embedded image asset',
  },
  pdfImportProvider: {
    area: 'Import: PDF',
    responsibility: 'PDF→Markdown provider (native local vs Docling remote)',
  },
  pdfImportDoclingEndpoint: {
    area: 'Import: PDF',
    responsibility: 'Docling HTTP endpoint (used when provider=docling-remote)',
  },
  pdfImportProviderFallbackToNative: {
    area: 'Import: PDF',
    responsibility: 'Fallback to native conversion when Docling fails',
  },
  pdfImportOcrEnabled: {
    area: 'Import: PDF',
    responsibility: 'Enable OCR enhancement for sparse text pages',
  },
  pdfImportOcrMode: {
    area: 'Import: PDF',
    responsibility: 'OCR mode (fallback vs always)',
  },
  'three.voxel.districts.enabled': {
    area: 'Voxel Mode',
    responsibility: 'Enable cluster district slabs in voxel mode',
  },
  'three.voxel.districts.paddingCells': {
    area: 'Voxel Mode',
    responsibility: 'District padding in grid cells (world quantized)',
  },
  'three.voxel.districts.opacity': {
    area: 'Voxel Mode',
    responsibility: 'District slab opacity',
  },
  'three.voxel.bridges.tubeRadius': {
    area: 'Voxel Mode',
    responsibility: 'Bridge tube radius (TubeGeometry)',
  },
  'three.voxel.bridges.opacity': {
    area: 'Voxel Mode',
    responsibility: 'Bridge tube opacity baseline',
  },
  'three.voxel.bridges.pulseStrength': {
    area: 'Voxel Mode',
    responsibility: 'Bridge tube pulse strength (opacity + emissive)',
  },
  'three.voxel.bridges.particles.enabled': {
    area: 'Voxel Mode',
    responsibility: 'Enable tube flow particles (instanced)',
  },
  'three.voxel.bridges.particles.density': {
    area: 'Voxel Mode',
    responsibility: 'Scale particles per bridge (bounded)',
  },
  'three.voxel.bridges.particles.speed': {
    area: 'Voxel Mode',
    responsibility: 'Flow particle speed along bridge curves',
  },
  'three.layout.voxelAnimationEnabled': {
    area: 'Voxel Mode',
    responsibility: 'Master on/off switch for all voxel animations',
  },
  themeMode: {
    area: 'UI Appearance',
    responsibility: 'Global color theme (Light, Dark, or System)',
    notes: 'Controls the application color palette. Light mode follows GitHub Light Tritanopia, Dark mode follows GitHub Dark Tritanopia.',
  },
  selectionFlashDurationMs: {
    area: 'Selection Flash',
    responsibility: 'Duration of canvas-driven selection flash highlights (ms)',
    notes: 'clamps to [100,2000]',
  },
  selectionFlashOpacity: {
    area: 'Selection Flash',
    responsibility: 'Opacity of canvas-driven selection flash highlights',
    notes: 'clamps to [0,1]',
  },
  floatingPanelWidthRatio: { area: 'Floating Panel Layout', responsibility: 'Floating panel width ratio (viewport)' },
  floatingPanelZIndex: { area: 'Floating Panel Layout', responsibility: 'Floating panel z-index' },
  enableTabSync: { area: 'Tab Sync', responsibility: 'Enable cross‑tab sync' },
  enableVirtualTables: { area: 'Multi-dimensional Table Virtualization', responsibility: 'Virtualized tables' },
  'import.json.workspaceTarget': {
    area: 'JSON Import',
    responsibility: 'Default destination after JSON parse/import',
    notes: 'Choose Editor Workspace, Multi-dimensional Table, or Infinite Canvas as the default JSON import landing surface.',
  },
  'graphDataTable.overscanMultiplier': {
    area: 'Multi-dimensional Table Virtualization',
    responsibility: 'Overscan multiplier for virtual tables',
    notes:
      'To make the table more stable with fewer re-renders while scrolling, increase this toward 1.0–2.0. To reduce DOM size for very large tables, lower this toward 0.1–0.3 and optionally reduce graphDataTable.virtualOverscanRows for a more aggressive window.',
  },
  'graphDataTable.virtualOverscanRows': {
    area: 'Multi-dimensional Table Virtualization',
    responsibility: 'Virtual overscan rows (window padding)',
    notes:
      'Acts as a hard floor for overscan rows. Lower values reduce DOM size but may cause more frequent row window updates while scrolling, especially when graphDataTable.overscanMultiplier is also low.',
  },
  'graphDataTable.minRows': {
    area: 'Multi-dimensional Table Virtualization',
    responsibility: 'Min rows before virtualizing tables',
  },
  'graphDataTable.debugLogRanges': {
    area: 'Multi-dimensional Table Virtualization',
    responsibility: 'Log virtual window ranges in dev',
  },
  schemaDeriveCacheCapacity: { area: 'Graph Performance (Schema Derive Cache)', responsibility: 'LRU capacity for schema derive lists' },
  'graphDataTable.frozenDragStepNoneLabelPx': {
    area: 'Multi-dimensional Table',
    responsibility: 'Drag distance (px) from none to label boundary',
  },
  'graphDataTable.frozenDragStepLabelIdPx': {
    area: 'Multi-dimensional Table',
    responsibility: 'Drag distance (px) from label to id boundary',
  },
  'graphDataTable.numericSampleLimit': {
    area: 'Multi-dimensional Table',
    responsibility: 'Maximum samples per field when inferring numeric behavior',
  },
  'graphDataTable.numericSampleMinCount': {
    area: 'Multi-dimensional Table',
    responsibility: 'Minimum numeric samples required for aggregate eligibility',
  },
  'graphDataTable.numericSampleMinRatio': {
    area: 'Multi-dimensional Table',
    responsibility: 'Minimum numeric ratio required for aggregate eligibility',
  },
  'spotlight.margin': { area: 'Launch Spotlight Layout', responsibility: 'Viewport margin for spotlight card clamp' },
  'spotlight.nearTopThreshold': {
    area: 'Launch Spotlight Layout',
    responsibility: 'Top threshold before anchored card flips below target',
  },
  chatProvider: { area: 'Chat', responsibility: 'Chat provider profile and model compatibility' },
  chatAuthMode: { area: 'Chat', responsibility: 'Server-managed key default vs BYOK (API key stays memory-only)' },
  chatEndpointUrl: { area: 'Chat', responsibility: 'Chat endpoint URL (OpenAI-compatible)' },
  chatApiKey: { area: 'Chat', responsibility: 'BYOK API key (in-memory only, never localStorage)' },
  chatModel: { area: 'Chat', responsibility: 'Chat model name (OpenAI-compatible)' },
  chatTemperature: { area: 'Chat', responsibility: 'Chat completion temperature' },
  chatSystemPrompt: { area: 'Chat', responsibility: 'Optional system prompt for Chat' },
  chatContextScope: { area: 'Chat', responsibility: 'Chat context scope for Selection + Workspace, Canvas Selection, or Workspace Source Files AI prompts' },
  integrationConfigsJson: { area: 'Integrations', responsibility: 'JSON settings for AI chat routing and simulation command defaults' },
  CLICK_URL: { area: 'Config Constants', responsibility: 'Toolbar badge click URL' },
  PUBLIC_FALLBACK_JSON: { area: 'Dataset Loading', responsibility: 'Fallback dataset path' },
  AG_INPUT_PATH: { area: 'Pipeline Env', responsibility: 'Pipeline input path' },
  AG_OUTPUT_DIR: { area: 'Pipeline Env', responsibility: 'Pipeline output directory' },
  'max-lines': { area: 'ESLint Guard', responsibility: 'Max lines per file' },
  canvasRenderMode: { area: 'Canvas Rendering', responsibility: 'Render mode (2d or 3d)' },
  canvas3dMode: { area: 'Canvas Rendering', responsibility: '3D renderer mode (default, XR, or voxel)' },
  viewportControlsPreset: {
    area: 'Canvas Interaction (Viewport Controls)',
    responsibility: 'Pointer/wheel gesture preset (map vs design)',
    notes: 'Used by Flow and Storyboard renderers to decide pan drag and wheel zoom behavior.',
  },
  storyboardWidgetSelectionOnDrag: {
    area: 'Canvas Interaction (Storyboard Widget)',
    responsibility: 'Enable selection box on drag in Storyboard renderer',
    notes: 'When enabled with viewportControlsPreset=design, left-drag creates a selection box. When disabled, selection box uses Shift-drag like other modes.',
  },
  storyboardWidgetOverlayWheelProxyEnabled: {
    area: 'Canvas Interaction (Storyboard Widget)',
    responsibility: 'Enable wheel zoom/pan proxy when pointer is over Storyboard Widget fly-out overlays',
    notes: 'When enabled, wheel gestures over Widget overlays are forwarded to the Flow canvas unless the overlay can scroll in that direction.',
  },
  viewPinned: {
    area: 'Canvas Zoom Modes',
    responsibility: 'Pin view (disables Fit/Selection auto-zoom + zoom-to-bounds requests)',
    notes: 'When enabled, Fit to Screen and Zoom to Selection modes are disabled.',
  },
  fitToScreenMode: {
    area: 'Canvas Zoom Modes',
    responsibility: 'Auto-fit graph to viewport (Fit to Screen mode)',
    notes: 'When enabled, Pin View and Zoom to Selection modes are disabled.',
  },
  zoomToSelectionMode: {
    area: 'Canvas Zoom Modes',
    responsibility: 'Auto-zoom to current selection (Zoom to Selection mode)',
    notes: 'When enabled, Pin View and Fit to Screen modes are disabled.',
  },
  zoomDurationFitMs: {
    area: 'Canvas Zoom Actions',
    responsibility: 'Animation duration (ms) for Fit-to-View / Fit-to-Screen actions',
    notes: 'clamps to [0,2000]. Used by both D3 and Flow 2D renderers.',
  },
  zoomDurationSelectionMs: {
    area: 'Canvas Zoom Actions',
    responsibility: 'Animation duration (ms) for Zoom-to-Selection action',
    notes: 'clamps to [0,2000]. Used by both D3 and Flow 2D renderers.',
  },
  wheelZoomCtrlMetaBoostMultiplier: {
    area: 'Canvas Interaction (Wheel Zoom)',
    responsibility: 'Ctrl/Meta wheel zoom boost multiplier (trackpad pinch)',
    notes: 'clamps to [1,400]. Used by D3, Flow, and Storyboard 2D renderer.',
  },
  flowWheelZoomSpeedMultiplier: {
    area: 'Canvas Interaction (Flow Zoom)',
    responsibility: 'Wheel zoom speed multiplier for Flow renderer',
    notes: 'clamps to [0.25,2.5]. Used by D3, Flow, and Storyboard 2D renderer.',
  },
  flowWheelZoomIncrementMultiplier: {
    area: 'Canvas Interaction (Flow Zoom)',
    responsibility: 'Wheel zoom increment multiplier for Flow renderer',
    notes: 'clamps to [0.25,5.0]. Values > 1 make each wheel gesture zoom more per delta; values < 1 make it more precise.',
  },
  flowWheelZoomSmoothMinDurationMs: {
    area: 'Canvas Interaction (Flow Zoom)',
    responsibility: 'Min duration (ms) for Flow wheel zoom smoothing animation',
    notes: 'clamps to [10,400] and is coerced to ≤ flowWheelZoomSmoothMaxDurationMs.',
  },
  flowWheelZoomSmoothMaxDurationMs: {
    area: 'Canvas Interaction (Flow Zoom)',
    responsibility: 'Max duration (ms) for Flow wheel zoom smoothing animation',
    notes: 'clamps to [10,400] and is coerced to ≥ flowWheelZoomSmoothMinDurationMs.',
  },
  orchestratorTraversalDelayMs: {
    area: 'Orchestrator Traversal',
    responsibility: 'Delay between traversal steps in Orchestrator (ms)',
  },
  'graph.behavior.selectMode': {
    area: 'Canvas Interaction',
    responsibility: 'Node selection mode (single, multi, lasso)',
    notes:
      'Selector → pick single, multi, or lasso selection behavior → shape how canvas clicks, Multi-dimensional Table row selection, and Embed/Overlay / Dataset Inspector visualizations respond to the active selection neighborhood.',
  },
  'graph.behavior.createMode': {
    area: 'Canvas Interaction',
    responsibility: 'Edge creation mode (shift-drag, click, panel-only)',
    notes:
      'Edge creator → choose shift-drag, click-source-target, or panel-only edge creation → align edge gestures with selection-aware overlays so you can inspect distributions, hierarchies, clusters, and paths without losing predictable zoom and node-drag behavior.',
  },
  'schema.layout.groups.nestedPaddingStep': {
    area: 'Canvas Layout (2D)',
    responsibility: 'Extra padding to visually separate nested groups',
    notes: 'Higher values increase outer-group breathing room to prevent nested group borders from visually snapping together.',
  },
  'schema.layout.edges.opacity': {
    area: 'Canvas Layering (2D)',
    responsibility: 'Base edge opacity in D3 renderer',
    notes: 'clamps to [0,1]. For readability, keep this lower than node/group prominence.',
  },
  'schema.layout.edges.opacityUnderGroups': {
    area: 'Canvas Layering (2D)',
    responsibility: 'Edge opacity when groups are enabled',
    notes: 'clamps to [0,1]. Used to keep edges visually beneath group underlays.',
  },
  'three.selection.selectedNodeGlowIntensity': { area: '3D Selection', responsibility: 'Selected node emissive glow intensity' },
  'three.selection.dimmedNodeOpacity': { area: '3D Selection', responsibility: 'Dimmed unselected node opacity' },
  'three.selection.dimmedEdgeOpacity': { area: '3D Selection', responsibility: 'Dimmed non‑selected edge opacity' },
  'three.selection.selectedEdgeWidth': { area: '3D Selection', responsibility: 'Selected edge stroke width in 3D' },
  'three.graph.linkDirectionalArrowLength': { area: '3D Edges & Arrows', responsibility: 'Default 3D edge arrow length' },
  'three.graph.linkOpacity': { area: '3D Edges & Arrows', responsibility: 'Default 3D edge opacity' },
  'three.graph.linkCurvature': { area: '3D Edges & Arrows', responsibility: 'Default 3D edge curvature' },
  'three.graph.linkCurveRotation': { area: '3D Edges & Arrows', responsibility: 'Default 3D curve rotation' },
  'three.graph.linkDirectionalParticles': { area: '3D Particles', responsibility: 'Default edge particle count' },
  'three.graph.linkDirectionalParticleSpeed': { area: '3D Particles', responsibility: 'Default edge particle speed' },
  'three.graph.nodeSizingFormula': { area: '3D Formulas', responsibility: 'Node sizing formula (schema or importance)' },
  'three.graph.edgeWidthFormula': { area: '3D Formulas', responsibility: 'Edge width formula (schema or weight)' },
  'three.graph.layerOpacityByLayer.1': { area: '3D Layers', responsibility: 'Layer 1 base opacity' },
  'three.graph.layerOpacityByLayer.2': { area: '3D Layers', responsibility: 'Layer 2 base opacity' },
  'three.graph.layerOpacityByLayer.3': { area: '3D Layers', responsibility: 'Layer 3 base opacity' },
  'three.graph.nodeMotionIntensity': { area: '3D Motion', responsibility: 'Idle node motion intensity' },
  'three.graph.minimapOpacity': { area: '3D Minimap', responsibility: '3D minimap background opacity' },
  'three.graph.starfieldEnabled': { area: '3D Background', responsibility: 'Enable 3D starfield particle background' },
  'three.graph.starfieldCount': { area: '3D Background', responsibility: 'Starfield particle count (0 disables)' },
  'three.graph.starfieldRadius': { area: '3D Background', responsibility: 'Starfield radius around camera' },
  'three.graph.starfieldOpacity': { area: '3D Background', responsibility: 'Starfield particle brightness/opacity' },
  'three.graph.starfieldColor': { area: '3D Background', responsibility: 'Starfield particle tint color' },
  'three.layout.sphereRadius': { area: '3D Layout & Physics', responsibility: 'Base sphere radius for node layout' },
  'three.layout.seed': { area: '3D Layout & Physics', responsibility: 'Random seed for 3D layout' },
  'three.layout.minSpacing': { area: '3D Layout & Physics', responsibility: 'Minimum spacing between nodes' },
  'three.preset.presentation3d': { area: '3D Presets', responsibility: 'Apply low-motion presentation 3D preset' },
  'three.camera.backgroundColor': { area: 'Canvas Rendering', responsibility: '3D canvas background color' },
  'three.graph.polygons.elevationOffset': {
    area: '3D Group Surfaces',
    responsibility: 'Vertical offset for 3D cluster surfaces (graph layers) relative to nodes',
  },
  'three.graph.polygons.opacityMultiplier': {
    area: '3D Group Surfaces',
    responsibility: 'Global multiplier for 3D cluster surface (graph layers) fill opacity',
  },
}
