export type WorkspaceDocsMirrorLocalRootRequest = {
  absRoot: string
  workspaceRootName?: string
  excludedRelPathRoots?: string[]
}

const AGENTIC_CANVAS_OS_DOCS_WORKSPACE_ROOT_NAME = 'agentic-canvas-os/docs'
const AGENTICGRAPH_WORKSPACE_SEEDS_WORKSPACE_ROOT_NAME = 'workspace-seeds'

const normalizeRoot = (value: unknown): string => String(value || '').trim().replace(/\\/g, '/').replace(/\/+$/, '')

export function resolveWorkspaceDocsMirrorLocalRootRequests(args: {
  docsAbsRoot: unknown
  outputDocsAbsRoot?: unknown
  agenticDocsAbsRoot: unknown
  workspaceSeedsReadAbsRoot?: unknown
}): WorkspaceDocsMirrorLocalRootRequest[] {
  const docsAbsRoot = normalizeRoot(args.docsAbsRoot)
  const outputDocsAbsRoot = normalizeRoot(args.outputDocsAbsRoot)
  const agenticDocsAbsRoot = normalizeRoot(args.agenticDocsAbsRoot)
  const workspaceSeedsReadAbsRoot = normalizeRoot(args.workspaceSeedsReadAbsRoot)
  const requests: WorkspaceDocsMirrorLocalRootRequest[] = []
  if (docsAbsRoot) {
    requests.push({
      absRoot: docsAbsRoot,
      ...(workspaceSeedsReadAbsRoot ? { excludedRelPathRoots: [AGENTICGRAPH_WORKSPACE_SEEDS_WORKSPACE_ROOT_NAME] } : {}),
    })
  }
  if (workspaceSeedsReadAbsRoot) {
    requests.push({
      absRoot: workspaceSeedsReadAbsRoot,
      workspaceRootName: AGENTICGRAPH_WORKSPACE_SEEDS_WORKSPACE_ROOT_NAME,
    })
  }
  if (outputDocsAbsRoot) {
    requests.push({ absRoot: outputDocsAbsRoot, workspaceRootName: 'docs_' })
  }
  if (agenticDocsAbsRoot) {
    requests.push(requests.length === 0
      ? { absRoot: agenticDocsAbsRoot }
      : {
          absRoot: agenticDocsAbsRoot,
          workspaceRootName: AGENTIC_CANVAS_OS_DOCS_WORKSPACE_ROOT_NAME,
        })
  }
  return requests
}
