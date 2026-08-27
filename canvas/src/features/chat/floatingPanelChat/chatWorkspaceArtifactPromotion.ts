import { normalizeWorkspacePath } from '@/features/workspace-fs/path'
import type { UiToastInput } from '@/hooks/store/types'
import { buildChatPromotionRetryInsertAction } from './floatingPanelChatPromotionRetryUiAction'

const GENERATED_ARTIFACT_PROMOTION_TOAST_TTL_MS = 12_000

export type WorkspaceArtifactPromotion = 'LOCAL_ONLY' | 'MIRRORED_GITHUB' | 'MIRRORED_STORAGE' | 'MIRRORED_GITHUB+STORAGE' | 'PROMOTION_FAILED'

export const normalizeAssistantWorkspacePath = (value: unknown): string => {
  const raw = String(value || '').trim()
  if (!raw) return ''
  return normalizeWorkspacePath(raw.startsWith('workspace:') ? raw.slice('workspace:'.length) : raw)
}

export type PromoteGeneratedChatWorkspacePathsResult = {
  paths: string[]
  githubStatus: 'applied' | 'skipped' | 'failed'
  githubError?: string
  storageStatus: 'applied' | 'skipped' | 'failed'
  storageError?: string
}

export const toWorkspaceArtifactPromotion = (
  result: PromoteGeneratedChatWorkspacePathsResult | null,
): WorkspaceArtifactPromotion | null => {
  if (!result || result.paths.length === 0) return null
  if (result.githubStatus === 'applied' && result.storageStatus === 'applied') return 'MIRRORED_GITHUB+STORAGE'
  if (result.githubStatus === 'applied') return 'MIRRORED_GITHUB'
  if (result.storageStatus === 'applied') return 'MIRRORED_STORAGE'
  if (result.githubStatus === 'failed' || result.storageStatus === 'failed') return 'PROMOTION_FAILED'
  return 'LOCAL_ONLY'
}

export const buildWorkspacePromotionFailureNote = (
  result: PromoteGeneratedChatWorkspacePathsResult | null,
): string | null => {
  if (!result || (result.githubStatus !== 'failed' && result.storageStatus !== 'failed')) return null
  const details: string[] = []
  if (result.githubStatus === 'failed') details.push(`github: ${String(result.githubError || 'failed')}`)
  else details.push(`github: ${result.githubStatus}`)
  if (result.storageStatus === 'failed') details.push(`storage: ${String(result.storageError || 'failed')}`)
  else details.push(`storage: ${result.storageStatus}`)
  return `- Promotion note: mirroring failed (${details.join('; ')}).`
}

export const buildWorkspacePromotionRetryHint = (
  result: PromoteGeneratedChatWorkspacePathsResult | null,
): string | null => {
  if (!result || (result.githubStatus !== 'failed' && result.storageStatus !== 'failed')) return null
  const githubError = String(result.githubError || '').trim().toLowerCase()
  const storageError = String(result.storageError || '').trim().toLowerCase()
  if (githubError.includes('fetch_unavailable')) {
    return '- Retry hint: rerun from a fetch-capable runtime or browser session before mirroring again.'
  }
  if (githubError.includes('github_write_failed')) {
    return '- Retry hint: verify the GitHub write route/config, or rerun with GitHub mirroring disabled for a local-only save.'
  }
  if (storageError.includes('storage_publish_failed')) {
    return '- Retry hint: verify AgenticGraph storage sync availability, then rerun mirroring for the saved local artifact.'
  }
  if (result.githubStatus === 'failed') {
    return '- Retry hint: resolve the GitHub mirroring failure, then rerun promotion for the saved local artifact.'
  }
  if (result.storageStatus === 'failed') {
    return '- Retry hint: resolve the storage mirroring failure, then rerun promotion for the saved local artifact.'
  }
  return null
}

export const buildWorkspacePromotionRetryCommand = (
  result: PromoteGeneratedChatWorkspacePathsResult | null,
): string | null => {
  if (!result || (result.githubStatus !== 'failed' && result.storageStatus !== 'failed')) return null
  const retryPaths = [...new Set(result.paths.map(normalizeAssistantWorkspacePath).filter(Boolean))]
  if (!retryPaths.length) return null
  return `- Retry command: \`#promotion.retry ${retryPaths.join(' ')}\``
}

const stripWorkspaceLedgerLinePrefix = (value: string | null): string => String(value || '').trim().replace(/^-+\s*/, '')

export const buildWorkspacePromotionRetryToast = (
  result: PromoteGeneratedChatWorkspacePathsResult | null,
): UiToastInput | null => {
  if (!result || (result.githubStatus !== 'failed' && result.storageStatus !== 'failed')) return null
  const retryPaths = [...new Set(result.paths.map(normalizeAssistantWorkspacePath).filter(Boolean))]
  if (!retryPaths.length) return null
  const retryCommand = stripWorkspaceLedgerLinePrefix(buildWorkspacePromotionRetryCommand(result))
  const retryHint = stripWorkspaceLedgerLinePrefix(buildWorkspacePromotionRetryHint(result))
  const artifactLabel = retryPaths.length === 1 ? 'artifact' : 'artifacts'
  const messageLines = [`Artifact mirroring failed for the saved local ${artifactLabel}.`]
  if (retryCommand) messageLines.push(retryCommand)
  else if (retryHint) messageLines.push(retryHint)
  return {
    id: `chat-promotion-retry:${retryPaths[0]}`,
    kind: 'warning',
    message: messageLines.join('\n'),
    ttlMs: GENERATED_ARTIFACT_PROMOTION_TOAST_TTL_MS,
    dismissible: true,
    actions: retryCommand ? [buildChatPromotionRetryInsertAction(retryCommand, `chat-promotion-retry:${retryPaths[0]}`)] : undefined,
  }
}

