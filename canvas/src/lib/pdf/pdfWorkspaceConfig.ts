export const PDF_WORKSPACE_API = {
  base: '/__pdf_workspace',
  docs: '/__pdf_workspace/docs',
  import: '/__pdf_workspace/import',
  doc: (docId: string) => `/__pdf_workspace/doc/${encodeURIComponent(docId)}`,
} as const

export const PDF_WORKSPACE_DIR_REL_DEFAULT = '.agenticgraph-workspace/pdf-md'

