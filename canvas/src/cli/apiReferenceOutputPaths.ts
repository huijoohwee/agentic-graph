import path from 'node:path'

export const API_REFERENCE_CODEBASE_INDEX_DIRECTORY = path.join(
  'docs',
  'documents',
  'agentic-graph-api-reference',
  'api-reference-codebase-index_202604261230',
)

export function resolveApiReferenceCodebaseIndexOutputPath(repoRoot: string, filename: string): string {
  return path.join(repoRoot, API_REFERENCE_CODEBASE_INDEX_DIRECTORY, filename)
}
