import {
  importSourceDocumentIntoSourceFile,
} from '@/features/source-files/sourceFilesParseRuntime'
import {
  adaptKnowledgeSourceSnapshotToDocument,
} from '@/features/source-files/knowledge-source/knowledgeSourceDocumentAdapter'
import {
  readKnowledgeSourceSnapshot,
  type KnowledgeSourceReadHandoff,
} from '@/features/source-files/knowledge-source/knowledgeSourceReadClient'
import { useGraphStore } from '@/hooks/useGraphStore'

export type KnowledgeSourceImportRequest = {
  handoff: KnowledgeSourceReadHandoff
}

export type KnowledgeSourceImportResult =
  | {
      ok: true
      fileId: string
      name: string
      warnings: string[]
    }
  | {
      ok: false
      error: string
      warnings: string[]
    }

export async function importKnowledgeSourceFromHandoff(
  args: KnowledgeSourceImportRequest,
  dependencies: {
    readSnapshot?: typeof readKnowledgeSourceSnapshot
  } = {},
): Promise<KnowledgeSourceImportResult> {
  const read = await (dependencies.readSnapshot || readKnowledgeSourceSnapshot)({ handoff: args.handoff })
  if (read.ok === false) return { ok: false, error: read.error, warnings: [] }

  const adapted = adaptKnowledgeSourceSnapshotToDocument(read.envelope)
  if (adapted.ok === false) {
    return { ok: false, error: adapted.error, warnings: adapted.warnings }
  }

  const existingNames = new Set(
    useGraphStore.getState().sourceFiles.map(file => String(file.name || '').trim().toLowerCase()),
  )
  const desiredName = adapted.document.name
  const separatorIndex = desiredName.lastIndexOf('.')
  const stem = separatorIndex > 0 ? desiredName.slice(0, separatorIndex) : desiredName
  const extension = separatorIndex > 0 ? desiredName.slice(separatorIndex) : ''
  let createOnlyName = desiredName
  for (let suffix = 2; existingNames.has(createOnlyName.toLowerCase()); suffix += 1) {
    createOnlyName = `${stem}-${suffix}${extension}`
  }

  const imported = await importSourceDocumentIntoSourceFile({
    fileId: null,
    name: createOnlyName,
    text: adapted.document.text,
    source: { kind: 'local', path: createOnlyName },
  })
  if (imported.ok === false) {
    return {
      ok: false,
      error: imported.error,
      warnings: adapted.document.warnings,
    }
  }
  return {
    ok: true,
    fileId: imported.fileId,
    name: createOnlyName,
    warnings: adapted.document.warnings,
  }
}
