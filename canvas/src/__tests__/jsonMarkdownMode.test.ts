import { readFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { useGraphStore } from '@/hooks/useGraphStore'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { workspaceTablePreferencesStore } from '@/features/workspace-table/workspaceTablePreferencesStore'
import { jsonToMarkdown, jsonToMarkdownPreferTable, type JsonToMarkdownMode } from '@/features/markdown/jsonToMarkdown'
import {
  buildJsonMarkdownDocumentFromValue,
  tryBuildJsonMarkdownDocumentFromText,
} from '@/features/markdown/jsonToMarkdownDocument'
import { readMarkdownSourceFidelityTextFromJsonText } from '@/features/markdown/jsonMarkdownSourceFidelity'
import { serializeJsonMarkdownDraftToSourceText } from '@/features/markdown-workspace/main/jsonMarkdownEditing'

async function withWindowHarness(run: () => Promise<void>) {
  const storage = new MemoryStorage()
  const { restore } = initWindowHarness({ storage })
  try {
    await run()
  } finally {
    restore()
  }
}

export async function testJsonMarkdownModeUpdatesMarkdownFromJsonSource() {
  await withWindowHarness(async () => {
    const json = {
      records: [
        { id: 1, name: 'A', meta: { city: 'Singapore', active: true } },
        { id: 2, name: 'B', meta: { city: 'Jurong', active: false } },
      ],
      summary: { count: 2 },
    }
    const text = JSON.stringify(json)

    const initialMode: JsonToMarkdownMode = 'table'
    workspaceTablePreferencesStore.setJsonMarkdownMode(initialMode)
    const before = tryBuildJsonMarkdownDocumentFromText(text)
    if (!before || !before.markdown.trim()) {
      throw new Error('expected markdown before changing json markdown preference')
    }
    if (before.mode !== initialMode) {
      throw new Error(`expected initial json markdown mode ${initialMode}, got ${before.mode}`)
    }

    workspaceTablePreferencesStore.setJsonMarkdownMode('key-value')
    const after = tryBuildJsonMarkdownDocumentFromText(text)
    if (!after || !after.markdown.trim()) {
      throw new Error('expected markdown after changing json markdown preference')
    }
    if (after.mode !== 'key-value') {
      throw new Error(`expected updated json markdown mode key-value, got ${after.mode}`)
    }
    const expectedBefore = jsonToMarkdownPreferTable(json, { defaultMode: initialMode }, initialMode)
    if (before.markdown !== expectedBefore) {
      throw new Error('expected markdown to match table-first rendering before mode change')
    }
    const expectedAfter = jsonToMarkdownPreferTable(json, { defaultMode: 'key-value' }, 'key-value')
    if (after.markdown !== expectedAfter) {
      throw new Error('expected markdown to match table-first rendering after mode change')
    }
    if (workspaceTablePreferencesStore.getSnapshot().jsonMarkdownMode !== 'key-value') {
      throw new Error('expected workspace table preferences store to persist the updated json markdown mode')
    }
  })
}

export async function testJsonMarkdownApplyJsonUpdatesJsonSourceAndMarkdown() {
  await withWindowHarness(async () => {
    const initialMode: JsonToMarkdownMode = 'table'
    workspaceTablePreferencesStore.setJsonMarkdownMode(initialMode)

    const updatedJson = {
      nodes: [
        { id: 'n1', type: 'Node', properties: { name: 'After A' } },
        { id: 'n2', type: 'Node', properties: { name: 'After B' } },
      ],
      edges: [],
    }
    const updatedJsonText = JSON.stringify(updatedJson)
    const built = buildJsonMarkdownDocumentFromValue(updatedJson, {
      preferredMode: initialMode,
      sourceText: updatedJsonText,
    })

    if (built.jsonSourceText !== updatedJsonText) {
      throw new Error('expected json markdown document builder to retain the source json text')
    }
    const expectedMarkdown = jsonToMarkdown(updatedJson, { defaultMode: initialMode }, initialMode)
    if (built.markdown !== expectedMarkdown) {
      throw new Error('expected markdown to match updated json after simulated applyJson')
    }
    if (built.mode !== initialMode) {
      throw new Error(`expected json markdown document builder to retain mode ${initialMode}, got ${built.mode}`)
    }
    if (workspaceTablePreferencesStore.getSnapshot().jsonMarkdownMode !== initialMode) {
      throw new Error('expected json markdown document builder to write the preferred mode back to workspace preferences')
    }
  })
}

export async function testJsonMarkdownSourceFidelityRoundTripsYamlFrontmatter() {
  const markdown = [
    '---',
    'title: AgenticGraph Strybldr Demo',
    'strybldr_storyboard:',
    '  version: 1',
    '  runId: strybldr-validation-recreate-runtime',
    '  workflow:',
    '    stages:',
    '      - Source',
    '      - Storyboard',
    '  cards:',
    '    - id: readiness',
    '      type: Runtime',
    '      summary: Host-only key readiness.',
    '---',
    '',
    '# Runtime',
    '',
    'Keep YAML-native storyboard data in frontmatter.',
    '',
  ].join('\n')
  const jsonText = serializeJsonMarkdownDraftToSourceText({
    activeDocumentKey: '/docs/agenticgraph-strybldr-demo.md',
    editorUri: 'file:///docs/agenticgraph-strybldr-demo.md',
    markdownText: markdown,
  })
  const restored = readMarkdownSourceFidelityTextFromJsonText(jsonText)
  if (restored !== markdown) {
    throw new Error('expected markdown source fidelity payload to preserve YAML frontmatter byte-for-byte')
  }
  const built = tryBuildJsonMarkdownDocumentFromText(jsonText, 'table')
  if (!built || built.markdown !== markdown) {
    throw new Error('expected JSON-to-Markdown builder to prefer the exact markdown source fidelity payload')
  }
  const parsed = JSON.parse(jsonText) as { metadata?: { markdownSource?: { text?: unknown } } }
  if (parsed.metadata?.markdownSource?.text !== markdown) {
    throw new Error('expected serialized JSON-LD metadata to carry the exact markdown source text')
  }
  if (jsonText.includes('strybldr_storyboard: |')) {
    throw new Error('expected source fidelity payload to retain YAML-native storyboard frontmatter, not JSON literal frontmatter')
  }
}

export async function testJsonMarkdownModeWithExternalJsonFiles() {
  await withWindowHarness(async () => {
    const paths: string[] = [
      resolve(process.cwd(), '..', 'data', 'test-data', 'eda-mlp-path.json'),
    ]

    for (const path of paths) {
      const name = basename(path)
      const text = readFileSync(path, 'utf8')
      if (!text.trim()) {
        continue
      }

      const parsed = JSON.parse(text) as unknown
      const expectedTable = jsonToMarkdownPreferTable(parsed, { defaultMode: 'table' }, 'table')
      const expectedKeyValue = jsonToMarkdownPreferTable(parsed, { defaultMode: 'key-value' }, 'key-value')

      workspaceTablePreferencesStore.setJsonMarkdownMode('table')
      const tableBuilt = tryBuildJsonMarkdownDocumentFromText(text)
      if (!tableBuilt || !tableBuilt.markdown.trim()) {
        throw new Error(`expected markdown before mode change for ${name}`)
      }
      if (tableBuilt.markdown !== expectedTable) {
        throw new Error(`expected markdown to match table rendering for ${name}`)
      }

      workspaceTablePreferencesStore.setJsonMarkdownMode('key-value')
      const keyValueBuilt = tryBuildJsonMarkdownDocumentFromText(text)
      if (!keyValueBuilt || !keyValueBuilt.markdown.trim()) {
        throw new Error(`expected markdown after mode change for ${name}`)
      }
      if (keyValueBuilt.markdown !== expectedKeyValue) {
        throw new Error(`expected markdown to match key-value rendering for ${name}`)
      }
      if (keyValueBuilt.mode !== 'key-value') {
        throw new Error(`expected persisted json markdown mode key-value for ${name}, got ${keyValueBuilt.mode}`)
      }
    }
  })
}

export async function testMarkdownApplyButtonUpdatesGraphData() {
  const state = useGraphStore.getState()
  const prevFrontmatterModeEnabled = !!state.frontmatterModeEnabled
  try {
    state.setDocumentStructureBaselineLock(false)
    state.setCanvasRenderMode('2d')
    state.setCanvas2dRenderer('d3')
    state.setDocumentSemanticMode('document')
    state.setFrontmatterModeEnabled(false)
    try {
      state.clearGraphData()
    } catch {
      void 0
    }
    const markdown = ['# Title', '', '- Item one', '- Item two', ''].join('\n')
    const ok = await state.applyMarkdownDocumentToGraph('apply-test.md', markdown, { force: true })
    if (!ok) {
      throw new Error('expected applyMarkdownDocumentToGraph to succeed for plain markdown')
    }

    const afterGraph = useGraphStore.getState().graphData
    if (!afterGraph || typeof afterGraph !== 'object') {
      throw new Error('expected graphData after markdown Apply')
    }

    const nodes = Array.isArray((afterGraph as { nodes?: unknown[] }).nodes)
      ? ((afterGraph as { nodes?: unknown[] }).nodes as unknown[])
      : []
    if (nodes.length === 0) {
      throw new Error('expected markdown Apply to produce at least one node')
    }

    const jsonText = JSON.stringify(afterGraph, null, 2)
    if (!jsonText.includes('"nodes"') || !jsonText.includes('"edges"')) {
      throw new Error('expected markdown Apply graph JSON to include nodes and edges')
    }
  } finally {
    state.setFrontmatterModeEnabled(prevFrontmatterModeEnabled)
  }
}
