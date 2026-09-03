import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { P2PCollaborationExtensionEvent } from '@/features/collaboration/p2pCollaborationExtensionRuntime'
import type { P2PCollaborationExtensionPayload } from '@/features/collaboration/p2pCollaborationProtocol'
import {
  createXrV2ConnectedPreviewTransport,
  type XrV2PreviewExtensionPort,
} from '../connectedPreviewTransport'

function connectedPorts(now: () => number): readonly [XrV2PreviewExtensionPort, XrV2PreviewExtensionPort] {
  const handlers: Array<((event: P2PCollaborationExtensionEvent<P2PCollaborationExtensionPayload>) => void) | null> = [null, null]
  const make = (index: number): XrV2PreviewExtensionPort => ({
    register: handler => {
      handlers[index] = handler
      return () => { handlers[index] = null }
    },
    publish: payload => {
      queueMicrotask(() => handlers[1 - index]?.({
        kind: 'message', namespace: 'agentic-graph.xr.preview/v1', sourceId: `src_testpeer0000${index}`,
        payload, receivedAt: now(),
      }))
      return { status: 'sent', deliveredPeerCount: 1 }
    },
    connectedPeerCount: () => 1,
  })
  return [make(0), make(1)]
}

test('connected preview acknowledges an applied edit within the latency ceiling', async () => {
  let clock = 10
  const now = () => clock
  const [authorPort, viewerPort] = connectedPorts(now)
  let appliedColor = ''
  const viewer = createXrV2ConnectedPreviewTransport({
    role: 'viewer', streamId: 'scene.preview', port: viewerPort, now,
    onViewerEdit: edit => { appliedColor = String(edit.color); clock += 40 },
  })
  const author = createXrV2ConnectedPreviewTransport({
    role: 'author', streamId: 'scene.preview', port: authorPort, now, latencyCeilingMs: 250,
  })
  const result = await author.submitEdit({ color: '#336699' })
  assert.deepEqual(result, {
    status: 'acknowledged', revision: 1, latencyMs: 40, withinCeiling: true,
  })
  assert.equal(appliedColor, '#336699')
  assert.equal(viewer.snapshot().revision, 1)
  author.dispose()
  viewer.dispose()
})

test('connected preview fails closed without a peer', async () => {
  const transport = createXrV2ConnectedPreviewTransport({
    role: 'author', streamId: 'scene.preview',
    port: {
      register: () => () => undefined,
      publish: () => ({ status: 'not-connected', deliveredPeerCount: 0 }),
      connectedPeerCount: () => 0,
    },
  })
  assert.equal((await transport.submitEdit({ x: 1 })).status, 'not-connected')
  transport.dispose()
})

test('connected preview serializes concurrent edits without revision divergence', async () => {
  let clock = 100
  const now = () => clock
  const [authorPort, viewerPort] = connectedPorts(now)
  const applied: number[] = []
  const viewer = createXrV2ConnectedPreviewTransport({
    role: 'viewer', streamId: 'scene.concurrent', port: viewerPort, now,
    onViewerEdit: edit => { applied.push(Number(edit.value)); clock += 10 },
  })
  const author = createXrV2ConnectedPreviewTransport({
    role: 'author', streamId: 'scene.concurrent', port: authorPort, now,
  })

  const [first, second] = await Promise.all([
    author.submitEdit({ value: 1 }),
    author.submitEdit({ value: 2 }),
  ])
  assert.deepEqual(applied, [1, 2])
  assert.equal(first.status, 'acknowledged')
  assert.equal(first.revision, 1)
  assert.equal(second.status, 'acknowledged')
  assert.equal(second.revision, 2)
  assert.equal(author.snapshot().revision, 2)
  assert.equal(viewer.snapshot().revision, 2)
  author.dispose()
  viewer.dispose()
})

test('connected preview measures latency from edit invocation, including queue delay', async () => {
  let clock = 0
  const now = () => clock
  const [authorPort, viewerPort] = connectedPorts(now)
  const viewer = createXrV2ConnectedPreviewTransport({
    role: 'viewer', streamId: 'scene.deadline', port: viewerPort, now,
    onViewerEdit: () => { clock += 240 },
  })
  const author = createXrV2ConnectedPreviewTransport({
    role: 'author', streamId: 'scene.deadline', port: authorPort, now, latencyCeilingMs: 250,
  })

  const [first, second] = await Promise.all([
    author.submitEdit({ value: 1 }),
    author.submitEdit({ value: 2 }),
  ])
  assert.equal(first.latencyMs, 240)
  assert.equal(first.withinCeiling, true)
  assert.equal(second.latencyMs, 480)
  assert.equal(second.withinCeiling, false)
  author.dispose()
  viewer.dispose()
})

test('connected preview retries canonical throttle within the original deadline', async () => {
  const [baseAuthorPort, viewerPort] = connectedPorts(() => 0)
  let publishAttempts = 0
  const authorPort: XrV2PreviewExtensionPort = {
    ...baseAuthorPort,
    publish: payload => {
      publishAttempts += 1
      return publishAttempts === 1
        ? { status: 'throttled', deliveredPeerCount: 0 }
        : baseAuthorPort.publish(payload)
    },
  }
  const viewer = createXrV2ConnectedPreviewTransport({
    role: 'viewer', streamId: 'scene.throttle', port: viewerPort, now: () => 0,
    onViewerEdit: () => undefined,
  })
  const author = createXrV2ConnectedPreviewTransport({
    role: 'author', streamId: 'scene.throttle', port: authorPort, now: () => 0,
  })
  const result = await author.submitEdit({ value: 1 })
  assert.equal(result.status, 'acknowledged')
  assert.equal(publishAttempts, 2)
  author.dispose()
  viewer.dispose()
})

test('connected preview latches a timed-out revision and rejects multi-viewer ambiguity', async () => {
  let publishCount = 0
  const port: XrV2PreviewExtensionPort = {
    register: () => () => undefined,
    publish: () => { publishCount += 1; return { status: 'sent', deliveredPeerCount: 1 } },
    connectedPeerCount: () => 1,
  }
  const author = createXrV2ConnectedPreviewTransport({
    role: 'author', streamId: 'scene.timeout', port, latencyCeilingMs: 10,
  })
  assert.equal((await author.submitEdit({ value: 1 })).status, 'timeout')
  assert.equal((await author.submitEdit({ value: 2 })).status, 'rejected')
  assert.equal(publishCount, 1)
  author.dispose()

  const ambiguous = createXrV2ConnectedPreviewTransport({
    role: 'author', streamId: 'scene.multiple',
    port: { ...port, connectedPeerCount: () => 2 },
  })
  assert.equal((await ambiguous.submitEdit({ value: 1 })).status, 'rejected')
  ambiguous.dispose()
})
