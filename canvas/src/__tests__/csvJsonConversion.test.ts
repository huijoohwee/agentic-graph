import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryWorkspaceFs } from '@/features/workspace-fs/workspaceFsMemory'
import { resetWorkspaceFsForTests } from '@/features/workspace-fs/workspaceFs'
import { resolveWorkspaceSourcePathKey } from '@/features/workspace-fs/syncToSourceFiles'
import { workspaceDocumentKey } from '@/features/workspace-fs/path'
import { applyWorkspaceImportToCanvas } from '@/features/workspace-fs/applyWorkspaceImportToCanvas'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { importWorkspaceLocalFiles, importWorkspaceUrl } from '@/features/markdown-workspace/workspaceImport'
import { activateFirstImportedWorkspaceFile } from '@/features/markdown-workspace/useWorkspaceFileActions/importRuntimeActions'
import { MarkdownWorkspaceMain } from '@/features/markdown-workspace/main/MarkdownWorkspaceMain'
import {
  exportCsvJsonWorkspaceDataFile,
  resolveCsvJsonWorkspaceExportArtifact,
} from '@/features/markdown-workspace/main/exports/exportCsvJsonDataFile'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import { WORKSPACE_IMPORT_DEFER_LOCAL_FILE_BYTES } from '@/lib/config'
import { generateDelimitedText, parseDelimitedText, parseDelimitedTextAsync } from '@/lib/delimited-text/delimitedText'
import { parseDelimitedTextWithWorkerFallback } from '@/lib/delimited-text/delimitedTextWorkerBridge'
import type { MonacoTextEditorHandle } from '@/features/monaco/MonacoTextEditor'
import { MARKDOWN_DATA_VIEW_TABLE_INITIAL_RENDER_ROW_LIMIT } from '@/features/markdown/ui/MarkdownDataViewTableView'

const EXTERNAL_VALIDATION_CSV_PATH_ENV = 'AGENTICGRAPH_TEST_VALIDATION_CSV_IMPORT_PATH'

const createFile = (name: string, text: string, type = 'text/plain') => {
  const blob = new Blob([text], { type })
  return new File([blob], name, { type })
}

const tick = async () => {
  await new Promise<void>(resolve => setTimeout(resolve, 0))
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  !!value && typeof value === 'object' && !Array.isArray(value)
)

function readExternalValidationCsvPath(): string {
  return String(process.env[EXTERNAL_VALIDATION_CSV_PATH_ENV] || '').trim()
}

function collectTextFilesForHardcodeGuard(path: string, out: string[] = []): string[] {
  if (!existsSync(path)) return out
  const stat = statSync(path)
  if (stat.isFile()) {
    if (/\.(?:cjs|css|html|js|json|jsx|md|mjs|ts|tsx)$/i.test(path)) out.push(path)
    return out
  }
  if (!stat.isDirectory()) return out
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === 'build') continue
    collectTextFilesForHardcodeGuard(resolve(path, entry.name), out)
  }
  return out
}

function readJsonSourceDocumentForPath(result: { jsonSourceDocuments?: Array<{ path: string; text: string }> }, path: string): string {
  return String((result.jsonSourceDocuments || []).find(item => String(item?.path || '') === path)?.text || '')
}

async function expectCsvJsonWorkspaceExport(args: {
  activeDocumentKey: string
  activeText: string
  targetFormat: 'json' | 'csv'
  expectedName: string
  expectedText: string
  jsonSourceText?: string | null
}) {
  const exported = await resolveCsvJsonWorkspaceExportArtifact({
    activeDocumentKey: args.activeDocumentKey,
    activeText: args.activeText,
    targetFormat: args.targetFormat,
    jsonSourceText: args.jsonSourceText,
  })
  if (!exported) throw new Error(`expected ${args.targetFormat} export artifact for ${args.activeDocumentKey}`)
  if (exported.name !== args.expectedName) {
    throw new Error(`expected ${args.targetFormat} export name ${args.expectedName}, got ${exported.name}`)
  }
  if (exported.text !== args.expectedText) {
    throw new Error(`expected exact ${args.targetFormat} export fidelity for ${args.activeDocumentKey}`)
  }
}

export function testCsvJsonConversionNativeParserHandlesQuotedMalformedAndFormulaCells() {
  const parsed = parseDelimitedText('name,note\nAda,"hello,\nworld"\nGrace,"quote ""inside"""\n', {
    header: true,
  })
  if (parsed.metadata.parserOwner !== 'agenticgraph-native-delimited-text') {
    throw new Error(`expected native parser owner, got ${parsed.metadata.parserOwner}`)
  }
  if (parsed.rows.length !== 2) throw new Error(`expected 2 rows, got ${parsed.rows.length}`)
  if (parsed.rows[0][1] !== 'hello,\nworld') {
    throw new Error(`expected embedded newline cell to survive, got ${JSON.stringify(parsed.rows[0][1])}`)
  }
  if (parsed.rows[1][1] !== 'quote "inside"') {
    throw new Error(`expected escaped quotes to survive, got ${JSON.stringify(parsed.rows[1][1])}`)
  }

  const malformed = parseDelimitedText('name,note\nAda,"unterminated\n', { header: true })
  if (!malformed.diagnostics.some(item => item.code === 'unclosed-quote' && item.severity === 'error')) {
    throw new Error(`expected unclosed quote diagnostic, got ${JSON.stringify(malformed.diagnostics)}`)
  }

  const csv = generateDelimitedText([['Ada', '=1+1', { nested: true }]], {
    fields: ['name', 'calc', 'payload'],
    escapeFormulaCells: true,
  })
  if (!csv.includes("Ada,'=1+1")) throw new Error(`expected formula cell to be escaped, got ${csv}`)
  if (!csv.includes('"{""nested"":true}"')) throw new Error(`expected object cell to be JSON encoded and quoted, got ${csv}`)
}

export async function testCsvJsonConversionChunkProgressAndAbortAreBounded() {
  let progressCalls = 0
  const parsed = await parseDelimitedTextAsync(`name,score\n${'Ada,10\n'.repeat(80)}`, {
    header: true,
    chunkSizeChars: 32,
    onProgress: () => {
      progressCalls += 1
    },
  })
  if (parsed.rows.length !== 80) throw new Error(`expected chunked parse rows, got ${parsed.rows.length}`)
  if (progressCalls < 2) throw new Error(`expected multiple chunk progress calls, got ${progressCalls}`)

  const controller = new AbortController()
  const aborted = await parseDelimitedTextAsync(`name,score\n${'Ada,10\n'.repeat(80)}`, {
    header: true,
    chunkSizeChars: 32,
    signal: controller.signal,
    onProgress: () => controller.abort(),
  })
  if (aborted.metadata.aborted !== true) {
    throw new Error(`expected aborted parser metadata, got ${JSON.stringify(aborted.metadata)}`)
  }

  const bridged = await parseDelimitedTextWithWorkerFallback('name,score\nAda,10\n', { header: true })
  if (bridged.rows[0]?.[0] !== 'Ada') {
    throw new Error(`expected worker bridge fallback to parse rows, got ${JSON.stringify(bridged.rows)}`)
  }
}

