import path from 'node:path'
import {
  XLSX_MIME_TYPE,
  createKgFsPathPolicy,
  decodeXlsxArtifactBase64,
  enforceCanonicalWorkspaceMutation,
  resolveKgFsMutationTarget,
} from '../../viteWorkspaceArtifactBridge'

export function testWorkspaceArtifactBridgeAcceptsOnlyVerifiedXlsxPayloads() {
  const valid = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]).toString('base64')
  if (!decodeXlsxArtifactBase64({ base64: valid, encoding: 'base64', mimeType: XLSX_MIME_TYPE })) {
    throw new Error('expected exact-MIME base64 XLSX ZIP bytes to be accepted')
  }
  for (const candidate of [
    { base64: valid, encoding: 'text', mimeType: XLSX_MIME_TYPE },
    { base64: valid, encoding: 'base64', mimeType: 'application/octet-stream' },
    { base64: Buffer.from('not-a-zip').toString('base64'), encoding: 'base64', mimeType: XLSX_MIME_TYPE },
    { base64: 'not base64', encoding: 'base64', mimeType: XLSX_MIME_TYPE },
  ]) {
    if (decodeXlsxArtifactBase64(candidate)) {
      throw new Error(`expected invalid XLSX write payload to be rejected: ${JSON.stringify(candidate)}`)
    }
  }
}

export function testWorkspaceArtifactBridgeConfinesDownloadPathsToWorkspaceRoots() {
  const repoRoot = path.resolve('/workspace/agentic-graph')
  const policy = createKgFsPathPolicy(repoRoot)
  if (!policy.isAllowed(path.resolve(repoRoot, 'artifact.xlsx'))) {
    throw new Error('expected task-repo artifacts to be allowed')
  }
  const remapped = policy.resolveHostPath('/outside/secrets.xlsx')
  if (remapped === '/outside/secrets.xlsx' || !policy.isAllowed(remapped)) {
    throw new Error(`expected outside absolute paths to be remapped inside the workspace mirror, got ${remapped}`)
  }
}

export async function testWorkspaceArtifactBridgeEnforcesCanonicalWorkspaceSeedOwnership() {
  const repoRoot = path.resolve('/workspace/.worktrees/agentic-graph/storage-sync')
  const policy = createKgFsPathPolicy(repoRoot)
  const workspacePath = '/docs/workspace-seeds/team/demo.md'
  const canonicalPath = path.resolve('/workspace/agentic-graph/docs/workspace-seeds/team/demo.md')
  const rejectedPath = path.resolve('/workspace/huijoohwee/docs/workspace-seeds/team/demo.md')
  if (policy.resolveCanonicalWorkspacePath(workspacePath) !== canonicalPath) {
    throw new Error('expected task worktrees to resolve workspace seeds against the canonical agentic-graph checkout')
  }
  const logicalTarget = resolveKgFsMutationTarget({
    policy,
    incomingPath: '',
    workspacePath,
  })
  if (!logicalTarget.ok || logicalTarget.requestedAbsPath !== canonicalPath) {
    throw new Error(`expected the bridge to derive the canonical target from workspacePath, got ${JSON.stringify(logicalTarget)}`)
  }
  const clientPathTarget = resolveKgFsMutationTarget({
    policy,
    incomingPath: canonicalPath,
    workspacePath,
  })
  if (clientPathTarget.ok) {
    throw new Error('expected canonical seed requests with client host paths to be rejected')
  }
  if (!('status' in clientPathTarget) || clientPathTarget.status !== 400) {
    throw new Error('expected canonical seed requests with client host paths to be rejected')
  }
  const unkeyedTarget = resolveKgFsMutationTarget({
    policy,
    incomingPath: canonicalPath,
    workspacePath: '',
  })
  if (unkeyedTarget.ok) {
    throw new Error('expected direct workspace seed mutations without an ownership key to be rejected')
  }
  if (!('status' in unkeyedTarget) || unkeyedTarget.status !== 403) {
    throw new Error('expected direct workspace seed mutations without an ownership key to be rejected')
  }
  const mismatch = await enforceCanonicalWorkspaceMutation({
    policy,
    requestedAbsPath: rejectedPath,
    workspacePath,
    deleteOnly: false,
  })
  if (mismatch?.status !== 403) throw new Error('expected the bridge operation to reject a repository ownership mismatch')
  const rootDelete = await enforceCanonicalWorkspaceMutation({
    policy,
    requestedAbsPath: path.resolve('/workspace/agentic-graph/docs/workspace-seeds'),
    workspacePath: '/docs/workspace-seeds',
    deleteOnly: true,
  })
  if (rootDelete?.status !== 403) throw new Error('expected the bridge operation to reject seed-root deletion')
}
