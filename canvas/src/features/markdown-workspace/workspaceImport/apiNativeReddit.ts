type RedditListing = {
  kind?: string
  data?: {
    children?: Array<{ kind?: string; data?: any }>
  }
}

type RedditPost = {
  title?: string
  selftext?: string
  url?: string
  permalink?: string
  author?: string
  subreddit_name_prefixed?: string
  score?: number
  created_utc?: number
}

type RedditComment = {
  body?: string
  author?: string
  score?: number
  created_utc?: number
  replies?: RedditListing | ''
}

function isRedditHost(hostname: string): boolean {
  const h = hostname.toLowerCase()
  return h === 'reddit.com' || h.endsWith('.reddit.com') || h === 'redd.it' || h.endsWith('.redd.it')
}

export function toSafeBasename(raw: string): string {
  const t = String(raw || '')
    .toLowerCase()
    .replace(/&amp;/g, '&')
    .replace(/[^a-z0-9\s._-]+/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
  const clipped = t.length > 70 ? t.slice(0, 70).replace(/-+$/g, '') : t
  return clipped || 'import'
}

export function buildRedditJsonUrl(inputUrl: string): { jsonUrl: string; canonicalUrl: string } | null {
  try {
    const u = new URL(inputUrl)
    if (!isRedditHost(u.hostname)) return null

    const host = 'www.reddit.com'
    const path = u.pathname || '/'

    const canonicalUrl = `https://${host}${path}${u.search || ''}${u.hash || ''}`

    const hasJsonExt = /\.json$/i.test(path)
    const basePath = hasJsonExt ? path : `${path.replace(/\/+$/g, '')}.json`
    const json = new URL(`https://${host}${basePath}${u.search || ''}`)
    if (!json.searchParams.has('raw_json')) json.searchParams.set('raw_json', '1')
    if (!json.searchParams.has('limit')) json.searchParams.set('limit', '80')
    return { jsonUrl: json.toString(), canonicalUrl }
  } catch {
    return null
  }
}

function coercePostFromListing(listing: unknown): RedditPost | null {
  const l = listing as RedditListing
  const child = l?.data?.children?.[0]
  if (!child || typeof child !== 'object') return null
  const data = (child as { data?: unknown })?.data as any
  if (!data || typeof data !== 'object') return null
  return {
    title: typeof data.title === 'string' ? data.title : undefined,
    selftext: typeof data.selftext === 'string' ? data.selftext : undefined,
    url: typeof data.url === 'string' ? data.url : undefined,
    permalink: typeof data.permalink === 'string' ? data.permalink : undefined,
    author: typeof data.author === 'string' ? data.author : undefined,
    subreddit_name_prefixed: typeof data.subreddit_name_prefixed === 'string' ? data.subreddit_name_prefixed : undefined,
    score: typeof data.score === 'number' ? data.score : undefined,
    created_utc: typeof data.created_utc === 'number' ? data.created_utc : undefined,
  }
}

function isRedditCommentThing(child: unknown): child is { kind?: string; data?: RedditComment } {
  if (!child || typeof child !== 'object') return false
  const k = (child as any).kind
  return typeof k === 'string' && k.toLowerCase() === 't1'
}

function readListingChildren(listing: unknown): unknown[] {
  const l = listing as RedditListing
  const ch = l?.data?.children
  return Array.isArray(ch) ? ch : []
}

function formatUtc(utcSeconds: number | undefined): string {
  if (!utcSeconds || !Number.isFinite(utcSeconds)) return ''
  const ms = Math.floor(utcSeconds * 1000)
  try {
    const d = new Date(ms)
    if (!Number.isFinite(d.getTime())) return ''
    return d.toISOString().replace(/\.\d{3}Z$/, 'Z')
  } catch {
    return ''
  }
}

export function convertRedditListingJsonToMarkdown(args: {
  jsonText: string
  sourceUrl: string
  maxChars?: number
  maxComments?: number
}): { ok: true; markdown: string; title?: string } | { ok: false; error: string } {
  const maxChars = Number.isFinite(args.maxChars) ? Math.max(20_000, Math.floor(args.maxChars as number)) : 240_000
  const maxComments = Number.isFinite(args.maxComments) ? Math.max(0, Math.floor(args.maxComments as number)) : 60

  let parsed: unknown
  try {
    parsed = JSON.parse(String(args.jsonText || ''))
  } catch {
    return { ok: false, error: 'Invalid Reddit JSON' }
  }

  if (!Array.isArray(parsed) || parsed.length < 1) return { ok: false, error: 'Unexpected Reddit JSON shape' }
  const postListing = parsed[0]
  const commentsListing = parsed[1]

  const post = coercePostFromListing(postListing)
  if (!post) return { ok: false, error: 'Missing post data' }
  const title = String(post.title || '').trim()
  const permalink = post.permalink ? `https://www.reddit.com${post.permalink}` : String(args.sourceUrl || '').trim()

  const headerLines: string[] = []
  headerLines.push(`# ${title || 'Reddit'}`)
  headerLines.push('')
  if (permalink) headerLines.push(`[](${permalink})`)
  const metaParts: string[] = []
  if (post.subreddit_name_prefixed) metaParts.push(post.subreddit_name_prefixed)
  if (post.author) metaParts.push(`u/${post.author}`)
  if (typeof post.score === 'number') metaParts.push(`score: ${post.score}`)
  const ts = formatUtc(post.created_utc)
  if (ts) metaParts.push(ts)
  if (metaParts.length > 0) {
    headerLines.push('')
    headerLines.push(`- ${metaParts.join(' · ')}`)
  }

  headerLines.push('')

  const bodyLines: string[] = []
  const selfText = String(post.selftext || '').trim()
  if (selfText) {
    bodyLines.push(selfText)
  } else if (post.url && typeof post.url === 'string' && post.url.trim()) {
    bodyLines.push(`[](${post.url.trim()})`)
  }

  const out: string[] = [...headerLines, ...bodyLines]

  let remaining = maxChars - out.join('\n').length
  const pushBounded = (line: string) => {
    if (remaining <= 0) return false
    const s = String(line || '')
    const nextLen = s.length + 1
    if (nextLen > remaining) return false
    out.push(s)
    remaining -= nextLen
    return true
  }

  const commentChildren = readListingChildren(commentsListing)
  let added = 0
  const visit = (children: unknown[], depth: number) => {
    if (added >= maxComments) return
    for (const child of children) {
      if (added >= maxComments) return
      if (!isRedditCommentThing(child)) continue
      const c = child.data
      const body = String(c?.body || '').trim()
      if (!body || body === '[deleted]' || body === '[removed]') continue
      const author = c?.author && typeof c.author === 'string' ? c.author : ''
      const score = typeof c?.score === 'number' ? c.score : undefined
      const ts = formatUtc(c?.created_utc)

      if (added === 0) {
        pushBounded('')
        pushBounded('## Comments')
        pushBounded('')
      }

      const indent = '  '.repeat(Math.max(0, Math.min(4, depth)))
      const metaBits: string[] = []
      if (author) metaBits.push(`u/${author}`)
      if (typeof score === 'number') metaBits.push(`score: ${score}`)
      if (ts) metaBits.push(ts)
      const meta = metaBits.length > 0 ? ` (${metaBits.join(' · ')})` : ''
      if (!pushBounded(`${indent}- ${body.replace(/\s+/g, ' ').trim()}${meta}`)) return
      added += 1

      const replies = (c as any)?.replies
      if (replies && typeof replies === 'object') {
        const kids = readListingChildren(replies)
        if (kids.length > 0) visit(kids, depth + 1)
      }
    }
  }

  visit(commentChildren, 0)
  const markdown = out.join('\n').trimEnd() + '\n'
  return { ok: true, markdown, title: title || undefined }
}
