import React from 'react'
import { getWorkspaceFs } from '@/features/workspace-fs/workspaceFs'
import type { WorkspaceEntry, WorkspacePath } from '@/features/workspace-fs/types'
import { MarkdownFileTree } from '@/features/markdown-workspace/MarkdownFileTree'

const DEMO_PATH = '/python-learning-demo.py'

/** Create an editable browser-local file only when the learner opens the bundled demo. */
export function PythonLearningDemoSourceFile({ search = '', onSelectFile, entry, onReady, cloudIndicator, represented }: {
  search?: string
  onSelectFile: (path: WorkspacePath) => void
  entry: WorkspaceEntry | null
  onReady: (entry: WorkspaceEntry) => void
  cloudIndicator?: React.ReactNode
  represented: boolean
}) {
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  if (!'python-learning-demo.py open python demo'.includes(search.trim().toLowerCase())) return null
  const open = async () => {
    if (busy) return
    setBusy(true); setError('')
    try {
      const fs = await getWorkspaceFs()
      let path = DEMO_PATH
      if (await fs.readFileText(path) === null) {
        const { LEARNING_LESSONS } = await import('./learningLessons')
        path = await fs.createFile({
          parentPath: '/', name: 'python-learning-demo.py',
          text: LEARNING_LESSONS[0].solution, mirrorToHost: false,
        })
      }
      const selected = (await fs.listEntries()).find(candidate => candidate.path === path && candidate.kind === 'file')
      if (!selected) throw new Error('The Python demo was not saved locally.')
      onReady(selected)
      onSelectFile(path)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not open the Python demo.')
    } finally {
      setBusy(false)
    }
  }
  return <>
    <button type="button" className="w-full px-2 py-1 text-left text-xs" disabled={busy} onClick={() => void open()}>
      {busy ? 'Opening Python demo…' : 'Open Python demo · local'}
    </button>
    {entry && !represented ? <MarkdownFileTree entries={[entry]} readOnly expandedPaths={new Set(['/'])}
      toggleExpanded={() => void 0} activePath={null} onSelectFile={onSelectFile}
      renderFileRight={() => cloudIndicator} /> : null}
    {error ? <p role="alert" className="px-2 text-xs">{error}</p> : null}
  </>
}
