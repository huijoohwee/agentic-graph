import assert from 'node:assert/strict'
import test from 'node:test'
import { buildAgenticGraphRedirects } from '../production-pages-routing.mjs'
import { CANONICAL_MIRROR_NAMESPACE, LEGACY_PRODUCT_NAMESPACES } from '../mirror-namespace-contract.mjs'

const canonical = `/${CANONICAL_MIRROR_NAMESPACE}`
const destination = (routes, pathname) => {
  for (const line of routes.split('\n')) {
    const [source, target, status] = line.trim().split(/\s+/)
    if (source === pathname) return { target, status }
    if (source?.endsWith('/*') && pathname.startsWith(source.slice(0, -1))) {
      return { target: target.replace(':splat', pathname.slice(source.length - 1)), status }
    }
  }
  return null
}

test('retired root and deep links redirect instead of reaching removed mirror assets', () => {
  for (const namespace of LEGACY_PRODUCT_NAMESPACES) {
    const old = `/${namespace}`
    const existing = `${old} /content/${namespace}/index.html 200\n${old}/* /content/${namespace}/:splat 200\n`
    const routes = buildAgenticGraphRedirects({ existing, rootFiles: ['index.html', 'sw.js'] })
    for (const suffix of ['', '/', '/share/document-token', '/deep/link']) {
      assert.deepEqual(destination(routes, old + suffix), { target: canonical + suffix, status: '301' })
    }
    assert.deepEqual(destination(routes, `/content/${namespace}/index.html`), { target: `${canonical}/index.html`, status: '301' })
    assert.deepEqual(destination(routes, `${canonical}/assets/revision/app.js`), {
      target: '/content/agentic-graph/assets/revision/app.js', status: '200',
    })
    assert.equal(buildAgenticGraphRedirects({ existing: routes, rootFiles: ['index.html', 'sw.js'] }), routes)
  }
})

test('scope migration preserves sibling routes, including names with the same prefix', () => {
  const existing = [
    '/unrelated /preserved 302',
    `${canonical}-tools /tool-app 302`,
    ...LEGACY_PRODUCT_NAMESPACES.map(namespace => `/${namespace}-tools /tool-app 302`),
  ].join('\n') + '\n'
  const routes = buildAgenticGraphRedirects({ existing, rootFiles: [] })
  assert.ok(routes.startsWith(existing))
  assert.deepEqual(destination(routes, `${canonical}-tools`), { target: '/tool-app', status: '302' })
})
