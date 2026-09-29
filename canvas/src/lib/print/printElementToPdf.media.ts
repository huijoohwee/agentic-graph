import { UI_FONT_SANS } from 'grph-shared/ui/typography'
// Extracted helpers from printElementToPdf.ts
const captureVideoFrameAsDataUrl = (video: HTMLVideoElement): string | null => {
  try {
    if (!video.videoWidth || !video.videoHeight) return null
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(video, 0, 0)
    try {
      return canvas.toDataURL('image/png')
    } catch {
      return canvas.toDataURL('image/jpeg', 0.92)
    }
  } catch {
    return null
  }
}

const captureImageAsDataUrl = (img: HTMLImageElement): string | null => {
  try {
    if (!img.complete || !img.naturalWidth || !img.naturalHeight) return null
    const src = String(img.getAttribute('src') || '').trim()
    if (/\.svg(\?|#|$)/i.test(src)) return null
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(img, 0, 0)
    const px = img.naturalWidth * img.naturalHeight
    if (px > 1_200_000) return canvas.toDataURL('image/jpeg', 0.92)
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}

const YOUTUBE_ID_RE = /(?:youtube(?:-nocookie)?\.com\/(?:embed\/|watch\?v=|shorts\/|live\/)|youtu\.be\/)([\w-]+)/i
const PROXY_URL_RE = /^\/__(?:media|webpage|webpage_asset)_proxy\?url=(.+)$/i
const KNOWN_VIDEO_IFRAME_HOST_RE = /(youtube(?:-nocookie)?\.com|youtu\.be|bilibili\.com|tiktok\.com|douyin\.com|vimeo\.com|twitter\.com|x\.com)/i

type ThumbnailFormat = 'svg' | 'png' | 'jpg' | 'other'

const detectThumbnailFormat = (src: string): ThumbnailFormat => {
  const raw = String(src || '').trim().toLowerCase()
  if (!raw) return 'other'
  if (raw.startsWith('data:image/svg+xml') || /\.svg(\?|#|$)/i.test(raw)) return 'svg'
  if (
    raw.startsWith('data:image/png')
    || /\.png(\?|#|$)/i.test(raw)
    || raw.startsWith('data:image/webp')
    || /\.webp(\?|#|$)/i.test(raw)
    || raw.startsWith('data:image/avif')
    || /\.avif(\?|#|$)/i.test(raw)
  ) {
    return 'png'
  }
  if (raw.startsWith('data:image/jpeg') || raw.startsWith('data:image/jpg') || /\.jpe?g(\?|#|$)/i.test(raw)) return 'jpg'
  return 'other'
}

const thumbnailFormatScore = (format: ThumbnailFormat): number => {
  if (format === 'svg') return 3
  if (format === 'png') return 2
  if (format === 'jpg') return 1
  return 0
}

const pickPreferredThumbnailSource = (sources: Array<string | null | undefined>): string | null => {
  let best: { src: string; score: number } | null = null
  const seen = new Set<string>()
  for (let i = 0; i < sources.length; i += 1) {
    const raw = String(sources[i] || '').trim()
    if (!raw || seen.has(raw)) continue
    seen.add(raw)
    const score = thumbnailFormatScore(detectThumbnailFormat(raw))
    if (!best || score > best.score) best = { src: raw, score }
  }
  return best?.src || null
}

const probeImageUrl = (url: string, timeoutMs = 1_200): Promise<boolean> =>
  new Promise<boolean>((resolve) => {
    let settled = false
    const finish = (ok: boolean) => {
      if (settled) return
      settled = true
      resolve(ok)
    }
    const probe = new Image()
    probe.onload = () => finish(true)
    probe.onerror = () => finish(false)
    probe.src = url
    setTimeout(() => finish(false), timeoutMs)
  })

const unwrapProxyUrl = (src: string): string => {
  const m = src.match(PROXY_URL_RE)
  if (!m) return src
  try {
    return decodeURIComponent(m[1])
  } catch {
    return src
  }
}

const extractYouTubeVideoId = (url: string): string | null => {
  const unwrapped = unwrapProxyUrl(String(url || '').trim())
  const m = unwrapped.match(YOUTUBE_ID_RE)
  return m ? m[1] : null
}

const resolveYouTubeThumbnail = (ytId: string): Promise<string> => {
  const candidates = [
    `https://img.youtube.com/vi/${ytId}/maxresdefault.png`,
    `https://img.youtube.com/vi/${ytId}/sddefault.png`,
    `https://img.youtube.com/vi/${ytId}/hqdefault.png`,
    `https://img.youtube.com/vi/${ytId}/maxresdefault.jpg`,
    `https://img.youtube.com/vi/${ytId}/sddefault.jpg`,
    `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`,
  ]
  return new Promise<string>((resolve) => {
    const run = async () => {
      for (let i = 0; i < candidates.length; i += 1) {
        const candidate = candidates[i]
        const ok = await probeImageUrl(candidate)
        if (ok) {
          resolve(candidate)
          return
        }
      }
      resolve(candidates[candidates.length - 1])
    }
    void run()
  })
}

const createImg = (src: string, alt: string): HTMLImageElement => {
  const img = document.createElement('img')
  img.src = src
  img.alt = alt
  img.style.width = '100%'
  img.style.maxWidth = '100%'
  img.style.height = 'auto'
  img.style.display = 'block'
  img.style.objectFit = 'contain'
  return img
}

const buildVideoFallbackSvgThumbnail = (href: string): string => {
  const label = inferPlatformLabel(href)
  const host = (() => {
    try {
      const url = new URL(href)
      return url.hostname.replace(/^www\./, '')
    } catch {
      return ''
    }
  })()
  const esc = (value: string): string =>
    value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0b1020"/>
      <stop offset="100%" stop-color="#1f2937"/>
    </linearGradient>
  </defs>
  <rect width="1280" height="720" fill="url(#g)"/>
  <circle cx="640" cy="360" r="86" fill="rgba(255,255,255,0.16)"/>
  <polygon points="622,322 622,398 690,360" fill="#ffffff"/>
  <text x="640" y="500" fill="rgba(255,255,255,0.95)" font-family="${UI_FONT_SANS}" font-size="44" text-anchor="middle">${esc(label)}</text>
  <text x="640" y="540" fill="rgba(255,255,255,0.70)" font-family="${UI_FONT_SANS}" font-size="24" text-anchor="middle">${esc(host)}</text>
</svg>`.trim()
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

const inferPlatformLabel = (url: string): string => {
  const u = String(url || '').trim().toLowerCase()
  if (/youtu\.?be|youtube(?:-nocookie)?\.com/i.test(u)) return 'YouTube'
  if (/bilibili\.com/i.test(u)) return 'Bilibili'
  if (/tiktok\.com/i.test(u)) return 'TikTok'
  if (/douyin\.com/i.test(u)) return 'Douyin'
  if (/vimeo\.com/i.test(u)) return 'Vimeo'
  if (/twitter\.com|x\.com/i.test(u)) return 'X'
  return 'Video'
}

const createVideoEmbedPreview = (thumbSrc: string, alt: string, href: string): HTMLAnchorElement => {
  const a = document.createElement('a')
  a.href = href
  a.target = '_blank'
  a.rel = 'noopener noreferrer'
  a.style.display = 'block'
  a.style.textDecoration = 'none'
  a.style.color = 'inherit'
  a.style.width = '100%'
  a.style.borderRadius = '12px'
  a.style.overflow = 'hidden'
  a.style.border = '1px solid #d1d5db'
  a.style.boxShadow = '0 2px 8px rgba(0,0,0,0.12)'

  const wrapper = document.createElement('figure')
  wrapper.style.position = 'relative'
  wrapper.style.lineHeight = '0'
  wrapper.style.backgroundColor = '#000'
  wrapper.style.margin = '0'

  const img = document.createElement('img')
  img.src = thumbSrc
  img.alt = alt
  img.setAttribute('width', '1280')
  img.setAttribute('height', '720')
  img.style.width = '100%'
  img.style.height = 'auto'
  img.style.display = 'block'

  const gradient = document.createElement('section')
  gradient.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;background:linear-gradient(to top,rgba(0,0,0,0.7) 0%,rgba(0,0,0,0) 50%);pointer-events:none'

  const playBtn = document.createElement('span')
  playBtn.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:56px;height:56px;background:rgba(0,0,0,0.65);border-radius:50%;display:flex;align-items:center;justify-content:center;pointer-events:none'
  const playTriangle = document.createElement('span')
  playTriangle.style.cssText = 'width:0;height:0;border-top:11px solid transparent;border-bottom:11px solid transparent;border-left:20px solid #fff;margin-left:4px'
  playBtn.appendChild(playTriangle)

  const label = inferPlatformLabel(href)
  const titleBar = document.createElement('figcaption')
  titleBar.style.cssText = 'position:absolute;bottom:0;left:0;right:0;padding:10px 12px;display:flex;align-items:center;gap:8px;pointer-events:none'
  const titleText = document.createElement('span')
  titleText.style.cssText = `color:#fff;font-size:12px;font-family:${UI_FONT_SANS};font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1`
  titleText.textContent = label
  titleBar.appendChild(titleText)
  const linkHint = document.createElement('span')
  linkHint.style.cssText = `color:rgba(255,255,255,0.6);font-size:12px;font-family:${UI_FONT_SANS};white-space:nowrap;letter-spacing:0.5px`
  linkHint.textContent = 'OPEN \u2192'
  titleBar.appendChild(linkHint)

  wrapper.appendChild(img)
  wrapper.appendChild(gradient)
  wrapper.appendChild(playBtn)
  wrapper.appendChild(titleBar)
  a.appendChild(wrapper)
  return a
}

const wrapImgWithLink = (img: HTMLImageElement, href: string): HTMLAnchorElement => {
  const a = document.createElement('a')
  a.href = href
  a.target = '_blank'
  a.rel = 'noopener noreferrer'
  a.style.display = 'block'
  a.style.textDecoration = 'none'
  a.style.color = 'inherit'
  img.replaceWith(a)
  a.appendChild(img)
  return a
}

export const wrapImagesWithSourceLinks = (clone: Element): void => {
  const imgs = clone.querySelectorAll('img')
  for (let i = 0; i < imgs.length; i += 1) {
    const img = imgs[i] as HTMLImageElement
    if (img.closest('a')) continue
    const originalSrc = String(img.getAttribute('data-kg-original-src') || '').trim()
    if (!/^https?:\/\//i.test(originalSrc)) continue
    try {
      wrapImgWithLink(img, originalSrc)
    } catch {
      void 0
    }
  }
}

export const annotateSourceImages = (el: Element): void => {
  const imgs = el.querySelectorAll('img')
  for (let i = 0; i < imgs.length; i += 1) {
    const img = imgs[i] as HTMLImageElement
    if (img.hasAttribute('data-kg-original-src')) continue
    const src = String(img.getAttribute('src') || '').trim()
    const originalSrc = unwrapProxyUrl(src)
    if (/^https?:\/\//i.test(originalSrc)) {
      try {
        img.setAttribute('data-kg-original-src', originalSrc)
      } catch {
        void 0
      }
    }
  }
}

const resolvePreferredThumbnailFromImage = (img: HTMLImageElement | null): string | null => {
  if (!img) return null
  const originalSrc = String(img.currentSrc || img.getAttribute('src') || '').trim()
  const originalSourceSrc = String(img.getAttribute('data-kg-original-src') || '').trim()
  const bakedDataUrl = captureImageAsDataUrl(img)
  return pickPreferredThumbnailSource([originalSourceSrc, originalSrc, bakedDataUrl])
}

export const bakeLoadedImages = (src: Element, dst: Element): void => {
  const srcImgs = src.querySelectorAll('img')
  const dstImgs = dst.querySelectorAll('img')
  const len = Math.min(srcImgs.length, dstImgs.length)
  for (let i = 0; i < len; i += 1) {
    const si = srcImgs[i] as HTMLImageElement
    const di = dstImgs[i] as HTMLImageElement
    const dataUrl = captureImageAsDataUrl(si)
    if (dataUrl) {
      try {
        di.setAttribute('src', dataUrl)
      } catch {
        void 0
      }
    }
    try {
      di.removeAttribute('loading')
    } catch {
      void 0
    }
    try {
      di.removeAttribute('decoding')
    } catch {
      void 0
    }
  }
}

export const replaceVideosWithFrames = (src: Element, dst: Element): void => {
  const srcVideos = src.querySelectorAll('video')
  const dstVideos = dst.querySelectorAll('video')
  const len = Math.min(srcVideos.length, dstVideos.length)
  for (let i = 0; i < len; i += 1) {
    const sv = srcVideos[i] as HTMLVideoElement
    const dv = dstVideos[i] as HTMLVideoElement
    const frameUrl = captureVideoFrameAsDataUrl(sv)
    if (!frameUrl) continue
    const videoSrc = unwrapProxyUrl(String(sv.getAttribute('src') || '').trim())
    const href = /^https?:\/\//i.test(videoSrc) ? videoSrc : ''
    try {
      dv.replaceWith(href ? createVideoEmbedPreview(frameUrl, sv.poster || 'video frame', href) : createImg(frameUrl, sv.poster || 'video frame'))
    } catch {
      void 0
    }
  }
}

export const replaceVideoIframes = async (clone: Element): Promise<void> => {
  const iframes = clone.querySelectorAll('iframe')
  const tasks: Promise<void>[] = []
  for (let i = 0; i < iframes.length; i += 1) {
    const iframe = iframes[i] as HTMLIFrameElement
    const src = unwrapProxyUrl(String(iframe.getAttribute('src') || '').trim())
    if (!KNOWN_VIDEO_IFRAME_HOST_RE.test(src)) continue
    const ytId = extractYouTubeVideoId(src)
    const href = ytId ? `https://www.youtube.com/watch?v=${ytId}` : src
    tasks.push(
      (ytId ? resolveYouTubeThumbnail(ytId) : Promise.resolve('')).then((thumbUrl) => {
        try {
          const parent = iframe.parentElement
          const parentThumb = parent
            ? (parent.querySelector('img[data-kg-media-thumbnail="1"], img') as HTMLImageElement | null)
            : null
          const preferredFromParent = resolvePreferredThumbnailFromImage(parentThumb)
          const preferredThumb = pickPreferredThumbnailSource([preferredFromParent, thumbUrl]) || buildVideoFallbackSvgThumbnail(href)
          const container = iframe.parentElement
          if (container && container !== clone && container.children.length <= 2) {
            container.replaceWith(createVideoEmbedPreview(preferredThumb, `${inferPlatformLabel(href)} video`, href))
          } else {
            iframe.replaceWith(createVideoEmbedPreview(preferredThumb, `${inferPlatformLabel(href)} video`, href))
          }
        } catch {
          void 0
        }
      }),
    )
  }
  await Promise.all(tasks)
}

export const freezeIframesToStaticThumbnails = async (src: Element, dst: Element): Promise<void> => {
  const srcIframes = src.querySelectorAll('iframe')
  const dstIframes = dst.querySelectorAll('iframe')
  const len = Math.min(srcIframes.length, dstIframes.length)
  const tasks: Promise<void>[] = []
  for (let i = 0; i < len; i += 1) {
    const srcIframe = srcIframes[i] as HTMLIFrameElement
    const dstIframe = dstIframes[i] as HTMLIFrameElement
    tasks.push(
      Promise.resolve().then(async () => {
        const iframeSrc = unwrapProxyUrl(String(srcIframe.getAttribute('src') || '').trim())
        const parentThumb = srcIframe.parentElement
          ? (srcIframe.parentElement.querySelector('img[data-kg-media-thumbnail="1"], img') as HTMLImageElement | null)
          : null
        let preferredThumb = pickPreferredThumbnailSource([resolvePreferredThumbnailFromImage(parentThumb)])
        if (!preferredThumb) {
          const ytId = extractYouTubeVideoId(iframeSrc)
          if (ytId) preferredThumb = await resolveYouTubeThumbnail(ytId)
        }
        if (!preferredThumb) preferredThumb = buildVideoFallbackSvgThumbnail(iframeSrc || 'about:blank')
        const href = /^https?:\/\//i.test(iframeSrc) ? iframeSrc : ''
        const replacement = href
          ? createVideoEmbedPreview(preferredThumb, `${inferPlatformLabel(href)} embed`, href)
          : createImg(preferredThumb, 'embedded content')
        try {
          const iframeClassName = String(dstIframe.getAttribute('class') || '').trim()
          if (iframeClassName) replacement.setAttribute('class', iframeClassName)
        } catch {
          void 0
        }
        try {
          const iframeStyle = String(dstIframe.getAttribute('style') || '').trim()
          if (iframeStyle) replacement.setAttribute('style', iframeStyle)
        } catch {
          void 0
        }
        try {
          dstIframe.replaceWith(replacement)
        } catch {
          void 0
        }
      }),
    )
  }
  await Promise.all(tasks)
}

export const replaceYouTubeBrokenImgs = async (clone: Element): Promise<void> => {
  const imgs = clone.querySelectorAll('img')
  const tasks: Promise<void>[] = []
  for (let i = 0; i < imgs.length; i += 1) {
    const img = imgs[i] as HTMLImageElement
    const src = String(img.getAttribute('src') || '').trim()
    const ytId = extractYouTubeVideoId(src)
    if (!ytId) continue
    const watchUrl = `https://www.youtube.com/watch?v=${ytId}`
    tasks.push(
      resolveYouTubeThumbnail(ytId).then((thumbUrl) => {
        try {
          img.replaceWith(createVideoEmbedPreview(thumbUrl, `YouTube: ${ytId}`, watchUrl))
        } catch {
          void 0
        }
      }),
    )
  }
  await Promise.all(tasks)
}

export const replaceYouTubeWebpageSnapshots = async (src: Element, clone: Element): Promise<void> => {
  const srcSnapshots = src.querySelectorAll('[data-kg-webpage-snapshot="1"]')
  const cloneSnapshots = clone.querySelectorAll('[data-kg-webpage-snapshot="1"]')
  const len = Math.min(srcSnapshots.length, cloneSnapshots.length)
  const tasks: Promise<void>[] = []
  for (let i = 0; i < len; i += 1) {
    const cs = cloneSnapshots[i] as HTMLElement
    const dataSrc = String(cs.getAttribute('data-src') || '').trim()
    const ytId = extractYouTubeVideoId(dataSrc)
    if (!ytId) continue
    const watchUrl = `https://www.youtube.com/watch?v=${ytId}`
    tasks.push(
      resolveYouTubeThumbnail(ytId).then((thumbUrl) => {
        try {
          cs.replaceWith(createVideoEmbedPreview(thumbUrl, `YouTube: ${ytId}`, watchUrl))
        } catch {
          void 0
        }
      }),
    )
  }
  await Promise.all(tasks)
}

export const replaceVideoSnapshots = (src: Element, clone: Element): void => {
  const srcSnapshots = src.querySelectorAll('[data-kg-video-snapshot="1"]')
  const cloneSnapshots = clone.querySelectorAll('[data-kg-video-snapshot="1"]')
  const len = Math.min(srcSnapshots.length, cloneSnapshots.length)
  for (let i = 0; i < len; i += 1) {
    const ss = srcSnapshots[i] as HTMLElement
    const cs = cloneSnapshots[i] as HTMLElement
    const srcThumb = ss.querySelector('img[data-kg-media-thumbnail="1"]') as HTMLImageElement | null
    const videoSrc = unwrapProxyUrl(String(cs.getAttribute('data-src') || '').trim())
    const preferredThumb =
      pickPreferredThumbnailSource([resolvePreferredThumbnailFromImage(srcThumb)])
      || buildVideoFallbackSvgThumbnail(videoSrc)
    const href = /^https?:\/\//i.test(videoSrc) ? videoSrc : ''
    try {
      cs.replaceWith(href ? createVideoEmbedPreview(preferredThumb, videoSrc, href) : createImg(preferredThumb, videoSrc))
    } catch {
      void 0
    }
  }
}

export const bakeWebpageSnapshotThumbnails = (src: Element, clone: Element): void => {
  const srcSnapshots = src.querySelectorAll('[data-kg-webpage-snapshot="1"]')
  const cloneSnapshots = clone.querySelectorAll('[data-kg-webpage-snapshot="1"]')
  const len = Math.min(srcSnapshots.length, cloneSnapshots.length)
  for (let i = 0; i < len; i += 1) {
    const ss = srcSnapshots[i] as HTMLElement
    const cs = cloneSnapshots[i] as HTMLElement
    const srcThumb = ss.querySelector('img[data-kg-media-thumbnail="1"]') as HTMLImageElement | null
    const cloneThumb = cs.querySelector('img[data-kg-media-thumbnail="1"]') as HTMLImageElement | null
    if (cloneThumb) {
      const preferredThumb = pickPreferredThumbnailSource([
        resolvePreferredThumbnailFromImage(srcThumb),
        String(cloneThumb.getAttribute('src') || '').trim(),
        String(cloneThumb.currentSrc || '').trim(),
      ])
      if (!preferredThumb) continue
      try {
        cloneThumb.setAttribute('src', preferredThumb)
        cloneThumb.removeAttribute('loading')
        cloneThumb.removeAttribute('decoding')
      } catch {
        void 0
      }
    }
  }
}

export const stripLazyAttrs = (el: Element): void => {
  const media = el.querySelectorAll('img,video,iframe')
  for (let i = 0; i < media.length; i += 1) {
    try {
      media[i].removeAttribute('loading')
    } catch {
      void 0
    }
    try {
      media[i].removeAttribute('decoding')
    } catch {
      void 0
    }
  }
}
