import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { useGraphStore } from '@/hooks/useGraphStore'
import {
  resolveLiveWorkspaceStreamingTailFollowKey,
  resolveLiveWorkspaceStreamingText,
  useMarkdownWorkspaceEffectiveContent,
} from '@/lib/markdown-workspace-runtime/useMarkdownWorkspaceEffectiveContent'
import {
  scrollWorkspaceEditorHandleToBottom,
  useWorkspaceScrollSync,
} from '@/features/markdown-workspace/main/scroll/useWorkspaceScrollSync'
import type { MonacoTextEditorHandle } from '@/features/monaco/MonacoTextEditor'
import {
  resolveMarkdownWorkspaceLineOffset,
  resolveMarkdownWorkspaceRevealText,
} from '@/lib/markdown-workspace-runtime/markdownWorkspaceInteractionHelpers'

const tick = async (n = 1): Promise<void> => {
  for (let i = 0; i < n; i += 1) {
    await new Promise<void>(resolve => setTimeout(resolve, 0))
  }
}

const VITE_DEV_INDEX_HTML = [
  '<!doctype html><html lang="en">',
  '<head>',
  '<script type="module">import { injectIntoGlobalHook } from "/@react-refresh";</script>',
  '<script type="module" src="/@vite/client"></script>',
  '</head>',
  '<body><main id="root"></main><script type="module" src="/src/main.tsx?t=123"></script></body>',
  '</html>',
].join('\n')

export async function testMarkdownWorkspaceEffectiveContentPrefersCanonicalWritebackWhenEditorIsClean() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  const container = dom.window.document.getElementById('root')
  if (!container) throw new Error('missing root container')
  const root = createRoot(container)

  try {
    const canonicalText = [
      '---',
      'title: Demo',
      'flow:',
      '  nodes:',
      '    - id: SCENE_01',
      '      summary: Updated from graph writeback.',
      '---',
      '',
      '# Demo',
    ].join('\n')

    function Harness() {
      const [activeText, setActiveText] = React.useState('stale workspace text')
      const activeTextRef = React.useRef(activeText)
      const userEditedActiveTextRef = React.useRef(false)
      const effective = useMarkdownWorkspaceEffectiveContent({
        activePath: '/docs/demo.md' as never,
        activeDocumentKey: 'docs/demo.md',
        activeEntryKind: 'file',
        activeText,
        activeTextRef,
        setActiveText,
        markdownDocumentName: '/docs/demo.md',
        markdownDocumentText: canonicalText,
        layoutMode: 'split',
        contentMode: 'document',
        widgetFormat: 'markdown',
        widgetEditorText: '',
        widgetViewerText: '',
        pdfWorkspaceViewerTextOverride: null,
        webpageWorkspaceMeta: null,
        webpageWorkspaceEditorTextOverride: null,
        webpageWorkspaceViewerTextOverride: null,
        userEditedActiveTextRef,
      })

      return (
        <output
          data-testid="state"
          data-active-text={activeText}
          data-effective-text={effective.effectiveActiveText}
        />
      )
    }

    const readState = () => {
      const el = dom.window.document.querySelector('[data-testid="state"]')
      if (!(el instanceof dom.window.HTMLElement)) throw new Error('missing state output')
      return {
        activeText: el.getAttribute('data-active-text') || '',
        effectiveText: el.getAttribute('data-effective-text') || '',
      }
    }

    await act(async () => {
      root.render(<Harness />)
      await tick(4)
    })
    await act(async () => {
      await tick(4)
    })

    const state = readState()
    if (state.activeText !== canonicalText) {
      throw new Error(`expected clean workspace editor text to resync from canonical markdown writeback, got ${JSON.stringify(state)}`)
    }
    if (state.effectiveText !== canonicalText) {
      throw new Error(`expected effective workspace text to prefer canonical markdown writeback, got ${JSON.stringify(state)}`)
    }
  } finally {
  try {
      await act(async () => {
        root.unmount()
        await tick(2)
      })
    } catch {
      void 0
    }
    restore()
  }
}

