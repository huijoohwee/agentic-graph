import {
  normalizeInvocationTokenSpacing,
  splitInvocationTokenSegments,
} from '@/lib/markdown/invocationTokens'

export const readLiveCanvasHeroPromptParameters = (prompt: string): string[] => {
  const parameters = splitInvocationTokenSegments(prompt)
    .filter(segment => segment.kind === 'token' && segment.tokenKind !== 'slash')
    .map(segment => segment.value)
  return [...new Set(parameters)]
}

export const liveCanvasHeroPromptHasParameter = (prompt: string, parameter: string): boolean => (
  splitInvocationTokenSegments(prompt).some(segment => (
    segment.kind === 'token' && segment.value.toLowerCase() === parameter.toLowerCase()
  ))
)

export const toggleLiveCanvasHeroPromptParameter = (prompt: string, parameter: string): string => {
  if (!liveCanvasHeroPromptHasParameter(prompt, parameter)) {
    return normalizeInvocationTokenSpacing([prompt.trim(), parameter].filter(Boolean).join(' '))
  }
  const withoutParameter = splitInvocationTokenSegments(prompt)
    .filter(segment => segment.kind !== 'token' || segment.value.toLowerCase() !== parameter.toLowerCase())
    .map(segment => segment.value)
    .join('')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
  return normalizeInvocationTokenSpacing(withoutParameter)
}
