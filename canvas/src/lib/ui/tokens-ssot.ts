export * from 'grph-shared/ui/kgTokens'

export const readRootCssStateKey = (): string => {
  if (typeof document === 'undefined') return ''
  const root = document.documentElement
  const theme = root.getAttribute('data-theme') || ''
  const darkVariant = root.getAttribute('data-dark-variant') || ''
  const className = root.className || ''
  const style = root.getAttribute('style') || ''
  return `${theme}|${darkVariant}|${className}|${style}`
}