export async function testMarkdownWorkspaceEffectiveContentPreservesUnsavedEditorDraftOverCanonicalWriteback() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  const container = dom.window.document.getElementById('root')
  if (!container) throw new Error('missing root container')
  const root = createRoot(container)

  try {
    const draftText = 'locally edited unsaved draft'
    const canonicalText = 'upstream canonical text'

    function Harness() {
      const [activeText, setActiveText] = React.useState(draftText)
      const activeTextRef = React.useRef(activeText)
      const userEditedActiveTextRef = React.useRef(true)
      const effective = useMarkdownWorkspaceEffectiveContent({
        activePath: '/docs/demo.md' as never,
        activeDocumentKey: 'docs/demo.md',
        activeEntryKind: 'file',
        activeText,
        activeTextRef,
        setActiveText,
        markdownDocumentName: '/docs/demo.md',
        markdownDocumentText: canonicalText,
        layoutMode: 'split',
        contentMode: 'document',
        widgetFormat: 'markdown',
        widgetEditorText: '',
        widgetViewerText: '',
        pdfWorkspaceViewerTextOverride: null,
        webpageWorkspaceMeta: null,
        webpageWorkspaceEditorTextOverride: null,
        webpageWorkspaceViewerTextOverride: null,
        userEditedActiveTextRef,
      })

      return (
        <output
          data-testid="state"
          data-active-text={activeText}
          data-effective-text={effective.effectiveActiveText}
        />
      )
    }

    const readState = () => {
      const el = dom.window.document.querySelector('[data-testid="state"]')
      if (!(el instanceof dom.window.HTMLElement)) throw new Error('missing state output')
      return {
        activeText: el.getAttribute('data-active-text') || '',
        effectiveText: el.getAttribute('data-effective-text') || '',
      }
    }

    await act(async () => {
      root.render(<Harness />)
      await tick(4)
    })

    const state = readState()
    if (state.activeText !== draftText || state.effectiveText !== draftText) {
      throw new Error(`expected unsaved workspace draft to remain authoritative over canonical writeback, got ${JSON.stringify(state)}`)
    }
  } finally {
    try {
      await act(async () => {
        root.unmount()
        await tick(2)
      })
    } catch {
      void 0
    }
    restore()
  }
}

export async function testMarkdownWorkspaceEffectiveContentKeepsNonMarkdownSourceTextAuthoritative() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  const container = dom.window.document.getElementById('root')
  if (!container) throw new Error('missing root container')
  const root = createRoot(container)

  try {
    const jsonSourceText = '{"rows":[{"Column":"Value"}]}'
    const derivedMarkdownText = '| Column |\n|---|\n| Value |'

    function Harness() {
      const [activeText, setActiveText] = React.useState(jsonSourceText)
      const activeTextRef = React.useRef(activeText)
      const userEditedActiveTextRef = React.useRef(false)
      const effective = useMarkdownWorkspaceEffectiveContent({
        activePath: '/docs/data.json' as never,
        activeDocumentKey: 'docs/data.json',
        activeEntryKind: 'file',
        activeText,
        activeTextRef,
        setActiveText,
        markdownDocumentName: '/docs/data.json',
        markdownDocumentText: derivedMarkdownText,
        layoutMode: 'split',
        contentMode: 'document',
        widgetFormat: 'markdown',
        widgetEditorText: '',
        widgetViewerText: '',
        pdfWorkspaceViewerTextOverride: null,
        webpageWorkspaceMeta: null,
        webpageWorkspaceEditorTextOverride: null,
        webpageWorkspaceViewerTextOverride: null,
        userEditedActiveTextRef,
      })

      return (
        <output
          data-testid="state"
          data-active-text={activeText}
          data-effective-text={effective.effectiveActiveText}
        />
      )
    }

    const readState = () => {
      const el = dom.window.document.querySelector('[data-testid="state"]')
      if (!(el instanceof dom.window.HTMLElement)) throw new Error('missing state output')
      return {
        activeText: el.getAttribute('data-active-text') || '',
        effectiveText: el.getAttribute('data-effective-text') || '',
      }
    }

    await act(async () => {
      root.render(<Harness />)
      await tick(4)
    })

    const state = readState()
    if (state.activeText !== jsonSourceText || state.effectiveText !== jsonSourceText) {
      throw new Error(`expected non-markdown workspace source text to remain authoritative over derived markdown text, got ${JSON.stringify(state)}`)
    }
  } finally {
    try {
      await act(async () => {
        root.unmount()
        await tick(2)
      })
    } catch {
      void 0
    }
    restore()
  }
}

