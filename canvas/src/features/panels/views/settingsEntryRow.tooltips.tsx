import { buildSettingsKeyTooltip, buildSettingsValueTooltip } from 'agentic-design-system/hover/text'
import type { SettingsEntry } from './useSettingsView.helpers'

type BuildSettingsEntryTooltipsArgs = {
  entry: SettingsEntry
  resolvedTypeLabel: string
  resolvedInputOptions?: string[]
  resolvedValueKey: string
  values: Record<string, string | number | boolean>
}

export function buildSettingsEntryTooltips({
  entry,
  resolvedTypeLabel,
  resolvedInputOptions,
  resolvedValueKey,
  values,
}: BuildSettingsEntryTooltipsArgs) {
  const {
    meta: setting,
    details,
    valueDisplayOverride,
    tooltipRole,
    tooltipActions,
    tooltipDefaultValue,
    tooltipMin,
    tooltipMax,
    tooltipInterval,
    tooltipExpansionNote,
    tooltipContractionNote,
    tooltipImpact,
  } = entry

  return {
    keyTooltip: buildSettingsKeyTooltip({
      area: details.area,
      key: setting.key,
      responsibility: details.responsibility,
      role: tooltipRole,
      actions: tooltipActions,
      outcome: tooltipImpact || details.responsibility,
    }),
    valueTooltip: buildSettingsValueTooltip({
      type: resolvedTypeLabel,
      key: setting.key,
      defaultValue: setting.default ? setting.default() : valueDisplayOverride ?? values[resolvedValueKey] ?? null,
      options: resolvedInputOptions,
      notes: details.notes,
      impact: tooltipImpact || details.notes || details.responsibility,
      defaultValueOverride: tooltipDefaultValue,
      min: tooltipMin,
      max: tooltipMax,
      interval: tooltipInterval,
      expansionNote: tooltipExpansionNote,
      contractionNote: tooltipContractionNote,
    }),
  }
}
