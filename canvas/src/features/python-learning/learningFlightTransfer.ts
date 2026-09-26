/** Native-link producer for GameXR's bounded #flight review contract. No popup or opener. */
export function flightDestination(value: string): URL {
  const url = new URL(value)
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || value.length > 4096)
    throw new Error('Enter the HTTP(S) address of your GameXR browser.')
  // A desktop handoff never forwards query credentials or a phone pairing token.
  url.search = '?drone=1'; url.hash = ''
  return url
}

/** Input is the existing validated Graph export. GameXR independently validates on arrival. */
export async function createFlightReviewUrl(text: string, destination: string, signal: AbortSignal): Promise<string> {
  signal.throwIfAborted()
  const url = flightDestination(destination)
  if (new TextEncoder().encode(text).byteLength > 500000) throw new Error('Flight path exceeds 500 kB')
  if (typeof CompressionStream === 'undefined') throw new Error('Link compression unavailable. Use Copy flight path or file export.')
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))
  const compressed = new Uint8Array(await new Response(stream).arrayBuffer())
  signal.throwIfAborted()
  // Same wire bounds as the receiver's existing phone-link contract; no code or grant is sent.
  if (compressed.length > 12000) throw new Error('Path is too large for a review link. Use Copy flight path or file export.')
  const encoded = btoa(String.fromCharCode(...compressed)).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '')
  url.hash = new URLSearchParams({ flight: encoded }).toString()
  return url.href
}
