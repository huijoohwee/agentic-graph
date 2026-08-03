import { useGraphStore } from '@/hooks/useGraphStore'
import type { SettingMeta } from './types'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import type { ThemeMode } from '@/lib/ui/theme'
import { LS_KEYS } from '@/lib/config'
import { PANEL_TYPOGRAPHY_DEFAULTS } from 'grph-shared/ui/panelTypography'
import {
  STORYBOARD_WIDGET_IMAGE_MODEL_OPTIONS,
  STORYBOARD_WIDGET_IMAGE_OUTPUT_FORMAT_OPTIONS,
  STORYBOARD_WIDGET_IMAGE_SIZE_OPTIONS,
  STORYBOARD_WIDGET_VIDEO_MODEL_OPTIONS,
} from '@/lib/config.storyboard-widget'
import { lsBool, lsInt, lsJson, lsSetBool, lsSetInt, lsSetJson } from '@/lib/persistence'
import {
  CHAT_BYTEPLUS_IMAGE_MODEL_DEFAULT,
  CHAT_BYTEPLUS_VIDEO_MODEL_DEFAULT,
  CHAT_DEFAULT_ENDPOINT_URL,
  CHAT_DEFAULT_MODEL,
  CHAT_DEFAULT_PROVIDER,
  CHAT_GEMINI_VIDEO_MODEL_DEFAULT,
  CHAT_GEMINI_VIDEO_MODEL_OPTIONS,
  CHAT_PROVIDER_OPTIONS,
  getSharedChatModelCatalogOptions,
  normalizeChatEndpointUrlInput,
} from '@/lib/chatEndpoint'
import { DEFAULT_INTEGRATION_CONFIGS, stringifyIntegrationConfigs } from '@/features/integrations/config'
import { CHAT_LOCAL_STORAGE_ROOT_PATH_DEFAULT } from '@/features/chat/chatStorageConfig'
import {
  CHAT_AI_MARKDOWN_GRAPH_SUMMARY_MAX_TOKENS_DEFAULT,
  CHAT_AI_MARKDOWN_GUIDELINE_DIGEST_MAX_TOKENS_DEFAULT,
  CHAT_AI_MARKDOWN_MAX_TOKENS_DEFAULT,
} from '@/features/chat/chatAiMarkdownSpec'
import {
  UI_RESPONSIVE_BADGE_CHIP_DEFAULT_CLASSNAME,
  UI_RESPONSIVE_PANEL_HEADER_ROW_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'

const s = () => useGraphStore.getState(); const TAILWIND_BACKING = ['tailwindcss'] as const

export const uiUiSettingsRegistry: SettingMeta[] = [
  {
    key: 'startup.openWorkflowPanel',
    type: 'boolean',
    source: 'localStorage',
    read: () => lsBool(LS_KEYS.startupOpenWorkflowPanel, false),
    write: (v) => {
      lsSetBool(LS_KEYS.startupOpenWorkflowPanel, Boolean(v))
    },
    docKey: 'startup.openWorkflowPanel',
    default: () => false,
  },
  {
    key: 'uiOverlayOpacity',
    type: 'number',
    source: 'store',
    read: () => s().uiOverlayOpacity,
    write: (v) => s().setUiOverlayOpacity(Number(v)),
    docKey: 'overlayOpacity',
    default: () => 0.95,
  },
  {
    key: 'uiPanelOpacity',
    type: 'number',
    source: 'store',
    read: () => s().uiPanelOpacity,
    write: (v) => s().setUiPanelOpacity(Number(v)),
    docKey: 'panelOpacity',
    default: () => 0.95,
  },
  {
    key: 'uiToolbarOpacity',
    type: 'number',
    source: 'store',
    read: () => s().uiToolbarOpacity,
    write: (v) => s().setUiToolbarOpacity(Number(v)),
    docKey: 'toolbarOpacity',
    default: () => 0.95,
  },
  {
    key: 'selectionFlashDurationMs',
    type: 'number',
    source: 'store',
    read: () => s().selectionFlashDurationMs,
    write: v => s().setSelectionFlashDurationMs(Number(v)),
    docKey: 'selectionFlashDurationMs',
    default: () => 500,
  },
  {
    key: 'selectionFlashOpacity',
    type: 'number',
    source: 'store',
    read: () => s().selectionFlashOpacity,
    write: v => s().setSelectionFlashOpacity(Number(v)),
    docKey: 'selectionFlashOpacity',
    default: () => 0.18,
  },
  {
    key: 'uiIconScale',
    type: 'string',
    source: 'store',
    read: () => s().uiIconScale,
    write: (v) => {
      const raw = String(v || '')
      const scale: 'compact' | 'default' = raw === 'compact' ? 'compact' : 'default'
      s().setUiIconScale(scale)
    },
    docKey: 'uiIconScale',
    default: () => 'default',
    options: ['default', 'compact'],
  },
  {
    key: 'uiPanelTextFontClass',
    type: 'string',
    source: 'store', backingImports: TAILWIND_BACKING,
    read: () => s().uiPanelTextFontClass,
    write: (v) => s().setUiPanelTextFontClass(String(v || '')),
    docKey: 'uiPanelTextFontClass',
    default: () => 'font-sans',
  },
  {
    key: 'uiPanelKeyValueTextSizeClass',
    type: 'string',
    source: 'store', backingImports: TAILWIND_BACKING,
    read: () => s().uiPanelKeyValueTextSizeClass,
    write: (v) => s().setUiPanelKeyValueTextSizeClass(String(v || '')),
    docKey: 'uiPanelKeyValueTextSizeClass',
    default: () => 'text-sm',
  },
  {
    key: 'uiPanelKeyValueInputClass',
    type: 'string',
    source: 'store', backingImports: TAILWIND_BACKING,
    read: () => s().uiPanelKeyValueInputClass,
    write: (v) => s().setUiPanelKeyValueInputClass(String(v || '')),
    docKey: 'uiPanelKeyValueInputClass',
    default: () => PANEL_TYPOGRAPHY_DEFAULTS.keyValueInputClass,
  },
  {
    key: 'uiPanelMonospaceTextClass',
    type: 'string',
    source: 'store', backingImports: TAILWIND_BACKING,
    read: () => s().uiPanelMonospaceTextClass,
    write: (v) => s().setUiPanelMonospaceTextClass(String(v || '')),
    docKey: 'uiPanelMonospaceTextClass',
    default: () => 'font-mono text-xs',
  },
  {
    key: 'uiPanelRowDensityDefaultClass',
    type: 'string',
    source: 'store', backingImports: TAILWIND_BACKING,
    read: () => s().uiPanelRowDensityDefaultClass,
    write: (v) => s().setUiPanelRowDensityDefaultClass(String(v || '')),
    docKey: 'uiPanelRowDensityDefaultClass',
    default: () => 'py-1',
  },
  {
    key: 'uiHeaderRowHeightClass',
    type: 'string',
    source: 'store', backingImports: TAILWIND_BACKING,
    read: () => s().uiHeaderRowHeightClass,
    write: (v) => s().setUiHeaderRowHeightClass(String(v || '')),
    docKey: 'uiHeaderRowHeightClass',
    default: () => UI_RESPONSIVE_PANEL_HEADER_ROW_CLASSNAME,
  },
  {
    key: 'uiHeaderRowPaddingClass',
    type: 'string',
    source: 'store', backingImports: TAILWIND_BACKING,
    read: () => s().uiHeaderRowPaddingClass,
    write: (v) => s().setUiHeaderRowPaddingClass(String(v || '')),
    docKey: 'uiHeaderRowPaddingClass',
    default: () => 'py-1',
  },
  {
    key: 'uiSectionHeaderRowHeightClass',
    type: 'string',
    source: 'store', backingImports: TAILWIND_BACKING,
    read: () => s().uiSectionHeaderRowHeightClass,
    write: (v) => s().setUiSectionHeaderRowHeightClass(String(v || '')),
    docKey: 'uiSectionHeaderRowHeightClass',
    default: () => UI_RESPONSIVE_PANEL_HEADER_ROW_CLASSNAME,
  },
  {
    key: 'uiSectionHeaderRowPaddingClass',
    type: 'string',
    source: 'store', backingImports: TAILWIND_BACKING,
    read: () => s().uiSectionHeaderRowPaddingClass,
    write: (v) => s().setUiSectionHeaderRowPaddingClass(String(v || '')),
    docKey: 'uiSectionHeaderRowPaddingClass',
    default: () => 'py-1',
  },
  {
    key: 'uiIconFormat',
    type: 'string',
    source: 'store',
    read: () => s().uiIconFormat,
    write: (v) => {
      const raw = String(v || '')
      const format: 'default' | 'minimal' | '1' =
        raw === 'minimal' ? 'minimal' : raw === '1' ? '1' : 'default'
      s().setUiIconFormat(format)
    },
    docKey: 'uiIconFormat',
    default: () => '1',
    options: ['1', 'default', 'minimal'],
  },
  {
    key: 'uiIconStrokeWidth',
    type: 'number',
    source: 'store',
    read: () => s().uiIconStrokeWidth,
    write: (v) => s().setUiIconStrokeWidth(Number(v)),
    docKey: 'uiIconStrokeWidth',
    default: () => 2,
  },
  {
    key: 'uiIconColorClass',
    type: 'string',
    source: 'store', backingImports: TAILWIND_BACKING,
    read: () => s().uiIconColorClass,
    write: (v) => s().setUiIconColorClass(String(v || '')),
    docKey: 'uiIconColorClass',
    default: () => UI_THEME_TOKENS.icon.color,
  },
  {
    key: 'uiIconHoverBgClass',
    type: 'string',
    source: 'store', backingImports: TAILWIND_BACKING,
    read: () => s().uiIconHoverBgClass,
    write: (v) => s().setUiIconHoverBgClass(String(v || '')),
    docKey: 'uiIconHoverBgClass',
    default: () => UI_THEME_TOKENS.button.hoverBg,
  },
  {
    key: 'uiIconButtonPaddingClass',
    type: 'string',
    source: 'store', backingImports: TAILWIND_BACKING,
    read: () => s().uiIconButtonPaddingClass,
    write: (v) => s().setUiIconButtonPaddingClass(String(v || '')),
    docKey: 'uiIconButtonPaddingClass',
    default: () => 'p-2',
  },
  {
    key: 'uiIconPillClass',
    type: 'string',
    source: 'store', backingImports: TAILWIND_BACKING,
    read: () => s().uiIconPillClass,
    write: (v) => s().setUiIconPillClass(String(v || '')),
    docKey: 'uiIconPillClass',
    default: () =>
      `inline-flex items-center justify-center rounded border ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.headerBg} px-1.5 py-0.5`,
  },
  {
    key: 'uiIconPillLegendTextSizeClass',
    type: 'string',
    source: 'store', backingImports: TAILWIND_BACKING,
    read: () => s().uiIconPillLegendTextSizeClass,
    write: (v) => s().setUiIconPillLegendTextSizeClass(String(v || '')),
    docKey: 'uiIconPillLegendTextSizeClass',
    default: () => 'text-xs',
  },
  {
    key: 'uiIconPillBadgeTextSizeClass',
    type: 'string',
    source: 'store', backingImports: TAILWIND_BACKING,
    read: () => s().uiIconPillBadgeTextSizeClass,
    write: (v) => s().setUiIconPillBadgeTextSizeClass(String(v || '')),
    docKey: 'uiIconPillBadgeTextSizeClass',
    default: () => 'text-[9px]',
  },
  {
    key: 'uiIconBadgeChipClass',
    type: 'string',
    source: 'store', backingImports: TAILWIND_BACKING,
    read: () => s().uiIconBadgeChipClass,
    write: (v) => s().setUiIconBadgeChipClass(String(v || '')),
    docKey: 'uiIconBadgeChipClass',
    default: () => UI_RESPONSIVE_BADGE_CHIP_DEFAULT_CLASSNAME,
  },
  {
    key: 'uiIconBadgeChipTextSizeClass',
    type: 'string',
    source: 'store', backingImports: TAILWIND_BACKING,
    read: () => s().uiIconBadgeChipTextSizeClass,
    write: (v) => s().setUiIconBadgeChipTextSizeClass(String(v || '')),
    docKey: 'uiIconBadgeChipTextSizeClass',
    default: () => 'text-[9px]',
  },
  {
    key: 'uiPanelMicroLabelTextSizeClass',
    type: 'string',
    source: 'store', backingImports: TAILWIND_BACKING,
    read: () => s().uiPanelMicroLabelTextSizeClass,
    write: (v) => s().setUiPanelMicroLabelTextSizeClass(String(v || '')),
    docKey: 'uiPanelMicroLabelTextSizeClass',
    default: () => '',
  },
  {
    key: 'uiIconAnimationEnabled',
    type: 'boolean',
    source: 'store',
    read: () => s().uiIconAnimationEnabled,
    write: (v) => s().setUiIconAnimationEnabled(Boolean(v)),
    docKey: 'uiIconAnimationEnabled',
    default: () => true,
  },
  {
    key: 'themeMode',
    type: 'string',
    source: 'store', backingImports: TAILWIND_BACKING,
    read: () => s().themeMode,
    write: (v) => {
      const raw = String(v || '')
      const next: ThemeMode =
        raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'system'
      s().setThemeMode(next)
    },
    docKey: 'themeMode',
    default: () => 'system',
    options: ['light', 'dark', 'system'],
  },
  {
    key: 'floatingPanelWidthRatio',
    type: 'number',
    source: 'localStorage',
    read: () => s().floatingPanelWidthRatio,
    write: (v) => s().setFloatingPanelWidthRatio(Number(v)),
    docKey: 'floatingPanelWidthRatio',
    default: () => 0.3,
  },
  {
    key: 'floatingPanelZIndex',
    type: 'number',
    source: 'localStorage',
    read: () => s().floatingPanelZIndex,
    write: (v) => s().setFloatingPanelZIndex(Number(v)),
    docKey: 'floatingPanelZIndex',
    default: () => 5000,
  },
  {
    key: 'enableLaunchSpotlight',
    type: 'boolean',
    source: 'store',
    read: () => s().enableLaunchSpotlight,
    write: (v) => s().setEnableLaunchSpotlight(Boolean(v)),
    docKey: 'enableLaunchSpotlight',
    default: () => false,
  },
  {
    key: 'workspaceAutosaveEnabled',
    type: 'boolean',
    source: 'store',
    read: () => s().workspaceAutosaveEnabled,
    write: (v) => s().setWorkspaceAutosaveEnabled(Boolean(v)),
    docKey: 'workspaceAutosaveEnabled',
    default: () => true,
  },
  {
    key: 'spotlight.margin',
    type: 'number',
    source: 'store',
    read: () => s().spotlightMargin,
    write: (v) => s().setSpotlightMargin(Number(v)),
    docKey: 'spotlight.margin',
    default: () => 8,
  },
  {
    key: 'spotlight.nearTopThreshold',
    type: 'number',
    source: 'store',
    read: () => s().spotlightNearTopThreshold,
    write: (v) => s().setSpotlightNearTopThreshold(Number(v)),
    docKey: 'spotlight.nearTopThreshold',
    default: () => 96,
  },
  {
    key: 'chatProvider',
    type: 'string',
    source: 'localStorage',
    read: () => s().chatProvider,
    write: (v) => s().setChatProvider(String(v || '').trim()),
    docKey: 'chatProvider',
    default: () => CHAT_DEFAULT_PROVIDER,
    options: [...CHAT_PROVIDER_OPTIONS],
  },
  {
    key: 'chatAuthMode',
    type: 'string',
    source: 'localStorage',
    read: () => s().chatAuthMode,
    write: (v) => s().setChatAuthMode(String(v || '').trim().toLowerCase() === 'byok' ? 'byok' : 'serverManaged'),
    docKey: 'chatAuthMode',
    default: () => 'serverManaged',
    options: ['serverManaged', 'byok'],
  },
  {
    key: 'chatEndpointUrl',
    type: 'string',
    source: 'localStorage',
    read: () => s().chatEndpointUrl,
    write: (v) => s().setChatEndpointUrl(String(v || '').trim() || null),
    docKey: 'chatEndpointUrl',
    default: () => normalizeChatEndpointUrlInput(null, s().chatProvider),
  },
  {
    key: 'chatApiKey',
    type: 'string',
    source: 'store',
    read: () => s().chatApiKey,
    write: (v) => s().setChatApiKey(String(v || '').trim() || null),
    docKey: 'chatApiKey',
    default: () => '',
  },
  {
    key: 'byteplusImageModel',
    type: 'string',
    source: 'localStorage',
    read: () => lsJson<string>(LS_KEYS.byteplusImageModel, CHAT_BYTEPLUS_IMAGE_MODEL_DEFAULT, value => (typeof value === 'string' ? value : null)),
    write: (v) => {
      const normalized = String(v || '').trim() || CHAT_BYTEPLUS_IMAGE_MODEL_DEFAULT
      lsSetJson(LS_KEYS.byteplusImageModel, normalized)
    },
    docKey: 'byteplusImageModel',
    default: () => CHAT_BYTEPLUS_IMAGE_MODEL_DEFAULT,
    options: STORYBOARD_WIDGET_IMAGE_MODEL_OPTIONS.map(option => String(option.value)),
  },
  {
    key: 'byteplusImageSize',
    type: 'string',
    source: 'localStorage',
    read: () => lsJson<string>(LS_KEYS.byteplusImageSize, '2K', value => (typeof value === 'string' ? value : null)),
    write: (v) => {
      const raw = String(v || '').trim().toUpperCase()
      const normalized = STORYBOARD_WIDGET_IMAGE_SIZE_OPTIONS.some(option => option.value === raw) ? raw : '2K'
      lsSetJson(LS_KEYS.byteplusImageSize, normalized)
    },
    docKey: 'byteplusImageSize',
    default: () => '2K',
    options: STORYBOARD_WIDGET_IMAGE_SIZE_OPTIONS.map(option => String(option.value)),
  },
  {
    key: 'byteplusImageOutputFormat',
    type: 'string',
    source: 'localStorage',
    read: () => lsJson<string>(LS_KEYS.byteplusImageOutputFormat, 'jpeg', value => (typeof value === 'string' ? value : null)),
    write: (v) => {
      const raw = String(v || '').trim().toLowerCase()
      const normalized = STORYBOARD_WIDGET_IMAGE_OUTPUT_FORMAT_OPTIONS.some(option => option.value === raw) ? raw : 'jpeg'
      lsSetJson(LS_KEYS.byteplusImageOutputFormat, normalized)
    },
    docKey: 'byteplusImageOutputFormat',
    default: () => 'jpeg',
    options: STORYBOARD_WIDGET_IMAGE_OUTPUT_FORMAT_OPTIONS.map(option => String(option.value)),
  },
  {
    key: 'byteplusImageResponseFormat',
    type: 'string',
    source: 'localStorage',
    read: () => lsJson<string>(LS_KEYS.byteplusImageResponseFormat, 'b64_json', value => (typeof value === 'string' ? value : null)),
    write: (v) => {
      const raw = String(v || '').trim().toLowerCase()
      const normalized = raw === 'url' ? 'url' : 'b64_json'
      lsSetJson(LS_KEYS.byteplusImageResponseFormat, normalized)
    },
    docKey: 'byteplusImageResponseFormat',
    default: () => 'b64_json',
    options: ['b64_json', 'url'],
  },
  {
    key: 'byteplusImageOptimizePromptOptions',
    type: 'string',
    source: 'localStorage',
    read: () => lsJson<string>(LS_KEYS.byteplusImageOptimizePromptOptions, 'fast', value => (typeof value === 'string' ? value : null)),
    write: (v) => {
      const raw = String(v || '').trim().toLowerCase()
      const normalized = raw === 'standard' ? 'standard' : 'fast'
      lsSetJson(LS_KEYS.byteplusImageOptimizePromptOptions, normalized)
    },
    docKey: 'byteplusImageOptimizePromptOptions',
    default: () => 'fast',
    options: ['fast', 'standard'],
  },
  {
    key: 'byteplusImageAspectRatio',
    type: 'number',
    source: 'localStorage',
    read: () => lsJson<number>(LS_KEYS.byteplusImageAspectRatio, 0.0625, value => (typeof value === 'number' && Number.isFinite(value) ? value : null)),
    write: (v) => {
      const next = Number(v)
      const clamped = Number.isFinite(next) ? Math.max(0.0625, Math.min(16, next)) : 0.0625
      lsSetJson(LS_KEYS.byteplusImageAspectRatio, clamped)
    },
    docKey: 'byteplusImageAspectRatio',
    default: () => 0.0625,
  },
  {
    key: 'byteplusImageStream',
    type: 'boolean',
    source: 'localStorage',
    read: () => lsBool(LS_KEYS.byteplusImageStream, true),
    write: (v) => {
      lsSetBool(LS_KEYS.byteplusImageStream, Boolean(v))
    },
    docKey: 'byteplusImageStream',
    default: () => true,
  },
  {
    key: 'byteplusImageWatermark',
    type: 'boolean',
    source: 'localStorage',
    read: () => lsBool(LS_KEYS.byteplusImageWatermark, false),
    write: (v) => {
      lsSetBool(LS_KEYS.byteplusImageWatermark, Boolean(v))
    },
    docKey: 'byteplusImageWatermark',
    default: () => false,
  },
  {
    key: 'byteplusImageSeed',
    type: 'number',
    source: 'localStorage',
    read: () => lsInt(LS_KEYS.byteplusImageSeed, 0),
    write: (v) => {
      lsSetInt(LS_KEYS.byteplusImageSeed, Number(v), { min: 0, max: 2147483647 })
    },
    docKey: 'byteplusImageSeed',
    default: () => 0,
  },
  {
    key: 'byteplusImageGuidanceScale',
    type: 'number',
    source: 'localStorage',
    read: () => lsJson<number>(LS_KEYS.byteplusImageGuidanceScale, 0, value => (typeof value === 'number' && Number.isFinite(value) ? value : null)),
    write: (v) => {
      const next = Number(v)
      lsSetJson(LS_KEYS.byteplusImageGuidanceScale, Number.isFinite(next) ? next : 0)
    },
    docKey: 'byteplusImageGuidanceScale',
    default: () => 0,
  },
  {
    key: 'byteplusVideoModel',
    type: 'string',
    source: 'localStorage',
    read: () => lsJson<string>(LS_KEYS.byteplusVideoModel, CHAT_BYTEPLUS_VIDEO_MODEL_DEFAULT, value => (typeof value === 'string' ? value : null)),
    write: (v) => {
      const normalized = String(v || '').trim() || CHAT_BYTEPLUS_VIDEO_MODEL_DEFAULT
      lsSetJson(LS_KEYS.byteplusVideoModel, normalized)
    },
    docKey: 'byteplusVideoModel',
    default: () => CHAT_BYTEPLUS_VIDEO_MODEL_DEFAULT,
    options: STORYBOARD_WIDGET_VIDEO_MODEL_OPTIONS.map(option => String(option.value)),
  },
  {
    key: 'byteplusVideoContentJson',
    type: 'json',
    source: 'localStorage',
    read: () => lsJson<string>(LS_KEYS.byteplusVideoContentJson, '', value => (typeof value === 'string' ? value : null)),
    write: (v) => {
      lsSetJson(LS_KEYS.byteplusVideoContentJson, String(v || ''))
    },
    docKey: 'byteplusVideoContentJson',
    default: () => '',
  },
  {
    key: 'byteplusVideoResolution',
    type: 'string',
    source: 'localStorage',
    read: () => lsJson<string>(LS_KEYS.byteplusVideoResolution, '480p', value => (typeof value === 'string' ? value : null)),
    write: (v) => {
      const raw = String(v || '').trim().toLowerCase()
      const normalized = raw === '1080p' ? '1080p' : raw === '720p' ? '720p' : '480p'
      lsSetJson(LS_KEYS.byteplusVideoResolution, normalized)
    },
    docKey: 'byteplusVideoResolution',
    default: () => '480p',
    options: ['480p', '720p', '1080p'],
  },
  {
    key: 'byteplusVideoRatio',
    type: 'string',
    source: 'localStorage',
    read: () => lsJson<string>(LS_KEYS.byteplusVideoRatio, '16:9', value => (typeof value === 'string' ? value : null)),
    write: (v) => {
      const raw = String(v || '').trim().replace(/\s+/g, '').toLowerCase()
      const normalized = raw === '4:3' ? '4:3'
        : raw === '1:1' ? '1:1'
          : raw === '3:4' ? '3:4'
            : raw === '9:16' ? '9:16'
              : raw === '21:9' ? '21:9'
                : '16:9'
      lsSetJson(LS_KEYS.byteplusVideoRatio, normalized)
    },
    docKey: 'byteplusVideoRatio',
    default: () => '16:9',
    options: ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9'],
  },
  {
    key: 'byteplusVideoDuration',
    type: 'number',
    source: 'localStorage',
    read: () => lsInt(LS_KEYS.byteplusVideoDuration, 2),
    write: (v) => {
      lsSetInt(LS_KEYS.byteplusVideoDuration, Number(v), { min: 2, max: 15 })
    },
    docKey: 'byteplusVideoDuration',
    default: () => 2,
  },
  {
    key: 'byteplusVideoGenerateAudio',
    type: 'boolean',
    source: 'localStorage',
    read: () => lsBool(LS_KEYS.byteplusVideoGenerateAudio, false),
    write: (v) => {
      lsSetBool(LS_KEYS.byteplusVideoGenerateAudio, Boolean(v))
    },
    docKey: 'byteplusVideoGenerateAudio',
    default: () => false,
  },
  {
    key: 'byteplusVideoDraft',
    type: 'boolean',
    source: 'localStorage',
    read: () => lsBool(LS_KEYS.byteplusVideoDraft, true),
    write: (v) => {
      lsSetBool(LS_KEYS.byteplusVideoDraft, Boolean(v))
    },
    docKey: 'byteplusVideoDraft',
    default: () => true,
  },
  {
    key: 'byteplusVideoCameraFixed',
    type: 'boolean',
    source: 'localStorage',
    read: () => lsBool(LS_KEYS.byteplusVideoCameraFixed, false),
    write: (v) => {
      lsSetBool(LS_KEYS.byteplusVideoCameraFixed, Boolean(v))
    },
    docKey: 'byteplusVideoCameraFixed',
    default: () => false,
  },
  {
    key: 'byteplusVideoImageUrlUrl',
    type: 'string',
    source: 'localStorage',
    read: () => lsJson<string>(LS_KEYS.byteplusVideoImageUrlUrl, 'base64', value => (typeof value === 'string' ? value : null)),
    write: (v) => {
      const raw = String(v || '').trim().toLowerCase()
      lsSetJson(LS_KEYS.byteplusVideoImageUrlUrl, raw === 'url' ? 'url' : 'base64')
    },
    docKey: 'byteplusVideoImageUrlUrl',
    default: () => 'base64',
    options: ['base64', 'url'],
  },
  {
    key: 'geminiVideoModel',
    type: 'string',
    source: 'localStorage',
    read: () => lsJson<string>(LS_KEYS.geminiVideoModel, CHAT_GEMINI_VIDEO_MODEL_DEFAULT, value => (typeof value === 'string' ? value : null)),
    write: (v) => {
      const normalized = String(v || '').trim() || CHAT_GEMINI_VIDEO_MODEL_DEFAULT
      lsSetJson(LS_KEYS.geminiVideoModel, normalized)
    },
    docKey: 'geminiVideoModel',
    default: () => CHAT_GEMINI_VIDEO_MODEL_DEFAULT,
    options: [...CHAT_GEMINI_VIDEO_MODEL_OPTIONS],
  },
  {
    key: 'geminiVideoAspectRatio',
    type: 'string',
    source: 'localStorage',
    read: () => lsJson<string>(LS_KEYS.geminiVideoAspectRatio, '16:9', value => (typeof value === 'string' ? value : null)),
    write: (v) => {
      const raw = String(v || '').trim().toLowerCase()
      lsSetJson(LS_KEYS.geminiVideoAspectRatio, raw === '9:16' ? '9:16' : '16:9')
    },
    docKey: 'geminiVideoAspectRatio',
    default: () => '16:9',
    options: ['16:9', '9:16'],
  },
  {
    key: 'geminiVideoResolution',
    type: 'string',
    source: 'localStorage',
    read: () => lsJson<string>(LS_KEYS.geminiVideoResolution, '720p', value => (typeof value === 'string' ? value : null)),
    write: (v) => {
      const raw = String(v || '').trim().toLowerCase()
      lsSetJson(LS_KEYS.geminiVideoResolution, (raw === '1080p' || raw === '4k') ? raw : '720p')
    },
    docKey: 'geminiVideoResolution',
    default: () => '720p',
    options: ['720p', '1080p', '4k'],
  },
  {
    key: 'geminiVideoDurationSeconds',
    type: 'string',
    source: 'localStorage',
    read: () => lsJson<string>(LS_KEYS.geminiVideoDurationSeconds, '8', value => (typeof value === 'string' ? value : null)),
    write: (v) => {
      const raw = String(v || '').trim()
      lsSetJson(LS_KEYS.geminiVideoDurationSeconds, (raw === '4' || raw === '6') ? raw : '8')
    },
    docKey: 'geminiVideoDurationSeconds',
    default: () => '8',
    options: ['4', '6', '8'],
  },
  {
    key: 'geminiVideoPersonGeneration',
    type: 'string',
    source: 'localStorage',
    read: () => lsJson<string>(LS_KEYS.geminiVideoPersonGeneration, 'allow_all', value => (typeof value === 'string' ? value : null)),
    write: (v) => {
      const raw = String(v || '').trim().toLowerCase()
      lsSetJson(LS_KEYS.geminiVideoPersonGeneration, (raw === 'allow_adult' || raw === 'dont_allow') ? raw : 'allow_all')
    },
    docKey: 'geminiVideoPersonGeneration',
    default: () => 'allow_all',
    options: ['allow_all', 'allow_adult', 'dont_allow'],
  },
  {
    key: 'chatModel',
    type: 'string',
    source: 'localStorage',
    read: () => s().chatModel,
    write: (v) => s().setChatModel(String(v || '').trim() || CHAT_DEFAULT_MODEL),
    docKey: 'chatModel',
    default: () => CHAT_DEFAULT_MODEL,
    options: getSharedChatModelCatalogOptions(),
  },
  {
    key: 'chatTemperature',
    type: 'number',
    source: 'localStorage',
    read: () => s().chatTemperature,
    write: (v) => s().setChatTemperature(Number(v)),
    docKey: 'chatTemperature',
    default: () => 0.3,
  },
  {
    key: 'chatMaxCompletionTokens',
    type: 'number',
    source: 'localStorage',
    read: () => s().chatMaxCompletionTokens,
    write: (v) => s().setChatMaxCompletionTokens(Number(v)),
    docKey: 'chatMaxCompletionTokens',
    default: () => CHAT_AI_MARKDOWN_MAX_TOKENS_DEFAULT,
  },
  {
    key: 'chatServiceTier',
    type: 'string',
    source: 'localStorage',
    read: () => s().chatServiceTier,
    write: (v) => s().setChatServiceTier(String(v || '').trim() === 'default' ? 'default' : 'auto'),
    docKey: 'chatServiceTier',
    default: () => 'auto',
    options: ['auto', 'default'],
  },
  {
    key: 'chatStream',
    type: 'boolean',
    source: 'localStorage',
    read: () => s().chatStream,
    write: (v) => s().setChatStream(Boolean(v)),
    docKey: 'chatStream',
    default: () => true,
  },
  {
    key: 'chatMessagesJson',
    type: 'json',
    source: 'localStorage',
    read: () => s().chatMessagesJson,
    write: (v) => s().setChatMessagesJson(String(v || '')),
    docKey: 'chatMessagesJson',
    default: () => '',
  },
  {
    key: 'chatReasoningEffort',
    type: 'string',
    source: 'localStorage',
    read: () => s().chatReasoningEffort,
    write: (v) => s().setChatReasoningEffort(String(v || '').trim().toLowerCase() as 'minimal' | 'low' | 'medium' | 'high'),
    docKey: 'chatReasoningEffort',
    default: () => 'medium',
    options: ['minimal', 'low', 'medium', 'high'],
  },
  {
    key: 'chatThinkingType',
    type: 'string',
    source: 'localStorage',
    read: () => s().chatThinkingType,
    write: (v) => s().setChatThinkingType(String(v || '').trim().toLowerCase() as 'enabled' | 'disabled' | 'auto'),
    docKey: 'chatThinkingType',
    default: () => 'enabled',
    options: ['enabled', 'disabled', 'auto'],
  },
  {
    key: 'chatThinkingJson',
    type: 'json',
    source: 'localStorage',
    read: () => s().chatThinkingJson,
    write: (v) => s().setChatThinkingJson(String(v || '')),
    docKey: 'chatThinkingJson',
    default: () => '',
  },
  {
    key: 'chatFrequencyPenalty',
    type: 'number',
    source: 'localStorage',
    read: () => s().chatFrequencyPenalty,
    write: (v) => s().setChatFrequencyPenalty(Number(v)),
    docKey: 'chatFrequencyPenalty',
    default: () => 0,
  },
  {
    key: 'chatPresencePenalty',
    type: 'number',
    source: 'localStorage',
    read: () => s().chatPresencePenalty,
    write: (v) => s().setChatPresencePenalty(Number(v)),
    docKey: 'chatPresencePenalty',
    default: () => 0,
  },
  {
    key: 'chatTopP',
    type: 'number',
    source: 'localStorage',
    read: () => s().chatTopP,
    write: (v) => s().setChatTopP(Number(v)),
    docKey: 'chatTopP',
    default: () => 0.7,
  },
  {
    key: 'chatLogprobs',
    type: 'boolean',
    source: 'localStorage',
    read: () => s().chatLogprobs,
    write: (v) => s().setChatLogprobs(Boolean(v)),
    docKey: 'chatLogprobs',
    default: () => false,
  },
  {
    key: 'chatTopLogprobs',
    type: 'number',
    source: 'localStorage',
    read: () => s().chatTopLogprobs,
    write: (v) => s().setChatTopLogprobs(Number(v)),
    docKey: 'chatTopLogprobs',
    default: () => 0,
  },
  {
    key: 'chatParallelToolCalls',
    type: 'boolean',
    source: 'localStorage',
    read: () => s().chatParallelToolCalls,
    write: (v) => s().setChatParallelToolCalls(Boolean(v)),
    docKey: 'chatParallelToolCalls',
    default: () => true,
  },
  {
    key: 'chatStopJson',
    type: 'json',
    source: 'localStorage',
    read: () => s().chatStopJson,
    write: (v) => s().setChatStopJson(String(v || '')),
    docKey: 'chatStopJson',
    default: () => '',
  },
  {
    key: 'chatStreamOptionsJson',
    type: 'json',
    source: 'localStorage',
    read: () => s().chatStreamOptionsJson,
    write: (v) => s().setChatStreamOptionsJson(String(v || '')),
    docKey: 'chatStreamOptionsJson',
    default: () => '',
  },
  {
    key: 'chatResponseFormatJson',
    type: 'json',
    source: 'localStorage',
    read: () => s().chatResponseFormatJson,
    write: (v) => s().setChatResponseFormatJson(String(v || '')),
    docKey: 'chatResponseFormatJson',
    default: () => '',
  },
  {
    key: 'chatLogitBiasJson',
    type: 'json',
    source: 'localStorage',
    read: () => s().chatLogitBiasJson,
    write: (v) => s().setChatLogitBiasJson(String(v || '')),
    docKey: 'chatLogitBiasJson',
    default: () => '',
  },
  {
    key: 'chatToolsJson',
    type: 'json',
    source: 'localStorage',
    read: () => s().chatToolsJson,
    write: (v) => s().setChatToolsJson(String(v || '')),
    docKey: 'chatToolsJson',
    default: () => '',
  },
  {
    key: 'chatToolChoiceJson',
    type: 'json',
    source: 'localStorage',
    read: () => s().chatToolChoiceJson,
    write: (v) => s().setChatToolChoiceJson(String(v || '')),
    docKey: 'chatToolChoiceJson',
    default: () => '',
  },
  {
    key: 'chatGraphSummaryMaxTokens',
    type: 'number',
    source: 'localStorage',
    read: () => s().chatGraphSummaryMaxTokens,
    write: (v) => s().setChatGraphSummaryMaxTokens(Number(v)),
    docKey: 'chatGraphSummaryMaxTokens',
    default: () => CHAT_AI_MARKDOWN_GRAPH_SUMMARY_MAX_TOKENS_DEFAULT,
  },
  {
    key: 'chatGuidelineDigestMaxTokens',
    type: 'number',
    source: 'localStorage',
    read: () => s().chatGuidelineDigestMaxTokens,
    write: (v) => s().setChatGuidelineDigestMaxTokens(Number(v)),
    docKey: 'chatGuidelineDigestMaxTokens',
    default: () => CHAT_AI_MARKDOWN_GUIDELINE_DIGEST_MAX_TOKENS_DEFAULT,
  },
  {
    key: 'chatSystemPrompt',
    type: 'string',
    source: 'localStorage',
    read: () => s().chatSystemPrompt,
    write: (v) => s().setChatSystemPrompt(String(v || '').trim() || null),
    docKey: 'chatSystemPrompt',
    default: () => null,
  },
  {
    key: 'chatStorageTarget',
    type: 'string',
    source: 'localStorage',
    read: () => s().chatStorageTarget,
    write: (v) => s().setChatStorageTarget(String(v || '').trim() === 'chatHistory' ? 'chatHistory' : 'chatKnowgrph'),
    docKey: 'chatStorageTarget',
    default: () => 'chatKnowgrph',
    options: ['chatKnowgrph', 'chatHistory'],
  },
  {
    key: 'chatLocalStorageRootPath',
    type: 'string',
    source: 'localStorage',
    read: () => s().chatLocalStorageRootPath,
    write: (v) => s().setChatLocalStorageRootPath(String(v || '').trim() || null),
    docKey: 'chatLocalStorageRootPath',
    default: () => CHAT_LOCAL_STORAGE_ROOT_PATH_DEFAULT,
  },
  {
    key: 'chatKnowgrphStorageMode',
    type: 'string',
    source: 'localStorage',
    read: () => s().chatKnowgrphStorageMode,
    write: (v) => s().setChatKnowgrphStorageMode(String(v || '').trim() === 'cloud' ? 'cloud' : 'local'),
    docKey: 'chatKnowgrphStorageMode',
    default: () => 'local',
    options: ['local', 'cloud'],
  },
  {
    key: 'chatKnowgrphWorkspacePath',
    type: 'string',
    source: 'localStorage',
    read: () => s().chatKnowgrphWorkspacePath,
    write: (v) => s().setChatKnowgrphWorkspacePath(String(v || '').trim() || null),
    docKey: 'chatKnowgrphWorkspacePath',
    default: () => null,
  },
  {
    key: 'chatKnowgrphCloudUrl',
    type: 'string',
    source: 'localStorage',
    read: () => s().chatKnowgrphCloudUrl,
    write: (v) => s().setChatKnowgrphCloudUrl(String(v || '').trim() || null),
    docKey: 'chatKnowgrphCloudUrl',
    default: () => null,
  },
  {
    key: 'chatHistoryStorageMode',
    type: 'string',
    source: 'localStorage',
    read: () => s().chatHistoryStorageMode,
    write: (v) => s().setChatHistoryStorageMode(String(v || '').trim() === 'cloud' ? 'cloud' : 'local'),
    docKey: 'chatHistoryStorageMode',
    default: () => 'local',
    options: ['local', 'cloud'],
  },
  {
    key: 'chatHistoryWorkspacePath',
    type: 'string',
    source: 'localStorage',
    read: () => s().chatHistoryWorkspacePath,
    write: (v) => s().setChatHistoryWorkspacePath(String(v || '').trim() || null),
    docKey: 'chatHistoryWorkspacePath',
    default: () => null,
  },
  {
    key: 'chatHistoryCloudUrl',
    type: 'string',
    source: 'localStorage',
    read: () => s().chatHistoryCloudUrl,
    write: (v) => s().setChatHistoryCloudUrl(String(v || '').trim() || null),
    docKey: 'chatHistoryCloudUrl',
    default: () => null,
  },
  {
    key: 'chatContextScope',
    type: 'string',
    source: 'localStorage',
    read: () => s().chatContextScope,
    write: (v) =>
      s().setChatContextScope(
        String(v || '').trim() === 'selection'
          ? 'selection'
          : String(v || '').trim() === 'workspace'
            ? 'workspace'
            : 'hybrid',
      ),
    docKey: 'chatContextScope',
    default: () => 'hybrid',
    options: ['hybrid', 'selection', 'workspace'],
  },
  {
    key: 'integrationConfigsJson',
    type: 'string',
    source: 'localStorage',
    read: () => s().integrationConfigsJson,
    write: (v) => s().setIntegrationConfigsJson(String(v || '').trim() || null),
    docKey: 'integrationConfigsJson',
    default: () => stringifyIntegrationConfigs(DEFAULT_INTEGRATION_CONFIGS),
  },
];
