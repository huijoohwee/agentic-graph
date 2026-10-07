// The runtime contract is strictly less than 500 decimal kB, including equality.
const DEFAULT_BUILT_CHUNK_LIMIT = 499_999
export const isBuiltJavaScriptPath = filePath => /\.(?:js|mjs|cjs)$/i.test(filePath)
const BUILD_ASSET_PATH_PREFIX = '^canvas\\/dist\\/assets\\/(?:[0-9a-f]{40}\\/)?'

const buildAssetPattern = fileNamePattern => new RegExp(`${BUILD_ASSET_PATH_PREFIX}${fileNamePattern}$`)

const BUILT_CHUNK_DESCRIPTIONS = [
  { pattern: buildAssetPattern('index-[A-Za-z0-9_-]+\\.js'), reason: 'canvas app entry chunk' },
  { pattern: buildAssetPattern('SettingsView-[A-Za-z0-9_-]+\\.js'), reason: 'lazy Settings panel route' },
  { pattern: buildAssetPattern('settings-mcp-(?:docs|core)-[A-Za-z0-9_-]+\\.js'), reason: 'lazy MCP settings docs chunk' },
  { pattern: buildAssetPattern('mermaid-[A-Za-z0-9_-]+\\.js'), reason: 'lazy Mermaid runtime vendor chunk' },
  { pattern: buildAssetPattern('monaco-[A-Za-z0-9_-]+\\.js'), reason: 'lazy Monaco editor vendor chunk' },
  { pattern: buildAssetPattern('three-[A-Za-z0-9_-]+\\.js'), reason: 'lazy Three.js vendor chunk' },
  { pattern: buildAssetPattern('maplibre-[A-Za-z0-9_-]+\\.js'), reason: 'lazy MapLibre vendor chunk' },
  { pattern: buildAssetPattern('transformers-[A-Za-z0-9_-]+\\.js'), reason: 'lazy Hugging Face Transformers vendor chunk' },
]

export function resolveBuiltChunkBudget(relativePath) {
  for (const entry of BUILT_CHUNK_DESCRIPTIONS) {
    if (entry.pattern.test(relativePath)) return { ...entry, limit: DEFAULT_BUILT_CHUNK_LIMIT }
  }
  return { limit: DEFAULT_BUILT_CHUNK_LIMIT, reason: 'default asset budget' }
}