export async function testWorkspaceLocalCsvImportShowsJsonPanePreviewWithoutSeparateJsonFile() {
  const fs = createMemoryWorkspaceFs()
  await fs.ensureSeed()
  const csv = 'name,note\nAda,"hello,\nworld"\nGrace,"quote ""inside"""\n'
  const result = await importWorkspaceLocalFiles({
    fs,
    files: [createFile('people.csv', csv, 'text/csv')],
    parentPath: '/',
  })
  if (!result.createdPaths.includes('/people.csv')) throw new Error(`expected source path, got ${result.createdPaths.join(', ')}`)
  if (result.createdPaths.some(path => path !== '/people.csv' && /\.json$/i.test(path))) {
    throw new Error(`expected CSV import to avoid separate JSON workspace files, got ${result.createdPaths.join(', ')}`)
  }

  const text = readJsonSourceDocumentForPath(result, '/people.csv')
  if (!text) throw new Error(`expected CSV import to expose source-attached JSON pane text, got ${JSON.stringify(result.jsonSourceDocuments)}`)
  const parsed = JSON.parse(text) as {
    rows?: Array<Record<string, string>>
    metadata?: { parserOwner?: string; delimiter?: string; fieldNames?: string[] }
  }
  if (parsed.metadata?.parserOwner !== 'agenticgraph-native-delimited-text') {
    throw new Error(`expected native metadata, got ${JSON.stringify(parsed.metadata)}`)
  }
  if (parsed.metadata?.delimiter !== ',') throw new Error(`expected comma delimiter metadata, got ${JSON.stringify(parsed.metadata)}`)
  if (!Array.isArray(parsed.rows) || parsed.rows.length !== 2) throw new Error(`expected two JSON rows, got ${JSON.stringify(parsed.rows)}`)
  if (parsed.rows[0]?.note !== 'hello,\nworld') throw new Error(`expected quoted newline value, got ${JSON.stringify(parsed.rows[0])}`)
}

export async function testWorkspaceLargeLocalCsvImportsImmediatelyAndExposesJsonPanePreview() {
  const fs = createMemoryWorkspaceFs()
  await fs.ensureSeed()
  const largeCell = 'x'.repeat(WORKSPACE_IMPORT_DEFER_LOCAL_FILE_BYTES + 32)
  const csv = `name,note\nAda,${largeCell}\n`
  const result = await importWorkspaceLocalFiles({
    fs,
    files: [createFile('large.csv', csv, 'text/csv')],
    parentPath: '/',
  })
  if (!result.createdPaths.includes('/large.csv')) throw new Error(`expected large CSV source path, got ${result.createdPaths.join(', ')}`)
  if (result.createdPaths.some(path => path !== '/large.csv' && /\.json$/i.test(path))) {
    throw new Error(`expected large CSV import to avoid separate JSON workspace files, got ${result.createdPaths.join(', ')}`)
  }
  const source = String((await fs.readFileText('/large.csv')) || '')
  if (source !== csv) throw new Error('expected large CSV source to import immediately instead of writing a pending stub')
  const json = JSON.parse(readJsonSourceDocumentForPath(result, '/large.csv') || '{}') as { rows?: Array<Record<string, string>> }
  if (json.rows?.[0]?.note?.length !== largeCell.length) throw new Error('expected large CSV cell to be preserved in derived JSON')
}

