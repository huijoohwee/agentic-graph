import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export function testPagesSyncPublishHtmlKeepsCanonicalEntryScriptUrl() {
  const scriptPath = resolve(process.cwd(), '..', 'scripts', 'sync-pages-agentic-graph.mjs')
  const scriptText = readFileSync(scriptPath, 'utf8')

  if (scriptText.includes('addEntryScriptCacheKey')) {
    throw new Error('expected publish sync to avoid rewriting the entry script URL with a query cache key')
  }
  if (scriptText.includes('?v=${encodeURIComponent(assetFile)}')) {
    throw new Error('expected publish sync to avoid query-versioned entry script URLs that split module identity')
  }
}
