import { fetchRemoteText, fetchRemoteTextDetailed } from '@/lib/net/fetchRemoteText'

type FetchStubResponse = {
  ok: boolean
  status: number
  headers: { get: (key: string) => string | null }
  body?: null
  text: () => Promise<string>
}

type WindowOriginLike = { location?: { origin?: string } }
type GlobalWithFetch = { fetch?: typeof fetch; window?: WindowOriginLike }

export const testFetchRemoteTextValidateSupportsStringAndArgs = async () => {
  const g = globalThis as unknown as GlobalWithFetch
  const prevFetch = g.fetch
  const prevWindow = g.window
  const calls: { url: string; method?: string }[] = []

  g.window = { location: { origin: 'http://localhost:5173' } }
  g.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : ''
    calls.push({ url, method: init?.method })
    const response: FetchStubResponse = {
      ok: true,
      status: 200,
      headers: { get: () => null },
      body: null,
      text: async () => '  hello  ',
    }
    return response as unknown as Response
  }) as unknown as typeof fetch

  try {
    const t1 = await fetchRemoteTextDetailed('https://example.com/a.txt', {
      useProxy: 'never',
      validate: ({ text, url }) => text.trim() === 'hello' && url.includes('example.com'),
    })
    if ('kind' in t1) throw new Error(`Expected ok result (args validate), got ${t1.kind}`)

    const t2 = await fetchRemoteTextDetailed('https://example.com/b.txt', {
      useProxy: 'never',
      validate: (text: string) => text.trim() === 'hello',
    })
    if ('kind' in t2) throw new Error(`Expected ok result (string validate), got ${t2.kind}`)

    if (calls.length !== 2) throw new Error(`Expected 2 fetch calls, got ${calls.length}`)
  } finally {
    g.fetch = prevFetch
    g.window = prevWindow
  }
}

export const testFetchRemoteTextSupportsHeadersOption = async () => {
  const g = globalThis as unknown as GlobalWithFetch
  const prevFetch = g.fetch
  const prevWindow = g.window
  const calls: Array<{ url: string; method?: string; headerValue?: string }> = []

  g.window = { location: { origin: 'http://localhost:5173' } }
  g.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : ''
    const headerValue = (() => {
      const h = init?.headers as Record<string, string> | undefined
      return h ? String(h['X-Test'] || '') : ''
    })()
    calls.push({ url, method: init?.method, headerValue })
    const response: FetchStubResponse = {
      ok: true,
      status: 200,
      headers: { get: () => null },
      body: null,
      text: async () => 'ok',
    }
    return response as unknown as Response
  }) as unknown as typeof fetch

  try {
    const res = await fetchRemoteTextDetailed('https://example.com/a.txt', {
      useProxy: 'never',
      preflightHead: true,
      headers: { 'X-Test': '1' },
    })
    if ('kind' in res) throw new Error(`Expected ok result, got ${res.kind}`)
    if (calls.length < 2) throw new Error(`Expected at least 2 fetch calls (HEAD+GET), got ${calls.length}`)
    if (!calls.every(c => c.headerValue === '1')) throw new Error('Expected headers passed to all requests')
  } finally {
    g.fetch = prevFetch
    g.window = prevWindow
  }
}

export const testFetchRemoteTextPreflightHeadGuardsTooLarge = async () => {
  const g = globalThis as unknown as GlobalWithFetch
  const prevFetch = g.fetch
  const prevWindow = g.window
  const calls: { url: string; method?: string }[] = []

  g.window = { location: { origin: 'http://localhost:5173' } }
  g.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : ''
    calls.push({ url, method: init?.method })
    const isHead = String(init?.method || '').toUpperCase() === 'HEAD'
    const response: FetchStubResponse = {
      ok: true,
      status: 200,
      headers: {
        get: (key: string) => {
          if (key.toLowerCase() !== 'content-length') return null
          return isHead ? String(10_000_000) : String(1)
        },
      },
      body: null,
      text: async () => 'x',
    }
    return response as unknown as Response
  }) as unknown as typeof fetch

  try {
    const res = await fetchRemoteTextDetailed('https://example.com/huge.txt', {
      useProxy: 'always',
      preflightHead: true,
      maxBytes: 100,
    })
    if (!('kind' in res)) throw new Error('Expected too_large failure')
    if (res.kind !== 'too_large') throw new Error(`Expected kind=too_large, got ${res.kind}`)

    if (calls.length !== 1) throw new Error(`Expected only HEAD call, got ${calls.length}`)
    if ((calls[0]?.method || '').toUpperCase() !== 'HEAD') throw new Error('Expected HEAD preflight')
    if (!calls[0]?.url.startsWith('/__fetch_remote?url=')) throw new Error('Expected proxy URL for HEAD preflight')
  } finally {
    g.fetch = prevFetch
    g.window = prevWindow
  }
}

