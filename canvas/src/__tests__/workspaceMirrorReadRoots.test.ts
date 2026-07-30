import path from 'node:path'
import {
  isWorkspaceMirrorReadPathAllowed,
  resolveWorkspaceMirrorReadRoots,
} from '../../viteWorkspaceMirrorReadRoots'

export function testWorkspaceMirrorReadRootsAdmitConfiguredCanonicalDocsFromTaskWorktree(): void {
  const workspaceRoot = path.resolve('/workspace')
  const taskRepoRoot = path.join(workspaceRoot, '.worktrees', 'knowgrph', 'prompt-presets')
  const canonicalAgenticDocsRoot = path.join(workspaceRoot, 'agentic-canvas-os', 'docs')
  const roots = resolveWorkspaceMirrorReadRoots({
    repoRoot: taskRepoRoot,
    configuredRoots: ['', canonicalAgenticDocsRoot, canonicalAgenticDocsRoot],
  })

  if (!isWorkspaceMirrorReadPathAllowed(path.join(canonicalAgenticDocsRoot, 'PROMPT-PRESETS.md'), roots)) {
    throw new Error(`expected the configured canonical docs root to remain readable from task Dev, got ${JSON.stringify(roots)}`)
  }
  if (roots.filter(root => root === canonicalAgenticDocsRoot).length !== 1) {
    throw new Error(`expected configured read roots to be normalized and deduplicated, got ${JSON.stringify(roots)}`)
  }
  if (isWorkspaceMirrorReadPathAllowed(path.join(workspaceRoot, 'private', 'secret.md'), roots)) {
    throw new Error('expected an unrelated sibling path to remain outside the task Dev mirror read policy')
  }
}
