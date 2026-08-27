import { serializeMarkdownPipeTable } from '@/features/markdown/ui/markdownDataViewSerialize'
import { sanitizeImportedMarkdownText } from '@/lib/markdown/sanitizeImportedMarkdown'
import type {
  AgenticGraphKnowledgeSourceBaseSnapshot,
  AgenticGraphKnowledgeSourceDocumentSnapshot,
  AgenticGraphKnowledgeSourceSnapshotEnvelope,
} from '@/lib/storage/agenticgraphStorageSyncContract'

export type KnowledgeSourceDocument = {
  name: string
  text: string
  warnings: string[]
}

export type KnowledgeSourceDocumentAdapterResult =
  | { ok: true; document: KnowledgeSourceDocument }
  | { ok: false; error: string; warnings: string[] }

const normalizeString = (value: unknown): string => String(value || '').trim()

const sanitizeFileStem = (value: unknown): string =>
  normalizeString(value)
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

const yamlQuote = (value: unknown): string => JSON.stringify(String(value || ''))

const summarizeValue = (value: unknown): string => {
  if (value === null) return 'null'
  if (typeof value === 'string') {
    const compact = value.replace(/\s+/g, ' ').trim()
    if (!compact) return '""'
    return compact.length > 220 ? `${compact.slice(0, 217)}...` : compact
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    const serialized = JSON.stringify(value)
    if (typeof serialized !== 'string') return 'null'
    return serialized.length > 220 ? `${serialized.slice(0, 217)}...` : serialized
  } catch {
    return '[unserializable]'
  }
}

const summarizeOptionalText = (value: unknown): string => {
  const text = normalizeString(value)
  return text ? summarizeValue(text) : ''
}