export async function testWorkspaceExternalValidationCsvImportShowsJsonPanePreviewAndRunsCanvasPipeline() {
  const validationCsvPath = readExternalValidationCsvPath()
  if (!validationCsvPath) return

  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  let root: ReturnType<typeof createRoot> | null = null
  try {
    resetWorkspaceFsForTests()
    const fs = createMemoryWorkspaceFs()
    await fs.ensureSeed()
    const store = useGraphStore.getState()
    store.resetAll()

    const csvText = readFileSync(validationCsvPath, 'utf8')
    if (csvText.length < 100_000) {
      throw new Error('expected external CSV validation fixture to exercise large-file import behavior')
    }
    const csvName = basename(validationCsvPath)
    if (!/\.csv$/i.test(csvName)) throw new Error('expected external validation fixture to be a CSV file')

    const result = await importWorkspaceLocalFiles({
      fs,
      files: [createFile(csvName, csvText, 'text/csv')],
      parentPath: '/',
    })
    const sourcePath = result.createdPaths.find(path => /\.csv$/i.test(path) && !/\.conversion\.csv$/i.test(path)) || ''
    if (!sourcePath) throw new Error(`expected source CSV workspace path, got ${result.createdPaths.join(', ')}`)
    if (result.createdPaths.some(path => path !== sourcePath && /\.json$/i.test(path))) {
      throw new Error(`expected external CSV import to avoid separate JSON workspace files, got ${result.createdPaths.join(', ')}`)
    }
    if (String((await fs.readFileText(sourcePath)) || '') !== csvText) {
      throw new Error('expected imported source CSV text to be preserved exactly')
    }

    const derivedJsonText = readJsonSourceDocumentForPath(result, sourcePath)
    if (!derivedJsonText) throw new Error(`expected external CSV import to expose source-attached JSON pane text, got ${JSON.stringify(result.jsonSourceDocuments)}`)
    const derived = JSON.parse(derivedJsonText) as unknown
    if (!isRecord(derived)) throw new Error('expected derived CSV JSON artifact to parse to an object')
    const metadata = isRecord(derived.metadata) ? derived.metadata : {}
    const rows = Array.isArray(derived.rows) ? derived.rows : []
    const fieldNames = Array.isArray(metadata.fieldNames) ? metadata.fieldNames.map(String).filter(Boolean) : []
    if (rows.length < 50) throw new Error(`expected external CSV to produce many logical JSON rows, got ${rows.length}`)
    if (Number(metadata.rowCount) !== rows.length) {
      throw new Error(`expected derived JSON rowCount metadata to match rows, got ${String(metadata.rowCount)} vs ${rows.length}`)
    }
    if (metadata.parserOwner !== 'agenticgraph-native-delimited-text') {
      throw new Error(`expected native parser metadata, got ${String(metadata.parserOwner || '')}`)
    }
    if (metadata.sourcePath !== sourcePath) {
      throw new Error(`expected derived JSON metadata sourcePath ${sourcePath}, got ${String(metadata.sourcePath || '')}`)
    }
    const diagnosticsSummary = isRecord(metadata.diagnosticsSummary) ? metadata.diagnosticsSummary : {}
    if (Number(diagnosticsSummary.errors || 0) !== 0) {
      throw new Error(`expected external CSV conversion without fatal diagnostics, got ${JSON.stringify(diagnosticsSummary)}`)
    }
    if (fieldNames.length < 3) {
      throw new Error(`expected multiple CSV fields in metadata, got ${JSON.stringify(fieldNames)}`)
    }
    const firstRecord = rows.find(isRecord)
    if (!firstRecord) throw new Error('expected at least one derived JSON row object')
    const populatedFieldCount = fieldNames.filter(field => String(firstRecord[field] ?? '').trim()).length
    if (populatedFieldCount < Math.min(3, fieldNames.length)) {
      throw new Error(`expected first derived JSON row to retain populated CSV columns, got ${JSON.stringify(firstRecord)}`)
    }

    const applied = await applyWorkspaceImportToCanvas({
      fs,
      createdPaths: result.createdPaths,
      opts: { applyToGraph: true, skipComposedGraphApply: true },
    })
    if (!applied.sourceFilesUpdated) throw new Error('expected canvas import owner to update Source Files')
    const sourceFileKey = resolveWorkspaceSourcePathKey(sourcePath)
    const sourceFile = useGraphStore.getState().sourceFiles.find(file => String(file.source?.path || '') === sourceFileKey)
    if (!sourceFile) throw new Error(`expected source CSV to be present in Source Files as ${sourceFileKey}`)
    if (sourceFile.enabled !== true) throw new Error('expected source CSV Source File to be enabled for the canvas pipeline')
    if (String(sourceFile.text || '') !== csvText) throw new Error('expected source CSV Source File text to match workspace artifact')

    await activateFirstImportedWorkspaceFile({
      fs,
      createdPaths: result.createdPaths,
      applyToGraph: true,
      jsonSourceDocuments: result.jsonSourceDocuments,
    })
    const active = useGraphStore.getState()
    const explorer = useMarkdownExplorerStore.getState()
    const expectedDocumentName = workspaceDocumentKey(sourcePath)
    if (String(explorer.activePath || '') !== sourcePath) {
      throw new Error(`expected Editor Workspace explorer to focus source CSV ${sourcePath}, got ${String(explorer.activePath || '')}`)
    }
    if (active.markdownDocumentName !== expectedDocumentName) {
      throw new Error(`expected active Editor Workspace document ${expectedDocumentName}, got ${String(active.markdownDocumentName || '')}`)
    }
    if (active.markdownDocumentText !== csvText) {
      throw new Error('expected active Editor Workspace text to remain the source CSV')
    }
    if (active.jsonSourceDocumentName !== expectedDocumentName) {
      throw new Error(`expected active JSON pane source document ${expectedDocumentName}, got ${String(active.jsonSourceDocumentName || '')}`)
    }
    if (active.jsonSourceDocumentText !== derivedJsonText) {
      throw new Error('expected active JSON pane text to be the converted JSON preview')
    }

    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')
    const editorRef = { current: null as MonacoTextEditorHandle | null }
    root = createRoot(container)
    await act(async () => {
      root.render(React.createElement(MarkdownWorkspaceMain, {
        themeMode: 'light',
        uiPanelTextFontClass: 'font-sans',
        uiPanelMonospaceTextClass: 'font-mono text-xs',
        explorerOpen: true,
        setExplorerOpen: () => void 0,
        layoutMode: 'editor',
        setLayoutMode: () => void 0,
        markdownWordWrap: true,
        setMarkdownWordWrap: () => void 0,
        markdownTextHighlight: false,
        setMarkdownTextHighlight: () => void 0,
        onToggleFullscreen: () => void 0,
        presentationApiRef: { current: null },
        isMarkdown: false,
        activeText: csvText,
        setActiveText: () => void 0,
        jsonSourceText: derivedJsonText,
        activeDocumentKey: sourcePath,
        highlightedLineRange: { start: null, end: null },
        revealLineInEditor: () => void 0,
        showInViewer: () => void 0,
        showInPresentation: () => void 0,
        showInGallery: () => void 0,
        editorUri: `file://${sourcePath}`,
        editorLanguage: 'csv',
        editorRef,
        onEditorCaretLine: () => void 0,
      }))
      await tick()
      await tick()
      await tick()
      await tick()
    })
    await act(async () => {
      await tick()
      await tick()
    })
    const legacyMultiDimToggle = dom.window.document.querySelector('input[aria-label="Show Multi-dimensional Table"]')
    if (legacyMultiDimToggle) throw new Error('expected external CSV validation import to remove the legacy Multi-dimensional Table pane toggle')
    const viewerToggle = dom.window.document.querySelector('input[aria-label="Show Viewer preview pane"]') as HTMLInputElement | null
    if (!viewerToggle?.checked) throw new Error('expected external CSV validation import to check the Viewer pane toggle')
    const dataView = dom.window.document.querySelector('section[aria-label="Workspace data view"]')
    if (!dataView) throw new Error('expected external CSV validation import to render the Viewer data view')
    const dataViewText = String(dataView.textContent || '')
    if (dataViewText.includes('No eligible Markdown tables found.')) {
      throw new Error('expected external CSV validation import to render rows instead of the empty table fallback')
    }
    const expectedHeader = fieldNames.find(field => field.trim()) || ''
    if (expectedHeader && !dataViewText.includes(expectedHeader)) {
      throw new Error(`expected external CSV Viewer data view to render header ${expectedHeader}, got ${dataViewText.slice(0, 240)}`)
    }
    const expectedValue = expectedHeader ? String(firstRecord[expectedHeader] ?? '').trim() : ''
    if (expectedValue && !dataViewText.includes(expectedValue.slice(0, 80))) {
      throw new Error(`expected external CSV Viewer data view to render first-row value ${expectedValue.slice(0, 80)}, got ${dataViewText.slice(0, 240)}`)
    }

    const markdownToggle = dom.window.document.querySelector('input[aria-label="Show Markdown editor pane"]') as HTMLInputElement | null
    if (!markdownToggle) throw new Error('expected Markdown pane toggle to exist for external CSV validation import')
    await act(async () => {
      markdownToggle.click()
      await tick()
      await tick()
      await tick()
    })
    const markdownEditor = dom.window.document.querySelector('textarea[aria-label="Markdown Editor Text"]') as HTMLTextAreaElement | null
    if (!markdownEditor) throw new Error('expected external CSV validation import to mount the Markdown pane after toggle')
    const markdownText = String(markdownEditor.value || '')
    if (!markdownText.trim().startsWith('|')) {
      throw new Error(`expected external CSV Markdown pane to render pipe-table syntax, got ${markdownText.slice(0, 120)}`)
    }
    if (markdownText.startsWith(csvText.slice(0, 120))) {
      throw new Error('expected external CSV Markdown pane not to render raw comma-delimited source text')
    }
    if (expectedHeader && !markdownText.includes(`| ${expectedHeader}`) && !markdownText.includes(`${expectedHeader} |`)) {
      throw new Error(`expected external CSV Markdown pane to include pipe-table header ${expectedHeader}`)
    }
  } finally {
    if (root) {
      await act(async () => {
        root?.unmount()
        root = null
        await tick()
        await tick()
        await tick()
      })
    }
    restore()
  }
}

