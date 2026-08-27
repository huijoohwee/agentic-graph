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
    { input: '/agenticgraph/', expected: '/agenticgraph' },
    { input: '/agenticgraph', expected: '/agenticgraph' },
    { input: 'agenticgraph/', expected: '/agenticgraph' },
  ]

  for (const c of cases) {
    const got = resolveRouterBasename(c.input)
    if (got !== c.expected) {
      throw new Error(`Expected resolveRouterBasename(${JSON.stringify(c.input)}) to be ${JSON.stringify(c.expected)}, got ${JSON.stringify(got)}`)
    }
  }

  const rootAlias = resolveRouterBasename('/agenticgraph/', {
    pathname: '/',
    rootAliasBasePath: '/agenticgraph/',
  })
  if (rootAlias !== undefined) {
    throw new Error(`Expected root alias basename to be undefined, got ${JSON.stringify(rootAlias)}`)
  }
  if (!isRouterRootAliasRuntime('/', { pathname: '/', rootAliasBasePath: '/agenticgraph/' })) {
    throw new Error('Expected the explicit root alias marker to own the Vite Dev root runtime')
  }

  const canonicalPath = resolveRouterBasename('/agenticgraph/', {
    pathname: '/agenticgraph/',
    rootAliasBasePath: '/agenticgraph/',
  })
  if (canonicalPath !== '/agenticgraph') {
    throw new Error(`Expected canonical path basename to stay /agenticgraph, got ${JSON.stringify(canonicalPath)}`)
  }

  const mismatchedAlias = resolveRouterBasename('/agenticgraph/', {
    pathname: '/',
    rootAliasBasePath: '/other/',
  })
  if (mismatchedAlias !== '/agenticgraph') {
    throw new Error(`Expected mismatched root alias basename to stay /agenticgraph, got ${JSON.stringify(mismatchedAlias)}`)
  }

  const enterHref = resolveLiveCanvasHeroEnterHref('/agenticgraph/')
  if (enterHref !== '/agenticgraph/') {
    throw new Error(`Expected live canvas hero enter CTA to target /agenticgraph/, got ${JSON.stringify(enterHref)}`)
  }
}
