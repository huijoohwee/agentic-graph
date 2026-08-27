export const EXTERNAL_MCP_CATALOG_PATH = '/__agenticgraph_external_mcp/catalog' as const
export const EXTERNAL_MCP_PREPARE_PATH = '/__agenticgraph_external_mcp/prepare' as const
export const EXTERNAL_MCP_CALL_PATH = '/__agenticgraph_external_mcp/call' as const

export type ExternalMcpArtifactKind = 'slide-deck' | 'spreadsheet'

export type ExternalMcpCapability = {
  id: string
  revision: string
  label: string
  artifactKind: ExternalMcpArtifactKind
  toolName?: string
  transport?: 'stdio' | 'streamable-http'
  requiresApproval: true
}

export type ExternalMcpArtifactInput = {
  artifactKind: ExternalMcpArtifactKind
  title: string
  content: string
  contentType: string
  fileName: string
  workspacePath?: string
  sourceUrl?: string
}

export type ExternalMcpPrepareRequest = {
  capabilityId: string
  artifact: ExternalMcpArtifactInput
}

export type ExternalMcpPreparedAction = {
  approvalToken: string
  actionDigest: string
  expiresAt: string
  summary: string
  capability: ExternalMcpCapability
}

export type ExternalMcpArtifactReceipt = {
  capabilityId: string
  capabilityRevision: string
  toolName?: string
  artifactKind: ExternalMcpArtifactKind
  createdAt: string
  externalId?: string
  url?: string
  path?: string
  fileName?: string
  mimeType?: string
  summary?: string
}

export const normalizeExternalMcpCapabilityId = (value: unknown): string => {
  const id = String(value || '').trim()
  return /^[a-z0-9][a-z0-9._-]{0,95}$/i.test(id) ? id : ''
}

const boundedText = (value: unknown, maxLength: number): string =>
  typeof value === 'string' ? value.trim().slice(0, maxLength) : ''

const readArtifactKind = (value: unknown): ExternalMcpArtifactKind | null =>
  value === 'slide-deck' || value === 'spreadsheet' ? value : null

export const normalizeExternalMcpArtifactInput = (value: unknown): ExternalMcpArtifactInput | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const candidate = value as Partial<ExternalMcpArtifactInput>
  const artifactKind = readArtifactKind(candidate.artifactKind)
  const title = boundedText(candidate.title, 160)
  const rawContent = typeof candidate.content === 'string' ? candidate.content : ''
  const content = rawContent.length <= 131_072 ? rawContent : ''
  const contentType = boundedText(candidate.contentType, 120)
  const rawFileName = boundedText(candidate.fileName, 180)
  const fileName = /^[a-z0-9][a-z0-9._ -]{0,179}$/i.test(rawFileName) ? rawFileName : ''
  if (!artifactKind || !title || !content || !contentType || !fileName) return null
  const workspacePath = boundedText(candidate.workspacePath, 1_024)
  const sourceUrl = boundedText(candidate.sourceUrl, 2_048)
  return {
    artifactKind,
    title,
    content,
    contentType,
    fileName,
    ...(workspacePath ? { workspacePath } : {}),
    ...(sourceUrl ? { sourceUrl } : {}),
  }
}

export const normalizeExternalMcpPrepareRequest = (value: unknown): ExternalMcpPrepareRequest | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const candidate = value as Partial<ExternalMcpPrepareRequest>
  const capabilityId = normalizeExternalMcpCapabilityId(candidate.capabilityId)
  const artifact = normalizeExternalMcpArtifactInput(candidate.artifact)
  return capabilityId && artifact ? { capabilityId, artifact } : null
}

export const isExternalMcpCapability = (value: unknown): value is ExternalMcpCapability => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as Partial<ExternalMcpCapability>
  return Boolean(
    normalizeExternalMcpCapabilityId(candidate.id)
    && boundedText(candidate.revision, 96)
    && boundedText(candidate.label, 160)
    && readArtifactKind(candidate.artifactKind)
    && (!candidate.toolName || Boolean(boundedText(candidate.toolName, 160)))
    && (!candidate.transport || candidate.transport === 'stdio' || candidate.transport === 'streamable-http')
    && candidate.requiresApproval === true,
  )
}

export const isExternalMcpPreparedAction = (value: unknown): value is ExternalMcpPreparedAction => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as Partial<ExternalMcpPreparedAction>
  return Boolean(
    boundedText(candidate.approvalToken, 256)
    && boundedText(candidate.actionDigest, 256)
    && boundedText(candidate.expiresAt, 64)
    && boundedText(candidate.summary, 640)
    && isExternalMcpCapability(candidate.capability),
  )
}

export const isExternalMcpArtifactReceipt = (value: unknown): value is ExternalMcpArtifactReceipt => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as Partial<ExternalMcpArtifactReceipt>
  return Boolean(
    normalizeExternalMcpCapabilityId(candidate.capabilityId)
    && boundedText(candidate.capabilityRevision, 96)
    && (!candidate.toolName || Boolean(boundedText(candidate.toolName, 160)))
    && readArtifactKind(candidate.artifactKind)
    && boundedText(candidate.createdAt, 64),
  )
}
