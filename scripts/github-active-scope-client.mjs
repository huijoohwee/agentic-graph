const TRANSIENT_GITHUB_HTTP_STATUSES = new Set([502, 503, 504])

export const DEFAULT_GITHUB_RETRY_DELAYS_MS = Object.freeze([1_000, 2_000, 4_000])
export const DEFAULT_GITHUB_REQUEST_TIMEOUT_MS = 10_000

const sleep = delayMs => new Promise(resolve => setTimeout(resolve, delayMs))

const fetchPullRequestPage = async ({
  fetchImpl,
  requestTimeoutMs,
  retryDelaysMs,
  sleepImpl,
  token,
  url,
}) => {
  for (let attempt = 0; ; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs)
    let response
    try {
      response = await fetchImpl(url, {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
        signal: controller.signal,
      })
      if (response.ok) return await response.json()
    } catch (error) {
      if (controller.signal.aborted) throw new Error(`GitHub active-scope query timed out after ${requestTimeoutMs}ms`)
      throw error
    } finally {
      clearTimeout(timeout)
    }
    const canRetry = TRANSIENT_GITHUB_HTTP_STATUSES.has(response.status)
      && attempt < retryDelaysMs.length
    if (!canRetry) {
      const attempts = attempt + 1
      const suffix = attempts > 1 ? ` after ${attempts} attempts` : ''
      throw new Error(`GitHub active-scope query failed with HTTP ${response.status}${suffix}`)
    }
    await sleepImpl(retryDelaysMs[attempt])
  }
}

export const fetchOpenPullRequests = async (repository, token, options = {}) => {
  const apiBaseUrl = String(options.apiBaseUrl || 'https://api.github.com').replace(/\/$/, '')
  const fetchImpl = options.fetchImpl || fetch
  const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_GITHUB_REQUEST_TIMEOUT_MS
  const retryDelaysMs = options.retryDelaysMs || DEFAULT_GITHUB_RETRY_DELAYS_MS
  const sleepImpl = options.sleepImpl || sleep
  if (!Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs < 1 || requestTimeoutMs > 60_000) {
    throw new TypeError('GitHub active-scope request timeout must be an integer from 1 to 60000ms')
  }
  const pullRequests = []

  for (let page = 1; ; page += 1) {
    const pageItems = await fetchPullRequestPage({
      fetchImpl,
      requestTimeoutMs,
      retryDelaysMs,
      sleepImpl,
      token,
      url: `${apiBaseUrl}/repos/${repository}/pulls?state=open&per_page=100&page=${page}`,
    })
    if (!Array.isArray(pageItems)) throw new Error('GitHub active-scope query returned a non-array payload')
    pullRequests.push(...pageItems)
    if (pageItems.length < 100) return pullRequests
  }
}
