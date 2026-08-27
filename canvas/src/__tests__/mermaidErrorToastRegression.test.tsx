import React from 'react'
import { createRoot } from 'react-dom/client'
import { MermaidDiagram } from '@/lib/panels/views/preview-panel/ui/MermaidDiagram.impl'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { useGraphStore } from '@/hooks/useGraphStore'

export async function testMermaidRenderErrorUsesToastAndDoesNotRenderInlineBelowCanvas() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null

  const api = {
    registerLayoutLoaders: () => void 0,
    initialize: () => void 0,
    render: async () => {
      throw new Error('Syntax error in text')
    },
  }

  try {
    useGraphStore.getState().resetAll()
    ;(globalThis as unknown as { __AG_TEST_MERMAID_API__?: unknown }).__AG_TEST_MERMAID_API__ = api
    const anyWindow = dom.window as unknown as {
      requestAnimationFrame?: (cb: (ts: number) => void) => number
    }
    anyWindow.requestAnimationFrame = (cb: (ts: number) => void) =>
      setTimeout(() => cb(Date.now()), 0) as unknown as number
    ;(globalThis as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }).requestAnimationFrame =
      anyWindow.requestAnimationFrame

    const doc = dom.window.document
    const container = doc.createElement('section')
    container.id = 'root'
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)

    root.render(
      React.createElement(MermaidDiagram, {
        code: 'flowchart LR\nA-->B',
        highlightClass: '',
        frontmatterConfig: null,
        rootThemeMode: 'dark',
      } as never),
    )

    const waitFor = async (predicate: () => boolean) => {
      const deadline = Date.now() + 1000
      while (Date.now() < deadline) {
        if (predicate()) return
        await new Promise<void>(resolve => setTimeout(resolve, 10))
      }
      throw new Error('timed out waiting for mermaid toast')
    }

    await waitFor(() => {
      const toasts = useGraphStore.getState().uiToasts || []
      return toasts.some(t => String(t.id || '').startsWith('mermaid-render-error-') && String(t.message || '').includes('Mermaid render failed:'))
    })

    if (String(container.textContent || '').trim() !== '') {
      throw new Error('expected no inline Mermaid error rendered below canvas when render fails')
    }
  } finally {
    try {
      delete (globalThis as unknown as { __AG_TEST_MERMAID_API__?: unknown }).__AG_TEST_MERMAID_API__
    } catch {
      void 0
    }
    try {
      root?.unmount()
    } catch {
      void 0
    }
    try {
      restoreDom()
    } catch {
      void 0
    }
    try {
      restoreWindow()
    } catch {
      void 0
    }
  }
}

export async function testMermaidSvgErrorPayloadUsesToastAndNoInlineRender() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null

  const api = {
    registerLayoutLoaders: () => void 0,
    initialize: () => void 0,
    render: async () => ({
      svg: '<svg aria-roledescription="error"><text class="error-text">Syntax error in text</text><text class="error-text">mermaid version 11.12.2</text></svg>',
    }),
  }

  try {
    useGraphStore.getState().resetAll()
    ;(globalThis as unknown as { __AG_TEST_MERMAID_API__?: unknown }).__AG_TEST_MERMAID_API__ = api
    const anyWindow = dom.window as unknown as {
      requestAnimationFrame?: (cb: (ts: number) => void) => number
    }
    anyWindow.requestAnimationFrame = (cb: (ts: number) => void) =>
      setTimeout(() => cb(Date.now()), 0) as unknown as number
    ;(globalThis as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }).requestAnimationFrame =
      anyWindow.requestAnimationFrame

    const doc = dom.window.document
    const container = doc.createElement('section')
    container.id = 'root'
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)

    root.render(
      React.createElement(MermaidDiagram, {
        code: 'flowchart LR\nA-->B',
        highlightClass: '',
        frontmatterConfig: null,
        rootThemeMode: 'dark',
      } as never),
    )

    const waitFor = async (predicate: () => boolean) => {
      const deadline = Date.now() + 1000
      while (Date.now() < deadline) {
        if (predicate()) return
        await new Promise<void>(resolve => setTimeout(resolve, 10))
      }
      throw new Error('timed out waiting for mermaid svg error toast')
    }

    await waitFor(() => {
      const toasts = useGraphStore.getState().uiToasts || []
      return toasts.some(t => String(t.id || '').startsWith('mermaid-render-error-') && String(t.message || '').includes('Syntax error in text'))
    })

    if (String(container.textContent || '').trim() !== '') {
      throw new Error('expected no inline Mermaid svg error rendered below canvas when svg payload carries error')
    }
  } finally {
    try {
      delete (globalThis as unknown as { __AG_TEST_MERMAID_API__?: unknown }).__AG_TEST_MERMAID_API__
    } catch {
      void 0
    }
    try {
      root?.unmount()
    } catch {
      void 0
    }
    try {
      restoreDom()
    } catch {
      void 0
    }
    try {
      restoreWindow()
    } catch {
      void 0
    }
  }
}

