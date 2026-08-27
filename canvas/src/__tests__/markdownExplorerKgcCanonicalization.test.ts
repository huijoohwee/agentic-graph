import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'

export function testMarkdownExplorerStoreKeepsKgcCompanionActivePathStable() {
  const previous = useMarkdownExplorerStore.getState().activePath
  try {
    useMarkdownExplorerStore.getState().setActivePath('/chat-log/kgc-trace_20260420220645.md')
    const activePath = useMarkdownExplorerStore.getState().activePath
    if (activePath !== '/chat-log/kgc-trace_20260420220645.md') {
      throw new Error('Expected markdown explorer active path to keep live KGC trace files stable')
    }

    useMarkdownExplorerStore.getState().setActivePath('/chat-log/kgc-output_20260420220645.png')
    const outputActivePath = useMarkdownExplorerStore.getState().activePath
    if (outputActivePath !== '/chat-log/kgc-output_20260420220645.png') {
      throw new Error('Expected markdown explorer active path to keep KGC output companions stable')
    }
  } finally {
    useMarkdownExplorerStore.getState().setActivePath(previous)
  }
}

export function testMarkdownExplorerStoreSkipsIdempotentActivePathSet() {
  const previousActive = useMarkdownExplorerStore.getState().activePath
  const previousLastSet = useMarkdownExplorerStore.getState().lastSetActivePath
  const target = '/docs/agenticgraph-video-demo.md' as const
  try {
    useMarkdownExplorerStore.getState().setActivePath(target)
    const firstSet = useMarkdownExplorerStore.getState().lastSetActivePath
    if (!firstSet || firstSet.path !== target) {
      throw new Error('Expected markdown explorer store to stamp lastSetActivePath when setting a new active path')
    }
    useMarkdownExplorerStore.getState().setActivePath(target)
    const secondSet = useMarkdownExplorerStore.getState().lastSetActivePath
    if (!secondSet || secondSet.atMs !== firstSet.atMs) {
      throw new Error('Expected markdown explorer store to skip idempotent active-path set updates and avoid redundant churn')
    }
  } finally {
    useMarkdownExplorerStore.getState().setActivePath(previousActive)
    if (previousActive == null && previousLastSet == null) {
      useMarkdownExplorerStore.setState({ lastSetActivePath: null })
    }
  }
}
