import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { load as parseYaml } from 'js-yaml'
import { resolveAgenticCanvasOsDocsRoot } from '../../../mcp/agentic-canvas-os-docs-runtime.js'

type DictionarySpec = {
  fileName: string
  prefix: '/' | '#' | '@'
  mcpFields: readonly string[]
  tableLabel: string
}

const DICTIONARY_SPECS: readonly DictionarySpec[] = [
  {
    fileName: 'DICTIONARY-COMMAND.md',
    prefix: '/',
    mcpFields: ['intent', 'required_bindings', 'semantic_filters', 'completion_signal'],
    tableLabel: 'Commands',
  },
  {
    fileName: 'DICTIONARY-SEMANTIC.md',
    prefix: '#',
    mcpFields: ['meaning', 'match_when', 'required_proof'],
    tableLabel: 'Tags',
  },
  {
    fileName: 'DICTIONARY-BINDING.md',
    prefix: '@',
    mcpFields: ['meaning', 'authority', 'boundary', 'secret_policy'],
    tableLabel: 'Bindings',
  },
] as const

const EXPECTED_CONSUMERS = ['chat_composer', 'skills_commands_catalog', 'mcp'] as const
const SHARED_METADATA_FIELDS = ['token', 'label', 'summary', 'group', 'sourcePath', 'keywords', 'prefix_role'] as const

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))

const readDictionary = (fileName: string): { text: string; frontmatter: Record<string, unknown> } => {
  const docsRoot = String(process.env.AGENTICGRAPH_AGENTIC_CANVAS_OS_DOCS_ROOT || '').trim()
    || resolveAgenticCanvasOsDocsRoot({ rootDir: resolve(process.cwd(), '..'), env: process.env })
  const dictionaryPath = resolve(docsRoot, fileName)
  const text = readFileSync(dictionaryPath, 'utf8')
  const match = text.match(/^---\n([\s\S]*?)\n---/)
  if (!match?.[1]) throw new Error(`Expected ${fileName} to have YAML frontmatter`)
  const parsed = parseYaml(match[1])
  if (!isRecord(parsed)) throw new Error(`Expected ${fileName} frontmatter to parse as an object`)
  return { text, frontmatter: parsed }
}

const readArray = (value: unknown, label: string): readonly unknown[] => {
  if (!Array.isArray(value)) throw new Error(`Expected ${label} to be an array`)
  return value
}

export function testAgenticOsDictionariesExposeConsumerMetadata() {
  const mcpOwnerPath = resolve(process.cwd(), '..', 'mcp', 'local-tool-contract.js')
  if (!existsSync(mcpOwnerPath)) throw new Error(`Expected MCP metadata owner to exist at ${mcpOwnerPath}`)

  for (const spec of DICTIONARY_SPECS) {
    const { text, frontmatter } = readDictionary(spec.fileName)
    if (frontmatter.date !== '2026-07-26') {
      throw new Error(`Expected ${spec.fileName} date to reflect the consumer metadata update`)
    }
    if (frontmatter.prefix !== spec.prefix) {
      throw new Error(`Expected ${spec.fileName} prefix ${spec.prefix}, got ${String(frontmatter.prefix)}`)
    }

    const consumers = readArray(frontmatter.metadata_consumers, `${spec.fileName} metadata_consumers`)
    const consumerById = new Map<string, Record<string, unknown>>()
    for (const consumer of consumers) {
      if (!isRecord(consumer)) throw new Error(`Expected ${spec.fileName} metadata consumer entries to be objects`)
      consumerById.set(String(consumer.id || ''), consumer)
    }
    for (const expectedConsumer of EXPECTED_CONSUMERS) {
      const consumer = consumerById.get(expectedConsumer)
      if (!consumer) throw new Error(`Expected ${spec.fileName} metadata_consumers to include ${expectedConsumer}`)
      for (const key of ['surface', 'owner', 'behavior']) {
        if (!String(consumer[key] || '').trim()) throw new Error(`Expected ${spec.fileName} ${expectedConsumer}.${key} metadata`)
      }
      const fields = new Set(readArray(consumer.metadata_fields, `${spec.fileName} ${expectedConsumer}.metadata_fields`).map(String))
      for (const field of expectedConsumer === 'mcp' ? ['token', 'prefix', 'publish_policy', 'source_docs', 'catalog_digest', ...spec.mcpFields] : SHARED_METADATA_FIELDS) {
        if (!fields.has(field)) throw new Error(`Expected ${spec.fileName} ${expectedConsumer}.metadata_fields to include ${field}`)
      }
      if (expectedConsumer === 'mcp' && !String(consumer.behavior || '').includes('no standalone MCP tool execution')) {
        throw new Error(`Expected ${spec.fileName} MCP metadata to stay reference-only`)
      }
      if (expectedConsumer === 'mcp' && !String(consumer.behavior || '').includes('deterministic full-catalog digest')) {
        throw new Error(`Expected ${spec.fileName} MCP metadata to bind the deterministic full-catalog digest`)
      }
    }

    const contract = frontmatter.entry_metadata_contract
    if (!isRecord(contract)) throw new Error(`Expected ${spec.fileName} entry_metadata_contract object`)
    for (const key of ['token', 'label', 'summary', 'group', 'sourcePath', 'keywords', 'mcp']) {
      if (!String(contract[key] || '').trim()) throw new Error(`Expected ${spec.fileName} entry_metadata_contract.${key}`)
    }

    if (!text.includes('## Consumer Metadata')) throw new Error(`Expected ${spec.fileName} to document Consumer Metadata`)
    for (const rowLabel of ['| Chat composer |', '| Skills & Commands catalog |', '| MCP |']) {
      if (!text.includes(rowLabel)) throw new Error(`Expected ${spec.fileName} Consumer Metadata table row ${rowLabel}`)
    }
    if (!text.includes(`## ${spec.tableLabel}`)) throw new Error(`Expected ${spec.fileName} to retain the ${spec.tableLabel} table`)
    if (!/no standalone MCP tool execution|does not become an executable MCP tool|become executable MCP tools/.test(text)) {
      throw new Error(`Expected ${spec.fileName} MCP metadata to forbid implicit execution`)
    }
  }
}
