import React from 'react'
import { getWorkspaceFs } from '@/features/workspace-fs/workspaceFs'
import type { WorkspaceEntry, WorkspacePath } from '@/features/workspace-fs/types'
import { MarkdownFileTree } from '@/features/markdown-workspace/MarkdownFileTree'
import { MarkdownFileTreeRowButton } from '@/features/markdown-workspace/MarkdownFileTreeRowButton'
import { FileText } from 'lucide-react'
import { usePanelTypography } from '@/lib/ui/panelTypography'
import { UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME } from '@/lib/ui/responsiveElementClasses'

const DEMO_PATH = '/python-learning-demo.py'

/** Create an editable browser-local file only when the learner opens the bundled demo. */
export function PythonLearningDemoSourceFile({ search = '', onSelectFile, entry, onReady, cloudIndicator, represented, buildCanvasEmbedUrl, onCanvasEmbedReady }: {
  search?: string
  onSelectFile: (path: WorkspacePath) => void
  entry: WorkspaceEntry | null
  onReady: (entry: WorkspaceEntry) => void
  cloudIndicator?: React.ReactNode
  represented: boolean
  buildCanvasEmbedUrl?: (entry: WorkspaceEntry) => Promise<string | null>
  onCanvasEmbedReady?: (entry: WorkspaceEntry, url: string) => void
}) {
  const panelTypography = usePanelTypography()
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
    {!entry ? <section className="group flex items-center" aria-label="Python demo starter">
      <MarkdownFileTreeRowButton ariaLabel="Open Python demo" title="Create and open python-learning-demo.py"
        indent={0} isActive={false} textClassName={panelTypography.panelTextClass}
        onClick={() => void open()} onContextMenu={event => event.preventDefault()}>
        <span className={UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME} aria-hidden="true" />
        <FileText className={UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME} aria-hidden="true" />
        <span className="truncate">{busy ? 'Opening Python demo…' : 'python-learning-demo.py'}</span>
      </MarkdownFileTreeRowButton>
    </section> : null}
    {entry && !represented ? <MarkdownFileTree readOnly entries={[entry]} expandedPaths={new Set(['/'])}
      toggleExpanded={() => void 0} activePath={null} onSelectFile={onSelectFile}
      buildCanvasEmbedUrl={buildCanvasEmbedUrl} onCanvasEmbedReady={onCanvasEmbedReady}
      renderFileRight={() => cloudIndicator} /> : null}
    {error ? <p role="alert" className="px-2 text-xs">{error}</p> : null}
  </>
}
