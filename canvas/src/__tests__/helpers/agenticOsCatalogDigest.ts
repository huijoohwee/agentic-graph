import { createHash } from 'node:crypto'
import {
  AGENTIC_CANVAS_OS_DOCS_ROUTING_SCHEMA,
  serializeAgenticCanvasOsDocsCatalogForDigest,
  serializeAgenticCanvasOsDocsRoutingForDigest,
} from '../../../../mcp/agentic-canvas-os-docs-contract.mjs'

export type AgenticOsTestCatalogEntry = {
  token: string
  kind: string
  label?: string
  summary?: string
  sourcePath: string
  sourceUrl?: string
  keywords?: string[]
  mcpTool?: string
  mcpTools?: string[]
  semantics?: string[]
  bindings?: string[]
}

export const buildAgenticOsTestCatalogMetadata = (
  catalog: readonly AgenticOsTestCatalogEntry[],
) => ({
  catalogDigest: createHash('sha256')
    .update(serializeAgenticCanvasOsDocsCatalogForDigest(catalog), 'utf8')
    .digest('hex'),
  routingSchema: AGENTIC_CANVAS_OS_DOCS_ROUTING_SCHEMA,
  routingDigest: createHash('sha256')
    .update(serializeAgenticCanvasOsDocsRoutingForDigest(catalog), 'utf8')
    .digest('hex'),
  counts: {
    command: catalog.filter(entry => entry.kind === 'command').length,
    semantic: catalog.filter(entry => entry.kind === 'semantic').length,
    binding: catalog.filter(entry => entry.kind === 'binding').length,
  },
})
