import {
  createXrV2ConnectedPreviewTransport,
  type XrV2PreviewExtensionPort,
} from './connectedPreviewTransport'
import type { XrV2ConnectedPreviewAuthoringEdit } from './browserRuntimeEvidence'
import type { XrV2ConnectedPreviewViewerSession } from './xrV2ConnectedPreviewViewerRuntime'

/**
 * Exercises the exact structured transport path on an isolated stream before
 * revision-one measurement. This absorbs browser data-channel task/JIT startup
 * without promoting evidence or relaxing the measured 250 ms deadline.
 */
export async function warmXrV2ConnectedPreviewTransport(input: Readonly<{
  authorPort: XrV2PreviewExtensionPort
  viewerPort: XrV2PreviewExtensionPort
  viewerSession: XrV2ConnectedPreviewViewerSession
  authoringEdit: XrV2ConnectedPreviewAuthoringEdit
  signal: AbortSignal
}>): Promise<void> {
  const viewer = createXrV2ConnectedPreviewTransport({
    role: 'viewer',
    streamId: 'browser-preview-warmup',
    port: input.viewerPort,
    onViewerEdit: async (_edit, revision) => {
      await input.viewerSession.applyEdit(input.authoringEdit, revision, input.signal)
    },
  })
  const author = createXrV2ConnectedPreviewTransport({
    role: 'author',
    streamId: 'browser-preview-warmup',
    port: input.authorPort,
    latencyCeilingMs: 5_000,
  })
  try {
    const result = await author.submitEdit({ ...input.authoringEdit, operation: 'set-visible' })
    if (result.status !== 'acknowledged') {
      throw new Error(`Connected preview structured transport warm-up failed (${result.status}).`)
    }
  } finally {
    author.dispose()
    viewer.dispose()
  }
}