export async function testMarkdownWorkspaceCsvImportUsesViewerPaneWithoutJsonDocument() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  let root: ReturnType<typeof createRoot> | null = null
  try {
    useGraphStore.getState().resetAll()
    useGraphStore.getState().setWorkspaceViewState({ mode: 'editor', paneOpen: true })
    const csvText = 'name,score\nAda,10\nGrace,11\n'
    const jsonText = JSON.stringify({
      rows: [
        { name: 'Ada', score: '10' },
        { name: 'Grace', score: '11' },
      ],
      metadata: {
        sourcePath: '/people.csv',
        targetFormat: 'json',
        parserOwner: 'agenticgraph-native-delimited-text',
      },
    }, null, 2)
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')
    const editorRef = { current: null as MonacoTextEditorHandle | null }
    root = createRoot(container)
    await act(async () => {
      root.render(React.createElement(MarkdownWorkspaceMain, {
        themeMode: 'light',
        uiPanelTextFontClass: 'font-sans',
        uiPanelMonospaceTextClass: 'font-mono text-xs',
        explorerOpen: true,
        setExplorerOpen: () => void 0,
        layoutMode: 'editor',
        setLayoutMode: () => void 0,
        markdownWordWrap: true,
        setMarkdownWordWrap: () => void 0,
        markdownTextHighlight: false,
        setMarkdownTextHighlight: () => void 0,
        onToggleFullscreen: () => void 0,
        presentationApiRef: { current: null },
        isMarkdown: false,
        activeText: csvText,
        setActiveText: () => void 0,
        jsonSourceText: jsonText,
        activeDocumentKey: 'people.csv',
        highlightedLineRange: { start: null, end: null },
        revealLineInEditor: () => void 0,
        showInViewer: () => void 0,
        showInPresentation: () => void 0,
        showInGallery: () => void 0,
        editorUri: 'file:///people.csv',
        editorLanguage: 'csv',
        editorRef,
        onEditorCaretLine: () => void 0,
      }))
      await tick()
      await tick()
      await tick()
      await tick()
    })
    await act(async () => {
      await tick()
      await tick()
    })
    const legacyMultiDimToggle = dom.window.document.querySelector('input[aria-label="Show Multi-dimensional Table"]')
    if (legacyMultiDimToggle) throw new Error('expected CSV import to remove the legacy Multi-dimensional Table pane toggle')
    const viewerToggle = dom.window.document.querySelector('input[aria-label="Show Viewer preview pane"]') as HTMLInputElement | null
    if (!viewerToggle?.checked) throw new Error('expected CSV import to check the Viewer pane toggle')
    const jsonToggle = dom.window.document.querySelector('input[aria-label="Show JSON editor pane"]') as HTMLInputElement | null
    if (jsonToggle?.checked) throw new Error('expected CSV import to keep the JSON pane opt-in')
    const jsonEditor = dom.window.document.querySelector('textarea[aria-label="JSON Editor Text"]') as HTMLTextAreaElement | null
    if (jsonEditor) throw new Error('expected CSV import not to mount a separate JSON editor pane by default')
    const dataView = dom.window.document.querySelector('section[aria-label="Workspace data view"]')
    if (!dataView) throw new Error('expected CSV import to render the Viewer data view')
    if (!String(dataView.textContent || '').includes('Ada')) {
      throw new Error(`expected Viewer data view to render source-attached CSV rows, got ${String(dataView.textContent || '')}`)
    }
    const markdownEditor = dom.window.document.querySelector('textarea[aria-label="Markdown Editor Text"]') as HTMLTextAreaElement | null
    if (markdownEditor) {
      throw new Error('expected CSV import to keep the Markdown pane opt-in by default')
    }
  } finally {
    if (root) {
      await act(async () => {
        root?.unmount()
        root = null
        await tick()
        await tick()
        await tick()
      })
    }
    useGraphStore.getState().resetAll()
    restore()
  }
}

