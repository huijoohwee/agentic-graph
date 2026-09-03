import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildCatalogDescriptors,
  declaredPublishedPathEvidence,
  declaredRouteManifest,
  publishedPathEvidence,
} from '../authority-inputs.mjs'

test('source evidence derives routes and representing pages from the registry alone', () => {
  const registry = {
    entries: [
      { path: '/agentic-graph/*', surfaceTier: 'public-artifact' },
      { path: '/agentic-graph/', surfaceTier: 'public-discoverable' },
      { path: '/agentic-os/control-plane/mcp', surfaceTier: 'gated' },
      { path: '.well-known/mcp.json', surfaceTier: 'public-discoverable' },
    ],
  }

  assert.deepEqual(declaredRouteManifest(registry), {
    include: [
      '/agentic-graph/',
      '/agentic-graph/*',
      '/agentic-os/control-plane/mcp',
    ],
  })
  assert.deepEqual(declaredPublishedPathEvidence(registry), [
    '/.well-known/mcp.json',
    '/agentic-graph/',
  ])
})

test('catalog descriptors remain inside their declared repository root', () => {
  const paths = {
    agenticCanvasOsRoot: '/workspace/worker',
    repositoryRoot: '/workspace/dev',
  }
  assert.throws(
    () => buildCatalogDescriptors({
      catalogSources: [{
        catalogId: 'escape',
        repository: 'worker',
        path: '../../outside.md',
      }],
    }, paths),
    /escapes its repository root/u,
  )
})

test('published path evidence derives routes from tracked files, not wildcards', () => {
  assert.deepEqual(publishedPathEvidence([
    'index.html',
    'agentic-graph/index.html',
    'about.html',
  ]), [
    '/',
    '/about',
    '/about.html',
    '/agentic-graph/',
    '/agentic-graph/index.html',
    '/index.html',
  ])
})
