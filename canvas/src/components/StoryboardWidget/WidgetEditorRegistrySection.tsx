import { PanelSelect } from '@/lib/ui/panelFormControls'
import React from 'react'
import { PORT_HANDLE_STROKE_CLASS } from '@/components/StoryboardWidget/portHandleUi'
import type { WidgetRegistryEntry, WidgetRegistryFieldOption, WidgetRegistryPort } from '@/features/storyboard-widget-manager/widgetRegistryTypes'
import { getObjectPath } from '@/lib/data/objectPath'
import { WidgetEditorKvTable, type WidgetEditorKvRow } from '@/components/StoryboardWidget/WidgetEditorKvTable'
import type { FlowConnectedValuesBySchemaPath } from '@/lib/storyboardWidget/flowDataflow'
import { UI_COPY } from '@/lib/config'
import { formatFlowHandleAccessibleName, formatFlowHandleKtvKeyLabel, formatFlowHandleKtvSubLabel, formatFlowHandleSemanticKey, readFlowHandlePath } from '@/lib/graph/flowHandlePresentation'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { UI_RESPONSIVE_PANEL_CODE_EDITOR_FRAME_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import { cn } from '@/lib/utils'
import { PlainTextInputEditor } from '@/components/ui/PlainTextInputEditor'
import { StoryboardWidgetInlineValueEditor } from '@/components/StoryboardWidget/StoryboardWidgetInlineValueEditor'
import { buildInlineMediaCommandContextFromRecord } from '@/lib/command-menu/inlineMediaCommandContext'
import { listVisibleWidgetRegistryPortsForPropsEditor, resolveWidgetRegistryApiDocRef, resolveWidgetRegistryMainPanelLink } from '@/features/storyboard-widget-manager/registryTemplates'
import { emitMainPanelOpen } from '@/features/panels/utils/useMainPanelRect'
import { applyWidgetFieldValueUpdate, normalizeWidgetFieldSchemaPath, readWidgetFieldValueText } from '@/features/storyboard-widget-manager/widgetFieldMutation'
import {
  formatConnectedValue,
  JsonLikeValueEditor,
  normalizeJsonLikeValueText,
} from '@/components/StoryboardWidget/WidgetEditorJsonLikeValueEditor'
import {
  type RegistryPortRowModel,
  useWidgetEditorRegistryEffectiveProperties,
} from '@/components/StoryboardWidget/useWidgetEditorRegistryEffectiveProperties'

export const WidgetEditorRegistrySection = React.memo(function WidgetEditorRegistrySection(props: {
  active: boolean
  properties: Record<string, unknown>
  registryEntry: WidgetRegistryEntry
  microLabelClass: string
  monospaceTextClass: string
  textSizeClass: string
  keyValueInputClass: string
  keyLabelClass: string
  ids: { registryField: (fieldKey: string) => string }
  dotSizePx: number
  dotHitPx: number
  portHandlesEnabled: boolean
  portHandlesVisible?: boolean
  showFieldRows?: boolean
  showPortRows?: boolean
  showTableHeader?: boolean
  connectedValuesBySchemaPath?: FlowConnectedValuesBySchemaPath
  onSetProperties: (properties: Record<string, unknown>) => void
  onSchemaPortHandleClick?: (args: { dir: 'in' | 'out'; portKey: string }) => void
}) {
  const propertiesInlineMediaCommandContext = React.useMemo(
    () => buildInlineMediaCommandContextFromRecord(props.properties),
    [props.properties],
  )
  const {
    active,
    properties,
    registryEntry,
    microLabelClass,
    monospaceTextClass,
    textSizeClass,
    keyValueInputClass,
    keyLabelClass,
    ids,
    dotSizePx,
    dotHitPx,
    portHandlesEnabled,
    portHandlesVisible = true,
    showFieldRows = true,
    showPortRows = true,
    showTableHeader = false,
    connectedValuesBySchemaPath,
    onSetProperties,
    onSchemaPortHandleClick,
  } = props

  const registryFields = (registryEntry?.fields || []).filter(
    f => (f as { isHidden?: boolean }).isHidden !== true,
  )
  const registryPorts = React.useMemo(() => {
    return listVisibleWidgetRegistryPortsForPropsEditor({
      registryEntry,
      properties,
    })
  }, [properties, registryEntry])

  const rows: WidgetEditorKvRow[] = []

  const fieldKeyCounts = React.useMemo(() => {
    const counts = new Map<string, number>()
    for (let i = 0; i < registryFields.length; i += 1) {
      const key = String(registryFields[i]?.fieldKey || i).trim() || 'field'
      counts.set(key, (counts.get(key) || 0) + 1)
    }
    return counts
  }, [registryFields])

  const effectiveProperties = useWidgetEditorRegistryEffectiveProperties({ properties, registryEntry })

  const registryFieldSchemaPathSet = React.useMemo(() => {
    const out = new Set<string>()
    registryFields.forEach(field => {
      const schemaPath = normalizeWidgetFieldSchemaPath(field.schemaPath, field.fieldKey)
      if (schemaPath) out.add(schemaPath)
    })
    return out
  }, [registryFields])

  const registryPortModels = React.useMemo<RegistryPortRowModel[]>(() => {
    const counts = new Map<string, number>()
    for (let idx = 0; idx < registryPorts.length; idx += 1) {
      const p = registryPorts[idx]
      const portKey = String(p?.portKey || '').trim()
      if (!portKey) continue
      counts.set(`${p.direction}:${portKey}`, (counts.get(`${p.direction}:${portKey}`) || 0) + 1)
    }
    const seen = new Map<string, number>()
    const out: RegistryPortRowModel[] = []
    for (let idx = 0; idx < registryPorts.length; idx += 1) {
      const p = registryPorts[idx]
      const portKey = String(p.portKey || '').trim()
      if (!portKey) continue
      const isIn = p.direction === 'input'
      const occurrenceKey = `${p.direction}:${portKey}`
      const occurrenceIndex = seen.get(occurrenceKey) || 0
      seen.set(occurrenceKey, occurrenceIndex + 1)
      const schemaPath = String(p.schemaPath || '').trim()
      const normalizedSchemaPath = normalizeWidgetFieldSchemaPath(schemaPath, portKey)
      const portValueId = ids.registryField(
        (counts.get(occurrenceKey) || 0) > 1
          ? `port-${idx}-${p.direction}-${portKey}-${schemaPath}`
          : `port-${p.direction}-${portKey}`,
      )
      const handlePath = readFlowHandlePath(isIn ? 'in' : 'out')
      const handleSemanticKey = formatFlowHandleSemanticKey({ dir: isIn ? 'in' : 'out', portKey })
      const portKeyLabel = formatFlowHandleKtvKeyLabel({ dir: isIn ? 'in' : 'out', portKey }) || handleSemanticKey || portKey
      const portSubLabel = formatFlowHandleKtvSubLabel({ portKey, schemaPath })
      const aria = formatFlowHandleAccessibleName({
        dir: isIn ? 'in' : 'out',
        portKey,
        schemaPath,
        occurrenceIndex,
        occurrenceCount: counts.get(occurrenceKey) || 0,
      }) || handleSemanticKey
      out.push({
        port: p,
        rowIndex: idx,
        portKey,
        isIn,
        schemaPath,
        normalizedSchemaPath,
        portValueId,
        handlePath,
        portKeyLabel,
        portSubLabel,
        aria,
        mainPanelLink: resolveWidgetRegistryMainPanelLink({
          registryEntry,
          properties,
          portKey,
        }),
        portValueText: readWidgetFieldValueText({ properties: effectiveProperties, schemaPath, fallbackKey: portKey }),
      })
    }
    return out
  }, [effectiveProperties, ids, properties, registryEntry, registryPorts])

  const renderRegistryPortButton = React.useCallback((model: RegistryPortRowModel) => {
    if (!portHandlesVisible) return null
    return (
      <button
        type="button"
        aria-label={model.aria}
        title={model.aria}
        data-kg-port-handle="1"
        data-kg-port-handle-kind="dot"
        data-kg-port-dir={model.isIn ? 'in' : 'out'}
        data-kg-port-key={model.portKey}
        data-kg-port-schema-path={model.schemaPath || undefined}
        data-kg-port-path={model.handlePath}
        className={cn('relative', UI_THEME_TOKENS.button.text)}
        style={{ width: `${dotHitPx}px`, height: `${dotHitPx}px` }}
        onPointerDown={e => {
          try {
            e.stopPropagation()
          } catch {
            void 0
          }
        }}
        onClick={e => {
          try {
            e.stopPropagation()
          } catch {
            void 0
          }
          if (!active || !portHandlesEnabled) return
          if (onSchemaPortHandleClick) {
            onSchemaPortHandleClick({ dir: model.isIn ? 'in' : 'out', portKey: model.portKey })
            return
          }
          if (!model.mainPanelLink) return
          emitMainPanelOpen(model.mainPanelLink)
        }}
        disabled={!active || !portHandlesEnabled}
      >
        <span
          aria-hidden={true}
          className={cn(
            'absolute top-1/2 left-1/2 rounded-full border',
            UI_THEME_TOKENS.panel.bg,
            PORT_HANDLE_STROKE_CLASS,
          )}
          style={{ width: `${dotSizePx}px`, height: `${dotSizePx}px`, transform: 'translate(-50%, -50%)' }}
        />
      </button>
    )
  }, [active, dotHitPx, dotSizePx, onSchemaPortHandleClick, portHandlesEnabled, portHandlesVisible])

  const mergedRegistryPortNodesBySchemaPath = React.useMemo(() => {
    const out = new Map<string, Pick<WidgetEditorKvRow, 'inPortNode' | 'outPortNode'>>()
    registryPortModels.forEach(model => {
      if (!model.normalizedSchemaPath || !registryFieldSchemaPathSet.has(model.normalizedSchemaPath)) return
      const current = out.get(model.normalizedSchemaPath) || {}
      out.set(model.normalizedSchemaPath, {
        ...current,
        ...(model.isIn
          ? { inPortNode: renderRegistryPortButton(model) }
          : { outPortNode: renderRegistryPortButton(model) }),
      })
    })
    return out
  }, [registryFieldSchemaPathSet, registryPortModels, renderRegistryPortButton])

  for (let idx = 0; idx < registryFields.length; idx += 1) {
    const f = registryFields[idx]
    const rowKey = `${String(f.fieldKey || '')}:${idx}`
    const path = normalizeWidgetFieldSchemaPath(f.schemaPath, f.fieldKey)
    const cur = path ? getObjectPath({ properties }, path) : undefined
    const effectiveCur = path ? getObjectPath({ properties: effectiveProperties }, path) : undefined
    const connected = path ? connectedValuesBySchemaPath?.[path] : undefined
    const label = String(f.label || f.fieldKey)
    const fieldType = String(f.fieldType || '').trim().toLowerCase()
    const fieldOptions = Array.isArray((f as { options?: WidgetRegistryFieldOption[] }).options)
      ? ((f as { options?: WidgetRegistryFieldOption[] }).options || [])
      : []
    const rawFieldKey = String(f.fieldKey || idx).trim() || String(idx)
    const id = ids.registryField(
      (fieldKeyCounts.get(rawFieldKey) || 0) > 1
        ? `field-${idx}-${rawFieldKey}-${path}`
        : rawFieldKey,
    )
    const labelId = `${id}-label`
    const apiDocRef = resolveWidgetRegistryApiDocRef({
      registryEntry,
      properties,
      schemaPath: f.schemaPath,
      fieldKey: f.fieldKey,
      portKey: (f as { portKey?: string }).portKey,
    })

    const setValue = (nextValue: unknown) => {
      if (!path) return
      onSetProperties(applyWidgetFieldValueUpdate({
        properties,
        schemaPath: path,
        nextValue,
      }))
    }

    const apiKey = apiDocRef?.apiKey || ''
    const keyNode = (
      <label className={cn(keyLabelClass, UI_THEME_TOKENS.text.secondary)} htmlFor={id}>
        <span className={cn('block min-w-0 truncate', UI_THEME_TOKENS.text.primary)}>{label}</span>
        {apiKey ? (
          <span className={cn('block min-w-0 truncate', microLabelClass, monospaceTextClass, UI_THEME_TOKENS.text.tertiary)}>
            {apiKey}
          </span>
        ) : null}
      </label>
    )

    const mergedPortNodes = path ? mergedRegistryPortNodesBySchemaPath.get(path) : undefined
    const mergedPortRowProps: Pick<WidgetEditorKvRow, 'inPortNode' | 'outPortNode'> = {
      inPortNode: mergedPortNodes?.inPortNode,
      outPortNode: mergedPortNodes?.outPortNode,
    }

    if (fieldType === 'readonly') {
      const v = typeof effectiveCur === 'string' ? effectiveCur : typeof effectiveCur === 'number' ? String(effectiveCur) : String(effectiveCur ?? '').trim()
      rows.push({
        ...mergedPortRowProps,
        rowKey,
        labelId,
        keyNode,
        valueNode: (
          <PlainTextInputEditor
            id={id}
            className={cn(
              keyValueInputClass,
              textSizeClass,
              'text-left',
              monospaceTextClass,
              UI_THEME_TOKENS.input.bg,
              UI_THEME_TOKENS.input.border,
              UI_THEME_TOKENS.input.text,
            )}
            value={v}
            readOnly
          />
        ),
      })
      continue
    }

    const connectedValueText = connected ? formatConnectedValue(connected.value) : ''
    const connectedMeta = connectedValueText
      ? (
          <section
            className={cn(
              'mt-1 min-w-0',
              microLabelClass,
            )}
            aria-label={UI_COPY.flowWidgetConnectedValueLabel}
          >
            <p className={cn('min-w-0 truncate', UI_THEME_TOKENS.text.tertiary)}>{UI_COPY.flowWidgetConnectedValuePrefix}{connectedValueText}</p>
          </section>
        )
      : null

    if (fieldType === 'boolean' || fieldType === 'bool') {
      const checked = typeof cur === 'boolean' ? cur : false
      const effectiveChecked = typeof effectiveCur === 'boolean' ? effectiveCur : checked
      rows.push({
        ...mergedPortRowProps,
        rowKey,
        labelId,
        keyNode,
        valueNode: (
          <section className="w-full">
            <section className="flex items-center">
              <input id={id} type="checkbox" checked={effectiveChecked} onChange={e => setValue(e.target.checked)} disabled={!active} />
            </section>
            {connectedMeta}
          </section>
        ),
      })
      continue
    }

    if (fieldType === 'select') {
      const effectiveValue = typeof effectiveCur === 'number' && Number.isFinite(effectiveCur)
        ? String(effectiveCur)
        : String(effectiveCur ?? '').trim()
      rows.push({
        ...mergedPortRowProps,
        rowKey,
        labelId,
        keyNode,
        valueNode: (
          <section className="w-full">
            <PanelSelect
              id={id}
              className={cn(
                keyValueInputClass,
                textSizeClass,
                'text-left',
                UI_THEME_TOKENS.input.bg,
                UI_THEME_TOKENS.input.border,
                UI_THEME_TOKENS.input.text,
              )}
              value={effectiveValue}
              onValueChange={selectedValueInput => {
                const raw = String(selectedValueInput || '').trim()
                if (!raw) {
                  setValue(undefined)
                  return
                }
                const matchedOption = fieldOptions.find(option => String(option?.value ?? '').trim() === raw)
                setValue(matchedOption ? matchedOption.value : raw)
              }}
              disabled={!active}
            >
              <option value="">Select…</option>
              {fieldOptions.map(option => {
                const optionValue = String(option?.value ?? '').trim()
                if (!optionValue) return null
                return (
                  <option key={optionValue} value={optionValue}>
                    {String(option?.label || optionValue)}
                  </option>
                )
              })}
            </PanelSelect>
            {connectedMeta}
          </section>
        ),
      })
      continue
    }

    if (fieldType === 'number' || fieldType === 'int' || fieldType === 'integer' || fieldType === 'float') {
      const v = typeof effectiveCur === 'number' && Number.isFinite(effectiveCur) ? String(effectiveCur) : ''
      rows.push({
        ...mergedPortRowProps,
        rowKey,
        labelId,
        keyNode,
        valueNode: (
          <section className="w-full">
            <StoryboardWidgetInlineValueEditor
              id={id}
              className={cn(
                keyValueInputClass,
                textSizeClass,
                'text-left',
              )}
              value={v}
              placeholder={!v && connectedValueText ? connectedValueText : undefined}
              active={active}
              ariaLabel={label}
              markdownCommandContextText={propertiesInlineMediaCommandContext}
              onCommit={next => {
                const raw = String(next ?? '')
                if (!raw.trim()) {
                  setValue(undefined)
                  return
                }
                const num = Number.parseFloat(raw)
                setValue(Number.isFinite(num) ? num : undefined)
              }}
            />
            {connectedMeta}
          </section>
        ),
      })
      continue
    }

    if (fieldType === 'json' || fieldType === 'object') {
      const mode = fieldType === 'object' ? 'object' : 'json'
      const v = normalizeJsonLikeValueText(effectiveCur)
      rows.push({
        ...mergedPortRowProps,
        rowKey,
        labelId,
        keyNode,
        valueNode: (
          <section className="w-full">
            <JsonLikeValueEditor
              id={id}
              mode={mode}
              value={effectiveCur}
              active={active}
              placeholder={!v && connectedValueText ? connectedValueText : undefined}
              className={cn(
                UI_RESPONSIVE_PANEL_CODE_EDITOR_FRAME_CLASSNAME,
                'px-2 py-1 rounded-md border',
                monospaceTextClass,
                UI_THEME_TOKENS.input.bg,
                UI_THEME_TOKENS.input.border,
                UI_THEME_TOKENS.input.text,
              )}
              markdownCommandContextText={propertiesInlineMediaCommandContext}
              onCommit={next => setValue(next)}
            />
            {connectedMeta}
          </section>
        ),
      })
      continue
    }

    const v = typeof effectiveCur === 'string' ? effectiveCur : typeof effectiveCur === 'number' ? String(effectiveCur) : ''
    rows.push({
      ...mergedPortRowProps,
      rowKey,
      labelId,
      keyNode,
      valueNode: (
        <section className="w-full">
          <StoryboardWidgetInlineValueEditor
            id={id}
            className={cn(
              keyValueInputClass,
              textSizeClass,
              'text-left',
              fieldType === 'textarea' ? 'px-2 py-1' : '',
            )}
            multiline={fieldType === 'textarea'}
            rows={fieldType === 'textarea' ? 4 : undefined}
            value={v}
            placeholder={!v && connectedValueText ? connectedValueText : undefined}
            active={active}
            ariaLabel={label}
            markdownCommandContextText={propertiesInlineMediaCommandContext}
            onCommit={raw => {
              setValue(raw.trim() ? raw : undefined)
            }}
          />
          {connectedMeta}
        </section>
      ),
    })
  }

  const portRows: WidgetEditorKvRow[] = React.useMemo(() => {
    const out: WidgetEditorKvRow[] = []
    for (let idx = 0; idx < registryPortModels.length; idx += 1) {
      const model = registryPortModels[idx]
      if (showFieldRows && registryFieldSchemaPathSet.has(model.normalizedSchemaPath)) continue
      const portButton = renderRegistryPortButton(model)
      out.push({
        rowKey: `port:${model.port.direction}:${model.portKey}:${model.rowIndex}`,
        labelId: `${model.portValueId}-label`,
        inPortNode: model.isIn ? portButton : null,
        outPortNode: !model.isIn ? portButton : null,
        keyNode: (
          <label className={cn(keyLabelClass, UI_THEME_TOKENS.text.secondary)} htmlFor={model.portValueId} title={model.aria || model.portKeyLabel}>
            <span className={cn('block min-w-0 truncate', UI_THEME_TOKENS.text.primary)}>{model.portKeyLabel}</span>
            {model.portSubLabel ? (
              <span className={cn('block', UI_THEME_TOKENS.text.tertiary)}>{model.portSubLabel}</span>
            ) : null}
          </label>
        ),
        valueNode: (
          <PlainTextInputEditor
            id={model.portValueId}
            ariaLabel={model.aria}
            value={model.portValueText}
            disabled
            readOnly
            className={cn(
              keyValueInputClass,
              textSizeClass,
              'text-left',
              monospaceTextClass,
              UI_THEME_TOKENS.input.bg,
              UI_THEME_TOKENS.input.border,
              UI_THEME_TOKENS.input.text,
            )}
          />
        ),
      })
    }
    return out
  }, [keyLabelClass, keyValueInputClass, monospaceTextClass, registryFieldSchemaPathSet, registryPortModels, renderRegistryPortButton, showFieldRows, textSizeClass])

  if (!registryEntry) return null
  const visibleFieldRows = showFieldRows ? rows : []
  const visiblePortRows = showPortRows && portHandlesVisible ? portRows : []
  if (visibleFieldRows.length === 0 && visiblePortRows.length === 0) return null

  return (
    <section className="min-w-0 mt-4" aria-label="Widget Registry">
      {visibleFieldRows.length > 0 && (
        <WidgetEditorKvTable
          ariaLabel="Registry fields"
          microLabelClass={microLabelClass}
          rows={visibleFieldRows}
          showHeader={showTableHeader}
          dotSizePx={dotSizePx}
          dotHitPx={dotHitPx}
          forcePortDots={portHandlesVisible}
          extraPlaceholderCell
        />
      )}

      {visiblePortRows.length > 0 && (
        <WidgetEditorKvTable
          ariaLabel="Registry ports"
          microLabelClass={microLabelClass}
          rows={visiblePortRows}
          showHeader={showTableHeader}
          dotSizePx={dotSizePx}
          dotHitPx={dotHitPx}
          forcePortDots={portHandlesVisible}
        />
      )}
    </section>
  )
})
