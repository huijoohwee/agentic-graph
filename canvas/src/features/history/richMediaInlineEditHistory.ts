import { useGraphStore } from '@/hooks/useGraphStore'

export const RICH_MEDIA_INLINE_EDIT_HISTORY_LABEL = 'Rich Media inline edit'

export function commitRichMediaInlineEditVersion(args: {
  currentText: string
  nextText: string
  commit: () => void
}): boolean {
  if (args.nextText === args.currentText) return false

  const store = useGraphStore.getState()
  store.addHistory(`Before ${RICH_MEDIA_INLINE_EDIT_HISTORY_LABEL}`)
  args.commit()
  useGraphStore.getState().addHistory(RICH_MEDIA_INLINE_EDIT_HISTORY_LABEL)
  return true
}
