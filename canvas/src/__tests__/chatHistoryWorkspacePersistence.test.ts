import { buildCanonicalKgcTemplateFixtureDocument } from '@/__tests__/helpers/neutralKgcFixture'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { getWorkspaceFs, resetWorkspaceFsForTests } from '@/features/workspace-fs/workspaceFs'
import {
  appendChatHistoryWorkspaceFile,
  createNewChatHistoryWorkspaceFilePath,
  upsertChatHistoryWorkspaceDraft,
} from '@/features/chat/chatHistoryWorkspace'
import { toKgcTraceWorkspacePath } from '@/features/chat/chatHistoryWorkspace.paths'

const buildBaseTemplateSample = (): string => {
  return buildCanonicalKgcTemplateFixtureDocument()
}

const VITE_DEV_INDEX_HTML = [
  '<!doctype html><html lang="en">',
  '<script type="module">import { injectIntoGlobalHook } from "/@react-refresh";</script>',
  '<script type="module" src="/@vite/client"></script>',
  '<main id="root"></main><script type="module" src="/src/main.tsx?t=123"></script>',
  '</html>',
].join('\n')

const LOCAL_MEDIA_IMAGE_PROMPT = 'why ![strybldr-starter-source.png](http://localhost:5180/api/storage/media/airvio/runs/upload-017d1e965528642f/image/strybldr-starter-source-017d1e965528642f.png?kg_media_token=secret)'

export async function testChatHistoryWorkspaceNewKgcCollisionCreatesMatchingSessionFolder() {
  resetWorkspaceFsForTests()
  try {
    const timestampMs = Date.UTC(2026, 6, 8, 4, 48, 39)
    const args = { storageType: 'chatAgenticGraph' as const, defaultLocalRootPath: '/chat-log' }
    const firstPath = await createNewChatHistoryWorkspaceFilePath(timestampMs, args)
    const secondPath = await createNewChatHistoryWorkspaceFilePath(timestampMs, args)
    const parseSession = (workspacePath: string): { folder: string; file: string } | null => {
      const match = /^\/chat-log\/(\d{8}T\d{6}Z)\/kgc_(\d{8}T\d{6}Z)\.md$/i.exec(workspacePath)
      return match ? { folder: match[1], file: match[2] } : null
    }
    const firstSession = parseSession(firstPath)
    const secondSession = parseSession(secondPath)
    if (!firstSession || !secondSession || firstSession.folder !== firstSession.file || secondSession.folder !== secondSession.file) {
      throw new Error(`expected KGC session folders and filenames to stay aligned, got ${JSON.stringify({ firstPath, secondPath })}`)
    }
    if (firstSession.folder === secondSession.folder || firstPath === secondPath) {
      throw new Error(`expected same-second New Chat collisions to allocate a fresh session folder, got ${JSON.stringify({ firstPath, secondPath })}`)
    }
    const secondText = await (await getWorkspaceFs()).readFileText(secondPath)
    if (secondText !== '') throw new Error(`expected collision-created KGC file to start empty, got ${JSON.stringify(secondText)}`)
  } finally {
    resetWorkspaceFsForTests()
  }
}

export async function testChatHistoryWorkspaceDraftWritesOnlyKgcTraceDuringStreaming() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { restore: restoreDom } = initJsdomHarness()
  const originalFetch = globalThis.fetch
  const fetchCalls: string[] = []
  try {
    resetWorkspaceFsForTests()
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchCalls.push(`${String(input)}\n${String(init?.body || '')}`)
      return { ok: true } as Response
    }) as typeof fetch

    const canonicalPath = '/chat-log/20260430T120000Z/kgc_20260430T120000Z.md'
    await upsertChatHistoryWorkspaceDraft({
      requestedPath: canonicalPath,
      timestampMs: 1_746_000_000_000,
      providerSummary: 'OpenAI · test',
      userText: 'hello',
      assistantText: 'partial chunk',
      storageType: 'chatAgenticGraph',
      traceId: 'trace-1',
      title: 'Knowledge Graph Canvas Storage',
    })

    const fs = await getWorkspaceFs()
    const canonicalText = await fs.readFileText(canonicalPath)
    const tracePath = toKgcTraceWorkspacePath(canonicalPath)
    const traceText = tracePath ? await fs.readFileText(tracePath) : null

    if (canonicalText && canonicalText.trim()) {
      throw new Error('expected KGC streaming draft writes to avoid rewriting the canonical workspace file')
    }
    if (!traceText || !traceText.includes('kg-chat-draft:start:trace-1')) {
      throw new Error('expected KGC streaming draft writes to persist only the trace companion draft block')
    }
    if (fetchCalls.some(call => call.includes('kgc-trace_20260430T120000Z.md'))) {
      throw new Error('expected partial KGC draft writes to avoid mirroring kgc-trace companion drafts to the host chat-log path')
    }
  } finally {
    resetWorkspaceFsForTests()
    globalThis.fetch = originalFetch
    restoreDom()
    restoreWindow()
  }
}

