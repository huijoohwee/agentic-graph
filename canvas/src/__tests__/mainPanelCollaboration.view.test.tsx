import React from 'react'
import { createRoot } from 'react-dom/client'
import CollaborationView from '@/features/panels/views/CollaborationView'
import { useP2PCollaborationStore } from '@/features/collaboration/p2pCollaborationStore'
import { useGraphStore } from '@/hooks/useGraphStore'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { installDeterministicRaf, mountReactRoot, unmountReactRoot } from '@/tests/lib/reactRootHarness'
import {
  assertIncludes,
  CollaborationRegisterActionsHarness,
  makePeer,
  resetCollaborationStore,
} from './mainPanelCollaboration.testkit'

export async function testMainPanelCollaborationViewRendersPeerOwnershipRoster() {
  resetCollaborationStore()
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null

  try {
    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)

    useGraphStore.getState().resetAll()
    const store = useP2PCollaborationStore.getState()
    store.setSessionState({
      role: 'guest',
      phase: 'connected',
      sessionId: 'session-roster',
      localPeerId: 'guest-local-01',
      ownerPeerId: 'owner-remote-01',
      statusText: 'Peers in session: 3',
    })
    store.setFollowModeEnabled(true)
    store.replacePeers([
      makePeer({ peerId: 'guest-local-01', displayName: 'Local Guest', ownership: 'guest', isLocal: true }),
      makePeer({ peerId: 'owner-remote-01', displayName: 'Session Owner', ownership: 'owner' }),
      makePeer({ peerId: 'guest-remote-02', displayName: 'Remote Guest', ownership: 'guest' }),
    ])
    store.setFollowPeerId('guest-remote-02')

    const doc = dom.window.document
    const container = doc.createElement('section')
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)
    await mountReactRoot(root, React.createElement(CollaborationView, { searchQuery: '' }), { window: dom.window, frames: 3 })

    const text = container.textContent || ''
    assertIncludes(text, 'Session Owner')
    assertIncludes(text, 'Remote Guest')
    assertIncludes(text, 'Peers')
    assertIncludes(text, 'Owner')
    assertIncludes(text, 'You')
    assertIncludes(text, 'Guest')
    assertIncludes(text, 'connected')
    assertIncludes(text, 'total 3')
    assertIncludes(text, 'remote 2')
    assertIncludes(text, 'Target guest-re')
    assertIncludes(text, 'Follow')
    for (const label of ['Owner', 'You', 'Guest', 'connected', 'total 3', 'remote 2']) {
      const matches = (Array.from(container.querySelectorAll('span')) as HTMLSpanElement[])
        .filter(element => (element.textContent || '').trim() === label)
      if (matches.length === 0) {
        throw new Error(`expected Collaboration chip "${label}" to render`)
      }
      for (const element of matches) {
        const className = String(element.getAttribute('class') || '')
        if (!className.includes('App-toolbar__btn') || className.includes('rounded-full')) {
          throw new Error(`expected Collaboration chip "${label}" to reuse toolbar-button chrome, got ${className}`)
        }
      }
    }
  } finally {
    await unmountReactRoot(root, { window: dom.window })
    resetCollaborationStore()
    restoreDom()
    restoreWindow()
  }
}

export async function testMainPanelCollaborationViewShowsRemoveActionOnlyForOwnerGuestRows() {
  resetCollaborationStore()
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null

  try {
    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)

    useGraphStore.getState().resetAll()
    const store = useP2PCollaborationStore.getState()
    store.setSessionState({
      role: 'host',
      phase: 'connected',
      sessionId: 'session-owner-remove',
      localPeerId: 'owner-local-01',
      ownerPeerId: 'owner-local-01',
      statusText: 'Connected peers: 2',
    })
    store.replacePeers([
      makePeer({ peerId: 'owner-local-01', displayName: 'Owner Local', ownership: 'owner', isLocal: true }),
      makePeer({ peerId: 'guest-removable-01', displayName: 'Guest Removable', ownership: 'guest' }),
      makePeer({ peerId: 'guest-removable-02', displayName: 'Guest Removable Two', ownership: 'guest' }),
    ])

    const doc = dom.window.document
    const container = doc.createElement('section')
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)
    await mountReactRoot(root, React.createElement(CollaborationView, { searchQuery: '' }), { window: dom.window, frames: 3 })

    const text = container.textContent || ''
    assertIncludes(text, 'Guest Removable')
    assertIncludes(text, 'Remove')

    const buttons = (Array.from(container.querySelectorAll('button')) as HTMLButtonElement[])
      .map(button => (button.textContent || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
    const removeButtons = buttons.filter(label => label.includes('Remove'))
    if (removeButtons.length !== 2) {
      throw new Error(`expected exactly two owner remove buttons for guest rows, got ${removeButtons.length}`)
    }
  } finally {
    await unmountReactRoot(root, { window: dom.window })
    resetCollaborationStore()
    restoreDom()
    restoreWindow()
  }
}