export async function testMarkdownWorkspaceCsvRefreshProjectsJsonAndMarkdownPanesFromSourceText() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  let root: ReturnType<typeof createRoot> | null = null
  try {
    useGraphStore.getState().resetAll()
    useGraphStore.getState().setWorkspaceViewState({ mode: 'editor', paneOpen: true })
    const csvText = 'name,score,note\nAda,10,"hello, world"\nGrace,11,"compiler"\n'
    const setActiveTextCalls: string[] = []
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')
    const editorRef = { current: null as MonacoTextEditorHandle | null }
    root = createRoot(container)
    await act(async () => {
      root.render(React.createElement(MarkdownWorkspaceMain, {
        themeMode: 'light',
        uiPanelTextFontClass: 'font-sans',
        uiPanelMonospaceTextClass: 'font-mono text-xs',
        explorerOpen: true,
        setExplorerOpen: () => void 0,
        layoutMode: 'editor',
        setLayoutMode: () => void 0,
        markdownWordWrap: true,
        setMarkdownWordWrap: () => void 0,
        markdownTextHighlight: false,
        setMarkdownTextHighlight: () => void 0,
        onToggleFullscreen: () => void 0,
        presentationApiRef: { current: null },
        isMarkdown: false,
        activeText: csvText,
        setActiveText: next => {
          setActiveTextCalls.push(next)
        },
        jsonSourceText: null,
        activeDocumentKey: 'people.csv',
        highlightedLineRange: { start: null, end: null },
        revealLineInEditor: () => void 0,
        showInViewer: () => void 0,
        showInPresentation: () => void 0,
        showInGallery: () => void 0,
        editorUri: 'file:///people.csv',
        editorLanguage: 'csv',
        editorRef,
        onEditorCaretLine: () => void 0,
      }))
      await tick()
      await tick()
      await tick()
      await tick()
    })

    const jsonToggle = dom.window.document.querySelector('input[aria-label="Show JSON editor pane"]') as HTMLInputElement | null
    if (!jsonToggle) throw new Error('expected JSON pane toggle to exist for refreshed CSV source')
    const markdownToggle = dom.window.document.querySelector('input[aria-label="Show Markdown editor pane"]') as HTMLInputElement | null
    if (!markdownToggle) throw new Error('expected Markdown pane toggle to exist for refreshed CSV source')
    await act(async () => {
      jsonToggle.click()
      markdownToggle.click()
      await tick()
      await tick()
      await tick()
    })

    const jsonEditor = dom.window.document.querySelector('textarea[aria-label="JSON Editor Text"]') as HTMLTextAreaElement | null
    if (!jsonEditor) throw new Error('expected refreshed CSV source to mount JSON pane after toggle')
    const jsonText = String(jsonEditor.value || '')
    if (jsonText.startsWith('name,score,note')) {
      throw new Error('expected refreshed CSV JSON pane not to render raw comma-delimited source text')
    }
    const parsed = JSON.parse(jsonText) as { rows?: Array<Record<string, string>>; metadata?: { parserOwner?: string; fieldNames?: string[] } }
    if (parsed.metadata?.parserOwner !== 'agenticgraph-native-delimited-text') {
      throw new Error(`expected refreshed CSV JSON pane to use native parser metadata, got ${JSON.stringify(parsed.metadata)}`)
    }
    if (parsed.rows?.[0]?.name !== 'Ada' || parsed.rows?.[1]?.score !== '11') {
      throw new Error(`expected refreshed CSV JSON pane to project rows from source text, got ${JSON.stringify(parsed.rows)}`)
    }

    const markdownEditor = dom.window.document.querySelector('textarea[aria-label="Markdown Editor Text"]') as HTMLTextAreaElement | null
    if (!markdownEditor) throw new Error('expected refreshed CSV source to mount Markdown pane after toggle')
    const markdownText = String(markdownEditor.value || '')
    if (!markdownText.startsWith('| name | score | note |')) {
      throw new Error(`expected refreshed CSV Markdown pane to render pipe-table syntax, got ${markdownText.slice(0, 160)}`)
    }
    if (markdownText.startsWith('name,score,note')) {
      throw new Error('expected refreshed CSV Markdown pane not to render raw comma-delimited source text')
    }
    if (!markdownText.includes('| Grace | 11 | compiler |')) {
      throw new Error(`expected refreshed CSV Markdown pane to include CSV rows as pipe table, got ${markdownText.slice(0, 240)}`)
    }
    if (setActiveTextCalls.length > 0) {
      throw new Error(`expected pane projection toggles not to mutate active CSV source text, got ${setActiveTextCalls.length} writes`)
    }
  } finally {
    if (root) {
      await act(async () => {
        root?.unmount()
        root = null
        await tick()
        await tick()
        await tick()
      })
    }
    useGraphStore.getState().resetAll()
    restore()
  }
}

export async function testMarkdownWorkspaceLargeCsvJsonPreviewRendersViewerPane() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  let root: ReturnType<typeof createRoot> | null = null
  try {
    useGraphStore.getState().resetAll()
    useGraphStore.getState().setWorkspaceViewState({ mode: 'editor', paneOpen: true })
    const rows = Array.from({ length: 720 }).map((_, index) => ({
      company: `Company ${index}`,
      location: index % 2 === 0 ? 'Singapore' : 'San Francisco',
      launch: `Recent launch ${index} ${'details '.repeat(64)}`,
    }))
    const csvText = `company,location,launch\n${rows.map(row => `${row.company},${row.location},${row.launch}`).join('\n')}\n`
    const jsonText = JSON.stringify({
      rows,
      metadata: {
        sourcePath: '/large.csv',
        direction: 'delimited-to-json',
        targetFormat: 'json',
        parserOwner: 'agenticgraph-native-delimited-text',
        rowCount: rows.length,
        fieldNames: ['company', 'location', 'launch'],
      },
      diagnostics: [],
      conversion: {
        direction: 'delimited-to-json',
        sourcePath: '/large.csv',
        sourceFormat: 'csv',
        targetFormat: 'json',
      },
    }, null, 2)
    if (jsonText.length <= 320_000) {
      throw new Error(`expected large source-attached JSON preview to exceed Markdown table scan limit, got ${jsonText.length}`)
    }
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')
    const editorRef = { current: null as MonacoTextEditorHandle | null }
    root = createRoot(container)
    await act(async () => {
      root.render(React.createElement(MarkdownWorkspaceMain, {
        themeMode: 'light',
        uiPanelTextFontClass: 'font-sans',
        uiPanelMonospaceTextClass: 'font-mono text-xs',
        explorerOpen: true,
        setExplorerOpen: () => void 0,
        layoutMode: 'editor',
        setLayoutMode: () => void 0,
        markdownWordWrap: true,
        setMarkdownWordWrap: () => void 0,
        markdownTextHighlight: false,
        setMarkdownTextHighlight: () => void 0,
        onToggleFullscreen: () => void 0,
        presentationApiRef: { current: null },
        isMarkdown: false,
        activeText: csvText,
        setActiveText: () => void 0,
        jsonSourceText: jsonText,
        activeDocumentKey: 'large.csv',
        highlightedLineRange: { start: null, end: null },
        revealLineInEditor: () => void 0,
        showInViewer: () => void 0,
        showInPresentation: () => void 0,
        showInGallery: () => void 0,
        editorUri: 'file:///large.csv',
        editorLanguage: 'csv',
        editorRef,
        onEditorCaretLine: () => void 0,
      }))
      await tick()
      await tick()
      await tick()
      await tick()
    })
    await act(async () => {
      await tick()
      await tick()
    })
    const legacyMultiDimToggle = dom.window.document.querySelector('input[aria-label="Show Multi-dimensional Table"]')
    if (legacyMultiDimToggle) throw new Error('expected large CSV import to remove the legacy Multi-dimensional Table pane toggle')
    const viewerToggle = dom.window.document.querySelector('input[aria-label="Show Viewer preview pane"]') as HTMLInputElement | null
    if (!viewerToggle?.checked) throw new Error('expected large CSV import to check the Viewer pane toggle')
    const dataView = dom.window.document.querySelector('section[aria-label="Workspace data view"]')
    if (!dataView) throw new Error('expected large CSV import to render the Viewer data view')
    const text = String(dataView.textContent || '')
    if (text.includes('No eligible Markdown tables found.')) {
      throw new Error('expected large source-attached CSV JSON preview to bypass Markdown table scan fallback')
    }
    const initiallyHiddenCompany = `Company ${MARKDOWN_DATA_VIEW_TABLE_INITIAL_RENDER_ROW_LIMIT + 10}`
    if (!text.includes('Company 0') || !text.includes('San Francisco')) {
      throw new Error(`expected large Viewer data view to render CSV rows, got ${text.slice(0, 240)}`)
    }
    if (text.includes(initiallyHiddenCompany)) {
      throw new Error('expected large Viewer data view to defer rows beyond the initial row window')
    }
    let showMoreRowsButton: HTMLButtonElement | null = null
    for (const button of Array.from(dataView.querySelectorAll('button')) as HTMLButtonElement[]) {
      if (String(button.textContent || '').includes('more rows')) {
        showMoreRowsButton = button
        break
      }
    }
    if (!showMoreRowsButton) throw new Error('expected large Viewer data view to expose progressive row rendering control')
    await act(async () => {
      showMoreRowsButton.click()
      await tick()
      await tick()
      await tick()
    })
    const expandedText = String(dataView.textContent || '')
    if (!expandedText.includes(initiallyHiddenCompany)) {
      throw new Error(`expected large Viewer data view to render deferred CSV rows after request, got ${expandedText.slice(0, 240)}`)
    }

    const markdownToggle = dom.window.document.querySelector('input[aria-label="Show Markdown editor pane"]') as HTMLInputElement | null
    if (!markdownToggle) throw new Error('expected Markdown pane toggle to exist for large CSV import')
    await act(async () => {
      markdownToggle.click()
      await tick()
      await tick()
      await tick()
    })
    const markdownEditor = dom.window.document.querySelector('textarea[aria-label="Markdown Editor Text"]') as HTMLTextAreaElement | null
    if (!markdownEditor) throw new Error('expected large CSV import to mount the Markdown pane after toggle')
    const markdownText = String(markdownEditor.value || '')
    if (!markdownText.startsWith('| company | location | launch |')) {
      throw new Error(`expected large CSV Markdown pane to render pipe-table syntax, got ${markdownText.slice(0, 160)}`)
    }
    if (markdownText.startsWith('company,location,launch')) {
      throw new Error('expected large CSV Markdown pane not to render raw comma-delimited source text')
    }
    if (!markdownText.includes('| Company 42 | Singapore | Recent launch 42')) {
      throw new Error(`expected large CSV Markdown pane to include CSV rows as pipe table, got ${markdownText.slice(0, 240)}`)
    }
  } finally {
    if (root) {
      await act(async () => {
        root?.unmount()
        root = null
        await tick()
        await tick()
        await tick()
      })
    }
    useGraphStore.getState().resetAll()
    restore()
  }
}

