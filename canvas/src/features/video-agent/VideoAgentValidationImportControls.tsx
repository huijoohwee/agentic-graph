import React from 'react'
import { getMarkdownWorkspaceActionBridge, type WorkspaceImportUrlOpts } from '@/features/markdown-explorer/workspaceActionBridge'
import { cn } from '@/lib/utils'
import {
  buildVideoAgentValidationUrlOptions,
  mergeVideoAgentValidationConfigs,
  readVideoAgentValidationConfig,
  readVideoAgentValidationConfigFromRuntimeInput,
  serializeVideoAgentValidationUrls,
  splitVideoAgentValidationUrls,
  writeVideoAgentValidationConfig,
  type VideoAgentValidationUrlOption,
} from './videoAgentValidationConfig'

export type VideoAgentValidationUrlActionMode = 'import' | 'select'
type VideoAgentValidationImportState = 'idle' | 'running' | 'success' | 'error'

type ImportUrlFallback = (urlRaw: string, opts?: WorkspaceImportUrlOpts) => void | Promise<void>

export type VideoAgentValidationImportControlsProps = {
  actionClassName: string
  actionsAriaLabel: string
  containerAriaLabel: string
  containerClassName?: string
  docPathAriaLabel: string
  docPathLabel?: string
  docPathPlaceholder?: string
  fieldClassName: string
  storyboardWidgetDataHook?: boolean
  importSetLabel?: string
  importUrlFallback?: ImportUrlFallback
  importUrlOpts?: WorkspaceImportUrlOpts | (() => WorkspaceImportUrlOpts | undefined)
  onBeforeImport?: () => void
  onSelectUrl?: (url: string) => void
  optionAriaLabel?: (option: VideoAgentValidationUrlOption) => string
  optionButtonLabel?: (option: VideoAgentValidationUrlOption) => string
  optionMode: VideoAgentValidationUrlActionMode
  runtimeInput?: unknown
  showFieldLabels?: boolean
  textAreaClassName?: string
  urlsAriaLabel: string
  urlsLabel?: string
  urlsPlaceholder?: string
}

const resolveImportUrlOpts = (
  value: VideoAgentValidationImportControlsProps['importUrlOpts'],
): WorkspaceImportUrlOpts | undefined => {
  if (typeof value === 'function') return value()
  return value
}

