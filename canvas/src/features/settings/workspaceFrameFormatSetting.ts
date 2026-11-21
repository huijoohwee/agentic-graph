import { DEFAULT_REMOTE_VIDEO_FRAME_FORMAT, REMOTE_VIDEO_FRAME_FORMAT_LABELS } from 'grph-shared/rich-media/providers'
import { readWorkspaceFrameFormat, writeWorkspaceFrameFormat } from '@/lib/rich-media/videoFrameSettings'
import type { SettingMeta } from './types'

export const FRAME_FORMAT_SETTING: SettingMeta = {
  key: 'workspace.import.videoFrames.format',
  type: 'string',
  source: 'localStorage',
  options: Object.values(REMOTE_VIDEO_FRAME_FORMAT_LABELS),
  valueHelp: [
    'PNG preserves fine text and edges. Files are larger.',
    'JPEG encodes quickly into small files. Fine text can blur.',
    'WebP often saves more space. Encoding takes longer and fine detail can soften.',
  ].join('\n'),
  read: () => REMOTE_VIDEO_FRAME_FORMAT_LABELS[readWorkspaceFrameFormat()],
  write: writeWorkspaceFrameFormat,
  default: () => REMOTE_VIDEO_FRAME_FORMAT_LABELS[DEFAULT_REMOTE_VIDEO_FRAME_FORMAT],
}
