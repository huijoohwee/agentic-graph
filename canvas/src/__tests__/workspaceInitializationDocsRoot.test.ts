import path from 'node:path'
import { resolveWorkspaceInitializationDocsRoot } from '../../viteWorkspaceInitializationDocsRoot'

export function testWorkspaceInitializationDocsRootFindsCanonicalSiblingFromTaskWorktree(): void {
  const githubRoot = path.resolve('/workspace')
  const canonicalDocsRoot = path.join(githubRoot, 'huijoohwee', 'docs')
  const resolved = resolveWorkspaceInitializationDocsRoot({
    siblingDocsRoot: path.join(githubRoot, '.worktrees', 'agenticgraph', 'seed-reconciliation', '..', 'huijoohwee', 'docs'),
    gitCommonDir: path.join(githubRoot, 'agenticgraph', '.git'),
    exists: candidate => candidate === canonicalDocsRoot,
  })

  if (resolved !== canonicalDocsRoot) {
    throw new Error(`expected the task worktree to resolve canonical docs, got ${resolved}`)
  }
}

export function testWorkspaceInitializationDocsRootPrefersDirectSibling(): void {
  const directDocsRoot = path.resolve('/workspace/huijoohwee/docs')
  const resolved = resolveWorkspaceInitializationDocsRoot({
    siblingDocsRoot: directDocsRoot,
    gitCommonDir: path.resolve('/other/agenticgraph/.git'),
    exists: candidate => candidate === directDocsRoot,
  })

  if (resolved !== directDocsRoot) {
    throw new Error(`expected the direct sibling docs root, got ${resolved}`)
  }
}
