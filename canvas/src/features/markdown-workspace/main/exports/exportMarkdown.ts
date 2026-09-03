import { saveBlobWithPicker, downloadBlob } from '@/lib/graph/save'
import { writeAgenticOsCompanionOutputText } from '@/features/chat/chatHistoryWorkspace.output'

export async function exportMarkdownFile(args: {
  exportBaseName: string
  text: string
  activeDocumentPath?: string | null
}): Promise<void> {
  try {
    const text = String(args.text || '')
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' })
    const name = `${String(args.exportBaseName || '').trim() || 'document'}.md`
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
