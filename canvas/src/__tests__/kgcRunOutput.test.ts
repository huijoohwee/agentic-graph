import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { resetWorkspaceFsForTests, getWorkspaceFs } from '@/features/workspace-fs/workspaceFs'
import { emitKgcRunOutput, resolveKgcRunOutputPreference } from '@/features/chat/kgcRunOutput'

const buildKgcFixture = (formatLine = ''): string => [
  '---',
  'title: "Knowledge Graph Canvas - Pitch Deck + PRD + TAD + TCO"',
  'product: "Knowledge Graph Canvas"',
  'subject: "Solo founder"',
  'artifact: "Pitch Deck + PRD + TAD + TCO"',
  'objective: "Recommend a zero-budget bootstrap plan for external users with Use Case, Problem, Solution, User Flow, Work Flow, Data Flow, B2C monetization, and Stripe payment flow"',
  'domain: "MCP distribution, OpenClaw, marketplace, organic growth"',
  'date: "2026-04-20"',
  'doc:',
  '  id: "doc:kgc:test"',
  '  type: chatAgenticGraph',
  'flow:',
  '  nodes:',
  '    - id: n-in',
  '      type: input',
  '      label: "Input"',
  '      data:',
  '        role: "user"',
  '        text: "hello"',
  '    - id: n-out',
  '      type: output',
  '      label: "Output"',
  '      data:',
  '        role: "assistant"',
  ...(formatLine ? [`        ${formatLine}`] : []),
  '        text: "done"',
  '  edges:',
  '    - source: n-in.turn',
  '      target: n-out.turn',
  '---',
  '',
  '# Knowledge Graph Canvas · AI Pipeline',
  '',
  '### Use Case',
  '',
  'Pipeline-only placeholder.',
  '',
  '### Problem',
  '',
  'Pipeline-only placeholder.',
  '',
  '### Solution',
  '',
  'Pipeline-only placeholder.',
  '',
  '### User Flow',
  '',
  'Pipeline-only placeholder.',
  '',
  '### Work Flow',
  '',
  'Pipeline-only placeholder.',
  '',
  '### Data Flow',
  '',
  'Pipeline-only placeholder.',
  '',
  '### Monetization Surface',
  '',
  'Pipeline-only placeholder.',
  '',
  '### Integration Boundaries',
  '',
  'Pipeline-only placeholder.',
  '',
].join('\n')

const buildGenericKgcFixture = (): string => [
  '---',
  'title: "QNX-42 Gateway Response"',
  'product: ""',
  'subject: "Operator"',
  'artifact: "response"',
  'objective: "Connect QNX-42 gateway, BlueLark adapter, outputSrcDoc chart panel, and audioUrl review notes"',
  'domain: "QNX-42 gateway, BlueLark adapter, outputSrcDoc chart panel, audioUrl review notes"',
  'date: "2026-06-05"',
  'doc:',
  '  id: "doc:kgc:generic-run"',
  '  type: chatAgenticGraph',
  'flow:',
  '  nodes:',
  '    - id: n-out',
  '      type: output',
  '      label: "Output"',
  '      data:',
  '        role: "assistant"',
  '        format: "markdown"',
  '        text: "done"',
  '---',
  '',
  '# QNX-42 Gateway Response · AI Pipeline',
  '',
  '### Use Case',
  '',
  'Pipeline-only placeholder.',
  '',
  '### Problem',
  '',
  'Pipeline-only placeholder.',
  '',
  '### Solution',
  '',
  'Pipeline-only placeholder.',
  '',
  '### User Flow',
  '',
  'Pipeline-only placeholder.',
  '',
  '### Data Flow',
  '',
  'Pipeline-only placeholder.',
  '',
].join('\n')

export function testResolveKgcRunOutputPreferenceReadsOutputNodeFormat() {
  const pngPref = resolveKgcRunOutputPreference({
    canonicalPath: '/chat-log/kgc_20260420231505.md',
    canonicalText: buildKgcFixture('format: "png"'),
  })
  if (pngPref.kind !== 'png' || pngPref.extension !== 'png') {
    throw new Error(`expected png output preference, got ${pngPref.kind}.${pngPref.extension}`)
  }

  const svgPref = resolveKgcRunOutputPreference({
    canonicalPath: '/chat-log/kgc_20260420231505.md',
    canonicalText: buildKgcFixture('file: "kgc-output_20260420231505.svg"'),
  })
  if (svgPref.kind !== 'svg' || svgPref.extension !== 'svg') {
    throw new Error(`expected svg output preference, got ${svgPref.kind}.${svgPref.extension}`)
  }

  const videoPref = resolveKgcRunOutputPreference({
    canonicalPath: '/chat-log/kgc_20260420231505.md',
    canonicalText: buildKgcFixture('format: "video"'),
  })
  if (videoPref.kind !== 'video' || videoPref.extension !== 'mp4') {
    throw new Error(`expected video output preference, got ${videoPref.kind}.${videoPref.extension}`)
  }
}

export function testResolveKgcRunOutputPreferenceReadsCanonicalMediaKeys() {
  const imagePref = resolveKgcRunOutputPreference({
    canonicalPath: '/chat-log/kgc_20260420231505.md',
    canonicalText: buildKgcFixture('image: "https://example.com/output.png"'),
  })
  if (imagePref.kind !== 'png' || imagePref.extension !== 'png') {
    throw new Error(`expected png output preference from canonical image key, got ${imagePref.kind}.${imagePref.extension}`)
  }

  const videoPref = resolveKgcRunOutputPreference({
    canonicalPath: '/chat-log/kgc_20260420231505.md',
    canonicalText: buildKgcFixture('videoUrl: "https://example.com/output.mp4"'),
  })
  if (videoPref.kind !== 'video' || videoPref.extension !== 'mp4') {
    throw new Error(`expected video output preference from canonical videoUrl key, got ${videoPref.kind}.${videoPref.extension}`)
  }
}