type GeneratedChatPromotionFetch = typeof fetch

export const promoteGeneratedChatWorkspacePaths = async (
  paths: ReadonlyArray<string | null | undefined>,
  options: {
    githubEnabled?: boolean
    githubBaseUrl?: string | null
    githubFetchImpl?: GeneratedChatPromotionFetch
    storageWorkspaceId?: string | null
    storageSyncNow?: boolean
    storageBaseUrl?: string | null
    storageDeviceId?: string | null
    storageFetchImpl?: GeneratedChatPromotionFetch
  } = {},
): Promise<PromoteGeneratedChatWorkspacePathsResult> => {
  const uniquePaths = [...new Set(paths.map(normalizeAssistantWorkspacePath).filter(path => path && path !== '/'))]
  const result: PromoteGeneratedChatWorkspacePathsResult = {
    paths: uniquePaths,
    githubStatus: 'skipped',
    storageStatus: 'skipped',
  }
  if (uniquePaths.length === 0) return result
  let githubWriteApplied = false
  try {
    const { publishGeneratedWorkspacePathsToGitHub } = await import('@/features/source-files/sourceFilesGitHubWrite')
    const githubResult = await publishGeneratedWorkspacePathsToGitHub({
      paths: uniquePaths,
      enabled: options.githubEnabled,
      baseUrl: options.githubBaseUrl,
      fetchImpl: options.githubFetchImpl,
    })
    githubWriteApplied = githubResult.status === 'applied'
    result.githubStatus = githubResult.status === 'applied' ? 'applied' : 'skipped'
    if (githubResult.status === 'failed') {
      const error = githubResult.error || 'github_write_failed'
      console.warn('[agenticgraph-github] generated chat artifact promotion failed before storage fallback', error)
      return { ...result, githubStatus: 'failed', githubError: error, storageStatus: 'skipped' }
    }
  } catch (error) {
    console.warn('[agenticgraph-github] generated chat artifact promotion skipped before storage fallback', error)
    result.githubStatus = 'skipped'
  }
  try {
    const { publishGeneratedWorkspacePathsToAgenticGraphStorage } = await import('@/features/source-files/sourceFileShareUrl')
    const storageResult = await publishGeneratedWorkspacePathsToAgenticGraphStorage({
      paths: uniquePaths,
      workspaceId: options.storageWorkspaceId,
      syncNow: options.storageSyncNow,
      baseUrl: options.storageBaseUrl,
      deviceId: options.storageDeviceId,
      fetchImpl: options.storageFetchImpl,
    })
    result.storageStatus = storageResult.storedCount > 0 ? 'applied' : 'skipped'
  } catch (error) {
    console.warn(
      githubWriteApplied
        ? '[agenticgraph-storage] generated chat artifact secondary storage promotion skipped after GitHub write'
        : '[agenticgraph-storage] generated chat artifact promotion skipped',
      error,
    )
    result.storageStatus = 'failed'
    result.storageError = error instanceof Error ? error.message : String(error || 'storage_publish_failed')
  }
  return result
}

export type RetryGeneratedChatWorkspaceArtifactPromotionResult = PromoteGeneratedChatWorkspacePathsResult & {
  promotion: WorkspaceArtifactPromotion | null
  failureNote: string | null
  retryHint: string | null
  retryCommand: string | null
}

export const retryGeneratedChatWorkspaceArtifactPromotion = async (args: {
  paths: ReadonlyArray<string | null | undefined>
  githubEnabled?: boolean
  githubBaseUrl?: string | null
  githubFetchImpl?: GeneratedChatPromotionFetch
  storageWorkspaceId?: string | null
  storageSyncNow?: boolean
  storageBaseUrl?: string | null
  storageDeviceId?: string | null
  storageFetchImpl?: GeneratedChatPromotionFetch
}): Promise<RetryGeneratedChatWorkspaceArtifactPromotionResult> => {
  const result = await promoteGeneratedChatWorkspacePaths(args.paths, {
    githubEnabled: args.githubEnabled,
    githubBaseUrl: args.githubBaseUrl,
    githubFetchImpl: args.githubFetchImpl,
    storageWorkspaceId: args.storageWorkspaceId,
    storageSyncNow: args.storageSyncNow,
    storageBaseUrl: args.storageBaseUrl,
    storageDeviceId: args.storageDeviceId,
    storageFetchImpl: args.storageFetchImpl,
  })
  return {
    ...result,
    promotion: toWorkspaceArtifactPromotion(result),
    failureNote: buildWorkspacePromotionFailureNote(result),
    retryHint: buildWorkspacePromotionRetryHint(result),
    retryCommand: buildWorkspacePromotionRetryCommand(result),
  }
}