export async function testWorkspaceLocalJsonImportWritesFormulaSafeCsv() {
  const fs = createMemoryWorkspaceFs()
  await fs.ensureSeed()
  const json = JSON.stringify([
    { name: 'Ada', calc: '=1+1', payload: { nested: true } },
    { name: 'Grace', calc: '@cmd', payload: ['compiler'] },
  ], null, 2)
  const result = await importWorkspaceLocalFiles({
    fs,
    files: [createFile('rows.json', `${json}\n`, 'application/json')],
    parentPath: '/',
  })
  if (!result.createdPaths.includes('/rows.json')) throw new Error(`expected source JSON path, got ${result.createdPaths.join(', ')}`)
  if (!result.createdPaths.includes('/rows.csv')) throw new Error(`expected derived CSV path, got ${result.createdPaths.join(', ')}`)
  const csv = String((await fs.readFileText('/rows.csv')) || '')
  if (!csv.startsWith('name,calc,payload')) throw new Error(`expected CSV header, got ${csv}`)
  if (!csv.includes("Ada,'=1+1")) throw new Error(`expected equals formula escape, got ${csv}`)
  if (!csv.includes("Grace,'@cmd")) throw new Error(`expected at-sign formula escape, got ${csv}`)
  if (!csv.includes('"{""nested"":true}"')) throw new Error(`expected nested object cell to be JSON text, got ${csv}`)
  const metadata = JSON.parse(String((await fs.readFileText('/rows.conversion.json')) || '{}')) as {
    metadata?: { safety?: { formulaEscaping?: boolean }; parserOwner?: string }
  }
  if (metadata.metadata?.parserOwner !== 'native-json') throw new Error(`expected native JSON metadata, got ${JSON.stringify(metadata)}`)
  if (metadata.metadata?.safety?.formulaEscaping !== true) throw new Error(`expected formula safety metadata, got ${JSON.stringify(metadata)}`)
}

export async function testWorkspaceLocalCsvAndJsonImportExportFidelity() {
  const fs = createMemoryWorkspaceFs()
  await fs.ensureSeed()

  const csvText = 'name,note\nAda,"hello,\nworld"\nGrace,"quote ""inside"""\n'
  const csvResult = await importWorkspaceLocalFiles({
    fs,
    files: [createFile('people.csv', csvText, 'text/csv')],
    parentPath: '/',
  })
  const jsonPreview = readJsonSourceDocumentForPath(csvResult, '/people.csv')
  if (!jsonPreview) throw new Error('expected CSV import to expose JSON preview text before export')
  await expectCsvJsonWorkspaceExport({
    activeDocumentKey: '/people.csv',
    activeText: csvText,
    targetFormat: 'csv',
    expectedName: 'people.csv',
    expectedText: csvText,
    jsonSourceText: jsonPreview,
  })
  await expectCsvJsonWorkspaceExport({
    activeDocumentKey: '/people.csv',
    activeText: csvText,
    targetFormat: 'json',
    expectedName: 'people.json',
    expectedText: jsonPreview,
    jsonSourceText: jsonPreview,
  })

  const jsonText = `${JSON.stringify([
    { name: 'Ada', calc: '=1+1', payload: { nested: true } },
    { name: 'Grace', calc: '@cmd', payload: ['compiler'] },
  ], null, 2)}\n`
  const jsonResult = await importWorkspaceLocalFiles({
    fs,
    files: [createFile('rows.json', jsonText, 'application/json')],
    parentPath: '/',
  })
  if (!jsonResult.createdPaths.includes('/rows.json')) throw new Error(`expected JSON source path, got ${jsonResult.createdPaths.join(', ')}`)
  const derivedCsvText = String((await fs.readFileText('/rows.csv')) || '')
  if (!derivedCsvText) throw new Error('expected JSON import to create derived CSV before export')
  await expectCsvJsonWorkspaceExport({
    activeDocumentKey: '/rows.json',
    activeText: jsonText,
    targetFormat: 'json',
    expectedName: 'rows.json',
    expectedText: jsonText,
  })
  await expectCsvJsonWorkspaceExport({
    activeDocumentKey: '/rows.json',
    activeText: jsonText,
    targetFormat: 'csv',
    expectedName: 'rows.csv',
    expectedText: derivedCsvText,
  })
}

