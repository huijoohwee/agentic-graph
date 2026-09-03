import {
  collectFloatingPanelChatMediaTokens,
  readFloatingPanelChatMediaPlaceholder,
  type FloatingPanelChatMediaToken,
} from './floatingPanelChatMediaTokens'
import type { ChatSubmitMessage } from './floatingPanelChatSubmitRequest'

export type OpenAiResponsesInputContent =
  | { type: 'input_text' | 'output_text'; text: string }
  | { type: 'input_image'; image_url: string; detail?: 'low' | 'high' | 'auto' }

export type OpenAiResponsesInputMessage = {
  type: 'message'
  role: ChatSubmitMessage['role']
  content: OpenAiResponsesInputContent[]
}

const INLINE_IMAGE_MAX_BYTES = 8 * 1024 * 1024

const isLocalMediaUrl = (value: string): boolean => {
  const raw = String(value || '').trim()
  if (/(?:[?&]agentic_os_media_token=)|\/api\/storage\/media\/|^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\//i.test(raw)) {
    return true
  }
  try {
    const url = new URL(raw, typeof window !== 'undefined' ? window.location.href : 'http://localhost')
    return (
      url.searchParams.has('agentic_os_media_token') ||
      /\/api\/storage\/media\//i.test(url.pathname) ||
      url.hostname === 'localhost' ||
      url.hostname === '127.0.0.1'
    )
  } catch {
    return false
  }
}

const replaceMediaTokensWithPlaceholders = (
  text: string,
  tokens: FloatingPanelChatMediaToken[],
): string => {
  const source = String(text || '').replace(/\r\n/g, '\n')
  if (tokens.length <= 0) return source
  let cursor = 0
  let out = ''
  for (const token of tokens) {
    if (token.index < cursor) continue
    out += source.slice(cursor, token.index)
    out += ` ${readFloatingPanelChatMediaPlaceholder(token)} `
    cursor = token.index + token.raw.length
  }
  out += source.slice(cursor)
  return out
}

export const sanitizeOpenAiResponsesMessageText = (
  text: string,
  tokens: FloatingPanelChatMediaToken[] = collectFloatingPanelChatMediaTokens(text),
): string => {
  return replaceMediaTokensWithPlaceholders(text, tokens)
    .replace(/\bhttps?:\/\/\S+/gi, value => isLocalMediaUrl(value) ? ' [attached media] ' : value)
    .replace(/\s+/g, ' ')
    .replace(/\s+([?.!,;:])/g, '$1')
    .trim()
}

const toFetchableUrl = (value: string): string => {
  try {
    return new URL(value, typeof window !== 'undefined' ? window.location.href : 'http://localhost').toString()
  } catch {
    return value
  }
}

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  let binary = ''
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return btoa(binary)
}

const fetchLocalImageAsDataUrl = async (url: string, fetchFn: typeof fetch): Promise<string> => {
  const response = await fetchFn(toFetchableUrl(url), { credentials: 'include' })
  if (!response.ok) return ''
  const blob = await response.blob()
  if (blob.size <= 0 || blob.size > INLINE_IMAGE_MAX_BYTES) return ''
  const mimeType = blob.type || response.headers.get('content-type') || 'image/png'
  if (!/^image\//i.test(mimeType)) return ''
  const base64 = arrayBufferToBase64(await blob.arrayBuffer())
  return `data:${mimeType};base64,${base64}`
}

const resolveImageUrlForResponses = async (url: string, fetchFn: typeof fetch): Promise<string> => {
  const value = String(url || '').trim()
  if (!value) return ''
  if (/^data:image\//i.test(value)) return value
  if (!isLocalMediaUrl(value)) return value
  try {
    return await fetchLocalImageAsDataUrl(value, fetchFn)
  } catch {
    return ''
  }
}

const buildUserInputContent = async (
  text: string,
  fetchFn: typeof fetch,
): Promise<OpenAiResponsesInputContent[]> => {
  const content: OpenAiResponsesInputContent[] = []
  const mediaTokens = collectFloatingPanelChatMediaTokens(text)
  const cleanText = sanitizeOpenAiResponsesMessageText(text, mediaTokens).slice(0, 4000).trim()
  if (cleanText) content.push({ type: 'input_text', text: cleanText })
  for (const ref of mediaTokens.filter(token => token.mediaKind === 'image').slice(0, 4)) {
    const imageUrl = await resolveImageUrlForResponses(ref.sourceUrl || '', fetchFn)
    if (imageUrl) content.push({ type: 'input_image', image_url: imageUrl, detail: 'auto' })
  }
  return content
}

export const buildOpenAiResponsesInput = async (
  messages: ChatSubmitMessage[],
  args: { fetchFn?: typeof fetch } = {},
): Promise<OpenAiResponsesInputMessage[]> => {
  const fetchFn = args.fetchFn || globalThis.fetch
  const out: OpenAiResponsesInputMessage[] = []
  for (const message of messages) {
    const text = String(message.content || '').trim()
    const contentType: OpenAiResponsesInputContent['type'] = message.role === 'assistant' ? 'output_text' : 'input_text'
    const content = message.role === 'user'
      ? await buildUserInputContent(text, fetchFn)
      : (text ? [{ type: contentType, text }] : [])
    if (content.length <= 0) continue
    out.push({
      type: 'message',
      role: message.role,
      content,
    })
  }
  return out
}
