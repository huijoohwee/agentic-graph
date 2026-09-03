import {
  isRouterRootAliasRuntime,
  resolveLiveCanvasHeroEnterHref,
  resolveRouterBasename,
} from '@/lib/routing/basePath'

export const testResolveRouterBasenameFromBaseUrl = () => {
  const cases: Array<{ input: unknown; expected: string | undefined }> = [
    { input: undefined, expected: undefined },
    { input: '', expected: undefined },
    { input: '/', expected: undefined },
    { input: '/agentic-graph/', expected: '/agentic-graph' },
    { input: '/agentic-graph', expected: '/agentic-graph' },
    { input: 'agentic-graph/', expected: '/agentic-graph' },
  ]

  for (const c of cases) {
    const got = resolveRouterBasename(c.input)
    if (got !== c.expected) {
      throw new Error(`Expected resolveRouterBasename(${JSON.stringify(c.input)}) to be ${JSON.stringify(c.expected)}, got ${JSON.stringify(got)}`)
    }
  }

  const rootAlias = resolveRouterBasename('/agentic-graph/', {
    pathname: '/',
    rootAliasBasePath: '/agentic-graph/',
  })
  if (rootAlias !== undefined) {
    throw new Error(`Expected root alias basename to be undefined, got ${JSON.stringify(rootAlias)}`)
  }
  if (!isRouterRootAliasRuntime('/', { pathname: '/', rootAliasBasePath: '/agentic-graph/' })) {
    throw new Error('Expected the explicit root alias marker to own the Vite Dev root runtime')
  }

  const canonicalPath = resolveRouterBasename('/agentic-graph/', {
    pathname: '/agentic-graph/',
    rootAliasBasePath: '/agentic-graph/',
  })
  if (canonicalPath !== '/agentic-graph') {
    throw new Error(`Expected canonical path basename to stay /agentic-graph, got ${JSON.stringify(canonicalPath)}`)
  }

  const mismatchedAlias = resolveRouterBasename('/agentic-graph/', {
    pathname: '/',
    rootAliasBasePath: '/other/',
  })
  if (mismatchedAlias !== '/agentic-graph') {
    throw new Error(`Expected mismatched root alias basename to stay /agentic-graph, got ${JSON.stringify(mismatchedAlias)}`)
  }

  const enterHref = resolveLiveCanvasHeroEnterHref('/agentic-graph/')
  if (enterHref !== '/agentic-graph/') {
    throw new Error(`Expected live canvas hero enter CTA to target /agentic-graph/, got ${JSON.stringify(enterHref)}`)
  }
}