export async function testWorkspaceLocalTsvImportUsesSharedDelimitedTextOwner() {
  const fs = createMemoryWorkspaceFs()
  await fs.ensureSeed()
  const result = await importWorkspaceLocalFiles({
    fs,
    files: [createFile('scores.tsv', 'name\tscore\nAda\t10\nGrace\t11\n', 'text/tab-separated-values')],
    parentPath: '/',
  })
  if (!result.createdPaths.includes('/scores.tsv')) throw new Error(`expected TSV source path, got ${result.createdPaths.join(', ')}`)
  if (result.createdPaths.some(path => path !== '/scores.tsv' && /\.json$/i.test(path))) {
    throw new Error(`expected TSV import to avoid separate JSON workspace files, got ${result.createdPaths.join(', ')}`)
  }
  const json = JSON.parse(readJsonSourceDocumentForPath(result, '/scores.tsv') || '{}') as {
    rows?: Array<Record<string, string>>
    metadata?: { delimiter?: string; parserOwner?: string }
  }
  if (json.metadata?.delimiter !== '\t') throw new Error(`expected tab delimiter metadata, got ${JSON.stringify(json.metadata)}`)
  if (json.metadata?.parserOwner !== 'agenticgraph-native-delimited-text') throw new Error(`expected native parser metadata, got ${JSON.stringify(json.metadata)}`)
  if (json.rows?.[1]?.score !== '11') throw new Error(`expected TSV rows to convert, got ${JSON.stringify(json)}`)
}

export async function testWorkspaceUrlCsvImportShowsJsonPanePreviewWithoutSeparateJsonFile() {
  const fs = createMemoryWorkspaceFs()
  const result = await importWorkspaceUrl({
    fs,
    urlRaw: 'https://example.com/data.csv',
    parentPath: '/',
    fetchUrlContent: async () => ({
      normalizedUrl: 'https://example.com/data.csv',
      name: 'data.csv',
      text: 'name,score\nAda,10\nGrace,11\n',
      sourceMimeHint: 'text/csv',
    }),
  })
  if (!result.createdPaths.includes('/data.csv')) throw new Error(`expected URL source CSV path, got ${result.createdPaths.join(', ')}`)
  if (result.createdPaths.some(path => path !== '/data.csv' && /\.json$/i.test(path))) {
    throw new Error(`expected URL CSV import to avoid separate JSON workspace files, got ${result.createdPaths.join(', ')}`)
  }
  const json = JSON.parse(readJsonSourceDocumentForPath(result, '/data.csv') || '{}') as { rows?: Array<Record<string, string>> }
  if (json.rows?.[1]?.name !== 'Grace') throw new Error(`expected derived URL JSON rows, got ${JSON.stringify(json)}`)
  if (!result.sources.some(item => item.path === '/data.csv' && item.source.kind === 'url')) {
    throw new Error(`expected source URL provenance, got ${JSON.stringify(result.sources)}`)
  }
}

export async function testWorkspaceUrlJsonImportWritesFormulaSafeCsv() {
  const fs = createMemoryWorkspaceFs()
  const result = await importWorkspaceUrl({
    fs,
    urlRaw: 'https://example.com/rows.json',
    parentPath: '/',
    fetchUrlContent: async () => ({
      normalizedUrl: 'https://example.com/rows.json',
      name: 'rows.json',
      text: JSON.stringify([{ name: 'Ada', calc: '=1+1' }], null, 2),
      sourceMimeHint: 'application/json',
    }),
  })
  if (!result.createdPaths.includes('/rows.json')) throw new Error(`expected URL source JSON path, got ${result.createdPaths.join(', ')}`)
  if (!result.createdPaths.includes('/rows.csv')) throw new Error(`expected URL derived CSV path, got ${result.createdPaths.join(', ')}`)
  const csv = String((await fs.readFileText('/rows.csv')) || '')
  if (!csv.includes("Ada,'=1+1")) throw new Error(`expected URL JSON-to-CSV formula escaping, got ${csv}`)
  if (!result.sources.some(item => item.path === '/rows.csv' && item.source.kind === 'url')) {
    throw new Error(`expected derived CSV URL provenance, got ${JSON.stringify(result.sources)}`)
  }
}

export async function testWorkspaceUrlCsvAndJsonImportExportFidelity() {
  const fs = createMemoryWorkspaceFs()
  await fs.ensureSeed()

  const csvText = 'name,score\nAda,10\nGrace,11\n'
  const csvResult = await importWorkspaceUrl({
    fs,
    urlRaw: 'https://example.com/data.csv',
    parentPath: '/',
    fetchUrlContent: async () => ({
      normalizedUrl: 'https://example.com/data.csv',
      name: 'data.csv',
      text: csvText,
      sourceMimeHint: 'text/csv',
    }),
  })
  const jsonPreview = readJsonSourceDocumentForPath(csvResult, '/data.csv')
  if (!jsonPreview) throw new Error('expected URL CSV import to expose JSON preview text before export')
  await expectCsvJsonWorkspaceExport({
    activeDocumentKey: '/data.csv',
    activeText: csvText,
    targetFormat: 'csv',
    expectedName: 'data.csv',
    expectedText: csvText,
    jsonSourceText: jsonPreview,
  })
  await expectCsvJsonWorkspaceExport({
    activeDocumentKey: '/data.csv',
    activeText: csvText,
    targetFormat: 'json',
    expectedName: 'data.json',
    expectedText: jsonPreview,
    jsonSourceText: jsonPreview,
  })

  const jsonText = `${JSON.stringify([{ name: 'Ada', calc: '=1+1' }, { name: 'Grace', calc: '@cmd' }], null, 2)}\n`
  const jsonResult = await importWorkspaceUrl({
    fs,
    urlRaw: 'https://example.com/rows.json',
    parentPath: '/',
    fetchUrlContent: async () => ({
      normalizedUrl: 'https://example.com/rows.json',
      name: 'rows.json',
      text: jsonText,
      sourceMimeHint: 'application/json',
    }),
  })
  if (!jsonResult.createdPaths.includes('/rows.json')) throw new Error(`expected URL JSON source path, got ${jsonResult.createdPaths.join(', ')}`)
  const derivedCsvText = String((await fs.readFileText('/rows.csv')) || '')
  if (!derivedCsvText) throw new Error('expected URL JSON import to create derived CSV before export')
  await expectCsvJsonWorkspaceExport({
    activeDocumentKey: '/rows.json',
    activeText: jsonText,
    targetFormat: 'json',
    expectedName: 'rows.json',
    expectedText: jsonText,
  })
  await expectCsvJsonWorkspaceExport({
    activeDocumentKey: '/rows.json',
    activeText: jsonText,
    targetFormat: 'csv',
    expectedName: 'rows.csv',
    expectedText: derivedCsvText,
  })
}