export async function testMainPanelCollaborationViewStabilizesRegisteredActions() {
  resetCollaborationStore()
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null
  const metrics = { registerCalls: 0 }

  try {
    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)

    useGraphStore.getState().resetAll()
    const doc = dom.window.document
    const container = doc.createElement('section')
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)
    await mountReactRoot(
      root,
      React.createElement(CollaborationRegisterActionsHarness, { metrics }),
      { window: dom.window, frames: 6 },
    )

    await new Promise(resolve => setTimeout(resolve, 30))
    if (metrics.registerCalls > 3) {
      throw new Error(`expected collaboration action registration to stabilize, got ${metrics.registerCalls} calls`)
    }
    assertIncludes(container.textContent || '', 'Host Session')
  } finally {
    await unmountReactRoot(root, { window: dom.window })
    resetCollaborationStore()
    restoreDom()
    restoreWindow()
  }
}

export async function testMainPanelCollaborationViewPrefersAuthenticatedRoomSurfaceWhenConfigured() {
  resetCollaborationStore()
  const previousBaseUrl = process.env.VITE_AGENTIC_OS_STORAGE_BASE_URL
  const previousWorkspaceId = process.env.VITE_AGENTIC_OS_STORAGE_WORKSPACE_ID
  const previousSessionToken = process.env.VITE_AGENTIC_OS_STORAGE_CHAT_SESSION_TOKEN
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null

  try {
    process.env.VITE_AGENTIC_OS_STORAGE_BASE_URL = 'https://airvio.co/agentic-graph'
    process.env.VITE_AGENTIC_OS_STORAGE_WORKSPACE_ID = 'kgws:test-room'
    process.env.VITE_AGENTIC_OS_STORAGE_CHAT_SESSION_TOKEN = 'sess_test_token'
    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)

    useGraphStore.getState().resetAll()
    const store = useP2PCollaborationStore.getState()
    store.setSessionState({
      role: 'host',
      phase: 'connected',
      sessionId: 'workspace:/docs/example.md',
      localPeerId: 'owner-local-01',
      ownerPeerId: 'owner-local-01',
      statusText: 'Workspace room connected',
    })
    store.replacePeers([
      makePeer({ peerId: 'owner-local-01', displayName: 'Owner Local', ownership: 'owner', isLocal: true }),
      makePeer({ peerId: 'guest-room-01', displayName: 'Guest Room', ownership: 'guest' }),
    ])

    const doc = dom.window.document
    const container = doc.createElement('section')
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)
    await mountReactRoot(root, React.createElement(CollaborationView, { searchQuery: '' }), { window: dom.window, frames: 3 })

    const text = container.textContent || ''
    assertIncludes(text, 'Room Session')
    assertIncludes(text, 'Reconnect Room')
    assertIncludes(text, 'Workspace room connected')
    assertIncludes(text, 'Authenticated workspace room relays presence and document sync for the active document.')
    if (text.includes('Invite Link') || text.includes('Join Invite') || text.includes('Guest Answer') || text.includes('Apply Answer')) {
      throw new Error(`expected authenticated room surface to hide legacy invite-answer rows, got ${text}`)
    }
  } finally {
    await unmountReactRoot(root, { window: dom.window })
    resetCollaborationStore()
    restoreDom()
    restoreWindow()
    if (typeof previousBaseUrl === 'string') process.env.VITE_AGENTIC_OS_STORAGE_BASE_URL = previousBaseUrl
    else delete process.env.VITE_AGENTIC_OS_STORAGE_BASE_URL
    if (typeof previousWorkspaceId === 'string') process.env.VITE_AGENTIC_OS_STORAGE_WORKSPACE_ID = previousWorkspaceId
    else delete process.env.VITE_AGENTIC_OS_STORAGE_WORKSPACE_ID
    if (typeof previousSessionToken === 'string') process.env.VITE_AGENTIC_OS_STORAGE_CHAT_SESSION_TOKEN = previousSessionToken
    else delete process.env.VITE_AGENTIC_OS_STORAGE_CHAT_SESSION_TOKEN
  }
}
