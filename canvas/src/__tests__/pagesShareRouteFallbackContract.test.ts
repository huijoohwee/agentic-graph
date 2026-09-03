import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const findRepoRoot = () => {
  const candidates = [
    resolve(process.cwd(), '..'),
    process.cwd(),
    resolve(process.cwd(), '..', '..'),
  ]
  for (const candidate of candidates) {
    if (existsSync(resolve(candidate, 'scripts', 'sync-pages-agentic-graph.mjs'))) {
      return candidate
    }
  }
  throw new Error('expected to find agentic-graph repo root')
}

export function testGeneratedRedirectsKeepPublishedDocRoutesFunctionOwned() {
  const repoRoot = findRepoRoot()
  const syncScript = readFileSync(resolve(repoRoot, 'scripts', 'sync-pages-agentic-graph.mjs'), 'utf8')
  const publishedDocFunctionRoutes = [
    '/agentic-graph/share/* /agentic-graph/share/:splat 200',
    '/agentic-graph/doc/* /agentic-graph/doc/:splat 200',
    '/agentic-graph/doc-default/* /agentic-graph/doc-default/:splat 200',
  ]

  for (const route of publishedDocFunctionRoutes) {
    const routeIndex = syncScript.indexOf(route)
    const fallbackIndex = syncScript.indexOf('/agentic-graph/* /content/agentic-graph/index.html 200')
    if (routeIndex < 0) {
      throw new Error(`expected generated redirects to preserve published document function route ${route}`)
    }
    if (fallbackIndex >= 0 && routeIndex > fallbackIndex) {
      throw new Error(`expected published document route ${route} to precede app-shell fallback`)
    }
  }

  if (!syncScript.includes('...rootFiles.map(rel => `/agentic-graph/${rel} /content/agentic-graph/${rel} 200`)')) {
    throw new Error('expected generated static file routes to remain rooted in content/agentic-graph')
  }
  if (!syncScript.includes("'/agentic-graph/mcp /agentic-graph/mcp 200'")) {
    throw new Error('expected agent-ready function routes to stay explicitly routed')
  }
}