export async function testMermaidNormalizesLegacyClickSyntaxForHref() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null
  let seenCode = ''

  const api = {
    registerLayoutLoaders: () => void 0,
    initialize: () => void 0,
    render: async (_id: string, code: string) => {
      seenCode = code
      return { svg: '<svg viewBox="0 0 100 100"></svg>' }
    },
  }

  try {
    useGraphStore.getState().resetAll()
    ;(globalThis as unknown as { __AG_TEST_MERMAID_API__?: unknown }).__AG_TEST_MERMAID_API__ = api
    const anyWindow = dom.window as unknown as {
      requestAnimationFrame?: (cb: (ts: number) => void) => number
    }
    anyWindow.requestAnimationFrame = (cb: (ts: number) => void) =>
      setTimeout(() => cb(Date.now()), 0) as unknown as number
    ;(globalThis as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }).requestAnimationFrame =
      anyWindow.requestAnimationFrame

    const doc = dom.window.document
    const container = doc.createElement('section')
    container.id = 'root'
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)

    root.render(
      React.createElement(MermaidDiagram, {
        code: 'flowchart LR\nA-->B\nclick A "#anchor" "Anchor"',
        highlightClass: '',
        frontmatterConfig: null,
        rootThemeMode: 'dark',
      } as never),
    )

    const deadline = Date.now() + 1000
    while (Date.now() < deadline) {
      if (seenCode.includes('click A href "#anchor" "Anchor"')) break
      await new Promise<void>(resolve => setTimeout(resolve, 10))
    }
    if (!seenCode.includes('click A href "#anchor" "Anchor"')) {
      throw new Error('expected MermaidDiagram to normalize legacy click syntax with href keyword')
    }
  } finally {
    try {
      delete (globalThis as unknown as { __AG_TEST_MERMAID_API__?: unknown }).__AG_TEST_MERMAID_API__
    } catch {
      void 0
    }
    try {
      root?.unmount()
    } catch {
      void 0
    }
    try {
      restoreDom()
    } catch {
      void 0
    }
    try {
      restoreWindow()
    } catch {
      void 0
    }
  }
}

