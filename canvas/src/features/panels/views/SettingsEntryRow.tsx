import { MainPanelCellHelp } from '@/features/panels/ui/mainPanelRowHelp'
import { useCanvasKeyTypeValueStaticRowProps } from '@/features/panels/ui/canvasKeyTypeValueRuntime'
import { RightAlignedValueCell } from '@/features/panels/ui/canvasKeyTypeValueValueCell'
import { MainPanelTypeIcon, resolveMainPanelSettingTypeIconKey } from '@/features/panels/ui/mainPanelHelpIconLibrary'
import { getUiSectionActionClassName, getUiSectionChipClassName } from '@/lib/ui/sectionChipChrome'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { KeyTypeValueStaticRow } from 'grph-shared/react/keyTypeValueRow'
import { KTV_STATUS_TEXT_SIZE_CLASS_NAME } from 'grph-shared/ui/keyTypeValueRows'
import { SettingsEntryDetailsTable } from './SettingsEntryDetailsTable'
import { buildSettingsEntryInputNode } from './settingsEntryRow.input'
import { buildSettingsEntryTooltips } from './settingsEntryRow.tooltips'
import { buildSettingsEntryValueNode } from './settingsEntryRow.value'
import { UI_TEXT_TRUNCATE } from '@/lib/ui/textLayout'
import type { SettingsEntry } from './useSettingsView.helpers'
import type { SettingsRowActions, SettingsRowRefs, SettingsRowStatusState, SettingsRowToggleActions, SettingsRowUi } from './settingsRowTypes'

type SettingsEntryRowProps = {
  area: string
  entry: SettingsEntry
  isExpanded: boolean
  actions: SettingsRowActions
  refs: SettingsRowRefs
  status: SettingsRowStatusState
  toggleActions: SettingsRowToggleActions
  ui: SettingsRowUi
  values: Record<string, string | number | boolean>
}

export function SettingsEntryRow({
  area,
  entry,
  isExpanded,
  actions,
  refs,
  status,
  toggleActions,
  ui,
  values,
}: SettingsEntryRowProps) {
  const {
    meta: setting,
    details,
    writable,
    anchorId,
    typeLabel,
    valueKey,
    valueDisplayOverride,
    valueType,
    valueOptions,
  } = entry

  const hasOptions = Array.isArray(setting.options) && setting.options.length > 0
  const resolvedTypeLabel = String(typeLabel || setting.type || '').trim() || 'string'
  const resolvedValueKey = valueKey || setting.key
  const resolvedInputType = valueType || setting.type
  const resolvedInputOptions = valueOptions || setting.options
  const settingTypeIconKey = resolveMainPanelSettingTypeIconKey(resolvedTypeLabel)
  const { keyTooltip, valueTooltip } = buildSettingsEntryTooltips({
    entry,
    resolvedInputOptions,
    resolvedTypeLabel,
    resolvedValueKey,
    values,
  })

  const sectionActionClassName = getUiSectionActionClassName('secondary', `${KTV_STATUS_TEXT_SIZE_CLASS_NAME} ${UI_TEXT_TRUNCATE}`)
  const sectionStatusClassName = getUiSectionChipClassName('tertiary', `${KTV_STATUS_TEXT_SIZE_CLASS_NAME} ${UI_TEXT_TRUNCATE}`)
  const resolvedValueDisplayOverride =
    writable
    && refs.dirtyRef.current.has(resolvedValueKey)
    && Object.prototype.hasOwnProperty.call(values, resolvedValueKey)
      ? undefined
      : valueDisplayOverride
  const inputNode = buildSettingsEntryInputNode({
    hasOptions: writable || hasOptions,
    renderInput: () => actions.renderInput(resolvedValueKey, resolvedInputType, writable, resolvedInputOptions, resolvedValueDisplayOverride),
    settingType: setting.type,
    valueTooltip,
  })
  const renderedValueNode = buildSettingsEntryValueNode({
    area,
    actions,
    entry,
    inputNode,
    refs,
    resolvedValueKey,
    sectionActionClassName,
    sectionStatusClassName,
    status,
    ui,
    values,
  })
  const staticRowProps = useCanvasKeyTypeValueStaticRowProps('default')

  return (
    <li>
      <KeyTypeValueStaticRow
        {...staticRowProps}
        id={anchorId}
        dataKgAnchor={anchorId}
        keyNode={(
          <MainPanelCellHelp
            content={keyTooltip}
            className="w-full min-w-0 max-w-full overflow-hidden"
          >
            <span className="inline-flex min-w-0 max-w-full items-center gap-1 overflow-hidden">
              <span className={UI_TEXT_TRUNCATE}>{setting.key}</span>
            </span>
          </MainPanelCellHelp>
        )}
        typeNode={(
          <span
            className={`inline-flex min-w-0 max-w-full items-center justify-start overflow-hidden sm:justify-end ${UI_THEME_TOKENS.text.secondary}`}
            title={resolvedTypeLabel}
            aria-label={resolvedTypeLabel}
          >
            <MainPanelTypeIcon
              iconKey={settingTypeIconKey}
              className={ui.settingsTypeIconSizeClass}
              strokeWidth={ui.uiIconStrokeWidth}
            />
          </span>
        )}
        valueNode={<RightAlignedValueCell>{renderedValueNode}</RightAlignedValueCell>}
        onClick={toggleActions.onToggleExpanded}
      />
      {isExpanded ? (
        <SettingsEntryDetailsTable
          details={details}
          uiPanelKeyValueTextSizeClass={ui.uiPanelKeyValueTextSizeClass}
        />
      ) : null}
    </li>
  )
}
