import { BYTEPLUS_SHARED_TEXT_API_REQUEST_DOC_ENTRIES } from '@/features/panels/views/byteplusSharedTextApiDocs'
import { buildSettingsKeyTooltip, buildSettingsValueTooltip } from 'agentic-design-system/hover/text'

export function testBytePlusEntriesExposeStructuredTooltipMetadata() {
  const missing = BYTEPLUS_SHARED_TEXT_API_REQUEST_DOC_ENTRIES
    .filter(entry => entry.valueKey)
    .filter(entry => !entry.tooltipRole || !Array.isArray(entry.tooltipActions) || entry.tooltipActions.length === 0)
    .map(entry => entry.meta.key)
  if (missing.length > 0) {
    throw new Error(`expected all configurable BytePlus rows to expose tooltip role/actions metadata, got ${JSON.stringify(missing)}`)
  }
}

export function testBytePlusMessagesRoleTooltipUsesRoleActionsOutcomeCopy() {
  const entry = BYTEPLUS_SHARED_TEXT_API_REQUEST_DOC_ENTRIES.find(item => item.meta.key === 'byteplusApi.messages.role')
  if (!entry) throw new Error('expected BytePlus messages.role entry')
  const tooltip = buildSettingsKeyTooltip({
    area: entry.details.area || '',
    key: entry.meta.key,
    responsibility: entry.details.responsibility || '',
    role: entry.tooltipRole,
    actions: entry.tooltipActions,
    outcome: entry.details.responsibility,
  })
  const expected = 'BytePlus Shared + Text API → compose message payload → serialize multimodal turns → Message orchestrator -> assign the sender role for each message object -> keep dialogue state and tool handoffs interpretable.'
  if (tooltip !== expected) {
    throw new Error(`expected BytePlus messages.role key tooltip ${JSON.stringify(expected)}, got ${JSON.stringify(tooltip)}`)
  }
}

export function testBytePlusTopPTooltipUsesDefaultMinMaxIntervalStyle() {
  const entry = BYTEPLUS_SHARED_TEXT_API_REQUEST_DOC_ENTRIES.find(item => item.meta.key === 'byteplusApi.top_p')
  if (!entry) throw new Error('expected BytePlus top_p entry')
  const tooltip = buildSettingsValueTooltip({
    type: entry.typeLabel,
    key: entry.meta.key,
    defaultValue: null,
    defaultValueOverride: entry.tooltipDefaultValue,
    min: entry.tooltipMin,
    max: entry.tooltipMax,
    interval: entry.tooltipInterval,
    impact: entry.tooltipImpact || entry.details.responsibility,
    expansionNote: entry.tooltipExpansionNote,
    contractionNote: entry.tooltipContractionNote,
  })
  const expected = 'Default: 0.7; Min: 0; Max: 1; Interval: 0.01; Higher top_p expands candidate token mass.; Lower top_p narrows sampling breadth.'
  if (tooltip !== expected) {
    throw new Error(`expected BytePlus top_p value tooltip ${JSON.stringify(expected)}, got ${JSON.stringify(tooltip)}`)
  }
}

export function testBytePlusToolSchemaTooltipUsesMultilineJsonCopy() {
  const entry = BYTEPLUS_SHARED_TEXT_API_REQUEST_DOC_ENTRIES.find(item => item.meta.key === 'byteplusApi.tools.function.parameters')
  if (!entry) throw new Error('expected BytePlus tools.function.parameters entry')
  const tooltip = buildSettingsValueTooltip({
    type: entry.typeLabel,
    key: entry.meta.key,
    defaultValue: null,
    defaultValueOverride: entry.tooltipDefaultValue,
    impact: entry.tooltipImpact || entry.details.responsibility,
    expansionNote: entry.tooltipExpansionNote,
    contractionNote: entry.tooltipContractionNote,
  })
  const expected = 'Default: {}; Richer schemas expands tool argument validation.; Lean schemas narrows argument structure.'
  if (tooltip !== expected) {
    throw new Error(`expected BytePlus tool schema value tooltip ${JSON.stringify(expected)}, got ${JSON.stringify(tooltip)}`)
  }
}