export async function testMarkdownWorkspaceEffectiveContentRejectsViteDevIndexHtmlPayload() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  const container = dom.window.document.getElementById('root')
  if (!container) throw new Error('missing root container')
  const root = createRoot(container)
  const path = '/chat-log/20260605T020314Z/kgc-trace_20260605T020314Z.md'

  useGraphStore.getState().setChatWorkspaceStreamingState({
    path,
    text: VITE_DEV_INDEX_HTML,
  })

    try {
    function Harness() {
      const [activeText, setActiveText] = React.useState('')
      const activeTextRef = React.useRef(activeText)
      const userEditedActiveTextRef = React.useRef(false)
      const effective = useMarkdownWorkspaceEffectiveContent({
        activePath: path as never,
        activeDocumentKey: path,
        activeEntryKind: 'file',
        activeText,
        activeTextRef,
        setActiveText,
        markdownDocumentName: path,
        markdownDocumentText: VITE_DEV_INDEX_HTML,
        layoutMode: 'split',
        contentMode: 'document',
        widgetFormat: 'markdown',
        widgetEditorText: '',
        widgetViewerText: '',
        pdfWorkspaceViewerTextOverride: null,
        webpageWorkspaceMeta: null,
        webpageWorkspaceEditorTextOverride: null,
        webpageWorkspaceViewerTextOverride: null,
        userEditedActiveTextRef,
      })

      return (
        <output
          data-testid="state"
          data-active-text={activeText}
          data-effective-text={effective.effectiveActiveText}
        />
      )
    }

    const readState = () => {
      const el = dom.window.document.querySelector('[data-testid="state"]')
      if (!(el instanceof dom.window.HTMLElement)) throw new Error('missing state output')
      return {
        activeText: el.getAttribute('data-active-text') || '',
        effectiveText: el.getAttribute('data-effective-text') || '',
      }
    }

    await act(async () => {
      root.render(<Harness />)
      await tick(4)
    })

    const state = readState()
    if (state.activeText || state.effectiveText) {
      throw new Error(`expected Vite dev app-shell HTML to be rejected from Markdown editor content, got ${JSON.stringify(state)}`)
    }
  } finally {
    try {
      await act(async () => {
        useGraphStore.getState().setChatWorkspaceStreamingState(null)
        root.unmount()
        await tick(2)
      })
    } catch {
      void 0
    }
    restore()
  }
}

export function testMarkdownWorkspaceEffectiveContentPrefersMatchingLiveStreamingDraft() {
  useGraphStore.getState().setChatWorkspaceStreamingState({
    path: '/chat-log/20260527T193000Z/kgc-trace_20260527T193000Z.md',
    text: '# streaming draft',
  })
  try {
    const state = useGraphStore.getState()
    const resolved = resolveLiveWorkspaceStreamingText({
      activePath: '/chat-log/20260527T193000Z/kgc-trace_20260527T193000Z.md' as never,
      streamingPath: state.chatWorkspaceStreamingPath,
      streamingText: state.chatWorkspaceStreamingText,
      userEditedActiveText: false,
    })
    if (resolved !== '# streaming draft') {
      throw new Error(`expected matching live workspace stream draft to override empty editor content, got ${JSON.stringify({ resolved })}`)
    }
    const hiddenByUserDraft = resolveLiveWorkspaceStreamingText({
      activePath: '/chat-log/20260527T193000Z/kgc-trace_20260527T193000Z.md' as never,
      streamingPath: state.chatWorkspaceStreamingPath,
      streamingText: state.chatWorkspaceStreamingText,
      userEditedActiveText: true,
    })
    if (hiddenByUserDraft) {
      throw new Error(`expected live workspace stream override to yield to an unsaved user draft, got ${JSON.stringify({ hiddenByUserDraft })}`)
    }
  } finally {
    useGraphStore.getState().setChatWorkspaceStreamingState(null)
  }
}

