import assert from 'node:assert/strict'
import test from 'node:test'
import {
  GANTT_TIMELINE_TRANSPORT_COMMAND_SCHEMA,
  isGanttTimelineDocumentClipEditAction,
  routeGanttTimelineTransportClipEdit,
  routeGanttTimelineTransportCommand,
  type GanttTimelineTransportCommand,
} from '../ganttTimelineTransportCommandAdapter'

const command: GanttTimelineTransportCommand = {
  action: 'nudge-forward',
  kind: 'clip-edit',
  schema: GANTT_TIMELINE_TRANSPORT_COMMAND_SCHEMA,
  target: {
    documentKey: 'timeline.md',
    playheadMinutes: 2.5,
    selectedRowKey: 'clip-1',
  },
}

test('editing-preference toggles remain local and are not document commands', () => {
  assert.equal(isGanttTimelineDocumentClipEditAction('toggle-auto-snapping'), false)
  assert.equal(isGanttTimelineDocumentClipEditAction('toggle-ripple-editing'), false)
  assert.equal(isGanttTimelineDocumentClipEditAction('nudge-forward'), true)
  assert.equal(isGanttTimelineDocumentClipEditAction('duplicate-element'), true)
})

test('editing-preference toggles bypass an installed document adapter', () => {
  let adapterCalls = 0
  let localCalls = 0
  const result = routeGanttTimelineTransportClipEdit({
    action: 'toggle-auto-snapping',
    adapter: {
      handleCommand: () => {
        adapterCalls += 1
        return { status: 'handled' }
      },
    },
    markdownFallback: () => {
      localCalls += 1
      return 'local-preference-updated'
    },
    target: command.target,
  })

  assert.equal(adapterCalls, 0)
  assert.equal(localCalls, 1)
  assert.deepEqual(result, {
    owner: 'markdown',
    status: 'handled',
    value: 'local-preference-updated',
  })
})

test('omitted timeline adapter preserves the default Markdown mutation', () => {
  let fallbackCalls = 0
  const result = routeGanttTimelineTransportCommand({
    command,
    markdownFallback: () => {
      fallbackCalls += 1
      return 'committed'
    },
  })

  assert.equal(fallbackCalls, 1)
  assert.deepEqual(result, { owner: 'markdown', status: 'handled', value: 'committed' })
})

test('handled external timeline command does not invoke Markdown fallback', () => {
  let fallbackCalls = 0
  let receivedCommand: GanttTimelineTransportCommand | null = null

  const result = routeGanttTimelineTransportCommand({
    adapter: {
      handleCommand: received => {
        receivedCommand = received
        return { status: 'handled' }
      },
    },
    command,
    markdownFallback: () => {
      fallbackCalls += 1
      return 'mutated'
    },
  })

  assert.notEqual(receivedCommand, command)
  assert.deepEqual(receivedCommand, command)
  assert.equal(Object.isFrozen(receivedCommand), true)
  assert.equal(Object.isFrozen(receivedCommand?.target), true)
  assert.equal(fallbackCalls, 0)
  assert.deepEqual(result, { owner: 'external', status: 'handled' })
})

test('declined external timeline command invokes the Markdown fallback once', () => {
  let fallbackCalls = 0

  const result = routeGanttTimelineTransportCommand({
    adapter: {
      handleCommand: () => ({ status: 'unhandled' }),
    },
    command,
    markdownFallback: () => {
      fallbackCalls += 1
      return 'committed'
    },
  })

  assert.equal(fallbackCalls, 1)
  assert.deepEqual(result, {
    owner: 'markdown',
    status: 'handled',
    value: 'committed',
  })
})

test('rejected external timeline command preserves the Markdown document', () => {
  let mutationCalls = 0

  const result = routeGanttTimelineTransportCommand({
    adapter: {
      handleCommand: () => ({ reason: 'read-only runtime', status: 'rejected' }),
    },
    command,
    markdownFallback: () => {
      mutationCalls += 1
      return 'mutated'
    },
  })

  assert.equal(mutationCalls, 0)
  assert.deepEqual(result, {
    owner: 'external',
    reason: 'read-only runtime',
    status: 'rejected',
  })
})

test('thrown timeline adapter error becomes a typed rejection without fallback', () => {
  let mutationCalls = 0
  const result = routeGanttTimelineTransportCommand({
    adapter: {
      handleCommand: () => {
        throw new Error('external owner unavailable')
      },
    },
    command,
    markdownFallback: () => {
      mutationCalls += 1
    },
  })

  assert.equal(mutationCalls, 0)
  assert.deepEqual(result, {
    owner: 'external',
    reason: 'external owner unavailable',
    status: 'rejected',
  })
})

test('malformed timeline adapter decisions fail closed without fallback', () => {
  const malformedDecisions: unknown[] = [
    undefined,
    null,
    {},
    { status: 'handled', unexpected: true },
    { status: 'rejected', reason: '   ' },
    { status: 'rejected' },
    Promise.resolve({ status: 'handled' }),
  ]

  for (const malformedDecision of malformedDecisions) {
    let mutationCalls = 0
    const result = routeGanttTimelineTransportCommand({
      adapter: {
        handleCommand: () => malformedDecision as never,
      },
      command,
      markdownFallback: () => {
        mutationCalls += 1
      },
    })
    assert.equal(mutationCalls, 0)
    assert.deepEqual(result, {
      owner: 'external',
      reason: 'Timeline command adapter returned an invalid decision.',
      status: 'rejected',
    })
  }
})

test('declined hostile media adapter cannot mutate the Markdown fallback payload', () => {
  const media = {
    kind: 'video' as const,
    label: 'Safe media',
    url: '/safe.mp4',
    xrScene: {
      schema: 'knowgrph-xr-scene-media/v1' as const,
      entityKind: 'asset' as const,
      entityId: 'asset-1',
      label: 'Safe XR asset',
    },
  }
  const mediaCommand: GanttTimelineTransportCommand = {
    kind: 'media-drop',
    media,
    positionMinutes: 1.25,
    schema: GANTT_TIMELINE_TRANSPORT_COMMAND_SCHEMA,
    target: command.target,
  }
  let fallbackPayload = ''

  const result = routeGanttTimelineTransportCommand({
    adapter: {
      handleCommand: received => {
        assert.equal(received.kind, 'media-drop')
        if (received.kind !== 'media-drop') return { reason: 'wrong command', status: 'rejected' }
        assert.notEqual(received.media, media)
        assert.notEqual(received.media.xrScene, media.xrScene)
        assert.equal(Object.isFrozen(received.media), true)
        assert.equal(Object.isFrozen(received.media.xrScene), true)
        assert.throws(() => {
          ;(received.media as { url: string }).url = '/hostile.mp4'
        }, TypeError)
        assert.throws(() => {
          ;(received.media.xrScene as { label: string }).label = 'Hostile XR asset'
        }, TypeError)
        return { status: 'unhandled' }
      },
    },
    command: mediaCommand,
    markdownFallback: () => {
      fallbackPayload = `${media.url}|${media.xrScene.label}`
      return fallbackPayload
    },
  })

  assert.equal(fallbackPayload, '/safe.mp4|Safe XR asset')
  assert.equal(media.url, '/safe.mp4')
  assert.equal(media.xrScene.label, 'Safe XR asset')
  assert.deepEqual(result, {
    owner: 'markdown',
    status: 'handled',
    value: '/safe.mp4|Safe XR asset',
  })
})
