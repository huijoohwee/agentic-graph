import { useState, useEffect } from 'react'
import { getKgThemeFromDom, type KgTheme } from '@/lib/ui/tokens-ssot'

export function useThemeDetector(): KgTheme {
  const [theme, setTheme] = useState<KgTheme>(() => getKgThemeFromDom())

  useEffect(() => {
    const handleMutation = () => {
      const next = getKgThemeFromDom()
      setTheme(prev => (prev !== next ? next : prev))
    }
    const observer = new MutationObserver(handleMutation)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme', 'data-dark-variant'],
    })
    return () => observer.disconnect()
  }, [])

  return theme
}