export async function testChatHistoryWorkspaceKgcTraceSanitizesLocalMediaUserText() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { restore: restoreDom } = initJsdomHarness()
  const originalFetch = globalThis.fetch
  try {
    resetWorkspaceFsForTests()
    globalThis.fetch = (async () => ({ ok: true } as Response)) as typeof fetch

    const canonicalPath = '/chat-log/20260707T234043Z/kgc_20260707T234043Z.md'
    const tracePath = toKgcTraceWorkspacePath(canonicalPath)
    await upsertChatHistoryWorkspaceDraft({
      requestedPath: canonicalPath,
      timestampMs: Date.UTC(2026, 6, 7, 23, 40, 43),
      providerSummary: 'OpenAI · test',
      userText: LOCAL_MEDIA_IMAGE_PROMPT,
      assistantText: 'partial trace signal',
      storageType: 'chatAgenticGraph',
      traceId: 'trace-local-media',
      title: 'Knowledge Graph Canvas Storage',
    })

    const fs = await getWorkspaceFs()
    const draftTraceText = tracePath ? await fs.readFileText(tracePath) : null
    if (!draftTraceText || !draftTraceText.includes('why [attached image]')) {
      throw new Error('expected KGC draft trace to preserve the neutral attached-image user intent')
    }
    for (const forbidden of ['kg_media_token', 'localhost:5180', 'upload-017d1e965528642f', 'strybldr-starter-source.png']) {
      if (draftTraceText.includes(forbidden)) {
        throw new Error(`expected KGC draft trace to sanitize local media detail: ${forbidden}`)
      }
    }

    await appendChatHistoryWorkspaceFile({
      requestedPath: canonicalPath,
      timestampMs: Date.UTC(2026, 6, 7, 23, 40, 43),
      providerSummary: 'OpenAI · test',
      userText: LOCAL_MEDIA_IMAGE_PROMPT,
      assistantText: 'No response content.',
      storageType: 'chatAgenticGraph',
      traceId: 'trace-local-media',
      title: 'Knowledge Graph Canvas Storage',
    })

    const finalTraceText = tracePath ? await fs.readFileText(tracePath) : null
    if (!finalTraceText || !finalTraceText.includes('why [attached image]')) {
      throw new Error('expected KGC final trace to preserve the neutral attached-image user intent')
    }
    for (const forbidden of ['kg_media_token', 'localhost:5180', 'upload-017d1e965528642f', 'strybldr-starter-source.png']) {
      if (finalTraceText.includes(forbidden)) {
        throw new Error(`expected KGC final trace to sanitize local media detail: ${forbidden}`)
      }
    }
  } finally {
    resetWorkspaceFsForTests()
    globalThis.fetch = originalFetch
    restoreDom()
    restoreWindow()
  }
}

