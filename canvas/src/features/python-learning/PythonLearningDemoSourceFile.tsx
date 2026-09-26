import React from 'react'
import { getWorkspaceFs } from '@/features/workspace-fs/workspaceFs'
import { applyWorkspaceImportToCanvas } from '@/features/workspace-fs/applyWorkspaceImportToCanvas'
import { runWorkspaceFsChangedBatch } from '@/features/workspace-fs/workspaceFsEvents'
import { ensureLearningLessonFiles } from './learningLessonFiles'

/** Files render through the ordinary explorer; this component only bootstraps them. */
export function PythonLearningDemoSourceFile() {
  const [error, setError] = React.useState('')
  const [attempt, retry] = React.useReducer(value => value + 1, 0)
  React.useEffect(() => {
    let live = true
    setError('')
    void getWorkspaceFs().then(fs => runWorkspaceFsChangedBatch(async () => {
      const entries = await ensureLearningLessonFiles(fs, attempt > 0)
      await applyWorkspaceImportToCanvas({ fs, createdPaths: entries.map(entry => entry.path),
        opts: { applyToGraph: false, skipComposedGraphApply: true } })
    })).catch(cause => {
      if (live) setError(cause instanceof Error ? cause.message : 'Could not save Python lesson files.')
    })
    return () => { live = false }
  }, [attempt])
  return error ? <p role="alert" className="px-2 text-xs">{error} <button type="button" onClick={retry}>Retry lesson files</button></p> : null
}