export async function testMarkdownWorkspaceEffectiveContentKeepsProgrammaticStreamUpdatingEditor() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  const container = dom.window.document.getElementById('root')
  if (!container) throw new Error('missing root container')
  const root = createRoot(container)
  const streamingPath = '/chat-log/20260605T232226Z/kgc-trace_20260605T232226Z.md'

  try {
    useGraphStore.getState().setChatWorkspaceStreamingState({
      path: streamingPath,
      text: '## Executive Summary',
    })

    function Harness() {
      const [activeText, setActiveText] = React.useState('## Executive Summary')
      const activeTextRef = React.useRef(activeText)
      const userEditedActiveTextRef = React.useRef(true)
      const effective = useMarkdownWorkspaceEffectiveContent({
        activePath: streamingPath as never,
        activeDocumentKey: 'chat-log/20260605T232226Z/kgc-trace_20260605T232226Z.md',
        activeEntryKind: 'file',
        activeText,
        activeTextRef,
        setActiveText,
        markdownDocumentName: '/chat-log/20260605T232226Z/kgc-trace_20260605T232226Z.md',
        markdownDocumentText: activeText,
        layoutMode: 'editor',
        contentMode: 'document',
        widgetFormat: 'markdown',
        widgetEditorText: '',
        widgetViewerText: '',
        pdfWorkspaceViewerTextOverride: null,
        webpageWorkspaceMeta: null,
        webpageWorkspaceEditorTextOverride: null,
        webpageWorkspaceViewerTextOverride: null,
        userEditedActiveTextRef,
      })

      return (
        <output
          data-testid="state"
          data-effective-text={effective.effectiveActiveText}
          data-editor-override={effective.effectiveEditorTextOverride || ''}
          data-disable-editor-mutations={String(effective.disableEditorMutations)}
        />
      )
    }

    const readState = () => {
      const el = dom.window.document.querySelector('[data-testid="state"]')
      if (!(el instanceof dom.window.HTMLElement)) throw new Error('missing state output')
      return {
        effectiveText: el.getAttribute('data-effective-text') || '',
        editorOverride: el.getAttribute('data-editor-override') || '',
        disableEditorMutations: el.getAttribute('data-disable-editor-mutations') || '',
      }
    }

    await act(async () => {
      root.render(<Harness />)
      await tick(4)
    })
    await act(async () => {
      useGraphStore.getState().setChatWorkspaceStreamingState({
        path: streamingPath,
        text: ['## Executive Summary', '', '- Stream chunk two arrived.'].join('\n'),
      })
      await tick(4)
    })

    const state = readState()
    if (!state.effectiveText.includes('Stream chunk two arrived.')) {
      throw new Error(`expected programmatic live stream to keep updating despite stale edit flag, got ${JSON.stringify(state)}`)
    }
    if (state.editorOverride !== state.effectiveText) {
      throw new Error(`expected editor override to match live streaming text, got ${JSON.stringify(state)}`)
    }
    if (state.disableEditorMutations !== 'true') {
      throw new Error(`expected live streaming editor override to disable editor mutations, got ${JSON.stringify(state)}`)
    }
  } finally {
    try {
      await act(async () => {
        useGraphStore.getState().setChatWorkspaceStreamingState(null)
        root.unmount()
        await tick(2)
      })
    } catch {
      void 0
    }
    restore()
  }
}

export function testMarkdownWorkspaceRevealUsesLiveStreamingEffectiveTextForTailFollow() {
  const activeText = [
    '<!-- kg-chat-draft:start:trace-demo -->',
    '## 2026-06-06 08:04:14 (in progress)',
    '',
    '### assistant',
    '```markdown',
    '_Streaming..._',
    '```',
    '<!-- kg-chat-draft:end:trace-demo -->',
  ].join('\n')
  const liveStreamingText = [
    '## Provider Stream Trace',
    '',
    '- Model: provider-model',
    '- SSE events: 712',
    '',
    '### Assistant Draft',
    '',
    '```markdown',
    '# Allocation Draft',
    '',
    '- Live streamed tail chunk one.',
    '- Live streamed tail chunk two.',
    'stream-tail-sentinel',
  ].join('\n')

  const revealText = resolveMarkdownWorkspaceRevealText({ activeText, revealText: liveStreamingText })
  if (revealText !== liveStreamingText) {
    throw new Error('expected reveal text to prefer the live streaming editor value')
  }

  const liveTail = resolveMarkdownWorkspaceLineOffset({
    text: revealText,
    line: Number.MAX_SAFE_INTEGER,
    cache: null,
  })
  const staleTail = resolveMarkdownWorkspaceLineOffset({
    text: activeText,
    line: Number.MAX_SAFE_INTEGER,
    cache: null,
  })
  if (liveTail.offset <= staleTail.offset) {
    throw new Error(`expected live stream tail offset to advance beyond stale placeholder tail, got ${JSON.stringify({ liveTail, staleTail })}`)
  }
  if (!revealText.slice(liveTail.offset).startsWith('stream-tail-sentinel')) {
    throw new Error(`expected reveal offset to land on live streamed tail, got ${JSON.stringify({ tail: revealText.slice(liveTail.offset) })}`)
  }

  const storedRevealText = resolveMarkdownWorkspaceRevealText({ activeText, revealText: '' })
  if (storedRevealText !== activeText) {
    throw new Error('expected reveal text to fall back to stored active text when no live stream is present')
  }
}