export async function testEmitKgcRunOutputWritesCanonicalMarkdownSection() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { restore: restoreDom } = initJsdomHarness()
  const originalFetch = globalThis.fetch
  try {
    resetWorkspaceFsForTests()
    globalThis.fetch = (async () => ({ ok: true } as Response)) as typeof fetch
    const result = await emitKgcRunOutput({
      canonicalPath: '/chat-log/kgc_20260420231505.md',
      canonicalText: buildKgcFixture('format: "markdown"'),
      getStore: () => ({
        captureCanvasPngSnapshot: async () => null,
        captureCanvasSvgSnapshot: async () => null,
      }),
    })
    if (result.path !== '/chat-log/20260420T231505Z/kgc_20260420T231505Z.md') {
      throw new Error(`expected markdown run output path, got ${String(result.path)}`)
    }
    const fs = await getWorkspaceFs()
    const written = await fs.readFileText('/chat-log/20260420T231505Z/kgc_20260420T231505Z.md')
    if (!written) {
      throw new Error('expected markdown run output text to be written')
    }
    const expectedSnippets = [
      '# Knowledge Graph Canvas - Pitch Deck + PRD + TAD + TCO',
      '## Use Case',
      '## Problem',
      '## Solution',
      '## User Flow',
      '## Work Flow',
      '## Data Flow',
      '## Monetization Surface',
      '## Integration Boundaries',
      'Stripe for checkout and payment confirmation',
      'OpenClaw for listing and discovery',
    ]
    for (const snippet of expectedSnippets) {
      if (!written.includes(snippet)) {
        throw new Error(`expected markdown run output to include query-responsive snippet: ${snippet}`)
      }
    }
    const forbiddenSnippets = [
      'doc:',
      '# Knowledge Graph Canvas · AI Pipeline',
      'Pipeline-only placeholder.',
      'Computing Flow Definition',
      'Runner Protocol',
    ]
    for (const snippet of forbiddenSnippets) {
      if (written.includes(snippet)) {
        throw new Error(`expected markdown run output to avoid copying KGC scaffold content: ${snippet}`)
      }
    }
  } finally {
    resetWorkspaceFsForTests()
    globalThis.fetch = originalFetch
    restoreDom()
    restoreWindow()
  }
}

export async function testEmitKgcRunOutputStaysGenericForArbitraryNamedTerms() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { restore: restoreDom } = initJsdomHarness()
  const originalFetch = globalThis.fetch
  try {
    resetWorkspaceFsForTests()
    globalThis.fetch = (async () => ({ ok: true } as Response)) as typeof fetch
    const result = await emitKgcRunOutput({
      canonicalPath: '/chat-log/kgc_20260605050000.md',
      canonicalText: buildGenericKgcFixture(),
      getStore: () => ({
        captureCanvasPngSnapshot: async () => null,
        captureCanvasSvgSnapshot: async () => null,
      }),
    })
    if (!result.path) throw new Error('expected generic markdown run output path')
    const fs = await getWorkspaceFs()
    const written = await fs.readFileText(result.path)
    if (!written) throw new Error('expected generic markdown run output text to be written')
    const expectedSnippets = [
      'QNX-42 gateway',
      'BlueLark adapter',
      'outputSrcDoc chart panel',
      'audioUrl review notes',
      '## Data Flow',
      'outputSrcDoc',
    ]
    for (const snippet of expectedSnippets) {
      if (!written.includes(snippet)) {
        throw new Error(`expected generic markdown run output to include term-responsive snippet: ${snippet}`)
      }
    }
    const forbiddenSnippets = [
      'delivery, or commercialization',
      'activation, upgrade, or purchase',
      'payment completion',
      'Pipeline-only placeholder.',
    ]
    for (const snippet of forbiddenSnippets) {
      if (written.includes(snippet)) {
        throw new Error(`expected generic markdown run output to avoid stale template snippet: ${snippet}`)
      }
    }
  } finally {
    resetWorkspaceFsForTests()
    globalThis.fetch = originalFetch
    restoreDom()
    restoreWindow()
  }
}

export async function testEmitKgcRunOutputFallsBackToMarkdownForVideoPreference() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { restore: restoreDom } = initJsdomHarness()
  const originalFetch = globalThis.fetch
  try {
    resetWorkspaceFsForTests()
    globalThis.fetch = (async () => ({ ok: true } as Response)) as typeof fetch
    const result = await emitKgcRunOutput({
      canonicalPath: '/chat-log/kgc_20260420231505.md',
      canonicalText: buildKgcFixture('format: "video"'),
      getStore: () => ({
        captureCanvasPngSnapshot: async () => null,
        captureCanvasSvgSnapshot: async () => null,
      }),
    })
    if (result.kind !== 'video' || result.degraded !== true) {
      throw new Error('expected video run output to report degraded markdown fallback until direct video bytes are available')
    }
    if (result.path !== '/chat-log/20260420T231505Z/kgc_20260420T231505Z.md') {
      throw new Error(`expected video run output fallback to write canonical markdown, got ${String(result.path)}`)
    }
    const fs = await getWorkspaceFs()
    const written = await fs.readFileText('/chat-log/20260420T231505Z/kgc_20260420T231505Z.md')
    if (!written || !written.includes('## Solution') || written.includes('# Knowledge Graph Canvas · AI Pipeline')) {
      throw new Error('expected video markdown fallback to stay query-responsive instead of copying the runnable KGC scaffold')
    }
  } finally {
    resetWorkspaceFsForTests()
    globalThis.fetch = originalFetch
    restoreDom()
    restoreWindow()
  }
}
