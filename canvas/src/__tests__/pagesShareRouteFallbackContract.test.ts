import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const findRepoRoot = () => {
  const candidates = [
    resolve(process.cwd(), '..'),
    process.cwd(),
    resolve(process.cwd(), '..', '..'),
  ]
  for (const candidate of candidates) {
    if (existsSync(resolve(candidate, 'scripts', 'sync-pages-agenticgraph.mjs'))) {
      return candidate
    }
  }
  throw new Error('expected to find agenticgraph repo root')
}

export function testGeneratedRedirectsKeepPublishedDocRoutesFunctionOwned() {
  const repoRoot = findRepoRoot()
  const syncScript = readFileSync(resolve(repoRoot, 'scripts', 'sync-pages-agenticgraph.mjs'), 'utf8')
  const publishedDocFunctionRoutes = [
    '/agenticgraph/share/* /agenticgraph/share/:splat 200',
    '/agenticgraph/doc/* /agenticgraph/doc/:splat 200',
    '/agenticgraph/doc-default/* /agenticgraph/doc-default/:splat 200',
  ]

  for (const route of publishedDocFunctionRoutes) {
    const routeIndex = syncScript.indexOf(route)
    const fallbackIndex = syncScript.indexOf('/agenticgraph/* /content/agenticgraph/index.html 200')
    if (routeIndex < 0) {
      throw new Error(`expected generated redirects to preserve published document function route ${route}`)
    }
    if (fallbackIndex >= 0 && routeIndex > fallbackIndex) {
      throw new Error(`expected published document route ${route} to precede app-shell fallback`)
    }
  }

  if (!syncScript.includes('...rootFiles.map(rel => `/agenticgraph/${rel} /content/agenticgraph/${rel} 200`)')) {
    throw new Error('expected generated static file routes to remain rooted in content/agenticgraph')
  }
  if (!syncScript.includes("'/agenticgraph/mcp /agenticgraph/mcp 200'")) {
    throw new Error('expected agent-ready function routes to stay explicitly routed')
  }
}