const formatInlineCode = (value: unknown): string => {
  const text = normalizeString(value).replace(/\s+/g, ' ') || 'Unnamed field'
  const longestFence = Math.max(0, ...Array.from(text.matchAll(/`+/g), match => match[0].length))
  const fence = '`'.repeat(longestFence + 1)
  return `${fence}${text}${fence}`
}

const buildProvenanceFrontmatter = (args: {
  envelope: AgenticGraphKnowledgeSourceSnapshotEnvelope
  title: string
  docType: string
}): string[] => {
  const { envelope } = args
  const lines = [
    '---',
    `title: ${yamlQuote(args.title)}`,
    `doc_type: ${yamlQuote(args.docType)}`,
    'lang: "en-US"',
    `kgKnowledgeSourceId: ${yamlQuote(envelope.sourceId)}`,
    `kgKnowledgeSourceProvider: ${yamlQuote(envelope.provider)}`,
    `kgKnowledgeSourceKind: ${yamlQuote(envelope.kind)}`,
    `kgKnowledgeSourceIdentityMode: ${yamlQuote(envelope.identityMode)}`,
    `kgKnowledgeSourceAllowlistRevision: ${yamlQuote(envelope.allowlistRevision)}`,
    `kgKnowledgeSourceAllowlistDigest: ${yamlQuote(envelope.allowlistDigest)}`,
    `kgKnowledgeSourceFetchedAt: ${yamlQuote(envelope.fetchedAt)}`,
    `kgKnowledgeSourceContentDigest: ${yamlQuote(envelope.contentDigest)}`,
    `kgKnowledgeSourceEnvelopeDigest: ${yamlQuote(envelope.envelopeDigest)}`,
    `kgKnowledgeSourcePageCount: ${envelope.counts.pages}`,
    `kgKnowledgeSourceFieldCount: ${envelope.counts.fields}`,
    `kgKnowledgeSourceRecordCount: ${envelope.counts.records}`,
    `kgKnowledgeSourceDocumentCount: ${envelope.counts.documents}`,
    `kgKnowledgeSourceByteCount: ${envelope.counts.bytes}`,
  ]
  if (envelope.providerRevision) {
    lines.push(`kgKnowledgeSourceProviderRevision: ${yamlQuote(envelope.providerRevision)}`)
  }
  lines.push('---', '')
  return lines
}

const buildBaseDocument = (args: {
  envelope: AgenticGraphKnowledgeSourceSnapshotEnvelope
  snapshot: AgenticGraphKnowledgeSourceBaseSnapshot
  warnings: string[]
}): KnowledgeSourceDocumentAdapterResult => {
  const fields = Array.isArray(args.snapshot.fields) ? args.snapshot.fields : []
  const records = Array.isArray(args.snapshot.records) ? args.snapshot.records : []
  const baseTitle = summarizeOptionalText(args.snapshot.baseTitle) || 'Lark Base'
  const tableName = summarizeOptionalText(args.snapshot.tableName) || 'Knowledge Source'
  const title = `${baseTitle} - ${tableName}`
  const lines = [
    ...buildProvenanceFrontmatter({
      envelope: args.envelope,
      title,
      docType: 'lark_base_knowledge_source',
    }),
    '# Lark Base Knowledge Source',
    '',
    '## Summary',
    '',
    `- Base: ${baseTitle}`,
    `- Table: ${tableName}`,
    `- View: ${summarizeOptionalText(args.snapshot.viewName) || 'Not specified'}`,
    `- Record count: ${records.length}`,
    `- Field count: ${fields.length}`,
    '',
    '## Field Schema',
    '',
  ]

  if (fields.length === 0) {
    lines.push('No field schema was provided for this snapshot.', '')
  } else {
    lines.push(...serializeMarkdownPipeTable({
      columns: ['Field', 'Type', 'Role'],
      rows: fields.map(field => [
        normalizeString(field.name) || 'Unnamed field',
        normalizeString(field.type) || 'unknown',
        field.isPrimary ? 'primary' : 'standard',
      ]),
    }), '')
  }

  lines.push('## Records', '')
  if (records.length === 0) {
    lines.push('No records were provided in this snapshot.', '')
  } else {
    records.forEach((record, index) => {
      const primaryField = fields.find(field => field.isPrimary)
      const primaryValue = primaryField
        ? summarizeValue(record.fields?.[primaryField.name])
        : ''
      const heading = summarizeOptionalText(record.title)
        || (primaryValue && primaryValue !== 'null' && primaryValue !== '""' ? primaryValue : `Record ${index + 1}`)
      lines.push(`### ${index + 1}. ${heading}`, '')
      const entries = Object.entries(record.fields || {})
      if (entries.length === 0) {
        lines.push('- No field values were provided.', '')
        return
      }
      entries.forEach(([fieldName, value]) => {
        lines.push(`- ${formatInlineCode(fieldName)}: ${summarizeValue(value)}`)
      })
      lines.push('')
    })
  }

  const sanitized = sanitizeImportedMarkdownText(lines.join('\n'))
  const nameStem = [sanitizeFileStem(baseTitle), sanitizeFileStem(tableName)].filter(Boolean).join('-')
  return {
    ok: true,
    document: {
      name: `${nameStem || 'lark-base-knowledge-source'}.md`,
      text: sanitized.text,
      warnings: sanitized.changed
        ? [...args.warnings, 'Unsafe or unsupported Markdown content was sanitized during import.']
        : args.warnings,
    },
  }
}

const buildMarkdownDocument = (args: {
  envelope: AgenticGraphKnowledgeSourceSnapshotEnvelope
  snapshot: AgenticGraphKnowledgeSourceDocumentSnapshot
  warnings: string[]
}): KnowledgeSourceDocumentAdapterResult => {
  const text = typeof args.snapshot.text === 'string' ? args.snapshot.text : ''
  const nameStem = sanitizeFileStem(args.snapshot.name) || sanitizeFileStem(args.snapshot.title) || 'lark-document'
  const name = /\.md$/i.test(nameStem) ? nameStem : `${nameStem.replace(/\.[^.]+$/, '')}.md`
  const title = summarizeOptionalText(args.snapshot.title) || nameStem.replace(/\.md$/i, '')
  const rawText = [
    ...buildProvenanceFrontmatter({
      envelope: args.envelope,
      title,
      docType: 'lark_document_knowledge_source',
    }),
    text,
  ].join('\n')
  const sanitized = sanitizeImportedMarkdownText(rawText)
  const warnings = sanitized.changed
    ? [...args.warnings, 'Unsafe or unsupported Markdown content was sanitized during import.']
    : args.warnings
  return {
    ok: true,
    document: { name, text: sanitized.text, warnings },
  }
}

export function adaptKnowledgeSourceSnapshotToDocument(
  envelope: AgenticGraphKnowledgeSourceSnapshotEnvelope,
): KnowledgeSourceDocumentAdapterResult {
  const sourceId = normalizeString(envelope.sourceId)
  const warnings = Array.isArray(envelope.warnings)
    ? envelope.warnings.filter((warning): warning is string => typeof warning === 'string')
    : []
  if (!sourceId) return { ok: false, error: 'Knowledge-source response is missing its source alias.', warnings }
  if (envelope.snapshot?.type === 'base') {
    return buildBaseDocument({ envelope, snapshot: envelope.snapshot, warnings })
  }
  if (envelope.snapshot?.type === 'document') {
    return buildMarkdownDocument({ envelope, snapshot: envelope.snapshot, warnings })
  }
  return { ok: false, error: 'Knowledge-source response has an unsupported snapshot type.', warnings }
}
