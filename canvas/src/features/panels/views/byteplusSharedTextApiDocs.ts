import type { FlowDetails, SettingMeta } from '@/features/settings/types'
import {
  BYTEPLUS_SHARED_TEXT_API_DOC_ROWS,
  BYTEPLUS_KEY_ACTIONS_BY_VALUE_KEY,
  BYTEPLUS_VALUE_TOOLTIP_BY_ROW_KEY,
  resolveBytePlusTextWidgetSharedTextApiRowKey,
} from '@/features/integrations/byteplusChatApiSsot'

export const BYTEPLUS_SHARED_TEXT_API_DOC_AREA = 'BytePlus Shared + Text API'

export { getBytePlusSharedTextApiRowAnchorId } from './chatApiDocAnchors'
export { resolveBytePlusTextWidgetSharedTextApiRowKey }

export type VirtualSettingsEntry = {
  meta: SettingMeta
  details: FlowDetails
  value: string | number | boolean
  typeLabel: string
  valueKey?: string
  referenceOnly?: boolean
  searchHints?: string[]
  tooltipRole?: string
  tooltipActions?: string[]
  tooltipDefaultValue?: string | number | boolean | null
  tooltipMin?: string | number
  tooltipMax?: string | number
  tooltipInterval?: string | number
  tooltipExpansionNote?: string
  tooltipContractionNote?: string
  tooltipImpact?: string
}

const BYTEPLUS_TOOLTIP_ROLE = 'BytePlus Shared + Text API'

function getBytePlusChatEntryKey(rowKey: string): string {
  if (rowKey === 'auth_mode' || rowKey === 'api_key' || rowKey === 'endpoint_url') {
    return `byteplus.${rowKey}`
  }
  return `byteplusApi.${rowKey}`
}

const toBaseType = (typeLabel: string): SettingMeta['type'] => {
  const normalized = String(typeLabel || '').trim().toLowerCase()
  if (normalized.includes('boolean')) return 'boolean'
  if (normalized.includes('integer') || normalized.includes('float') || normalized.includes('number')) return 'number'
  return normalized.includes('object') || normalized.includes('map') || normalized.includes('[]') ? 'json' : 'string'
}

export const BYTEPLUS_SHARED_TEXT_API_REQUEST_DOC_ENTRIES: ReadonlyArray<VirtualSettingsEntry> =
  BYTEPLUS_SHARED_TEXT_API_DOC_ROWS.map(row => ({
    meta: {
      key: getBytePlusChatEntryKey(row.key),
      type: toBaseType(row.typeLabel),
      source: 'backendEnv',
      read: () => row.value,
    },
    value: row.value,
    valueKey: row.valueKey,
    typeLabel: row.typeLabel,
    tooltipRole: row.valueKey ? BYTEPLUS_TOOLTIP_ROLE : undefined,
    tooltipActions: row.valueKey ? BYTEPLUS_KEY_ACTIONS_BY_VALUE_KEY[row.valueKey] : undefined,
    tooltipDefaultValue: typeof row.tooltipDefaultValue !== 'undefined'
      ? row.tooltipDefaultValue
      : BYTEPLUS_VALUE_TOOLTIP_BY_ROW_KEY[row.key]?.defaultValue,
    tooltipMin: typeof row.tooltipMin !== 'undefined'
      ? row.tooltipMin
      : BYTEPLUS_VALUE_TOOLTIP_BY_ROW_KEY[row.key]?.min,
    tooltipMax: typeof row.tooltipMax !== 'undefined'
      ? row.tooltipMax
      : BYTEPLUS_VALUE_TOOLTIP_BY_ROW_KEY[row.key]?.max,
    tooltipInterval: typeof row.tooltipInterval !== 'undefined'
      ? row.tooltipInterval
      : BYTEPLUS_VALUE_TOOLTIP_BY_ROW_KEY[row.key]?.interval,
    tooltipExpansionNote: row.tooltipExpansionNote || BYTEPLUS_VALUE_TOOLTIP_BY_ROW_KEY[row.key]?.expansionNote,
    tooltipContractionNote: row.tooltipContractionNote || BYTEPLUS_VALUE_TOOLTIP_BY_ROW_KEY[row.key]?.contractionNote,
    tooltipImpact: row.tooltipImpact || BYTEPLUS_VALUE_TOOLTIP_BY_ROW_KEY[row.key]?.impact,
    searchHints: [
      'byteplus modelark chat api request parameters',
      row.key,
      ...(row.searchHints || []),
    ],
    details: {
      area: BYTEPLUS_SHARED_TEXT_API_DOC_AREA,
      responsibility: row.responsibility,
      notes: row.notes || '',
      modules: row.modules || ['POST /api/v3/chat/completions'],
      classes: row.classes || ['Request body'],
      functions: row.functions || ['ModelArk Chat API'],
    },
  }))
