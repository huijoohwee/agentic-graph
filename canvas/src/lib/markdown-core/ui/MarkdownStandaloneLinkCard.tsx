import { isAbsoluteWebUrl, isSafeHref } from '@/features/markdown/ui/markdownPreviewLinks'
import React from 'react'
import type { Token, TokensParagraph, TokensLink, TokensText, TokensGeneric, TokensImage } from '@/features/markdown/ui/MarkdownTokens'
import type { RenderOpts } from '@/features/markdown/ui/MarkdownRendererTypes'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'

export const extractLinkText = (token: Token): string => {
  const p = token as unknown as TokensParagraph
  const inner = Array.isArray(p.tokens) ? p.tokens : []
  for (const t of inner) {
    const tt = t as unknown as { type?: unknown }
    if (String(tt.type || '') === 'link') {
      const link = t as unknown as TokensLink
      const children = Array.isArray(link.tokens) ? link.tokens : []
      return children.map(c => String((c as unknown as TokensText).text || '')).join('').trim()
    }
  }
  return ''
}
export const extractDomain = (href: string): string => {
  try {
    const u = new URL(href)
    return u.hostname || ''
  } catch {
    return ''
  }
}
type StandaloneLinkCardProps = {
  href: string
  title: string
  domain: string
  opts: RenderOpts
}
export const StandaloneLinkCard = React.memo(function StandaloneLinkCard({ href, title, domain }: StandaloneLinkCardProps) {
  const [imgError, setImgError] = React.useState(false)
  const faviconUrl = domain ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64` : ''
  const displayTitle = title || domain || href
  const truncatedUrl = href.length > 60 ? `${href.slice(0, 57)}...` : href
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`sm:flex ${UI_THEME_TOKENS.panel.bg} ${UI_THEME_TOKENS.panel.border} border rounded-xl shadow-sm hover:shadow-md transition-shadow no-underline text-inherit block`}
      onClick={e => e.stopPropagation()}
    >
      <section className="shrink-0 relative w-full rounded-t-xl overflow-hidden sm:rounded-s-xl sm:rounded-se-none sm:max-w-20 bg-gray-100 dark:bg-gray-800">
        {!imgError && faviconUrl ? (
          <img
            className="size-full absolute top-0 start-0 object-contain p-2"
            src={faviconUrl}
            alt=""
            onError={() => setImgError(true)}
          />
        ) : (
          <section className="flex items-center justify-center h-16 sm:h-full text-[color:var(--kg-text-tertiary)] text-xs font-mono">
            {domain ? domain.charAt(0).toUpperCase() : '?'}
          </section>
        )}
      </section>
      <section className="flex flex-wrap min-w-0">
        <section className="p-3 flex flex-col h-full sm:p-4 min-w-0">
          <h3 className={`font-semibold ${UI_THEME_TOKENS.text.primary} text-sm leading-snug truncate`}>
            {displayTitle}
          </h3>
          <p className={`mt-1 ${UI_THEME_TOKENS.text.secondary} text-xs truncate`}>
            {truncatedUrl}
          </p>
          <section className="mt-2 sm:mt-auto">
            <p className={`text-[10px] ${UI_THEME_TOKENS.text.secondary} font-mono`}>
              {domain}
            </p>
          </section>
        </section>
      </section>
    </a>
  )
})

export const getStandaloneLinkedImageParagraph = (
  token: Token,
): { linkHref: string; imageHref: string; imageAlt: string } | null => {
  const p = token as unknown as TokensParagraph
  const inner = Array.isArray(p.tokens) ? p.tokens : []
  const meaningful = inner.filter(t => {
    const type = String((t as unknown as { type?: unknown }).type || '')
    if (type === 'space' || type === 'br' || type === 'softbreak') return false
    if (type === 'text') return String((t as unknown as TokensText).text || '').trim().length > 0
    return true
  })
  if (meaningful.length !== 1) return null
  const only = meaningful[0] as unknown as TokensGeneric
  if (only.type !== 'link') return null
  const link = only as unknown as TokensLink
  const linkHref = String(link.href || '').trim()
  if (!linkHref || !isAbsoluteWebUrl(linkHref) || !isSafeHref(linkHref)) return null
  const linkTokens = Array.isArray(link.tokens) ? link.tokens : []
  const mediaTokens = linkTokens.filter(t => {
    const type = String((t as unknown as { type?: unknown }).type || '')
    if (type === 'space' || type === 'br' || type === 'softbreak') return false
    if (type === 'text') return String((t as unknown as TokensText).text || '').trim().length > 0
    return true
  })
  if (mediaTokens.length !== 1) return null
  const media = mediaTokens[0] as unknown as TokensGeneric
  if (media.type !== 'image') return null
  const image = media as unknown as TokensImage
  const imageHref = String(image.href || '').trim()
  if (!imageHref || !isSafeHref(imageHref)) return null
  return {
    linkHref,
    imageHref,
    imageAlt: String(image.text || '').trim() || imageHref,
  }
}
