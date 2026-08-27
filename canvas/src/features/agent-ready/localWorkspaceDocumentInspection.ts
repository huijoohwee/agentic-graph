import { inspectSharedDocumentStructure } from './sharedDocumentStructureInspection.mjs'

type LocalWorkspaceDocumentInspectionArgs = {
  markdownDocumentName?: unknown
  markdownDocumentText?: unknown
  markdownDocumentSourceUrl?: unknown
}

const normalizeString = (value: unknown): string => String(value || '').trim()

export const inspectLocalWorkspaceDocument = (
  args: LocalWorkspaceDocumentInspectionArgs,
) => {
  const documentName = normalizeString(args.markdownDocumentName)
  const markdown = String(args.markdownDocumentText || '')
  const documentSourceUrl = normalizeString(args.markdownDocumentSourceUrl)

  if (!documentName && !normalizeString(markdown)) {
    return {
      available: false,
      sourceKind: 'browser-local-workspace',
      documentName: '',
      documentSourceUrl: documentSourceUrl || null,
      message: 'No active markdown document is loaded in the local AgenticGraph workspace.',
    }
  }

  return {
    available: true,
    sourceKind: 'browser-local-workspace',
    documentName: documentName || 'document.md',
    documentSourceUrl: documentSourceUrl || null,
    ...inspectSharedDocumentStructure({
      canonicalPath: documentName || 'document.md',
      markdown,
    }),
  }
}
