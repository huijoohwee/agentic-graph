import React from 'react'
import { useSourceFilesBootstrapSnapshot } from '@/features/source-files/sourceFilesBootstrapReadiness'
const MarkdownWorkspaceLazy = React.lazy(() =>
  import('@/lib/markdown-workspace-runtime').then(mod => ({ default: mod.MarkdownWorkspace })),
)

export function EmbeddedEditorShell(props: { active: boolean; bootstrapRuntimesEnabled?: boolean }) {
  const { basePhase } = useSourceFilesBootstrapSnapshot()
  const deferExplorerWrites = props.bootstrapRuntimesEnabled === true && basePhase === 'resolving'
  return <section className={`relative w-full h-full ${props.active ? 'pointer-events-auto' : 'pointer-events-none'}`} aria-hidden={!props.active}>
    <section className="absolute inset-0"><React.Suspense fallback={null}>
      <MarkdownWorkspaceLazy active={props.active} deferExplorerWrites={deferExplorerWrites} />
    </React.Suspense></section>
  </section>
}
