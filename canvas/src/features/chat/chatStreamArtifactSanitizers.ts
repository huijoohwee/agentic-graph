import { sanitizeRequestIntent } from './chatAgenticOsRequestProfile'

export const sanitizeStreamArtifactPrompt = (requestText: string): string => {
  return sanitizeRequestIntent(requestText, 900) || 'Prompt unavailable.'
}

export const sanitizeChatHistoryTraceUserText = (requestText: string): string => {
  return sanitizeStreamArtifactPrompt(requestText)
}

const isLocalMediaAccessUrl = (value: string): boolean => {
  try {
    const url = new URL(value)
    return url.searchParams.has('agentic_os_media_token') || /\/api\/storage\/media\//i.test(url.pathname)
  } catch {
    return false
  }
}

export const filterPersistableObservedUrls = (urls: readonly string[]): string[] => (
  urls.filter(url => !isLocalMediaAccessUrl(url))
)
