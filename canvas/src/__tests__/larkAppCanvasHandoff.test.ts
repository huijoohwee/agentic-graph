import {
  buildLarkAppCanvasHandoff,
  buildLarkAppCanvasHandoffQuery,
  buildLarkAppCanvasReviewHandoffQuery,
  buildLarkKnowledgeSourceHandoffFragment,
  parseLarkAppCanvasHandoffFromLocation,
} from '@/features/canvas/larkAppCanvasHandoff'
import {
  FRAGMENT_PARAM_KNOWLEDGE_SOURCE_HANDOFF,
  QUERY_PARAM_KNOWLEDGE_SOURCE_LAUNCH,
  QUERY_PARAM_LARK_HANDOFF,
} from '@/lib/routing/queryParams'
import type { FeishuBaseSourceAdapterInput } from '@/features/source-files/feishuBaseSourceAdapter'

const SNAPSHOT_FIXTURE: FeishuBaseSourceAdapterInput = {
  selection: {
    baseToken: 'bascn_phase2_fixture',
    tableId: 'tbl_phase2_fixture',
    viewId: 'vew_phase2_fixture',
    baseTitle: 'Phase 2 Fixture Base',
    tableName: 'Tasks',
    viewName: 'Open',
  },
  fields: [
    { id: 'fld_title', name: 'Title', type: 'text', isPrimary: true },
  ],
  records: [
    { id: 'rec_1', title: 'Phase 2 Row', fields: { Title: 'Phase 2 Row' } },
  ],
}

export function testLarkKnowledgeSourceHandoffParsesOpaqueReadIntent() {
  const suffix = buildLarkKnowledgeSourceHandoffFragment({
    sourceId: 'product-handbook',
    token: 'opaque-worker-handoff',
  })
  const location = new URL(suffix, 'https://airvio.co/agenticgraph')
  if (location.searchParams.has(FRAGMENT_PARAM_KNOWLEDGE_SOURCE_HANDOFF)) {
    throw new Error(`expected no capability in the HTTP query, got ${location.search}`)
  }
  if (location.searchParams.get(QUERY_PARAM_KNOWLEDGE_SOURCE_LAUNCH) !== '1') {
    throw new Error(`expected non-secret bootstrap marker, got ${location.search}`)
  }
  const fragment = new URLSearchParams(location.hash.slice(1))
  if (!fragment.has(FRAGMENT_PARAM_KNOWLEDGE_SOURCE_HANDOFF)) {
    throw new Error(`expected knowledge-source fragment capability, got ${location.hash}`)
  }
  const parsed = parseLarkAppCanvasHandoffFromLocation({
    search: location.search,
    hash: location.hash,
  })
  if (!parsed?.ok) throw new Error(`expected opaque handoff to parse, got ${JSON.stringify(parsed)}`)
  if (parsed.value.importAction !== 'readKnowledgeSource' || parsed.value.snapshot !== null) {
    throw new Error(`expected remote read without embedded snapshot, got ${JSON.stringify(parsed.value)}`)
  }
  if (parsed.value.knowledgeSource?.sourceId !== 'product-handbook') {
    throw new Error(`expected configured source alias, got ${JSON.stringify(parsed.value)}`)
  }
  if (parsed.value.fileId !== null) {
    throw new Error(`expected opaque handoff to carry no unsigned file target, got ${JSON.stringify(parsed.value)}`)
  }
  const serialized = JSON.stringify(parsed.value)
  if (/tableId|viewId|baseToken|tenant_access_token|app_secret/i.test(serialized)) {
    throw new Error(`expected no Lark credentials or resource IDs, got ${serialized}`)
  }

  let unsignedTargetError = ''
  try {
    buildLarkKnowledgeSourceHandoffFragment({
      sourceId: 'product-handbook',
      token: 'opaque-worker-handoff',
      fileId: 'existing-source-file',
    } as never)
  } catch (error) {
    unsignedTargetError = error instanceof Error ? error.message : String(error)
  }
  if (unsignedTargetError !== 'Lark knowledge-source handoff is invalid.') {
    throw new Error(`expected unsigned file target to be rejected, got ${JSON.stringify(unsignedTargetError)}`)
  }
}

