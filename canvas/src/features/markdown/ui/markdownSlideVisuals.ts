import React from 'react'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { applyMediaProxySrc } from '@/lib/url'
import { resolveHref } from '@/features/markdown/ui/markdownPreviewLinks'

export type SlideVisualMeta = {
  slideClass: string
  layout: string
  backgroundRaw: string
  backgroundSize: string
  backgroundPosition: string
  authors: string[]
  meeting: string
  date: string
  venue: string
  url: string
  themeStyle: string
  institution: string
}

export const normalizeThemeStyle = (raw: string): 'default' | 'academic' => {
  const t = raw.trim().toLowerCase()
  if (t === 'academic') return 'academic'
  if (t === 'neversink') return 'academic'
  return 'default'
}

const getThemeBaseSlideClass = (themeStyle: string) => {
  if (themeStyle === 'academic') {
    return `${UI_THEME_TOKENS.panel.bg} ${UI_THEME_TOKENS.text.primary} tracking-normal`
  }
  return ''
}

export const buildBackgroundStyle = (
  activeDocumentPath: string,
  raw: string,
  size: string,
  position: string,
): React.CSSProperties => {
  const style: React.CSSProperties = {}
  const value = raw.trim()
  if (!value) return style

  const lower = value.toLowerCase()
  if (
    value.startsWith('#') ||
    lower.startsWith('rgb') ||
    lower.startsWith('hsl') ||
    lower.includes('gradient(')
  ) {
    style.background = value
  } else {
    const resolved = resolveHref(value, activeDocumentPath)
    style.backgroundImage = `url(${applyMediaProxySrc(resolved)})`
    style.backgroundSize = size
    style.backgroundPosition = position
  }
  return style
}

export const getSlideVisualMeta = (
  slideMeta: Record<string, unknown>,
  headMetaRecord: Record<string, unknown>,
  uiPanelTextFontClass: string,
): SlideVisualMeta => {
  const slideClassRaw = String(slideMeta.class || headMetaRecord.class || '').trim()
  const layout = String(slideMeta.layout || headMetaRecord.layout || '').trim().toLowerCase()
  const backgroundRaw = String(slideMeta.background || headMetaRecord.background || '').trim()
  const backgroundSize =
    String(slideMeta.backgroundSize || headMetaRecord.backgroundSize || '').trim() || 'cover'
  const backgroundPosition =
    String(slideMeta.backgroundPosition || headMetaRecord.backgroundPosition || '').trim() || 'center'
  
  const authorsRaw = slideMeta.authors || headMetaRecord.authors || []
  const authors = Array.isArray(authorsRaw) ? authorsRaw.map(String) : [String(authorsRaw)].filter(Boolean)
  const meeting = String(slideMeta.meeting || headMetaRecord.meeting || '').trim()
  const date = String(slideMeta.date || headMetaRecord.date || '').trim()
  const venue = String(slideMeta.venue || headMetaRecord.venue || '').trim()
  const url = String(slideMeta.url || headMetaRecord.url || '').trim()
  const themeStyle = normalizeThemeStyle(String(slideMeta.theme || headMetaRecord.theme || ''))
  const institution = String(slideMeta.institution || headMetaRecord.institution || '').trim()
  const themeBaseClass = getThemeBaseSlideClass(themeStyle)
  const slideClass = [themeBaseClass, uiPanelTextFontClass, slideClassRaw].filter(Boolean).join(' ')

  return {
    slideClass,
    layout,
    backgroundRaw,
    backgroundSize,
    backgroundPosition,
    authors,
    meeting,
    date,
    venue,
    url,
    themeStyle,
    institution,
  }
}
