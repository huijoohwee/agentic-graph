import React from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { getMarkdownWorkspaceActionBridge } from '@/features/markdown-explorer/workspaceActionBridge'
import { createId } from '@/lib/id'
import { mountWorkspaceProject } from './workspaceProjectClient.js'
import markup from './workspaceProjectMarkup.html?raw'
import './workspaceProject.css'

// One local project UI, mounted only while its native History section is open.
export default function WorkspaceProjectPanel() {
  const host = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const root = host.current
    if (!root) return
    root.innerHTML = markup
    const panel = mountWorkspaceProject(root, {
      captureFile() {
        const state = useGraphStore.getState()
        if (state.markdownDocumentText === null) return null
        return {
          path: String(state.markdownDocumentName || 'canvas.md').replace(/^\/+/, ''),
          content: state.markdownDocumentText,
        }
      },
      async openFile(file: { path: string; content: string; projectId: string }) {
        const state = useGraphStore.getState()
        const importFiles = getMarkdownWorkspaceActionBridge().importLocalFiles
        if (!importFiles) throw new Error('Open the Canvas editor workspace before importing a project copy.')
        const name = `projects/${file.projectId}/${createId('copy')}/${file.path}`
        state.addHistory('Before opening project copy')
        // The existing import owner materializes browser storage and selects the
        // copy. Assigning only markdownDocument would race its active selection.
        const result = await importFiles([new File([file.content], name, { type: 'text/plain' })])
        if (result && result.error) throw new Error(result.error)
        if (!result || !result.createdPaths?.length) throw new Error('Canvas did not import this file type. The project remains saved.')
        useGraphStore.getState().addHistory('Open project copy')
      },
    })
    return () => { panel.dispose(); root.replaceChildren() }
  }, [])
  return <div ref={host} className="workspace-project" aria-label="Project workspace" />
}
