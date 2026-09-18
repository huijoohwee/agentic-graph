import React from 'react'
const MarkdownWorkspaceLazy = React.lazy(() =>
  import('@/lib/markdown-workspace-runtime').then(mod => ({ default: mod.MarkdownWorkspace })),
)

export function EmbeddedEditorShell(props: { active: boolean }) {
  return <section className={`relative w-full h-full ${props.active ? 'pointer-events-auto' : 'pointer-events-none'}`} aria-hidden={!props.active}>
    <section className="absolute inset-0"><React.Suspense fallback={null}>
      <MarkdownWorkspaceLazy active={props.active} />
    </React.Suspense></section>
  </section>
}
