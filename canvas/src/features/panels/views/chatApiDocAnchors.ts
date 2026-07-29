import { buildSettingsRowAnchorId } from './settingsRowAnchor'

const buildLocalRowAnchorId = (prefix: string, rowKey: string): string => {
  const normalized = String(rowKey || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${prefix}-${normalized || 'entry'}`
}

export function getBytePlusSharedTextApiRowAnchorId(rowKey: string): string {
  return buildLocalRowAnchorId('byteplus-chat-api-row', rowKey)
}

export function getDeerFlowApiRowAnchorId(rowKey: string): string {
  return buildLocalRowAnchorId('deerflow-api-row', rowKey)
}

export function mapOpenAiRowKeyToDeerFlowRowKey(rowKey: string): string {
  const normalized = String(rowKey || '').trim()
  if (!normalized) return ''
  if (normalized.startsWith('openaiApi.')) {
    return `deerflowApi.${normalized.slice('openaiApi.'.length)}`
  }
  return `deerflowApi.${normalized}`
}

export function getAgnesApiRowAnchorId(rowKey: string): string {
  return buildSettingsRowAnchorId('agnes-chat-api-row', rowKey)
}

export function getSealionApiRowAnchorId(rowKey: string): string {
  return buildSettingsRowAnchorId('sealion-chat-api-row', rowKey)
}

export function getMiroMindApiRowAnchorId(rowKey: string): string {
  return buildSettingsRowAnchorId('miromind-chat-api-row', rowKey)
}

export function getOpenAiChatApiRowAnchorId(rowKey: string): string {
  return buildSettingsRowAnchorId('openai-chat-api-row', rowKey)
}

export function getQwenApiRowAnchorId(rowKey: string): string {
  return buildSettingsRowAnchorId('qwen-chat-api-row', rowKey)
}

export function getZaiApiRowAnchorId(rowKey: string): string {
  return buildSettingsRowAnchorId('zai-chat-api-row', rowKey)
}

export function getGoogleCloudApiRowAnchorId(rowKey: string): string {
  return buildSettingsRowAnchorId('google-cloud-chat-api-row', rowKey)
}
