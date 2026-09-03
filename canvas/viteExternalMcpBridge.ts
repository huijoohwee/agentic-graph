import { createHash, randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

import { createExternalToolGatewayRuntime } from '../mcp/external-tool-gateway-runtime.js'
import {
  EXTERNAL_MCP_CALL_PATH,
  EXTERNAL_MCP_CATALOG_PATH,
  EXTERNAL_MCP_PREPARE_PATH,
  normalizeExternalMcpPrepareRequest,
  type ExternalMcpArtifactKind,
  type ExternalMcpCapability,
} from './src/features/agent-ready/externalMcpBridgeContract'

const MAX_REQUEST_BYTES = 300 * 1024
const MAX_PENDING_ACTIONS = 100

type GatewayCapability = {
  capabilityId: string
  capabilityRevision: string
  label: string
  profileLabel: string
  artifactKind: 'slides' | 'spreadsheet'
  transportType: 'stdio' | 'streamable-http'
  approvalRequired: boolean
}

type GatewayRuntime = {
  catalog: (args: { artifactKinds: string[]; limit: number }) => { ok: boolean; capabilities?: GatewayCapability[] }
  createApprovalToken: (args: Record<string, unknown>, options: { tokenId: string }) => Record<string, unknown>
  call: (args: Record<string, unknown>, context: { markSideEffectDispatched: (actionDigest: string) => void }) => Promise<Record<string, unknown>>
}

type PendingAction = {
  callArgs: Record<string, unknown>
  approvalToken: Record<string, unknown>
  actionDigest: string
  expiresAt: number
  capability: ExternalMcpCapability
  fileName: string
}

const writeJson = (response: ServerResponse, status: number, payload: unknown): void => {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify(payload))
}

const isSameSiteRequest = (request: IncomingMessage): boolean => {
  const fetchSite = String(request.headers['sec-fetch-site'] || '').trim().toLowerCase()
  return !fetchSite || ['same-origin', 'same-site', 'none'].includes(fetchSite)
}

const readRequestJson = async (request: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = []
  let size = 0
  for await (const rawChunk of request) {
    const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk)
    size += chunk.byteLength
    if (size > MAX_REQUEST_BYTES) throw new Error('External MCP request exceeds 300 KiB.')
    chunks.push(chunk)
  }
  if (chunks.length === 0) throw new Error('External MCP request body is empty.')
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}

const mapArtifactKind = (kind: GatewayCapability['artifactKind']): ExternalMcpArtifactKind =>
  kind === 'slides' ? 'slide-deck' : 'spreadsheet'

const mapCapability = (capability: GatewayCapability): ExternalMcpCapability => ({
  id: capability.capabilityId,
  revision: capability.capabilityRevision,
  label: [capability.profileLabel, capability.label].filter(Boolean).join(' / '),
  artifactKind: mapArtifactKind(capability.artifactKind),
  transport: capability.transportType,
  requiresApproval: true,
})

const actionIdempotencyKey = (capabilityId: string, artifact: Record<string, unknown>): string =>
  `kg-${createHash('sha256').update(JSON.stringify({ capabilityId, artifact })).digest('hex')}`

const cleanPendingActions = (pending: Map<string, PendingAction>, now = Date.now()): void => {
  for (const [id, action] of pending) if (action.expiresAt <= now) pending.delete(id)
  while (pending.size > MAX_PENDING_ACTIONS) pending.delete(pending.keys().next().value as string)
}

const readGatewayError = (result: Record<string, unknown>): string => {
  const error = result.error && typeof result.error === 'object' && !Array.isArray(result.error)
    ? result.error as { message?: unknown }
    : null
  return String(error?.message || 'External MCP invocation failed.').slice(0, 640)
}

export const invokeApprovedGatewayCall = async (runtime: Pick<GatewayRuntime, 'call'>, args: Record<string, unknown>, expectedActionDigest: string): Promise<Record<string, unknown>> => {
  let dispatched = false
  const result = await runtime.call(args, {
    markSideEffectDispatched: actionDigest => {
      if (actionDigest !== expectedActionDigest) throw new Error('External MCP dispatch digest changed after approval.')
      dispatched = true
    },
  })
  if (result.ok === true && result.cached !== true && !dispatched) throw new Error('External MCP gateway returned an unconfirmed mutation result.')
  return result
}

