import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildCatalogDescriptors,
  publishedPathEvidence,
} from '../authority-inputs.mjs'

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
    'agenticgraph/index.html',
    'about.html',
  ]), [
    '/',
    '/about',
    '/about.html',
    '/index.html',
    '/agenticgraph/',
    '/agenticgraph/index.html',
  ])
})
