import path from 'node:path'
import { MARKDOWN_DATA_VIEW_COPY } from '@/lib/config-copy/markdownDataViewCopy'

const EXACT_AREAS: Readonly<Record<string, string>> = {
  enableLaunchSpotlight: 'Launch Spotlight',
}

const PREFIX_AREAS: readonly [prefix: string, area: string][] = [
  ['byteplusImage', 'BytePlus Image'],
  ['byteplusVideo', 'BytePlus Video'],
  ['chat', 'Chat'],
  ['graphDataTable.aggregate', `${MARKDOWN_DATA_VIEW_COPY.titleDefault} Aggregation`],
  ['graphDataTable.', MARKDOWN_DATA_VIEW_COPY.titleDefault],
  ['graphFields.', 'Graph Fields'],
  ['graphHoverPreview.', 'Graph Hover Preview'],
  ['schema.behavior.hover.', 'Graph Hover Preview'],
  ['spotlight.', 'Launch Spotlight Layout'],
]

const DOTTED_PREFIX_AREAS: Readonly<Record<string, string>> = {
  browser: 'API-Native Browser',
  feishu: 'Feishu',
  maps: 'Maps',
  openai: 'OpenAI MCP',
  operatorDeploy: 'Operator Deploy MCP',
  payments: 'Payments',
  print: 'Workspace',
  schema: 'Schema',
  workspace: 'Workspace',
}

function humanize(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim()
    .toLowerCase()
}

function titleCase(value: string): string {
  const acronyms: Record<string, string> = {
    ai: 'AI', api: 'API', mcp: 'MCP', pdf: 'PDF', ui: 'UI', url: 'URL', xr: 'XR',
  }
  return humanize(value)
    .split(/\s+/)
    .filter(Boolean)
    .map(word => acronyms[word] ?? `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ')
}

export function resolveSettingsArea(key: string, ownerModule: string): string {
  const exact = EXACT_AREAS[key]
  if (exact) return exact
  const prefixRule = PREFIX_AREAS.find(([prefix]) => key.startsWith(prefix))
  if (prefixRule) return prefixRule[1]

  const prefix = key.split('.')[0] ?? ''
  if (key.includes('.') && DOTTED_PREFIX_AREAS[prefix]) return DOTTED_PREFIX_AREAS[prefix]
  if (key.includes('.') && prefix) return titleCase(prefix)

  const basename = path.basename(ownerModule).replace(/\.tsx?$/, '')
  const parts = basename.split('.')
  const registryFamily = parts[0]?.replace(/^registry-/, '') ?? ''
  const areaSource = registryFamily === 'ui' && parts[1] && !parts[1].startsWith('part')
    ? parts[1]
    : registryFamily
  return titleCase(areaSource || 'Settings')
}

export function resolveSettingsResponsibility(key: string, type: string): string {
  const leaf = key.split('.').at(-1) || key
  const words = humanize(leaf)
  if (type === 'boolean') {
    if (leaf.startsWith('enable')) return `Enable ${words.replace(/^enable\s+/, '')}`.trim()
    if (leaf.startsWith('show')) return `Show ${words.replace(/^show\s+/, '')}`.trim()
  }
  if (leaf.endsWith('Ms')) return `${words.replace(/\sms$/, '')} (ms)`
  return words || 'Setting value'
}
