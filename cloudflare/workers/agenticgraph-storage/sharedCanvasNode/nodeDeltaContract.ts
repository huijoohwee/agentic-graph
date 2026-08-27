import { decodeYjsUpdateBase64 } from '../../../../grph-shared/src/collaboration/yjsSnapshot'

export const NODE_DELTA_SCHEMA = 'knowgrph-travel-node-delta/v1'
export const SHARED_CANVAS_NODE_SCHEMA = 'knowgrph-travel-shared-canvas-node/v1'

export type SharedCanvasNodeSide = 'shopper' | 'merchant'
export type SharedCanvasNodeScope = 'personal' | 'shared'
export type SharedCanvasNodeExpectedScope = SharedCanvasNodeScope | null

export type NodeDeltaEnvelope = {
  type: 'node.delta'
  schema: typeof NODE_DELTA_SCHEMA
  nodeId: string
  transactionId: string
  writerSide: SharedCanvasNodeSide
  clientSeq: number
  updateBase64: string
  updateByteLength: number
  expectedScope: SharedCanvasNodeExpectedScope
}

export type SharedCanvasNode = {
  schema: typeof SHARED_CANVAS_NODE_SCHEMA
  workspaceId: string
  roomId: string
  nodeId: string
  transactionId: string
  scope: SharedCanvasNodeScope
  shopperPartyId: string | null
  merchantPartyId: string | null
  acceptedSeq: number
  yjsStateBase64: string
  nodePayloadChecksum: string
  updatedAtMs: number
}

export type SharedNodeConfig = {
  maxDeltaBytes: number
  maxPayloadBytes: number
  replayLogMaxEntries: number
}

export type NodeDeltaRejectionCode = 'node-delta-schema-invalid' | 'delta-limit-exceeded'

export type NodeDeltaValidationFailure = {
  ok: false
  code: NodeDeltaRejectionCode
  fieldPath: string
  reason: string
  limitName?: keyof Pick<SharedNodeConfig, 'maxDeltaBytes' | 'maxPayloadBytes'>
  configuredValue?: number
}

export type NodeDeltaValidationSuccess = {
  ok: true
  envelope: NodeDeltaEnvelope
  updateBytes: Uint8Array
}

export type NodeDeltaValidationResult = NodeDeltaValidationSuccess | NodeDeltaValidationFailure

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0

const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0

const invalid = (fieldPath: string, reason: string): NodeDeltaValidationFailure => ({
  ok: false,
  code: 'node-delta-schema-invalid',
  fieldPath,
  reason,
})

const exceeded = (
  fieldPath: string,
  limitName: keyof Pick<SharedNodeConfig, 'maxDeltaBytes' | 'maxPayloadBytes'>,
  configuredValue: number,
): NodeDeltaValidationFailure => ({
  ok: false,
  code: 'delta-limit-exceeded',
  fieldPath,
  reason: `${fieldPath} exceeds ${limitName}`,
  limitName,
  configuredValue,
})

export const validateSharedNodeConfig = (config: SharedNodeConfig): NodeDeltaValidationFailure | null => {
  if (!isPositiveInteger(config.maxDeltaBytes)) return invalid('sharedNode.maxDeltaBytes', 'must be a positive integer')
  if (!isPositiveInteger(config.maxPayloadBytes)) return invalid('sharedNode.maxPayloadBytes', 'must be a positive integer')
  if (!isNonNegativeInteger(config.replayLogMaxEntries)) return invalid('sharedNode.replayLogMaxEntries', 'must be a non-negative integer')
  return null
}

export const validateNodeDeltaEnvelope = (args: {
  value: unknown
  resolvedWriterSide: SharedCanvasNodeSide
  config: SharedNodeConfig
}): NodeDeltaValidationResult => {
  const configError = validateSharedNodeConfig(args.config)
  if (configError) return configError
  if (!isRecord(args.value)) return invalid('', 'delta envelope must be an object')
  if (args.value.type !== 'node.delta') return invalid('type', 'must be node.delta')
  if (args.value.schema !== NODE_DELTA_SCHEMA) return invalid('schema', `must be ${NODE_DELTA_SCHEMA}`)

  const nodeId = String(args.value.nodeId || '').trim()
  const transactionId = String(args.value.transactionId || '').trim()
  const updateBase64 = String(args.value.updateBase64 || '').trim()
  const clientSeq = args.value.clientSeq
  const updateByteLength = args.value.updateByteLength
  const expectedScopeRaw = args.value.expectedScope

  if (!IDENTIFIER_PATTERN.test(nodeId)) return invalid('nodeId', 'must be a valid node identifier')
  if (!IDENTIFIER_PATTERN.test(transactionId)) return invalid('transactionId', 'must be a valid transaction identifier')
  if (!isNonNegativeInteger(clientSeq)) return invalid('clientSeq', 'must be a non-negative integer')
  if (!isPositiveInteger(updateByteLength)) return invalid('updateByteLength', 'must be a positive integer')
  if (expectedScopeRaw !== null && expectedScopeRaw !== 'personal' && expectedScopeRaw !== 'shared') {
    return invalid('expectedScope', 'must be personal, shared, or null')
  }
  const expectedScope: SharedCanvasNodeExpectedScope = expectedScopeRaw === 'personal' || expectedScopeRaw === 'shared' ? expectedScopeRaw : null

  let updateBytes: Uint8Array
  try {
    updateBytes = decodeYjsUpdateBase64(updateBase64)
  } catch {
    return invalid('updateBase64', 'must be a well-formed base64 Yjs update')
  }
  if (updateBytes.byteLength !== updateByteLength) return invalid('updateByteLength', 'must equal decoded update byte length')
  if (updateBytes.byteLength > args.config.maxDeltaBytes) {
    return exceeded('updateByteLength', 'maxDeltaBytes', args.config.maxDeltaBytes)
  }

  return {
    ok: true,
    envelope: {
      type: 'node.delta',
      schema: NODE_DELTA_SCHEMA,
      nodeId,
      transactionId,
      writerSide: args.resolvedWriterSide,
      clientSeq,
      updateBase64,
      updateByteLength,
      expectedScope,
    },
    updateBytes,
  }
}