export const testFetchRemoteTextWrapperUseProxyBoolean = async () => {
  const g = globalThis as unknown as GlobalWithFetch
  const prevFetch = g.fetch
  const prevWindow = g.window
  const calls: string[] = []

  g.window = { location: { origin: 'http://localhost:5173' } }
  g.fetch = (async (input: unknown) => {
    const url = typeof input === 'string' ? input : ''
    calls.push(url)
    const response: FetchStubResponse = {
      ok: true,
      status: 200,
      headers: { get: () => null },
      body: null,
      text: async () => 'ok',
    }
    return response as unknown as Response
  }) as unknown as typeof fetch

  try {
    const text = await fetchRemoteText('https://example.com/p.txt', { useProxy: true })
    if (text !== 'ok') throw new Error('Expected ok text result')
    if (calls.length !== 1) throw new Error(`Expected 1 fetch call, got ${calls.length}`)
    if (!calls[0]?.startsWith('/__fetch_remote?url=')) throw new Error('Expected proxy URL for fetchRemoteText wrapper')
  } finally {
    g.fetch = prevFetch
    g.window = prevWindow
  }
}

export const testFetchRemoteTextAutoFallsBackToProxyOnPrivateLanOrigin = async () => {
  const g = globalThis as unknown as GlobalWithFetch
  const prevFetch = g.fetch
  const prevWindow = g.window
  const calls: string[] = []

  g.window = { location: { origin: 'http://10.24.5.7:5173' } }
  g.fetch = (async (input: unknown) => {
    const url = typeof input === 'string' ? input : ''
    calls.push(url)
    if (url.startsWith('/__fetch_remote?url=')) {
      const response: FetchStubResponse = {
        ok: true,
        status: 200,
        headers: { get: () => null },
        body: null,
        text: async () => 'proxied',
      }
      return response as unknown as Response
    }
    throw new Error('network failed')
  }) as unknown as typeof fetch

  try {
    const res = await fetchRemoteTextDetailed('https://example.com/asset.json')
    if ('kind' in res) throw new Error(`Expected proxy fallback success, got ${res.kind}`)
    if (res.text !== 'proxied') throw new Error(`Expected proxied response body, got ${res.text}`)
    if (!res.usedProxy) throw new Error('Expected result to report proxy usage after LAN-origin fallback')
    if (calls.length !== 2) throw new Error(`Expected direct + proxy attempts, got ${calls.length}`)
    if (calls[0] !== 'https://example.com/asset.json') throw new Error(`Expected direct request first, got ${calls[0] || '<none>'}`)
    if (!calls[1]?.startsWith('/__fetch_remote?url=')) throw new Error('Expected proxied retry for LAN-origin auto mode')
  } finally {
    g.fetch = prevFetch
    g.window = prevWindow
  }
}

export const testFetchRemoteTextDoesNotReplayRateLimitedHttpAcrossTransports = async () => {
  const g = globalThis as unknown as GlobalWithFetch
  const prevFetch = g.fetch
  const prevWindow = g.window
  const calls: string[] = []

  g.window = { location: { origin: 'http://localhost:5173' } }
  g.fetch = (async (input: unknown) => {
    const url = typeof input === 'string' ? input : ''
    calls.push(url)
    const response: FetchStubResponse = {
      ok: false,
      status: 403,
      headers: { get: () => null },
      body: null,
      text: async () => '{"message":"request rate limit exceeded"}',
    }
    return response as unknown as Response
  }) as unknown as typeof fetch

  try {
    const result = await fetchRemoteTextDetailed('https://code.example.test/organization/project', {
      preferProxy: true,
    })
    if (!('kind' in result)) throw new Error('Expected a rate-limit HTTP failure')
    if (result.kind !== 'http' || result.status !== 403) {
      throw new Error(`Expected the original HTTP 403, got ${result.kind} ${String(result.status)}`)
    }
    if (result.errorText !== '{"message":"request rate limit exceeded"}') {
      throw new Error(`Expected bounded remote error evidence, got ${String(result.errorText)}`)
    }
    if (calls.length !== 1) throw new Error(`Expected one proxy attempt for an authoritative HTTP response, got ${calls.length}`)
    if (!calls[0]?.startsWith('/__fetch_remote?url=')) {
      throw new Error(`Expected the preferred proxy attempt first, got ${calls[0] || '<none>'}`)
    }
  } finally {
    g.fetch = prevFetch
    g.window = prevWindow
  }
}
