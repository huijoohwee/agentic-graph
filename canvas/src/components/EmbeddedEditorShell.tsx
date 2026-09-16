import React from 'react'
import { useAgentRunWorkspace } from '@/features/agent-ready/agentRunInspectionStore'
const AgentRunInspectionLazy = React.lazy(() => import('@/features/agent-ready/AgentRunWorkspaceInspection'))

const MarkdownWorkspaceLazy = React.lazy(() =>
  import('@/lib/markdown-workspace-runtime').then(mod => ({ default: mod.MarkdownWorkspace })),
)

export function EmbeddedEditorShell(props: { active: boolean }) {
  const inspection = useAgentRunWorkspace()
  const authoredMounted = React.useRef(!inspection)
  if (!inspection) authoredMounted.current = true
  return (
    <section className={`relative w-full h-full ${props.active ? 'pointer-events-auto' : 'pointer-events-none'}`} aria-hidden={!props.active}>
      {authoredMounted.current && <section className="absolute inset-0" hidden={!!inspection}>
        <React.Suspense fallback={null}>
          <MarkdownWorkspaceLazy active={props.active && !inspection} />
        </React.Suspense>
      </section>}
      {inspection && <section className="absolute inset-0"><React.Suspense fallback={<p>Loading run workspace…</p>}>
        <AgentRunInspectionLazy surface="editor" />
      </React.Suspense></section>}
    </section>
  )
}
