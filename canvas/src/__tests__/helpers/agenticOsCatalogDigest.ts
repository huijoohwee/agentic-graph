import { createHash } from 'node:crypto'
import { serializeAgenticCanvasOsDocsCatalogForDigest } from '../../../../mcp/agentic-canvas-os-docs-contract.mjs'

export type AgenticOsTestCatalogEntry = {
  token: string
  kind: string
  label?: string
  summary?: string
  sourcePath: string
  sourceUrl?: string
  keywords?: string[]
}

export const buildAgenticOsTestCatalogMetadata = (
  catalog: readonly AgenticOsTestCatalogEntry[],
) => ({
  catalogDigest: createHash('sha256')
    .update(serializeAgenticCanvasOsDocsCatalogForDigest(catalog), 'utf8')
    .digest('hex'),
  counts: {
    command: catalog.filter(entry => entry.kind === 'command').length,
    semantic: catalog.filter(entry => entry.kind === 'semantic').length,
    binding: catalog.filter(entry => entry.kind === 'binding').length,
  },
})