export async function testChatHistoryWorkspaceDraftRejectsViteDevIndexHtmlPayload() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { restore: restoreDom } = initJsdomHarness()
  const originalFetch = globalThis.fetch
  const fetchCalls: string[] = []
  try {
    resetWorkspaceFsForTests()
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchCalls.push(`${String(input)}\n${String(init?.body || '')}`)
      return { ok: true } as Response
    }) as typeof fetch

    const canonicalPath = '/chat-log/20260605T020314Z/kgc_20260605T020314Z.md'
    await upsertChatHistoryWorkspaceDraft({
      requestedPath: canonicalPath,
      timestampMs: Date.UTC(2026, 5, 5, 2, 3, 14),
      providerSummary: 'OpenAI · test',
      userText: 'Generate KGC',
      assistantText: VITE_DEV_INDEX_HTML,
      storageType: 'chatAgenticGraph',
      traceId: 'trace-vite-html',
      title: 'Knowledge Graph Canvas Storage',
    })

    const fs = await getWorkspaceFs()
    const canonicalText = await fs.readFileText(canonicalPath)
    const tracePath = toKgcTraceWorkspacePath(canonicalPath)
    const traceText = tracePath ? await fs.readFileText(tracePath) : null

    if (canonicalText || traceText) {
      throw new Error('expected KGC draft persistence to reject Vite dev app-shell HTML before writing Markdown artifacts')
    }
    const rejectedPathMirrorCalls = fetchCalls.filter(call => (
      call.includes('kgc_20260605T020314Z.md') ||
      call.includes('kgc-trace_20260605T020314Z.md')
    ))
    if (rejectedPathMirrorCalls.length > 0) {
      throw new Error(`expected rejected app-shell HTML draft to avoid host mirror writes, got ${rejectedPathMirrorCalls.length}`)
    }
  } finally {
    resetWorkspaceFsForTests()
    globalThis.fetch = originalFetch
    restoreDom()
    restoreWindow()
  }
}

export async function testChatHistoryWorkspaceFinalizeAppendsCanonicalHistoryEntry() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { restore: restoreDom } = initJsdomHarness()
  const originalFetch = globalThis.fetch
  try {
    resetWorkspaceFsForTests()
    globalThis.fetch = (async () => ({ ok: true } as Response)) as typeof fetch

    const historyPath = await appendChatHistoryWorkspaceFile({
      requestedPath: '/chat-log/chh_20260430120500.md',
      timestampMs: 1_746_000_100_000,
      providerSummary: 'OpenAI · test',
      userText: 'question',
      assistantText: 'answer',
      storageType: 'chatHistory',
      traceId: 'trace-2',
      title: 'Chat History Storage',
    })

    const fs = await getWorkspaceFs()
    const canonicalText = await fs.readFileText(historyPath)
    const traceText = await fs.readFileText('/chat-log/chh_20260430120500--trace-2.md')

    if (!canonicalText || !canonicalText.includes('Trace-ID: trace-2')) {
      throw new Error('expected chat history finalize to keep one canonical history file with the finalized entry')
    }
    if (!traceText || !traceText.includes('### assistant')) {
      throw new Error('expected chat history finalize to persist a per-trace shard alongside the canonical file')
    }
  } finally {
    resetWorkspaceFsForTests()
    globalThis.fetch = originalFetch
    restoreDom()
    restoreWindow()
  }
}

export async function testChatHistoryWorkspaceStructuredDraftDoesNotRewriteKgcTrace() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { restore: restoreDom } = initJsdomHarness()
  const originalFetch = globalThis.fetch
  try {
    resetWorkspaceFsForTests()
    globalThis.fetch = (async () => ({ ok: true } as Response)) as typeof fetch

    const canonicalPath = '/chat-log/20260430T120500Z/kgc_20260430T120500Z.md'
    await upsertChatHistoryWorkspaceDraft({
      requestedPath: canonicalPath,
      timestampMs: 1_746_000_300_000,
      providerSummary: 'OpenAI · test',
      userText: 'Generate a structured KGC',
      assistantText: 'partial chunk',
      storageType: 'chatAgenticGraph',
      traceId: 'trace-structured-draft',
      title: 'Knowledge Graph Canvas Storage',
    })

    const fs = await getWorkspaceFs()
    const tracePath = toKgcTraceWorkspacePath(canonicalPath)
    const traceBefore = tracePath ? await fs.readFileText(tracePath) : null
    const canonicalBefore = await fs.readFileText(canonicalPath)

    await upsertChatHistoryWorkspaceDraft({
      requestedPath: canonicalPath,
      timestampMs: 1_746_000_300_000,
      providerSummary: 'OpenAI · test',
      userText: 'Generate a structured KGC',
      assistantText: buildBaseTemplateSample(),
      storageType: 'chatAgenticGraph',
      traceId: 'trace-structured-draft',
      title: 'Knowledge Graph Canvas Storage',
    })

    const traceAfter = tracePath ? await fs.readFileText(tracePath) : null
    const canonicalAfter = await fs.readFileText(canonicalPath)

    if (!traceBefore || !traceBefore.includes('kg-chat-draft:start:trace-structured-draft')) {
      throw new Error('expected initial partial draft to persist the draft block in the trace companion')
    }
    if (traceAfter !== traceBefore) {
      throw new Error('expected structured draft persistence to avoid rewriting the trace companion before finalize')
    }
    if (!canonicalAfter || canonicalAfter === canonicalBefore) {
      throw new Error('expected structured draft persistence to update the canonical KGC workspace document')
    }
  } finally {
    resetWorkspaceFsForTests()
    globalThis.fetch = originalFetch
    restoreDom()
    restoreWindow()
  }
}

