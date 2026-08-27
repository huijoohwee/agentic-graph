import { useGraphStore } from '@/hooks/useGraphStore'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { buildSourceFileRecord } from '@/features/source-files/sourceFileParsedState'
import { importFeishuBaseSnapshotIntoSourceFile } from '@/features/source-files/sourceFilesIngestIntegration'
import { importSourceDocumentIntoSourceFile } from '@/features/source-files/sourceFilesParseRuntime'
import { AGENTICGRAPH_SOURCE_IMPORT_LIMITS } from '@/lib/storage/agenticgraphStorageBounds'

export async function testFeishuBaseSourceImportCreatesSourceFileAndMarkdownDocument() {
  const bootstrap = initJsdomHarness('<!doctype html><html><body></body></html>')
  try {
    const state = useGraphStore.getState()
    state.resetAll()
    state.clearSourceFiles()

    const result = await importFeishuBaseSnapshotIntoSourceFile({
      fileId: null,
      snapshot: {
        selection: {
          baseToken: 'appfeishubase1234567890',
          tableId: 'tblroadmap1234567890',
          viewId: 'vewpriority1234567890',
          baseTitle: 'AgenticGraph Ops',
          tableName: 'Roadmap',
          viewName: 'Priority',
          sourceUrl: 'https://example.com/base/appfeishubase1234567890?table=tblroadmap1234567890',
        },
        fields: [
          { id: 'fld1', name: 'Title', type: 'text', isPrimary: true },
          { id: 'fld2', name: 'Status', type: 'singleSelect' },
        ],
        records: [
          {
            id: 'recalpha1234567890',
            fields: {
              Title: 'Ship Phase 1',
              Status: 'Done',
            },
          },
        ],
      },
    })

    if (!result.ok) {
      const error = 'error' in result ? result.error : 'unexpected_failure'
      throw new Error(`expected ok result, got error: ${error}`)
    }
    const after = useGraphStore.getState()
    const file = after.sourceFiles.find(entry => entry.id === result.fileId)
    if (!file) throw new Error('expected imported source file to exist')
    if (file.name !== 'AgenticGraph-Ops-Roadmap.md') throw new Error(`unexpected source file name: ${file.name}`)
    if (file.source?.kind !== 'local') throw new Error(`expected local source kind, got ${String(file.source?.kind || '')}`)
    if (String(file.source?.path || '') !== 'AgenticGraph-Ops-Roadmap.md') {
      throw new Error(`expected source path to match imported name, got ${String(file.source?.path || '')}`)
    }
    if (!String(file.text || '').includes('# Feishu Base Source')) {
      throw new Error(`expected imported source text, got: ${String(file.text || '')}`)
    }
    if (after.markdownDocumentName !== 'AgenticGraph-Ops-Roadmap.md') {
      throw new Error(`expected active markdown document name to match import, got ${String(after.markdownDocumentName || '')}`)
    }
    if (!String(after.markdownDocumentText || '').includes('kgFeishuBaseBaseRef: "base:appfei...7890"')) {
      throw new Error(`expected active markdown document text to include Feishu Base frontmatter, got: ${String(after.markdownDocumentText || '')}`)
    }
  } finally {
    await new Promise<void>(resolve => setTimeout(resolve, 0))
    bootstrap.restore()
  }
}

export async function testFeishuBaseSourceImportUpdatesExistingSourceFileInPlace() {
  const bootstrap = initJsdomHarness('<!doctype html><html><body></body></html>')
  try {
    const state = useGraphStore.getState()
    state.resetAll()
    state.clearSourceFiles()
    state.addSourceFile(buildSourceFileRecord({
      id: 'sf-feishu',
      name: 'old.md',
      text: 'legacy',
      enabled: true,
      source: { kind: 'local', path: 'old.md' },
    }))

    const result = await importFeishuBaseSnapshotIntoSourceFile({
      fileId: 'sf-feishu',
      snapshot: {
        selection: {
          baseToken: 'appfeishubase1234567890',
          tableId: 'tblroadmap1234567890',
          baseTitle: 'AgenticGraph Ops',
          tableName: 'Roadmap',
        },
        records: [],
      },
    })

    if (!result.ok) {
      const error = 'error' in result ? result.error : 'unexpected_failure'
      throw new Error(`expected ok result, got error: ${error}`)
    }
    const after = useGraphStore.getState()
    if (after.sourceFiles.length !== 1) throw new Error(`expected 1 source file, got ${after.sourceFiles.length}`)
    const file = after.sourceFiles[0]
    if (file.id !== 'sf-feishu') throw new Error(`expected existing source file id reused, got ${file.id}`)
    if (file.name !== 'AgenticGraph-Ops-Roadmap.md') throw new Error(`expected imported file to rename in place, got ${file.name}`)
    if (!String(file.text || '').includes('No records were provided in this snapshot.')) {
      throw new Error(`expected updated imported text, got: ${String(file.text || '')}`)
    }
  } finally {
    await new Promise<void>(resolve => setTimeout(resolve, 0))
    bootstrap.restore()
  }
}

export async function testFeishuBaseSourceImportFailsWithoutMutatingStore() {
  const bootstrap = initJsdomHarness('<!doctype html><html><body></body></html>')
  try {
    const state = useGraphStore.getState()
    state.resetAll()
    state.clearSourceFiles()

    const result = await importFeishuBaseSnapshotIntoSourceFile({
      fileId: null,
      snapshot: {
        selection: {
          baseToken: '',
          tableId: 'tblroadmap1234567890',
        },
      },
    })

    if (result.ok) throw new Error('expected failure result')
    const error = 'error' in result ? result.error : 'unexpected_success'
    if (error !== 'Missing Feishu Base token.') throw new Error(`unexpected error: ${error}`)
    const after = useGraphStore.getState()
    if (after.sourceFiles.length !== 0) throw new Error(`expected no source files after failed import, got ${after.sourceFiles.length}`)
  } finally {
    await new Promise<void>(resolve => setTimeout(resolve, 0))
    bootstrap.restore()
  }
}

export async function testSourceDocumentImportRejectsOversizedTextWithoutMutation() {
  const bootstrap = initJsdomHarness('<!doctype html><html><body></body></html>')
  try {
    const state = useGraphStore.getState()
    state.resetAll()
    state.clearSourceFiles()
    const result = await importSourceDocumentIntoSourceFile({
      fileId: null,
      name: 'oversized.md',
      text: 'x'.repeat(AGENTICGRAPH_SOURCE_IMPORT_LIMITS.maxBytes + 1),
      source: { kind: 'local', path: 'oversized.md' },
    })
    if (result.ok === true) throw new Error(`expected oversized import failure, got ${JSON.stringify(result)}`)
    if (!result.error.includes('exceeds')) {
      throw new Error(`expected oversized import failure, got ${JSON.stringify(result)}`)
    }
    if (useGraphStore.getState().sourceFiles.length !== 0) {
      throw new Error('expected oversized import to fail before creating a Source File')
    }
  } finally {
    bootstrap.restore()
  }
}