export function VideoAgentValidationImportControls({
  actionClassName,
  actionsAriaLabel,
  containerAriaLabel,
  containerClassName,
  docPathAriaLabel,
  docPathLabel = 'Validation document path',
  docPathPlaceholder = 'Validation document path',
  fieldClassName,
  storyboardWidgetDataHook = false,
  importSetLabel = 'Import set',
  importUrlFallback,
  importUrlOpts,
  onBeforeImport,
  onSelectUrl,
  optionAriaLabel,
  optionButtonLabel,
  optionMode,
  runtimeInput,
  showFieldLabels = false,
  textAreaClassName,
  urlsAriaLabel,
  urlsLabel = 'Validation import URLs',
  urlsPlaceholder = 'Validation import URLs',
}: VideoAgentValidationImportControlsProps) {
  const runtimeConfig = React.useMemo(() => readVideoAgentValidationConfigFromRuntimeInput(runtimeInput), [runtimeInput])
  const initialConfig = React.useMemo(
    () => mergeVideoAgentValidationConfigs(readVideoAgentValidationConfig(), runtimeConfig),
    [runtimeConfig],
  )
  const [validationDocPathDraft, setValidationDocPathDraft] = React.useState(initialConfig.validationDocPath)
  const [validationUrlsDraft, setValidationUrlsDraft] = React.useState(serializeVideoAgentValidationUrls(initialConfig.importUrls))
  const [importState, setImportState] = React.useState<VideoAgentValidationImportState>('idle')
  const [importStatus, setImportStatus] = React.useState('')
  const validationImportUrls = React.useMemo(() => splitVideoAgentValidationUrls(validationUrlsDraft), [validationUrlsDraft])
  const validationUrlOptions = React.useMemo(() => buildVideoAgentValidationUrlOptions(validationImportUrls), [validationImportUrls])
  const initialImportUrlsDraft = React.useMemo(() => serializeVideoAgentValidationUrls(initialConfig.importUrls), [initialConfig.importUrls])
  const runtimeDocPathHydratedRef = React.useRef(false)
  const runtimeUrlsHydratedRef = React.useRef(false)

  React.useEffect(() => {
    if (!runtimeDocPathHydratedRef.current && !validationDocPathDraft && initialConfig.validationDocPath) {
      runtimeDocPathHydratedRef.current = true
      setValidationDocPathDraft(initialConfig.validationDocPath)
    }
    if (!runtimeUrlsHydratedRef.current && validationImportUrls.length === 0 && initialImportUrlsDraft) {
      runtimeUrlsHydratedRef.current = true
      setValidationUrlsDraft(initialImportUrlsDraft)
    }
  }, [initialConfig.validationDocPath, initialImportUrlsDraft, validationDocPathDraft, validationImportUrls.length])

  const updateValidationDocPath = React.useCallback((next: string) => {
    setValidationDocPathDraft(next)
    writeVideoAgentValidationConfig({ validationDocPath: next, importUrls: splitVideoAgentValidationUrls(validationUrlsDraft) })
  }, [validationUrlsDraft])

  const updateValidationUrls = React.useCallback((next: string) => {
    setValidationUrlsDraft(next)
    writeVideoAgentValidationConfig({ validationDocPath: validationDocPathDraft, importUrls: splitVideoAgentValidationUrls(next) })
  }, [validationDocPathDraft])

  const importValidationUrl = React.useCallback(async (urlRaw: string): Promise<void> => {
    const url = String(urlRaw || '').trim()
    if (!url) return
    const opts = resolveImportUrlOpts(importUrlOpts)
    const bridge = getMarkdownWorkspaceActionBridge()
    if (typeof bridge.importUrl === 'function') {
      await bridge.importUrl(url, opts)
      return
    }
    if (importUrlFallback) {
      await importUrlFallback(url, opts)
      return
    }
    throw new Error('URL import is unavailable')
  }, [importUrlFallback, importUrlOpts])

  const activateValidationUrl = React.useCallback(async (option: VideoAgentValidationUrlOption) => {
    if (optionMode === 'select') {
      onSelectUrl?.(option.url)
      return
    }
    setImportState('running')
    setImportStatus(`Importing ${option.label}`)
    try {
      onBeforeImport?.()
      await importValidationUrl(option.url)
      setImportState('success')
      setImportStatus(`Imported ${option.label}`)
    } catch (error) {
      setImportState('error')
      setImportStatus(error instanceof Error ? error.message : 'URL import failed')
    }
  }, [importValidationUrl, onBeforeImport, onSelectUrl, optionMode])

  const importValidationUrls = React.useCallback(async () => {
    if (validationImportUrls.length === 0) return
    setImportState('running')
    setImportStatus(`Importing ${validationImportUrls.length} URLs`)
    try {
      onBeforeImport?.()
      for (const url of validationImportUrls) await importValidationUrl(url)
      setImportState('success')
      setImportStatus(`Imported ${validationImportUrls.length} URLs`)
    } catch (error) {
      setImportState('error')
      setImportStatus(error instanceof Error ? error.message : 'URL import failed')
    }
  }, [importValidationUrl, onBeforeImport, validationImportUrls])

  const importRunning = importState === 'running'

  return (
    <section
      className={containerClassName}
      aria-label={containerAriaLabel}
      aria-busy={importRunning}
      data-kg-storyboard-widget-video-agent-validation-controls={storyboardWidgetDataHook ? '1' : undefined}
    >
      <label className={cn(showFieldLabels && 'grid min-w-0 gap-1 text-xs')}>
        {showFieldLabels ? <span className="truncate">{docPathLabel}</span> : null}
        <input
          className={fieldClassName}
          aria-label={docPathAriaLabel}
          placeholder={docPathPlaceholder}
          value={validationDocPathDraft}
          onChange={event => updateValidationDocPath(event.target.value)}
        />
      </label>
      <label className={cn(showFieldLabels && 'grid min-w-0 gap-1 text-xs')}>
        {showFieldLabels ? <span className="truncate">{urlsLabel}</span> : null}
        <textarea
          className={textAreaClassName || fieldClassName}
          aria-label={urlsAriaLabel}
          placeholder={urlsPlaceholder}
          value={validationUrlsDraft}
          onChange={event => updateValidationUrls(event.target.value)}
        />
      </label>
      <section className="flex min-w-0 flex-wrap items-stretch gap-1" aria-label={actionsAriaLabel}>
        {validationUrlOptions.map(option => (
          <button
            key={`${option.index}:${option.url}`}
            type="button"
            className={actionClassName}
            title={option.url}
            aria-label={optionAriaLabel ? optionAriaLabel(option) : `Use validation ${option.label}`}
            data-kg-video-agent-validation-url-option={option.index + 1}
            disabled={importRunning}
            onClick={() => void activateValidationUrl(option)}
          >
            {optionButtonLabel ? optionButtonLabel(option) : `Use ${option.label}`}
          </button>
        ))}
        <button
          type="button"
          className={actionClassName}
          disabled={validationImportUrls.length === 0 || importRunning}
          onClick={() => void importValidationUrls()}
        >
          {importSetLabel}
        </button>
      </section>
      {importStatus ? (
        <output aria-live="polite" data-kg-video-agent-validation-import-state={importState}>
          {importStatus}
        </output>
      ) : null}
    </section>
  )
}