export async function testChatHistoryWorkspaceFinalizeKeepsKgcTraceDraftAsFinalTrace() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { restore: restoreDom } = initJsdomHarness()
  const originalFetch = globalThis.fetch
  const fetchCalls: string[] = []
  try {
    resetWorkspaceFsForTests()
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchCalls.push(`${String(input)}\n${String(init?.body || '')}`)
      return { ok: true } as Response
    }) as typeof fetch

    const canonicalPath = '/chat-log/20260430T121000Z/kgc_20260430T121000Z.md'
    const tracePath = toKgcTraceWorkspacePath(canonicalPath)
    const structured = buildBaseTemplateSample()

    await upsertChatHistoryWorkspaceDraft({
      requestedPath: canonicalPath,
      timestampMs: 1_746_000_600_000,
      providerSummary: 'OpenAI · test',
      userText: 'Generate a structured KGC',
      assistantText: 'partial chunk',
      storageType: 'chatAgenticGraph',
      traceId: 'trace-finalize-upgrade',
      title: 'Knowledge Graph Canvas Storage',
    })
    await upsertChatHistoryWorkspaceDraft({
      requestedPath: canonicalPath,
      timestampMs: 1_746_000_600_000,
      providerSummary: 'OpenAI · test',
      userText: 'Generate a structured KGC',
      assistantText: structured,
      storageType: 'chatAgenticGraph',
      traceId: 'trace-finalize-upgrade',
      title: 'Knowledge Graph Canvas Storage',
    })

    const fs = await getWorkspaceFs()
    const traceBeforeFinalize = tracePath ? await fs.readFileText(tracePath) : null
    await appendChatHistoryWorkspaceFile({
      requestedPath: canonicalPath,
      timestampMs: 1_746_000_600_000,
      providerSummary: 'OpenAI · test',
      userText: 'Generate a structured KGC',
      assistantText: structured,
      storageType: 'chatAgenticGraph',
      traceId: 'trace-finalize-upgrade',
      title: 'Knowledge Graph Canvas Storage',
    })
    const traceAfterFinalize = tracePath ? await fs.readFileText(tracePath) : null
    const canonicalAfterFinalize = await fs.readFileText(canonicalPath)

    if (!traceBeforeFinalize || !traceBeforeFinalize.includes('kg-chat-draft:start:trace-finalize-upgrade')) {
      throw new Error('expected trace companion to still hold the streaming draft before finalize')
    }
    if (!traceAfterFinalize) {
      throw new Error('expected KGC finalize to keep the trace companion after canonical persistence')
    }
    if (traceAfterFinalize.includes('kg-chat-draft:start:trace-finalize-upgrade') || traceAfterFinalize.includes('kg-chat-draft:end:trace-finalize-upgrade')) {
      throw new Error('expected KGC finalize to remove the transient streaming draft markers from the trace companion')
    }
    for (const expected of ['## KGC Finalization Trace', 'Trace-ID: trace-finalize-upgrade', '### assistant', 'Computing Flow Definition']) {
      if (!traceAfterFinalize.includes(expected)) {
        throw new Error(`expected finalized trace companion to include ${expected}`)
      }
    }
    if (!canonicalAfterFinalize || !canonicalAfterFinalize.includes('Computing Flow Definition')) {
      throw new Error('expected KGC finalize to keep the canonical workspace document as the graph/run markdown output')
    }
  } finally {
    resetWorkspaceFsForTests()
    globalThis.fetch = originalFetch
    restoreDom()
    restoreWindow()
  }
}