export async function testCsvJsonWorkspaceExportWritesExactPickerBlobText() {
  const { restore, dom } = initJsdomHarness()
  try {
    let suggestedName = ''
    let writtenText = ''
    ;(dom.window as unknown as {
      showSaveFilePicker?: (options: { suggestedName: string }) => Promise<{
        name: string
        createWritable(): Promise<{ write(blob: Blob): Promise<void>; close(): Promise<void> }>
      }>
    }).showSaveFilePicker = async options => {
      suggestedName = options.suggestedName
      return {
        name: suggestedName,
        createWritable: async () => ({
          write: async (blob: Blob) => {
            writtenText = await blob.text()
          },
          close: async () => void 0,
        }),
      }
    }

    const csvText = 'name,score\nAda,10\n'
    const jsonPreviewText = `${JSON.stringify({ rows: [{ name: 'Ada', score: '10' }] }, null, 2)}\n`
    const exported = await exportCsvJsonWorkspaceDataFile({
      activeDocumentKey: '/people.csv',
      activeText: csvText,
      targetFormat: 'json',
      jsonSourceText: jsonPreviewText,
    })
    if (!exported) throw new Error('expected picker-backed CSV JSON export to complete')
    if (suggestedName !== 'people.json') throw new Error(`expected people.json export name, got ${suggestedName}`)
    if (writtenText !== jsonPreviewText) throw new Error('expected picker-backed JSON export to write exact source-attached text')
  } finally {
    restore()
  }
}

export function testCsvJsonConversionNoCopyAndNativeOwnerGuards() {
  const root = process.cwd()
  const packageText = readFileSync(resolve(root, 'package.json'), 'utf8')
  if (/"papaparse"\s*:/.test(packageText)) throw new Error('papaparse must not be added as a canvas dependency')

  const graphCsvText = readFileSync(resolve(root, 'src', 'lib', 'graph', 'csv.ts'), 'utf8')
  if (!graphCsvText.includes("import { generateDelimitedText, parseDelimitedText, rowsToRecords } from '@/lib/delimited-text/delimitedText'")) {
    throw new Error('expected graph CSV parser/exporter to reuse the shared native delimited-text owner')
  }
  if (graphCsvText.includes('function parseCsvLine(')) {
    throw new Error('legacy graph CSV line parser must stay removed')
  }

  const localImportText = readFileSync(resolve(root, 'src', 'features', 'markdown-workspace', 'workspaceImport', 'localImport.ts'), 'utf8')
  const urlImportText = readFileSync(resolve(root, 'src', 'features', 'markdown-workspace', 'workspaceImport', 'urlImport.ts'), 'utf8')
  if (!localImportText.includes('materializeCsvJsonImportArtifacts') || !urlImportText.includes('materializeCsvJsonImportArtifacts')) {
    throw new Error('expected local and URL import paths to use the shared CSV/JSON conversion adapter')
  }
  const conversionText = readFileSync(resolve(root, 'src', 'features', 'markdown-workspace', 'workspaceImport', 'csvJsonConversion.ts'), 'utf8')
  if (/from ['"]papaparse['"]/.test(conversionText) || /Papa\.(?:parse|unparse)/.test(conversionText)) {
    throw new Error('conversion adapter must not import or call PapaParse')
  }
  if (!conversionText.includes('parseDelimitedTextWithWorkerFallback')) {
    throw new Error('conversion adapter must use the repo-owned worker-compatible parse bridge')
  }
  if (!conversionText.includes('resolveCsvJsonWorkspaceExport')) {
    throw new Error('expected CSV/JSON export fidelity to resolve through the shared conversion owner')
  }

  const exportBridgeText = readFileSync(resolve(root, 'src', 'features', 'markdown-workspace', 'main', 'useWorkspaceExportBridge.ts'), 'utf8')
  const exportMenuText = readFileSync(resolve(root, 'src', 'lib', 'toolbar', 'exportMenuSsot.ts'), 'utf8')
  if (!exportBridgeText.includes('exportCsvJsonWorkspaceDataFile')) {
    throw new Error('expected Launch export bridge to reuse CSV/JSON data-file export owner')
  }
  if (!exportMenuText.includes("{ id: 'csv', menuLabel: 'CSV (.csv)'")) {
    throw new Error('expected export menu SSOT to expose CSV file export')
  }

  const workerBridgeText = readFileSync(resolve(root, 'src', 'lib', 'delimited-text', 'delimitedTextWorkerBridge.ts'), 'utf8')
  const workerText = readFileSync(resolve(root, 'src', 'lib', 'delimited-text', 'delimitedText.worker.ts'), 'utf8')
  if (!workerBridgeText.includes("new Worker(new URL('./delimitedText.worker.ts', import.meta.url)")) {
    throw new Error('expected repo-owned delimited text worker boundary')
  }
  if (!workerText.includes("import { parseDelimitedText")) {
    throw new Error('expected worker to reuse the native delimited text parser')
  }

  const validationCsvPath = readExternalValidationCsvPath()
  if (validationCsvPath) {
    const repoRoot = resolve(root, '..')
    const forbiddenNeedles = Array.from(new Set([
      validationCsvPath,
      basename(validationCsvPath),
    ].map(value => String(value || '').trim()).filter(Boolean)))
    const scanFiles = Array.from(new Set([
      ...collectTextFilesForHardcodeGuard(resolve(root, 'src')),
      resolve(root, 'package.json'),
      resolve(repoRoot, 'docs', 'documents', 'agenticgraph-csv-json-prd-tad.md'),
    ].filter(path => existsSync(path))))
    const offenders: string[] = []
    for (const path of scanFiles) {
      const text = readFileSync(path, 'utf8')
      if (forbiddenNeedles.some(needle => text.includes(needle))) offenders.push(path)
    }
    if (offenders.length > 0) {
      throw new Error(`external CSV validation fixture path must remain environment-only, found committed references in: ${offenders.join(', ')}`)
    }
  }
}