export async function testMermaidCleansUpOrphanRenderContainerOnFailure() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null

  const api = {
    registerLayoutLoaders: () => void 0,
    initialize: () => void 0,
    render: async (id: string) => {
      const wrapper = dom.window.document.createElement('section')
      wrapper.id = `d${id}`
      const svg = dom.window.document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      svg.setAttribute('id', id)
      svg.setAttribute('aria-roledescription', 'error')
      wrapper.appendChild(svg)
      dom.window.document.body.appendChild(wrapper)
      throw new Error('Syntax error in text')
    },
  }

  try {
    useGraphStore.getState().resetAll()
    ;(globalThis as unknown as { __AG_TEST_MERMAID_API__?: unknown }).__AG_TEST_MERMAID_API__ = api
    const anyWindow = dom.window as unknown as {
      requestAnimationFrame?: (cb: (ts: number) => void) => number
    }
    anyWindow.requestAnimationFrame = (cb: (ts: number) => void) =>
      setTimeout(() => cb(Date.now()), 0) as unknown as number
    ;(globalThis as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }).requestAnimationFrame =
      anyWindow.requestAnimationFrame

    const doc = dom.window.document
    const container = doc.createElement('section')
    container.id = 'root'
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)

    root.render(
      React.createElement(MermaidDiagram, {
        code: 'flowchart LR\nA-->B',
        highlightClass: '',
        frontmatterConfig: null,
        rootThemeMode: 'dark',
      } as never),
    )

    const deadline = Date.now() + 1200
    while (Date.now() < deadline) {
      const hasOrphan = Array.from(doc.querySelectorAll('[id^="dm_"],[id^="dkg-mermaid-"]')).length > 0
      if (!hasOrphan) break
      await new Promise<void>(resolve => setTimeout(resolve, 10))
    }
    const orphanCount = Array.from(doc.querySelectorAll('[id^="dm_"],[id^="dkg-mermaid-"]')).length
    if (orphanCount > 0) throw new Error('expected Mermaid orphan render containers to be cleaned up on failure')
  } finally {
    try {
      delete (globalThis as unknown as { __AG_TEST_MERMAID_API__?: unknown }).__AG_TEST_MERMAID_API__
    } catch {
      void 0
    }
    try {
      root?.unmount()
    } catch {
      void 0
    }
    try {
      restoreDom()
    } catch {
      void 0
    }
    try {
      restoreWindow()
    } catch {
      void 0
    }
  }
}

export async function testMermaidSuppressesDuplicateToastsAcrossRapidSwitching() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null

  const api = {
    registerLayoutLoaders: () => void 0,
    initialize: () => void 0,
    render: async () => {
      throw new Error('Parse error on line 49')
    },
  }

  try {
    useGraphStore.getState().resetAll()
    ;(globalThis as unknown as { __AG_TEST_MERMAID_API__?: unknown }).__AG_TEST_MERMAID_API__ = api
    const anyWindow = dom.window as unknown as {
      requestAnimationFrame?: (cb: (ts: number) => void) => number
    }
    anyWindow.requestAnimationFrame = (cb: (ts: number) => void) =>
      setTimeout(() => cb(Date.now()), 0) as unknown as number
    ;(globalThis as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }).requestAnimationFrame =
      anyWindow.requestAnimationFrame

    const doc = dom.window.document
    const container = doc.createElement('section')
    container.id = 'root'
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)

    root.render(React.createElement(MermaidDiagram, { code: 'flowchart LR\nA-->B', highlightClass: '', frontmatterConfig: null, rootThemeMode: 'dark' } as never))
    root.render(React.createElement(MermaidDiagram, { code: 'flowchart LR\nA-->B', highlightClass: '', frontmatterConfig: null, rootThemeMode: 'dark' } as never))

    const deadline = Date.now() + 1200
    while (Date.now() < deadline) {
      const toasts = useGraphStore.getState().uiToasts || []
      const count = toasts.filter(t => String(t.message || '').includes('Parse error on line 49')).length
      if (count >= 1) break
      await new Promise<void>(resolve => setTimeout(resolve, 10))
    }
    const toasts = useGraphStore.getState().uiToasts || []
    const count = toasts.filter(t => String(t.message || '').includes('Parse error on line 49')).length
    if (count !== 1) throw new Error(`expected exactly one deduped parse-error toast under rapid switching, got ${count}`)
  } finally {
    try {
      delete (globalThis as unknown as { __AG_TEST_MERMAID_API__?: unknown }).__AG_TEST_MERMAID_API__
    } catch {
      void 0
    }
    try {
      root?.unmount()
    } catch {
      void 0
    }
    try {
      restoreDom()
    } catch {
      void 0
    }
    try {
      restoreWindow()
    } catch {
      void 0
    }
  }
}