export function createExternalMcpBridgePlugin(args?: { runtime?: GatewayRuntime }): Plugin {
  const pending = new Map<string, PendingAction>()
  const runtime = args?.runtime || createExternalToolGatewayRuntime() as GatewayRuntime
  return {
    name: 'agentic-graph-external-mcp-bridge',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const requestPath = new URL(String(request.url || ''), 'http://localhost').pathname
        if (![EXTERNAL_MCP_CATALOG_PATH, EXTERNAL_MCP_PREPARE_PATH, EXTERNAL_MCP_CALL_PATH].includes(requestPath as never)) {
          next()
          return
        }
        if (!isSameSiteRequest(request)) {
          writeJson(response, 403, { ok: false, error: 'Cross-site external MCP requests are forbidden.' })
          return
        }
        try {
          cleanPendingActions(pending)
          if (requestPath === EXTERNAL_MCP_CATALOG_PATH) {
            if (request.method !== 'GET') return writeJson(response, 405, { ok: false, error: 'Method not allowed.' })
            const result = runtime.catalog({ artifactKinds: ['slides', 'spreadsheet'], limit: 100 })
            const capabilities = result.ok && Array.isArray(result.capabilities)
              ? result.capabilities.map(mapCapability)
              : []
            writeJson(response, 200, { ok: true, capabilities })
            return
          }
          if (request.method !== 'POST') return writeJson(response, 405, { ok: false, error: 'Method not allowed.' })
          if (!String(request.headers['content-type'] || '').toLowerCase().includes('application/json')) {
            return writeJson(response, 415, { ok: false, error: 'Content-Type must be application/json.' })
          }
          const body = await readRequestJson(request)
          if (requestPath === EXTERNAL_MCP_PREPARE_PATH) {
            const parsed = normalizeExternalMcpPrepareRequest(body)
            if (!parsed) return writeJson(response, 400, { ok: false, error: 'External MCP prepare request is invalid.' })
            const catalog = runtime.catalog({ artifactKinds: [parsed.artifact.artifactKind === 'slide-deck' ? 'slides' : 'spreadsheet'], limit: 100 })
            const gatewayCapability = catalog.capabilities?.find(capability => capability.capabilityId === parsed.capabilityId)
            if (!gatewayCapability) return writeJson(response, 404, { ok: false, error: 'External MCP capability is unavailable.' })
            const capability = mapCapability(gatewayCapability)
            const canonicalArtifact = {
              title: parsed.artifact.title,
              content: parsed.artifact.content,
              contentType: parsed.artifact.contentType,
              fileName: parsed.artifact.fileName,
              ...(parsed.artifact.workspacePath?.startsWith('workspace:/') ? { workspacePath: parsed.artifact.workspacePath } : {}),
              ...(parsed.artifact.sourceUrl?.startsWith('https://') ? { sourceUrl: parsed.artifact.sourceUrl } : {}),
            }
            const callArgs = {
              capabilityId: gatewayCapability.capabilityId,
              capabilityRevision: gatewayCapability.capabilityRevision,
              artifact: canonicalArtifact,
              idempotencyKey: actionIdempotencyKey(gatewayCapability.capabilityId, canonicalArtifact),
            }
            const signedApproval = runtime.createApprovalToken(callArgs, { tokenId: randomUUID() })
            const actionDigest = String(signedApproval.actionDigest || '')
            const expiresAt = Number(signedApproval.expiresAt)
            if (!/^[0-9a-f]{64}$/.test(actionDigest) || !Number.isFinite(expiresAt)) throw new Error('External MCP approval token is invalid.')
            const approvalToken = randomUUID()
            pending.set(approvalToken, { callArgs, approvalToken: signedApproval, actionDigest, expiresAt, capability, fileName: parsed.artifact.fileName })
            writeJson(response, 200, {
              ok: true,
              action: {
                approvalToken,
                actionDigest,
                expiresAt: new Date(expiresAt).toISOString(),
                summary: `Create ${parsed.artifact.title} through ${capability.label}.`,
                capability,
              },
            })
            return
          }
          const callBody = body && typeof body === 'object' && !Array.isArray(body)
            ? body as { approvalToken?: unknown; actionDigest?: unknown }
            : {}
          const opaqueToken = String(callBody.approvalToken || '').trim()
          const action = pending.get(opaqueToken)
          if (!action || String(callBody.actionDigest || '') !== action.actionDigest) {
            return writeJson(response, 403, { ok: false, error: 'External MCP approval is missing, expired, or does not match this action.' })
          }
          pending.delete(opaqueToken)
          const result = await invokeApprovedGatewayCall(runtime, { ...action.callArgs, approvalToken: action.approvalToken }, action.actionDigest)
          if (result.ok !== true) return writeJson(response, 502, { ok: false, error: readGatewayError(result) })
          const receipt = result.receipt && typeof result.receipt === 'object' && !Array.isArray(result.receipt)
            ? result.receipt as Record<string, unknown>
            : null
          if (!receipt) throw new Error('External MCP gateway returned no receipt.')
          writeJson(response, 200, {
            ok: true,
            receipt: {
              capabilityId: String(receipt.capabilityId || action.capability.id),
              capabilityRevision: String(receipt.capabilityRevision || action.capability.revision),
              artifactKind: mapArtifactKind(String(receipt.artifactKind || '') === 'slides' ? 'slides' : 'spreadsheet'),
              createdAt: new Date().toISOString(),
              externalId: typeof receipt.externalId === 'string' ? receipt.externalId : undefined,
              url: typeof receipt.webUrl === 'string' ? receipt.webUrl : undefined,
              fileName: action.fileName,
              mimeType: typeof receipt.mimeType === 'string' ? receipt.mimeType : undefined,
              summary: typeof receipt.title === 'string' ? receipt.title : undefined,
            },
          })
        } catch (error) {
          writeJson(response, 500, {
            ok: false,
            error: (error instanceof Error ? error.message : 'External MCP bridge failed.').slice(0, 640),
          })
        }
      })
    },
  }
}
