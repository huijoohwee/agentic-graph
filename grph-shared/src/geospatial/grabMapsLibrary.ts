import { readGrabMapsAuthModeFromBrowser, readGrabMapsByokApiKeyFromBrowser } from './grabMapsAuth.js'
import { GRABMAPS_BASE_URL, GRABMAPS_LIBRARY_ESM_URL } from './grabMapsSsot.js'

type GrabMapsGlobal = {
  GrabMaps?: any
}

let grabMapsLibraryPromise: Promise<any> | null = null

const readGrabMapsGlobal = (): any | null => {
  if (typeof globalThis === 'undefined') return null
  const root = globalThis as GrabMapsGlobal
  return root.GrabMaps || null
}

export const ensureGrabMapsLibraryLoaded = async (): Promise<any> => {
  const existing = readGrabMapsGlobal()
  if (existing) return existing
  if (typeof document === 'undefined') {
    throw new Error('GrabMaps Library requires a browser document')
  }
  if (grabMapsLibraryPromise) return grabMapsLibraryPromise
  grabMapsLibraryPromise = new Promise((resolve, reject) => {
    const afterLoad = () => {
      const loaded = readGrabMapsGlobal()
      if (loaded) {
        resolve(loaded)
        return
      }
      reject(new Error('GrabMaps Library global is missing after load'))
    }

    const existingScript = document.querySelector(`script[src="${GRABMAPS_LIBRARY_ESM_URL}"]`)
    if (existingScript) {
      existingScript.addEventListener('load', afterLoad, { once: true })
      existingScript.addEventListener('error', () => reject(new Error('GrabMaps Library failed to load')), { once: true })
      return
    }

    const script = document.createElement('script')
    script.type = 'module'
    script.src = GRABMAPS_LIBRARY_ESM_URL
    script.async = true
    script.addEventListener('load', afterLoad, { once: true })
    script.addEventListener('error', () => reject(new Error('GrabMaps Library failed to load')), { once: true })
    document.head.appendChild(script)
  })
  return grabMapsLibraryPromise
}

const readGrabMapsLibraryApiKey = (): string => {
  const mode = readGrabMapsAuthModeFromBrowser()
  if (mode !== 'byok') return ''
  return readGrabMapsByokApiKeyFromBrowser()
}

let containerSeq = 0

const ensureChildContainerId = (containerEl: HTMLElement): string => {
  const existing = Array.from(containerEl.children).find((child): child is HTMLElement => child instanceof HTMLElement)
  if (existing && existing.id) return existing.id
  const id = `kg-grabmaps-${containerSeq += 1}`
  const child = document.createElement('section')
  child.id = id
  child.style.width = '100%'
  child.style.height = '100%'
  containerEl.replaceChildren(child)
  return id
}

export const tryCreateGrabMapsLibraryMap = async (args: {
  containerEl: HTMLElement
  center: [number, number]
  zoom: number
  enableNavigation?: boolean
  enableLabels?: boolean
  enableBuildings?: boolean
  enableAttribution?: boolean
  isCurrent?: () => boolean
}): Promise<any | null> => {
  const apiKey = readGrabMapsLibraryApiKey()
  if (!apiKey) return null
  if (args.isCurrent?.() === false) return null
  const GrabMaps = await ensureGrabMapsLibraryLoaded()
  if (args.isCurrent?.() === false) return null
  const containerId = ensureChildContainerId(args.containerEl)
  const client = new GrabMaps.GrabMapsBuilder().setBaseUrl(GRABMAPS_BASE_URL).setApiKey(apiKey).build()
  const builder = new GrabMaps.MapBuilder(client)
    .setContainer(containerId)
    .setCenter(args.center)
    .setZoom(args.zoom)
  if (args.enableNavigation !== false) builder.enableNavigation()
  if (args.enableLabels !== false) builder.enableLabels()
  if (args.enableBuildings === true) builder.enableBuildings()
  if (args.enableAttribution !== false) builder.enableAttribution()
  const built = builder.build()

  if (built && typeof built === 'object') {
    const mapAny = built as any
    const containerEl = args.containerEl

    try {
      const originalRemove = typeof mapAny.remove === 'function' ? mapAny.remove.bind(mapAny) : null
      mapAny.remove = () => {
        try {
          originalRemove?.()
        } catch {
          void 0
        }
        try {
          containerEl.replaceChildren()
        } catch {
          void 0
        }
      }
      if (typeof mapAny.resize !== 'function') {
        mapAny.resize = () => void 0
      }
      return built
    } catch {
      const handler: ProxyHandler<any> = {
        get: (_target, prop) => {
          if (prop === 'remove') {
            return () => {
              try {
                built?.remove?.()
              } catch {
                void 0
              }
              try {
                args.containerEl.replaceChildren()
              } catch {
                void 0
              }
            }
          }
          if (prop === 'resize') {
            return () => {
              try {
                built?.resize?.()
              } catch {
                void 0
              }
            }
          }
          const value = (built as any)?.[prop]
          return typeof value === 'function' ? value.bind(built) : value
        },
      }
      return new Proxy({}, handler)
    }
  }

  return built
}
