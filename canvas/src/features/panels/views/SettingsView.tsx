import React from 'react'
import CollapsibleSection from '@/features/panels/ui/CollapsibleSection'
import {
  KeyTypeValueHeader,
  KeyTypeValueSectionStack,
} from 'grph-shared/react/keyTypeValueLayout'
import ExpandCollapseAllButton from '@/features/panels/ui/ExpandCollapseAllButton'
import {
  uiDangerButtonClassName,
  uiToolbarToggleActiveClassName,
  UI_COLOR_DANGER_RED_BORDER,
} from '@/features/toolbar/ui/toolbarStyles'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import {
  UI_ANCHORS,
} from '@/lib/config'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useSettingsView } from './useSettingsView'
import { WorkspaceTableModeControl } from '@/features/workspace-table/ui/WorkspaceTableModeControl'
import { LS_KEYS } from '@/lib/config'
import { lsRemove } from '@/lib/persistence'
import { SOURCE_FILES_FORMATS } from '@/lib/config-copy/importExportCopy'
import { getIconSizeClass } from '@/lib/ui'
import { UI_RESPONSIVE_PANEL_STICKY_OVERLAP_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import { CHAT_DEFAULT_PROVIDER } from '@/lib/chatEndpoint'
import { PAYMENTS_PROVIDERS, DEFAULT_PAYMENT_PROVIDER_ID, resolvePaymentsProviderSpec } from '@/features/payments/providers'
import {
  INTEGRATIONS_SECTION_META,
  MAPS_SECTION_META,
  MCP_SECTION_META,
  resolveSettingsKtvHeaderLabels,
  type SectionMeta,
  type SettingsViewMode,
} from './settingsView.constants'
import { useSettingsChatAssist } from './useSettingsChatAssist'
import { SettingsSections, type SettingsSectionDescriptor } from './SettingsSections'
import {
  matchesSourceFileManagementQuery,
  SOURCE_FILE_MANAGEMENT_SETTINGS_ROW_COUNT,
  SourceFileManagementSettingsRows,
} from './SourceFileManagementSettingsRows'
import { useSettingsRowBundles } from './useSettingsRowBundles'
import { useSettingsSync } from './useSettingsSync'
import { PANEL_TYPOGRAPHY_DENSITY_PRESETS } from 'grph-shared/ui/panelTypography'
import { useSettingsWorkspaceActions } from './useSettingsWorkspaceActions'
import {
  CANVAS_EMBED_SETTINGS_ROW_COUNT,
  CanvasEmbedSettingsRows,
  matchesCanvasEmbedQuery,
} from './CanvasEmbedSettingsRows'
import {
  CrossDeviceIdentitySettingsRows,
} from './CrossDeviceIdentitySettingsRows'
import {
  DOCUMENT_STORAGE_SYNC_SETTINGS_ROW_COUNT,
  DocumentStorageSyncSettingsRows,
  matchesDocumentStorageSyncQuery,
} from './DocumentStorageSyncSettingsRows'
import {
  CROSS_DEVICE_IDENTITY_SETTINGS_ROW_COUNT,
  matchesCrossDeviceIdentityQuery,
} from './crossDeviceIdentitySettingsContract'

const WORKSPACE_IMPORT_ACCEPT = [...SOURCE_FILES_FORMATS.import, '.mdx'].join(',')
const SETTINGS_MAIN_HEADER_STICKY_OFFSET_CLASS = 'top-9'
const CANVAS_EMBED_SETTINGS_AREA = 'Canvas Embed'
const CROSS_DEVICE_IDENTITY_SETTINGS_AREA = 'Cross-device Identity Gate'
const DOCUMENT_STORAGE_SYNC_SETTINGS_AREA = 'Document Storage & Sync'

export default function SettingsView({
  searchQuery,
  requestedAnchorId,
  requestedAnchorSeq,
  onRegisterActions,
  mode = 'all',
}: {
  searchQuery: string
  requestedAnchorId?: string
  requestedAnchorSeq?: number
  onRegisterActions?: (a: {
    apply: () => void
    reset: () => void
    globalReset?: () => void
    collapseAll?: () => void
    expandAll?: () => void
    allCollapsed?: boolean
  }) => void
  mode?: SettingsViewMode
}) {
  const [paymentsProviderId, setPaymentsProviderId] = React.useState<string>(DEFAULT_PAYMENT_PROVIDER_ID)
  const {
    expanded,
    setExpanded,
    flowDetailsRuntime,
    chatHealthOk,
    chatHealthDetails,
    isCheckingHealth,
    checkChatHealth,
    bytePlusHealthOk,
    bytePlusHealthDetails,
    isCheckingBytePlusHealth,
    checkBytePlusHealth,
    grabMapsHealthOk,
    grabMapsHealthDetails,
    isCheckingGrabMapsHealth,
    checkGrabMapsHealth,
    deerFlowHealthOk,
    deerFlowHealthDetails,
    isCheckingDeerFlowHealth,
    checkDeerFlowHealth,
    isCheckingBytePlusVideoModelPreview,
    checkBytePlusVideoModelPreview,
    onGlobalReset,
    renderInput,
    collapsedByArea,
    groupByArea,
    allCollapsed,
    collapseAll,
    expandAll,
    normalizedQuery,
    toggleArea,
    uiPanelKeyValueTextSizeClass,
    values,
    setValues,
    dirtyRef,
  } = useSettingsView({ searchQuery, onRegisterActions, mode, paymentsProviderId })
  const [isRestoringWorkspace, setIsRestoringWorkspace] = React.useState(false)
  const pushUiToast = useGraphStore(s => s.pushUiToast)

  const onRestoreWorkspace = React.useCallback(async () => {
    if (isRestoringWorkspace) return
    setIsRestoringWorkspace(true)
    try {
      lsRemove(LS_KEYS.markdownWorkspaceUserClearedAllFiles)
      lsRemove(LS_KEYS.markdownWorkspaceSeeded)
      const { getWorkspaceFs } = await import('@/features/workspace-fs/workspaceFs') as typeof import('@/features/workspace-fs/workspaceFs')
      const fs = await getWorkspaceFs()
      await fs.ensureSeed()
      pushUiToast({ id: 'workspace-restored', kind: 'success', message: 'Workspace files restored.', ttlMs: 3000, dismissible: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to restore workspace'
      pushUiToast({ id: 'workspace-restore-error', kind: 'error', message, ttlMs: 5000, dismissible: true })
    } finally {
      setIsRestoringWorkspace(false)
    }
  }, [isRestoringWorkspace, pushUiToast])
  const uiIconScale = useGraphStore(s => s.uiIconScale)
  const uiIconStrokeWidth = useGraphStore(s => s.uiIconStrokeWidth)
  const headerStickyTopClass = mode === 'integrations' || mode === 'mcp' ? 'top-0' : UI_RESPONSIVE_PANEL_STICKY_OVERLAP_CLASSNAME
  const headerHasToolbarStrip = mode === 'all' || mode === 'payments'
  const ktvHeaderLabels = React.useMemo(() => resolveSettingsKtvHeaderLabels(mode), [mode])
  const settingsTypeIconSizeClass = getIconSizeClass(uiIconScale)
  const normalizedChatProvider = React.useMemo(
    () => String(values.chatProvider || '').trim() || CHAT_DEFAULT_PROVIDER,
    [values.chatProvider],
  )

  const paymentsProviders = React.useMemo(() => [...PAYMENTS_PROVIDERS], [])
  const activePaymentsProvider = React.useMemo(
    () => resolvePaymentsProviderSpec(paymentsProviderId),
    [paymentsProviderId],
  )
  const applyUiPanelDensityPreset = React.useCallback(
    (preset: 'comfortable' | 'compact') => {
      const panelTypographyPreset = PANEL_TYPOGRAPHY_DENSITY_PRESETS[preset]
      const patches: Record<string, string> =
        preset === 'comfortable'
          ? {
              uiPanelKeyValueTextSizeClass: panelTypographyPreset.textSizeClass,
              uiPanelTextFontClass: panelTypographyPreset.fontClass,
              uiPanelKeyValueInputClass: panelTypographyPreset.keyValueInputClass,
              uiPanelRowDensityDefaultClass: 'py-1',
              uiPanelMonospaceTextClass: panelTypographyPreset.monospaceTextClass,
              uiPanelMicroLabelTextSizeClass: panelTypographyPreset.microLabelTextSizeClass,
            }
          : {
              uiPanelKeyValueTextSizeClass: panelTypographyPreset.textSizeClass,
              uiPanelTextFontClass: panelTypographyPreset.fontClass,
              uiPanelKeyValueInputClass: panelTypographyPreset.keyValueInputClass,
              uiPanelRowDensityDefaultClass: 'py-0.5',
              uiPanelMonospaceTextClass: panelTypographyPreset.monospaceTextClass,
              uiPanelMicroLabelTextSizeClass: panelTypographyPreset.microLabelTextSizeClass,
            }
      Object.keys(patches).forEach(key => dirtyRef.current.add(key))
      setValues(prev => ({ ...prev, ...patches }))
    },
    [dirtyRef, setValues],
  )

  const patchChatValues = React.useCallback((patch: Record<string, string>) => {
    Object.keys(patch).forEach(key => dirtyRef.current.add(key))
    setValues(prev => ({ ...prev, ...patch }))
  }, [dirtyRef, setValues])
  const openLocalChatApiKeyEntry = React.useCallback(() => {
    patchChatValues({ chatAuthMode: 'byok' })
    setExpanded('chatApiKey')
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        const target = document.querySelector<HTMLElement>(`[data-kg-anchor="${UI_ANCHORS.settingsChatApiKey}"]`)
        if (!target) return
        target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
        const input = target.querySelector<HTMLInputElement>('input[type="password"], input')
        input?.focus()
        input?.select?.()
      })
    }
  }, [patchChatValues, setExpanded])
  const { buildChatAssistNodes, chatModelSuggestions } = useSettingsChatAssist({
    dirtyRef,
    openLocalChatApiKeyEntry,
    setValues,
    values,
  })
  const {
    chatHistoryPathStatus,
    createAndSelectChatHistoryFile,
    createAndSelectAgenticGraphFile,
    applyActiveWorkspaceFileAsChatHistory,
    applyActiveWorkspaceFileAsAgenticGraph,
    importCloudUrlForChatHistory,
    importCloudUrlForAgenticGraph,
    importLocalFilesForChatHistory,
    importLocalFilesForAgenticGraph,
    importLocalFolderForChatHistory,
    importLocalFolderForAgenticGraph,
    isUpdatingChatHistoryPath,
    isUpdatingAgenticGraphPath,
    kgcLocalImportInputRef,
    kgcLocalFolderImportInputRef,
    agenticgraphPathStatus,
    localImportInputRef,
    localFolderImportInputRef,
    setChatHistoryPathStatus,
    setAgenticGraphPathStatus,
    openFilePicker,
    openWorkspaceFile,
  } = useSettingsWorkspaceActions({
    patchChatValues,
    chatLocalStorageRootPath: values.chatLocalStorageRootPath,
    chatHistoryCloudUrl: values.chatHistoryCloudUrl,
    chatAgenticGraphCloudUrl: values.chatAgenticGraphCloudUrl,
  })
  React.useEffect(() => {
    const anchorId = String(requestedAnchorId || '').trim()
    if (!anchorId || typeof window === 'undefined') return
    const rafId = window.requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>(`[data-kg-anchor="${anchorId}"]`)
      if (!target) return
      target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
    })
    return () => window.cancelAnimationFrame(rafId)
  }, [requestedAnchorId, requestedAnchorSeq, groupByArea])

  useSettingsSync({ dirtyRef, setValues, values })

  const {
    actions: settingsRowActions,
    refs: settingsRowRefs,
    status: settingsRowStatus,
    ui: settingsRowUi,
  } = useSettingsRowBundles({
    applyActiveWorkspaceFileAsChatHistory,
    applyActiveWorkspaceFileAsAgenticGraph,
    buildChatAssistNodes,
    bytePlusHealthDetails,
    bytePlusHealthOk,
    chatHealthDetails,
    chatHealthOk,
    chatHistoryPathStatus,
    checkBytePlusHealth,
    checkBytePlusVideoModelPreview,
    checkChatHealth,
    checkDeerFlowHealth,
    checkGrabMapsHealth,
    createAndSelectChatHistoryFile,
    createAndSelectAgenticGraphFile,
    dirtyRef,
    deerFlowHealthDetails,
    deerFlowHealthOk,
    grabMapsHealthDetails,
    grabMapsHealthOk,
    importCloudUrlForChatHistory,
    importCloudUrlForAgenticGraph,
    isCheckingBytePlusHealth,
    isCheckingBytePlusVideoModelPreview,
    isCheckingDeerFlowHealth,
    isCheckingGrabMapsHealth,
    isCheckingHealth,
    isUpdatingChatHistoryPath,
    isUpdatingAgenticGraphPath,
    kgcLocalImportInputRef,
    kgcLocalFolderImportInputRef,
    agenticgraphPathStatus,
    localImportInputRef,
    localFolderImportInputRef,
    normalizedChatProvider,
    openFilePicker,
    openWorkspaceFile,
    pushUiToast,
    renderInput,
    setChatHistoryPathStatus,
    setAgenticGraphPathStatus,
    setValues,
    settingsTypeIconSizeClass,
    uiIconStrokeWidth,
    uiPanelKeyValueTextSizeClass,
  })
  const sectionDescriptors = React.useMemo<SettingsSectionDescriptor[]>(() => {
    const descriptors = groupByArea.map(([area, entries]) => ({
      area,
      collapsed: normalizedQuery ? false : !!collapsedByArea[area],
      entries,
      sectionMeta:
        INTEGRATIONS_SECTION_META[area]
        || MAPS_SECTION_META[area]
        || MCP_SECTION_META[area],
      showDensityPresets: area === 'UI Density: Panels',
    }))
    if (mode === 'all' && matchesCrossDeviceIdentityQuery(normalizedQuery)) {
      descriptors.unshift({
        area: CROSS_DEVICE_IDENTITY_SETTINGS_AREA,
        collapsed: normalizedQuery ? false : !!collapsedByArea[CROSS_DEVICE_IDENTITY_SETTINGS_AREA],
        entries: [],
        sectionMeta: undefined,
        showDensityPresets: false,
      })
    }
    if (mode === 'all' && matchesDocumentStorageSyncQuery(normalizedQuery)) {
      descriptors.splice(descriptors[0]?.area === CROSS_DEVICE_IDENTITY_SETTINGS_AREA ? 1 : 0, 0, {
        area: DOCUMENT_STORAGE_SYNC_SETTINGS_AREA,
        collapsed: normalizedQuery ? false : !!collapsedByArea[DOCUMENT_STORAGE_SYNC_SETTINGS_AREA],
        entries: [],
        sectionMeta: undefined,
        showDensityPresets: false,
      })
    }
    if (mode === 'all' && matchesCanvasEmbedQuery(normalizedQuery)) {
      descriptors.push({
        area: CANVAS_EMBED_SETTINGS_AREA,
        collapsed: normalizedQuery ? false : !!collapsedByArea[CANVAS_EMBED_SETTINGS_AREA],
        entries: [],
        sectionMeta: undefined,
        showDensityPresets: false,
      })
    }
    return descriptors
  }, [collapsedByArea, groupByArea, mode, normalizedQuery])
  const shouldRenderSourceFileManagementRows = React.useCallback((area: string) => {
    return mode === 'all'
      && area === 'Source File Management'
      && matchesSourceFileManagementQuery(normalizedQuery)
  }, [mode, normalizedQuery])
  const getSettingsAreaIntroItemCount = React.useCallback((area: string) => {
    if (area === CROSS_DEVICE_IDENTITY_SETTINGS_AREA) return CROSS_DEVICE_IDENTITY_SETTINGS_ROW_COUNT
    if (area === DOCUMENT_STORAGE_SYNC_SETTINGS_AREA) return DOCUMENT_STORAGE_SYNC_SETTINGS_ROW_COUNT
    if (area === CANVAS_EMBED_SETTINGS_AREA) return CANVAS_EMBED_SETTINGS_ROW_COUNT
    return shouldRenderSourceFileManagementRows(area) ? SOURCE_FILE_MANAGEMENT_SETTINGS_ROW_COUNT : 0
  }, [shouldRenderSourceFileManagementRows])
  const renderSettingsAreaIntro = React.useCallback((area: string) => {
    if (area === CROSS_DEVICE_IDENTITY_SETTINGS_AREA) return <CrossDeviceIdentitySettingsRows />
    if (area === DOCUMENT_STORAGE_SYNC_SETTINGS_AREA) return <DocumentStorageSyncSettingsRows />
    if (area === CANVAS_EMBED_SETTINGS_AREA) return <CanvasEmbedSettingsRows />
    if (!shouldRenderSourceFileManagementRows(area)) return null
    return (
      <SourceFileManagementSettingsRows
        normalizedQuery={normalizedQuery}
        setValues={setValues}
        values={values}
      />
    )
  }, [normalizedQuery, setValues, shouldRenderSourceFileManagementRows, values])
  return (
    <article className="min-h-full flex flex-col space-y-0">
      <input
        ref={kgcLocalImportInputRef}
        type="file"
        multiple
        accept={WORKSPACE_IMPORT_ACCEPT}
        className="hidden"
        onChange={e => {
          const files = e.currentTarget.files
          importLocalFilesForAgenticGraph(files)
          e.currentTarget.value = ''
        }}
      />
      <input
        ref={el => {
          kgcLocalFolderImportInputRef.current = el
          if (!el) return
          el.setAttribute('webkitdirectory', '')
          el.setAttribute('directory', '')
        }}
        type="file"
        multiple
        className="hidden"
        onChange={e => {
          const files = e.currentTarget.files
          importLocalFolderForAgenticGraph(files)
          e.currentTarget.value = ''
        }}
      />
      <input
        ref={localImportInputRef}
        type="file"
        multiple
        accept={WORKSPACE_IMPORT_ACCEPT}
        className="hidden"
        onChange={e => {
          const files = e.currentTarget.files
          importLocalFilesForChatHistory(files)
          e.currentTarget.value = ''
        }}
      />
      <input
        ref={el => {
          localFolderImportInputRef.current = el
          if (!el) return
          el.setAttribute('webkitdirectory', '')
          el.setAttribute('directory', '')
        }}
        type="file"
        multiple
        className="hidden"
        onChange={e => {
          const files = e.currentTarget.files
          importLocalFolderForChatHistory(files)
          e.currentTarget.value = ''
        }}
      />
      {chatModelSuggestions.length > 0 && (
        <datalist id="settings-chat-model-options">
          {chatModelSuggestions.map(option => (
            <option key={option} value={option} />
          ))}
        </datalist>
      )}
      <section className="space-y-0">
        <KeyTypeValueHeader
          stickyOffsetClassName={headerStickyTopClass}
          keyLabel={ktvHeaderLabels.keyLabel}
          typeLabel={ktvHeaderLabels.typeLabel}
          valueLabel={ktvHeaderLabels.valueLabel}
          actions={(
            <ExpandCollapseAllButton
              allCollapsed={allCollapsed}
              onExpandAll={expandAll}
              onCollapseAll={collapseAll}
              titleExpand="Expand all sections"
              titleCollapse="Collapse all sections"
            />
          )}
        />
        <KeyTypeValueSectionStack>
          {flowDetailsRuntime.status === 'unavailable' && (
            <section
              role="status"
              className={`flex items-center justify-between gap-2 p-2 border-b border-amber-400/40 text-xs ${UI_THEME_TOKENS.text.primary}`}
            >
              <span title={flowDetailsRuntime.error || undefined}>
                Responsibility details are unavailable. Settings remain editable.
              </span>
              <button
                type="button"
                className={`App-toolbar__btn text-xs border ${UI_THEME_TOKENS.panel.border}`}
                onClick={flowDetailsRuntime.retry}
              >
                Retry
              </button>
            </section>
          )}
          {mode === 'payments' && (
            <section className={`p-2 border-b border-white/10 ${UI_THEME_TOKENS.text.secondary}`}>
              <section className="flex flex-wrap items-center gap-1">
                <span className={`text-xs font-semibold ${UI_THEME_TOKENS.text.primary}`}>Providers</span>
                {paymentsProviders.map(provider => (
                  <button
                    key={provider.id}
                    type="button"
                    data-main-panel-no-drag="true"
                    className={
                      provider.id === activePaymentsProvider.id
                        ? `App-toolbar__btn text-xs ${uiToolbarToggleActiveClassName}`
                        : `App-toolbar__btn text-xs border ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg} ${UI_THEME_TOKENS.text.primary}`
                    }
                    onClick={() => {
                      setPaymentsProviderId(provider.id)
                    }}
                  >
                    {provider.label}
                  </button>
                ))}
                {activePaymentsProvider.docsUrl && (
                  <a
                    className={`App-toolbar__btn text-xs border ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg} ${UI_THEME_TOKENS.text.primary}`}
                    href={activePaymentsProvider.docsUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open docs
                  </a>
                )}
              </section>
            </section>
          )}
          {mode === 'all' && (
            <section className="p-2 border-b border-white/10">
              <WorkspaceTableModeControl />
            </section>
          )}
          <SettingsSections
            applyUiPanelDensityPreset={applyUiPanelDensityPreset}
            descriptors={sectionDescriptors}
            expanded={expanded}
            normalizedQuery={normalizedQuery}
            rowActions={settingsRowActions}
            rowRefs={settingsRowRefs}
            rowStatus={settingsRowStatus}
            rowUi={settingsRowUi}
            getAreaIntroItemCount={getSettingsAreaIntroItemCount}
            renderAreaIntro={renderSettingsAreaIntro}
            setExpanded={setExpanded}
            flushFirstSectionTop={!headerHasToolbarStrip}
            stickyOffsetClassName={SETTINGS_MAIN_HEADER_STICKY_OFFSET_CLASS}
            toggleArea={toggleArea}
            values={values}
          />
          {mode === 'all' && (
            <CollapsibleSection
              title="Resets and data"
              collapsed={false}
              onToggle={() => void 0}
              className={`mt-2 pt-2 border-t ${UI_COLOR_DANGER_RED_BORDER}`}
            >
              <section className={`space-y-1 text-xs ${UI_THEME_TOKENS.text.primary}`}>
                <section>
                  Reset all settings to defaults and clear canvas data. This action cannot be undone.
                </section>
                <button
                  type="button"
                  className={uiDangerButtonClassName}
                  onClick={onGlobalReset}
                >
                  Global Reset
                </button>
              </section>
              <section className={`mt-3 space-y-1 text-xs ${UI_THEME_TOKENS.text.primary}`}>
                <section>
                  Restore default workspace seed files after clearing all workspace files in Source Files.
                </section>
                <button
                  type="button"
                  className={uiDangerButtonClassName}
                  disabled={isRestoringWorkspace}
                  onClick={onRestoreWorkspace}
                >
                  {isRestoringWorkspace ? 'Restoring…' : 'Restore Workspace'}
                </button>
              </section>
            </CollapsibleSection>
          )}
        </KeyTypeValueSectionStack>
      </section>
    </article>
  )
}
