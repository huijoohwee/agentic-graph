import { adaptFeishuBaseRecordsToSourceDocument } from '@/features/source-files/feishuBaseSourceAdapter'

type FeishuBaseSourceAdapterResult = ReturnType<typeof adaptFeishuBaseRecordsToSourceDocument>

export const testFeishuBaseSourceAdapterBuildsCanonicalMarkdownDocument = () => {
  const result = adaptFeishuBaseRecordsToSourceDocument({
    selection: {
      baseToken: 'appfeishubase1234567890',
      tableId: 'tblroadmap1234567890',
      viewId: 'vewpriority1234567890',
      baseTitle: 'agentic-graph Ops',
      tableName: 'Roadmap',
      viewName: 'Priority',
      sourceUrl: 'https://example.com/base/appfeishubase1234567890?table=tblroadmap1234567890',
    },
    fields: [
      { id: 'fld1', name: 'Title', type: 'text', isPrimary: true },
      { id: 'fld2', name: 'Status', type: 'singleSelect' },
      { id: 'fld3', name: 'Tags', type: 'multiSelect' },
    ],
    records: [
      {
        id: 'recalpha1234567890',
        fields: {
          Title: 'Ship Phase 1',
          Status: 'Done',
          Tags: ['mcp', 'feishu'],
        },
      },
      {
        id: 'recbeta1234567890',
        title: 'Define adapter boundary',
        fields: {
          Title: 'Define adapter boundary',
          Status: 'Planned',
          Tags: ['phase-2'],
        },
      },
    ],
  })

  if (!('document' in result)) {
    const error = 'error' in result ? result.error : 'unexpected_success'
    throw new Error(`expected ok result, got error: ${error}`)
  }
  const okResult = result
  const { document } = okResult
  if (document.name !== 'agentic-graph-Ops-Roadmap.md') throw new Error(`unexpected document name: ${document.name}`)
  if (document.recordCount !== 2) throw new Error(`expected record count 2, got ${document.recordCount}`)
  if (document.fieldCount !== 3) throw new Error(`expected field count 3, got ${document.fieldCount}`)
  ;[
    'doc_type: "feishu_base_source"',
    'kgFeishuBaseBaseRef: "base:appfei...7890"',
    'kgFeishuBaseTableRef: "table:tblroa...7890"',
    'kgFeishuBaseViewRef: "view:vewpri...7890"',
    'kgFeishuBaseBaseTitle: "agentic-graph Ops"',
    'kgFeishuBaseTableName: "Roadmap"',
    'kgFeishuBaseUrlOrigin: "https://example.com"',
    '# Feishu Base Source',
    '## Field Schema',
    '| Field | Type | Role |',
    '### 1. Ship Phase 1',
    '### 2. Define adapter boundary',
    '- `record_ref`: record:recalp...7890',
    '- `Status`: Done',
    '- `Tags`: ["mcp","feishu"]',
  ].forEach(token => {
    if (!document.text.includes(token)) {
      throw new Error(`expected document to include ${JSON.stringify(token)}, got: ${document.text}`)
    }
  })
  ;[
    'appfeishubase1234567890',
    'tblroadmap1234567890',
    'vewpriority1234567890',
    'recalpha1234567890',
    'recbeta1234567890',
  ].forEach(token => {
    if (document.text.includes(token)) {
      throw new Error(`expected raw identifier to be redacted: ${token}`)
    }
  })
}

export const testFeishuBaseSourceAdapterRejectsMissingRequiredIdentifiers = () => {
  const missingBase = adaptFeishuBaseRecordsToSourceDocument({
    selection: {
      baseToken: '',
      tableId: 'tblroadmap1234567890',
    },
  })
  if (missingBase.ok) throw new Error('expected failed result')
  const missingBaseError = 'error' in missingBase ? missingBase.error : 'unexpected_success'
  if (missingBaseError !== 'Missing Feishu Base token.') throw new Error(`unexpected error: ${missingBaseError}`)

  const missingTable = adaptFeishuBaseRecordsToSourceDocument({
    selection: {
      baseToken: 'appfeishubase1234567890',
      tableId: '',
    },
  })
  if (missingTable.ok) throw new Error('expected failed result')
  const missingTableError = 'error' in missingTable ? missingTable.error : 'unexpected_success'
  if (missingTableError !== 'Missing Feishu Base table id.') throw new Error(`unexpected error: ${missingTableError}`)
}

export const testFeishuBaseSourceAdapterSupportsEmptySnapshots = () => {
  const result = adaptFeishuBaseRecordsToSourceDocument({
    selection: {
      baseToken: 'appfeishubase1234567890',
      tableId: 'tblroadmap1234567890',
      baseTitle: 'agentic-graph Ops',
      tableName: 'Roadmap',
    },
    fields: [],
    records: [],
  })
  if (!('document' in result)) {
    const error = 'error' in result ? result.error : 'unexpected_success'
    throw new Error(`expected ok result, got error: ${error}`)
  }
  const okResult = result
  if (okResult.warnings.length !== 2) throw new Error(`expected 2 warnings, got ${okResult.warnings.length}`)
  if (!okResult.document.text.includes('No field schema was provided for this snapshot.')) {
    throw new Error(`expected no-schema message, got: ${okResult.document.text}`)
  }
  if (!okResult.document.text.includes('No records were provided in this snapshot.')) {
    throw new Error(`expected no-records message, got: ${okResult.document.text}`)
  }
}
