import { type SharedCanvasNodeSide } from './nodeDeltaContract'
import { type SharedCanvasNodeStore, type SharedNodeApplyResult } from './nodeStorage'

export type SharedNodeSocket = WebSocket & {
  send: (message: string) => void
}

export type SharedNodeRoomAttachment = {
  workspaceId: string
  roomId: string
  role: string
  membershipId?: string | null
  transactionSide?: SharedCanvasNodeSide | null
}

export const isSharedNodeRoomMessage = (type: unknown): boolean =>
  type === 'node.delta' || type === 'node.snapshot.request' || type === 'node.subscribe' || type === 'node.resume'

const readString = (record: Record<string, unknown>, key: string): string =>
  String(record[key] || '').trim()

const sendJson = (socket: SharedNodeSocket, body: unknown): void => {
  try {
    socket.send(JSON.stringify(body))
  } catch {
    // Socket may have closed between validation and response.
  }
}

const resolveTransactionSide = (attachment: SharedNodeRoomAttachment): SharedCanvasNodeSide | null =>
  attachment.transactionSide === 'shopper' || attachment.transactionSide === 'merchant'
    ? attachment.transactionSide
    : null

export const handleSharedNodeRoomMessage = async (args: {
  store: SharedCanvasNodeStore
  socket: SharedNodeSocket
  attachment: SharedNodeRoomAttachment
  payload: Record<string, unknown>
  broadcastJson: (body: unknown) => void
  nowMs?: () => number
}): Promise<void> => {
  const viewerSide = resolveTransactionSide(args.attachment)
  if (!viewerSide) {
    sendJson(args.socket, { type: 'node.delta.rejected', rejection: { code: 'transaction-side-missing', fieldPath: 'membershipId', reason: 'membership transaction side is required' } })
    return
  }

  if (args.payload.type === 'node.snapshot.request' || args.payload.type === 'node.subscribe' || args.payload.type === 'node.resume') {
    const nodeId = readString(args.payload, 'nodeId')
    if (!nodeId) {
      sendJson(args.socket, { type: 'node.delta.rejected', rejection: { code: 'node-delta-schema-invalid', fieldPath: 'nodeId', reason: 'nodeId is required' } })
      return
    }
    const node = await args.store.readNode(args.attachment.workspaceId, args.attachment.roomId, nodeId)
    const responseType = args.payload.type === 'node.resume'
      ? 'node.replay'
      : args.payload.type === 'node.subscribe'
        ? 'node.state'
        : 'node.snapshot'
    sendJson(args.socket, {
      type: responseType,
      node,
      viewerSide,
      viewerMembershipId: args.attachment.membershipId || null,
      servedAtMs: (args.nowMs || Date.now)(),
    })
    return
  }

  const result = await args.store.applyDelta({
    workspaceId: args.attachment.workspaceId,
    roomId: args.attachment.roomId,
    value: args.payload,
    resolvedWriterSide: viewerSide,
  })
  if (!result.ok) {
    const rejection = (result as Extract<SharedNodeApplyResult, { ok: false }>).rejection
    sendJson(args.socket, { type: 'node.delta.rejected', rejection })
    return
  }
  args.broadcastJson({
    type: 'node.delta.accepted',
    node: result.node,
    payload: result.payload,
    checksum: result.node.nodePayloadChecksum,
    seq: result.seq,
  })
}
