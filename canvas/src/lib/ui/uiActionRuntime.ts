import { runChatPromotionRetryUiAction } from '@/features/chat/floatingPanelChat/floatingPanelChatPromotionRetryUiAction'
import { runAgenticGraphStorageConflictAction } from '@/lib/storage/agentic-graph-storage-conflict-actions'

export const runUiAction = async (actionId: string): Promise<boolean> => {
  if (actionId.startsWith('canvas-authoring.cancel:')) {
    const { cancelCanvasProjection } = await import('@/features/chat/floatingPanelChat/canvasProjectionSubmit')
    return cancelCanvasProjection(actionId)
  }
  if (await runChatPromotionRetryUiAction(actionId)) return true
  if (await runAgenticGraphStorageConflictAction(actionId)) return true
  return false
}
