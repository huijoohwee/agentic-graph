import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveXrV2RendererCompileMethod } from '../xrV2RendererCompile'

test('prefers synchronous compile in CI when it is available', () => {
  assert.equal(resolveXrV2RendererCompileMethod({
    ci: 'true',
    hasCompileAsync: true,
    hasCompile: true,
  }), 'compile')
})

test('prefers async compile outside CI when it is available', () => {
  assert.equal(resolveXrV2RendererCompileMethod({
    ci: '',
    hasCompileAsync: true,
    hasCompile: true,
  }), 'compileAsync')
})

test('falls back to synchronous compile when async compile is unavailable', () => {
  assert.equal(resolveXrV2RendererCompileMethod({
    ci: '',
    hasCompileAsync: false,
    hasCompile: true,
  }), 'compile')
})

test('reports unavailable when neither compile path exists', () => {
  assert.equal(resolveXrV2RendererCompileMethod({
    ci: '',
    hasCompileAsync: false,
    hasCompile: false,
  }), 'unavailable')
})
