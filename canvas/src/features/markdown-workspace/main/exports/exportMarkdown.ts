import { saveBlobWithPicker, downloadBlob } from '@/lib/graph/save'
import { writeAgenticOsCompanionOutputText, writeWorkspaceBlobArtifactAtPath } from '@/features/chat/chatHistoryWorkspace.output'
import { readWorkspaceInitializationOutputDocsAbsRoot } from '@/features/workspace-fs/workspaceSeedProviderPaths'

export async function exportMarkdownFile(args: {
  exportBaseName: string
  text: string
  activeDocumentPath?: string | null
}): Promise<void> {
  try {
    const text = String(args.text || '')
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' })
    const base = String(args.exportBaseName || '').trim().replace(/[\\/\u0000-\u001f]/g, '_')
    const name = `${base && !/^\.+$/.test(base) ? base : 'document'}.md`
    const outputRoot = readWorkspaceInitializationOutputDocsAbsRoot()
    if (outputRoot) {
      const savedPath = await writeWorkspaceBlobArtifactAtPath({ absolutePath: `${outputRoot}/${name}`, blob })
      if (savedPath) {
        await writeAgenticOsCompanionOutputText({ workspacePath: args.activeDocumentPath, extension: 'md', text })
        return
      }
    }
    const saved = await saveBlobWithPicker(blob, name, { description: 'Markdown Files', accept: { 'text/markdown': ['.md'] } })
    if (saved === '') return
    if (!saved) downloadBlob(blob, name)
    await writeAgenticOsCompanionOutputText({
      workspacePath: args.activeDocumentPath,
      extension: 'md',
      text,
    })
  } catch {
    void 0
  }
}
