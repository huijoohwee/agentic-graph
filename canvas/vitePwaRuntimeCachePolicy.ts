export const nonHtmlRuntimeCachePlugin = {
  cachedResponseWillBeUsed: async ({ cachedResponse }: { cachedResponse?: Response }) => {
    if (!cachedResponse) return null;
    const mediaType = (cachedResponse.headers.get('content-type') || '')
      .split(';', 1)[0]
      .trim()
      .toLowerCase();
    return mediaType === 'text/html' || mediaType === 'application/xhtml+xml'
      ? null
      : cachedResponse;
  },
  cacheWillUpdate: async ({ response }: { response: Response }) => {
    if (response.status !== 200) return null;
    const mediaType = (response.headers.get('content-type') || '')
      .split(';', 1)[0]
      .trim()
      .toLowerCase();
    return mediaType === 'text/html' || mediaType === 'application/xhtml+xml'
      ? null
      : response;
  },
}
