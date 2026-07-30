export type WorkspaceDocsMirrorLocalRootRequest = {
  absRoot: string
  workspaceRootName?: string
  excludedRelPathRoots?: string[]
}

const AGENTIC_CANVAS_OS_DOCS_WORKSPACE_ROOT_NAME = 'agentic-canvas-os/docs'
const KNOWGRPH_WORKSPACE_SEEDS_WORKSPACE_ROOT_NAME = 'workspace-seeds'

const normalizeRoot = (value: unknown): string => String(value || '').trim().replace(/\\/g, '/').replace(/\/+$/, '')

const readAbsoluteParentRoot = (absRoot: string): string => {
  const parts = normalizeRoot(absRoot).split('/').filter(Boolean)
  return parts.length > 1 ? `/${parts.slice(0, -1).join('/')}` : ''
}

export function resolveKnowgrphWorkspaceSeedsAbsRoot(args: {
  docsAbsRoot: unknown
  explicitAbsRoot?: unknown
}): string {
  const explicitAbsRoot = normalizeRoot(args.explicitAbsRoot)
  if (explicitAbsRoot) return explicitAbsRoot
  const docsAbsRoot = normalizeRoot(args.docsAbsRoot)
  const repositoryRoot = readAbsoluteParentRoot(docsAbsRoot)
  const githubRoot = readAbsoluteParentRoot(repositoryRoot)
  return githubRoot ? `${githubRoot}/knowgrph/docs/workspace-seeds` : ''
}

export function resolveWorkspaceDocsMirrorLocalRootRequests(args: {
  docsAbsRoot: unknown
  outputDocsAbsRoot?: unknown
  agenticDocsAbsRoot: unknown
  knowgrphWorkspaceSeedsAbsRoot?: unknown
}): WorkspaceDocsMirrorLocalRootRequest[] {
  const docsAbsRoot = normalizeRoot(args.docsAbsRoot)
  const outputDocsAbsRoot = normalizeRoot(args.outputDocsAbsRoot)
  const agenticDocsAbsRoot = normalizeRoot(args.agenticDocsAbsRoot)
  const knowgrphWorkspaceSeedsAbsRoot = normalizeRoot(args.knowgrphWorkspaceSeedsAbsRoot)
  if (!docsAbsRoot) return agenticDocsAbsRoot ? [{ absRoot: agenticDocsAbsRoot }] : []
  const requests: WorkspaceDocsMirrorLocalRootRequest[] = [{
    absRoot: docsAbsRoot,
    ...(knowgrphWorkspaceSeedsAbsRoot ? { excludedRelPathRoots: [KNOWGRPH_WORKSPACE_SEEDS_WORKSPACE_ROOT_NAME] } : {}),
  }]
  if (knowgrphWorkspaceSeedsAbsRoot) {
    requests.push({
      absRoot: knowgrphWorkspaceSeedsAbsRoot,
      workspaceRootName: KNOWGRPH_WORKSPACE_SEEDS_WORKSPACE_ROOT_NAME,
    })
  }
  if (outputDocsAbsRoot) {
    requests.push({ absRoot: outputDocsAbsRoot, workspaceRootName: 'docs_' })
  }
  if (agenticDocsAbsRoot) {
    requests.push({
      absRoot: agenticDocsAbsRoot,
      workspaceRootName: AGENTIC_CANVAS_OS_DOCS_WORKSPACE_ROOT_NAME,
    })
  }
  return requests
}
