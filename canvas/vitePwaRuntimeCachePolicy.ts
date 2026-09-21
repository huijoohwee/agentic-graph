type LearningOfflineWorker = typeof self & { __agLearningOffline?: { read(request: Request): Promise<Response | null> } }
export const learningOfflineNavigationPlugin = {
  cachedResponseWillBeUsed: async ({ request }: { request: Request }) =>
    await (self as LearningOfflineWorker).__agLearningOffline?.read(request)
      || new Response('This learning version is not installed. Reconnect and install it from the Python pane.', { status: 503 }),
}
export const nonHtmlRuntimeCachePlugin = {
  cachedResponseWillBeUsed: async ({ request, cachedResponse }: { request?: Request; cachedResponse?: Response }) => {
    const admitted = request && await (self as LearningOfflineWorker).__agLearningOffline?.read(request);
    if (admitted) return admitted;
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
