import { normalizeRemoteVideoFrameFormat } from 'grph-shared/rich-media/providers'
import { LS_KEYS } from '@/lib/config.ls.keys'
import { getLocalStorage } from '@/lib/persistence'

export function readWorkspaceFrameFormat() {
  return normalizeRemoteVideoFrameFormat(getLocalStorage()?.getItem(LS_KEYS.workspaceImportVideoFrameFormat))
}

export function writeWorkspaceFrameFormat(value: unknown) {
  const storage = getLocalStorage()
  if (!storage) throw new Error('Browser storage is unavailable for the video frame format setting.')
  storage.setItem(LS_KEYS.workspaceImportVideoFrameFormat, normalizeRemoteVideoFrameFormat(value))
}