export function testLarkAppCanvasHandoffParsesReviewIntent() {
  const search = buildLarkAppCanvasReviewHandoffQuery()
  if (!search.includes(QUERY_PARAM_LARK_HANDOFF)) {
    throw new Error(`expected review handoff query to use ${QUERY_PARAM_LARK_HANDOFF}, got ${JSON.stringify(search)}`)
  }
  const parsed = parseLarkAppCanvasHandoffFromLocation({ search, hash: '' })
  if (!parsed || !parsed.ok) {
    throw new Error(`expected review handoff to parse, got ${JSON.stringify(parsed)}`)
  }
  if (parsed.value.surface !== 'webpage' || parsed.value.intent !== 'review') {
    throw new Error(`expected webpage review handoff, got ${JSON.stringify(parsed.value)}`)
  }
  if (parsed.value.openMainPanelTab !== 'mcp' || parsed.value.openEditorWorkspace !== true || parsed.value.openCanvas !== true) {
    throw new Error(`expected review handoff to open MainPanel MCP and Editor Workspace, got ${JSON.stringify(parsed.value)}`)
  }
  if (parsed.value.importAction !== null || parsed.value.snapshot !== null) {
    throw new Error(`expected review handoff to stay non-import, got ${JSON.stringify(parsed.value)}`)
  }
}

export function testLarkAppCanvasHandoffParsesImportIntent() {
  const search = buildLarkAppCanvasHandoffQuery({
    surface: 'webpage',
    intent: 'import',
    openMainPanelTab: 'mcp',
    openEditorWorkspace: true,
    openCanvas: true,
    snapshot: SNAPSHOT_FIXTURE,
    fileId: null,
  })
  const parsed = parseLarkAppCanvasHandoffFromLocation({ search, hash: '' })
  if (!parsed || !parsed.ok) {
    throw new Error(`expected import handoff to parse, got ${JSON.stringify(parsed)}`)
  }
  if (parsed.value.intent !== 'import' || parsed.value.importAction !== 'importSnapshot') {
    throw new Error(`expected importSnapshot action, got ${JSON.stringify(parsed.value)}`)
  }
  if (!parsed.value.snapshot || parsed.value.snapshot.selection.baseToken !== SNAPSHOT_FIXTURE.selection.baseToken) {
    throw new Error(`expected import handoff to preserve snapshot payload, got ${JSON.stringify(parsed.value)}`)
  }
}

export function testLarkAppCanvasHandoffRejectsMalformedPayload() {
  const parsed = parseLarkAppCanvasHandoffFromLocation({
    search: `?${QUERY_PARAM_LARK_HANDOFF}=not-valid-base64`,
    hash: '',
  })
  if (!parsed) {
    throw new Error(`expected malformed handoff to fail, got ${JSON.stringify(parsed)}`)
  }
  if (parsed.ok !== false) {
    throw new Error(`expected malformed handoff to fail, got ${JSON.stringify(parsed)}`)
  }
  const errorMessage = parsed.error
  if (!String(errorMessage || '').trim()) {
    throw new Error(`expected malformed handoff to surface an error, got ${JSON.stringify(parsed)}`)
  }
}

export function testLarkAppCanvasHandoffDoesNotAcceptSecretMaterial() {
  let secretError = ''
  try {
    buildLarkAppCanvasHandoff({
      surface: 'webpage',
      intent: 'review',
      openCanvas: true,
      tenant_access_token: 'secret',
    } as unknown as never)
  } catch (error) {
    secretError = error instanceof Error ? error.message : String(error)
  }
  if (secretError !== 'Lark App Canvas handoff must not contain secret material.') {
    throw new Error(`expected secret material to be rejected, got ${JSON.stringify(secretError)}`)
  }

  let endpointError = ''
  try {
    buildLarkAppCanvasHandoff({
      surface: 'webpage',
      intent: 'review',
      openCanvas: true,
      remoteUrl: 'https://example.com/override',
    } as unknown as never)
  } catch (error) {
    endpointError = error instanceof Error ? error.message : String(error)
  }
  if (endpointError !== 'Lark App Canvas handoff must not override the deployed MCP endpoint.') {
    throw new Error(`expected endpoint override to be rejected, got ${JSON.stringify(endpointError)}`)
  }
}
