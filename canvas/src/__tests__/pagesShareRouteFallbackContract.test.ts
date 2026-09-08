import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { resolveRepoSourcePath } from '@/tests/lib/repoTestData'

export async function testGeneratedRedirectsKeepPublishedDocRoutesFunctionOwned() {
  const cli = readFileSync(resolveRepoSourcePath('scripts/sync-pages-agentic-graph.mjs'), 'utf8')
  const sync = readFileSync(resolveRepoSourcePath('scripts/pages-mirror-sync.mjs'), 'utf8')
  if (!cli.includes("from './pages-mirror-sync.mjs'") || !cli.includes('await runPagesMirrorSync(')
    || !sync.includes("from './production-pages-routing.mjs'") || !sync.includes('buildAgenticGraphRedirects({')) {
    throw new Error('expected the Pages sync CLI to invoke the shared redirect builder')
  }
  const { buildAgenticGraphRedirects } = await import(pathToFileURL(resolveRepoSourcePath('scripts/production-pages-routing.mjs')).href)
  const existing = '/unrelated /preserved 302\n'
  const rootFiles = ['index.html', 'sw.js']
  const redirects: string = buildAgenticGraphRedirects({ existing, rootFiles })
  const routes = redirects.split('\n')
  const fallbackIndex = routes.indexOf('/agentic-graph/* /content/agentic-graph/index.html 200')
  if (fallbackIndex < 0) throw new Error('expected the generated app-shell fallback')
  for (const route of [
    '/agentic-graph/share/* /agentic-graph/share/:splat 200',
    '/agentic-graph/doc/* /agentic-graph/doc/:splat 200',
    '/agentic-graph/doc-default/* /agentic-graph/doc-default/:splat 200',
    '/agentic-graph/mcp /agentic-graph/mcp 200',
    ...rootFiles.map(file => `/agentic-graph/${file} /content/agentic-graph/${file} 200`),
  ]) {
    const routeIndex = routes.indexOf(route)
    if (routeIndex < 0 || routeIndex > fallbackIndex || routes.lastIndexOf(route) !== routeIndex) {
      throw new Error(`expected one generated function/static route before the app-shell fallback: ${route}`)
    }
  }
  if (!redirects.startsWith(existing) || buildAgenticGraphRedirects({ existing: redirects, rootFiles }) !== redirects) {
    throw new Error('expected repeatable generation that preserves unrelated routes')
  }
}
