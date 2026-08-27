import path from 'node:path'
import { resolveWorkspaceInitializationWorkspaceSeedsReadRoot } from '../../viteWorkspaceSeedsReadRoot'

export function testWorkspaceInitializationSeedsReadRootUsesActiveWorktree(): void {
  const repoRoot = path.resolve('/workspace/.worktrees/agenticgraph/canonical')
  const resolved = resolveWorkspaceInitializationWorkspaceSeedsReadRoot({
    command: 'serve',
    repoRoot,
  })

  if (resolved !== path.join(repoRoot, 'docs', 'workspace-seeds')) {
    throw new Error(`expected the active worktree seed root, got ${resolved}`)
  }
}

export function testWorkspaceInitializationSeedsReadRootHonorsExplicitFixture(): void {
  const explicitRoot = path.resolve('/workspace/fixtures/workspace-seeds')
  const resolved = resolveWorkspaceInitializationWorkspaceSeedsReadRoot({
    command: 'serve',
    repoRoot: path.resolve('/workspace/.worktrees/agenticgraph/canonical'),
    explicitAbsRoot: explicitRoot,
  })

  if (resolved !== explicitRoot) {
    throw new Error(`expected the explicit seed fixture root, got ${resolved}`)
  }
}

export function testWorkspaceInitializationSeedsReadRootStaysOutOfBuilds(): void {
  const resolved = resolveWorkspaceInitializationWorkspaceSeedsReadRoot({
    command: 'build',
    repoRoot: path.resolve('/workspace/.worktrees/agenticgraph/canonical'),
    explicitAbsRoot: path.resolve('/workspace/fixtures/workspace-seeds'),
  })

  if (resolved) {
    throw new Error(`expected no production seed root, got ${resolved}`)
  }
}
