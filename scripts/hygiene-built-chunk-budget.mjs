const DEFAULT_BUILT_CHUNK_LIMIT = 500 * 1024
const BUILD_ASSET_PATH_PREFIX = '^canvas\\/dist\\/assets\\/(?:[0-9a-f]{40}\\/)?'

const buildAssetPattern = fileNamePattern => new RegExp(`${BUILD_ASSET_PATH_PREFIX}${fileNamePattern}$`)

const BUILT_CHUNK_BUDGET_OVERRIDES = [
  { pattern: buildAssetPattern('index-[A-Za-z0-9_-]+\\.js'), limit: 1800 * 1024, reason: 'canvas app entry chunk' },
  { pattern: buildAssetPattern('SettingsView-[A-Za-z0-9_-]+\\.js'), limit: 700 * 1024, reason: 'lazy Settings panel route' },
  { pattern: buildAssetPattern('settings-mcp-(?:docs|core)-[A-Za-z0-9_-]+\\.js'), limit: 1920 * 1024, reason: 'lazy MCP settings docs chunk' },
  { pattern: buildAssetPattern('mermaid-[A-Za-z0-9_-]+\\.js'), limit: 2300 * 1024, reason: 'lazy Mermaid runtime vendor chunk' },
  { pattern: buildAssetPattern('monaco-[A-Za-z0-9_-]+\\.js'), limit: 3000 * 1024, reason: 'lazy Monaco editor vendor chunk' },
  { pattern: buildAssetPattern('three-core-[A-Za-z0-9_-]+\\.js'), limit: 800 * 1024, reason: 'lazy Three.js core vendor chunk' },
  { pattern: buildAssetPattern('maplibre-[A-Za-z0-9_-]+\\.js'), limit: 1200 * 1024, reason: 'lazy MapLibre vendor chunk' },
  { pattern: buildAssetPattern('transformers-[A-Za-z0-9_-]+\\.js'), limit: 700 * 1024, reason: 'lazy Hugging Face Transformers vendor chunk' },
]

export function resolveBuiltChunkBudget(relativePath) {
  for (const entry of BUILT_CHUNK_BUDGET_OVERRIDES) {
    if (entry.pattern.test(relativePath)) return entry
  }
  return { limit: DEFAULT_BUILT_CHUNK_LIMIT, reason: 'default asset budget' }
}
