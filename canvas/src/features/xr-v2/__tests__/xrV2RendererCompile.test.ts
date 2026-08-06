import assert from 'node:assert/strict'
import test from 'node:test'

import {
  resolveXrV2RendererCompileMethod,
  shouldRunXrV2RendererCompile,
} from '../xrV2RendererCompile'

test('prefers synchronous compile in an automated browser when available', () => {
  assert.equal(resolveXrV2RendererCompileMethod({
    automatedBrowser: true,
    hasCompileAsync: true,
    hasCompile: true,
  }), 'compile')
})

test('prefers async compile in a user browser when available', () => {
  assert.equal(resolveXrV2RendererCompileMethod({
    automatedBrowser: false,
    hasCompileAsync: true,
    hasCompile: true,
  }), 'compileAsync')
})

test('falls back to synchronous compile when async compile is unavailable', () => {
  assert.equal(resolveXrV2RendererCompileMethod({
    automatedBrowser: false,
    hasCompileAsync: false,
    hasCompile: true,
  }), 'compile')
})

test('reports unavailable when neither compile path exists', () => {
  assert.equal(resolveXrV2RendererCompileMethod({
    automatedBrowser: true,
    hasCompileAsync: false,
    hasCompile: false,
  }), 'unavailable')
})

test('defers synchronous compilation until one mounted render frame has completed', () => {
  const pending = {
    compileMethod: 'compile' as const,
    compileStatus: 'pending' as const,
    compileCallCount: 0,
  }
  assert.equal(shouldRunXrV2RendererCompile({ ...pending, observedFrameCount: 1, renderCallCount: 0 }), false)
  assert.equal(shouldRunXrV2RendererCompile({ ...pending, observedFrameCount: 2, renderCallCount: 0 }), false)
  assert.equal(shouldRunXrV2RendererCompile({ ...pending, observedFrameCount: 2, renderCallCount: 1 }), true)
  assert.equal(shouldRunXrV2RendererCompile({
    ...pending,
    compileCallCount: 1,
    observedFrameCount: 2,
    renderCallCount: 1,
  }), false)
  assert.equal(shouldRunXrV2RendererCompile({
    ...pending,
    compileStatus: 'ready',
    observedFrameCount: 2,
    renderCallCount: 1,
  }), false)
})