function createFakeEditorHandle(args: {
  scrollHeight: number
  clientHeight: number
}): MonacoTextEditorHandle & { scrollTopWrites: number[] } {
  const scrollTopWrites: number[] = []
  return {
    scrollTopWrites,
    focus: () => {},
    layout: () => {},
    revealLine: () => {},
    revealOffsetInCenter: () => {},
    setSelection: () => {},
    setSelectionOffsets: () => {},
    getSelectionOffsets: () => null,
    getValue: () => '',
    setScrollTop: scrollTop => { scrollTopWrites.push(scrollTop) },
    getScrollTop: () => scrollTopWrites[scrollTopWrites.length - 1] || 0,
    getScrollHeight: () => args.scrollHeight,
    getClientHeight: () => args.clientHeight,
    getLineHeight: () => 20,
    getContentWidth: () => 640,
    getVisibleRange: () => ({ startLine: 1, endLine: 20 }),
    getTopForLineNumber: line => Math.max(0, line - 1) * 20,
    onDidScrollChange: () => ({ dispose: () => {} }),
    onDidLayoutChange: () => ({ dispose: () => {} }),
  }
}

export async function testMarkdownWorkspaceScrollSyncFollowsLiveStreamingTail() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  const container = dom.window.document.getElementById('root')
  if (!container) throw new Error('missing root container')
  const root = createRoot(container)
  const handle = createFakeEditorHandle({ scrollHeight: 1200, clientHeight: 240 })

  function Harness(props: { tailKey: string | null }) {
    const iframeRef = React.useRef<HTMLIFrameElement | null>(null)
    useWorkspaceScrollSync({
      activeDocumentKey: '/workspace/chat/session/kgc-trace_session.md',
      layoutMode: 'editor',
      showWebpageHtml: false,
      markdownEditorHandle: handle,
      jsonEditorHandle: null,
      viewerEl: null,
      iframeRef,
      liveTextTailFollowKey: props.tailKey,
    })
    return null
  }

  try {
    const firstKey = resolveLiveWorkspaceStreamingTailFollowKey({
      activePath: '/workspace/chat/session/kgc-trace_session.md' as never,
      streamingText: ['## Provider Stream Trace', '', 'chunk one'].join('\n'),
    })
    const secondKey = resolveLiveWorkspaceStreamingTailFollowKey({
      activePath: '/workspace/chat/session/kgc-trace_session.md' as never,
      streamingText: ['## Provider Stream Trace', '', 'chunk one', 'stream-tail-sentinel'].join('\n'),
    })
    if (!firstKey || !secondKey || firstKey === secondKey) {
      throw new Error(`expected live streaming tail-follow key to track stream revisions, got ${JSON.stringify({ firstKey, secondKey })}`)
    }
    const bottom = scrollWorkspaceEditorHandleToBottom(handle)
    if (bottom !== 960 || handle.scrollTopWrites[handle.scrollTopWrites.length - 1] !== 960) {
      throw new Error(`expected editor bottom helper to use scroll height minus client height, got ${JSON.stringify({ bottom, writes: handle.scrollTopWrites })}`)
    }
    handle.scrollTopWrites.length = 0

    await act(async () => {
      root.render(<Harness tailKey={null} />)
      await tick(2)
    })
    const writesAfterInactiveMount = handle.scrollTopWrites.length
    await act(async () => {
      root.render(<Harness tailKey={firstKey} />)
      await tick(2)
    })
    const firstTailWrite = handle.scrollTopWrites[handle.scrollTopWrites.length - 1]
    await act(async () => {
      root.render(<Harness tailKey={secondKey} />)
      await tick(2)
    })
    const secondTailWrite = handle.scrollTopWrites[handle.scrollTopWrites.length - 1]

    if (writesAfterInactiveMount > 1) {
      throw new Error(`expected inactive mount to avoid live tail-follow churn, got ${JSON.stringify(handle.scrollTopWrites)}`)
    }
    if (firstTailWrite !== 960 || secondTailWrite !== 960) {
      throw new Error(`expected live stream revisions to follow the editor tail, got ${JSON.stringify({ firstTailWrite, secondTailWrite, writes: handle.scrollTopWrites })}`)
    }
  } finally {
    try {
      await act(async () => {
        root.unmount()
        await tick(2)
      })
    } catch {
      void 0
    }
    restore()
  }
}
