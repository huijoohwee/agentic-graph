/** Explicit, one-shot data handoff. The receiver keeps all Run/connection authority. */
export const FLIGHT_HANDOFF = 'agentic-drone-flight-handoff/v1'

export function flightDestination(value: string): URL {
  const url = new URL(value)
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || value.length > 4096)
    throw new Error('Enter the HTTP(S) address of your GameXR browser.')
  // The handoff never forwards query credentials or a phone pairing token.
  url.search = '?drone=1'; url.hash = ''
  return url
}

export function isFlightReply(event: MessageEvent, target: Window, origin: string, channel: string): boolean {
  const data = event.data
  return event.source === target && event.origin === origin && !!data && typeof data === 'object'
    && Object.keys(data).sort().join(',') === 'channel,kind,protocol'
    && data.protocol === FLIGHT_HANDOFF && data.channel === channel
    && ['ready', 'accepted', 'rejected'].includes(data.kind)
}

/** Call directly inside a click handler so Safari permits opening the review window. */
export function sendFlightPath(destination: string, prepare: () => Promise<string>, signal: AbortSignal): Promise<string> {
  const url = flightDestination(destination)
  const channel = Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join('')
  url.hash = new URLSearchParams({ flightChannel: channel, flightOrigin: location.origin }).toString()
  const target = window.open(url.href, '_blank')
  if (!target) throw new Error('Allow this popup, or use Copy flight path.')
  return new Promise((resolve, reject) => {
    let ready = false, sent = false, text: string | null = null, settled = false
    const finish = (error?: Error) => {
      if (settled) return
      settled = true; clearTimeout(timeout); window.removeEventListener('message', receive)
      signal.removeEventListener('abort', cancel)
      if (error) reject(error); else resolve('Sent to GameXR for review. Connect receiver there, then choose Run flight path.')
    }
    const send = () => {
      if (settled || signal.aborted || sent || !ready || text === null) return
      sent = true
      target.postMessage({ protocol: FLIGHT_HANDOFF, kind: 'path', channel, text }, url.origin)
    }
    const receive = (event: MessageEvent) => {
      if (!isFlightReply(event, target, url.origin, channel)) return
      if (event.data.kind === 'ready') { ready = true; send() }
      else if (sent) finish(event.data.kind === 'accepted' ? undefined : new Error('GameXR rejected the path. Review its message.'))
    }
    const cancel = () => finish(new Error('Flight path changed; send the current completed flight again.'))
    const timeout = setTimeout(() => finish(new Error('GameXR did not acknowledge within 20 seconds. Check its address or use Copy flight path.')), 20000)
    window.addEventListener('message', receive); signal.addEventListener('abort', cancel, { once: true })
    if (signal.aborted) { cancel(); return }
    void prepare().then(value => {
      if (new TextEncoder().encode(value).length > 500000) throw new Error('Flight path exceeds 500 kB')
      text = value; send()
    }).catch(error => finish(error instanceof Error ? error : new Error(String(error))))
  })
}
