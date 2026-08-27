import React from 'react'
import { Compass, ExternalLink, Send } from 'lucide-react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { emitMainPanelOpen } from '@/features/panels/utils/useMainPanelRect'
import { appendChatHistoryWorkspaceFile } from '@/features/chat/chatHistoryWorkspace'
import { toCanonicalKgcWorkspacePath } from '@/features/chat/chatHistoryWorkspace.paths'
import { CHAT_LOCAL_STORAGE_ROOT_PATH_DEFAULT } from '@/features/chat/chatStorageConfig'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import { fetchRemoteTextDetailed } from '@/lib/net/fetchRemoteText'
import { PlainTextInputEditor } from '@/components/ui/PlainTextInputEditor'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import {
  UI_RESPONSIVE_MULTILINE_TEXT_INPUT_EDITOR_CLASSNAME,
  UI_RESPONSIVE_PANEL_TEXT_ACTION_BUTTON_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'
import {
  CHAT_DEFAULT_MODEL,
  CHAT_DEFAULT_ENDPOINT_URL,
  CHAT_PROVIDER_OPENAI,
  buildChatProxyHeaders,
  normalizeChatEndpointUrlInput,
  resolveChatEndpointForRequest,
} from '@/lib/chatEndpoint'
import {
  getGrabMapsDiscoveryWidgetLabel,
  readGrabMapsDiscoverySettingsValues,
  resolveEffectiveGrabMapsDiscoverySettingsValues,
  writeGrabMapsDiscoverySettingsValues,
  type GrabMapsDiscoverySettingsValues,
} from '@/features/storyboard-widget-manager/grabMapsDiscoveryWidget'
import type { GraphNode } from '@/lib/graph/types'
import { FLOW_GRABMAPS_DISCOVERY_NODE_TYPE_ID } from '@/features/storyboard-widget-manager/grabMapsDiscoveryWidget'
import { GrabMapsDiscoverySettingsGrid } from './GrabMapsDiscoverySettingsGrid'

type PlannerOperation = {
  endpoint: 'keywordSearch' | 'nearbySearch' | 'reverseGeo'
  params?: Record<string, unknown>
  note?: string
}

type PlannerOutput = {
  operations: PlannerOperation[]
}

type PlaceItem = {
  name: string
  address: string
  coordinates: string
}

const EMPTY_STRING_ARRAY: string[] = []

function openMainPanelMaps(searchQuery: string): void {
  try {
    emitMainPanelOpen({ tab: 'maps', searchQuery })
  } catch {
    void 0
  }
}

function buildGrabMapsAuthHeader(apiKey: string): string {
  const raw = String(apiKey || '').trim()
  if (!raw) return ''
  return /^bearer\s+/i.test(raw) ? raw : `Bearer ${raw}`
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function extractJsonObject(text: string): string {
  const raw = String(text || '').trim()
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) return fenced[1].trim()
  const first = raw.indexOf('{')
  const last = raw.lastIndexOf('}')
  if (first < 0 || last < first) return '{}'
  return raw.slice(first, last + 1)
}

function readNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function readString(value: unknown, fallback = ''): string {
  const next = String(value ?? '').trim()
  return next || fallback
}

function readLocation(parts: { lat: unknown; lon: unknown }): string {
  const lat = readNumber(parts.lat, Number.NaN)
  const lon = readNumber(parts.lon, Number.NaN)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return ''
  return `${lat},${lon}`
}

function resolveSelectedDiscoveryWidgetNode(args: {
  selectedNodeIds: ReadonlyArray<string>
  graphData: { nodes?: unknown } | null | undefined
}): GraphNode | null {
  const selectedIds = args.selectedNodeIds || []
  if (!Array.isArray(selectedIds) || selectedIds.length === 0) return null
  const selectedIdSet = new Set(selectedIds.map(id => String(id || '').trim()).filter(Boolean))
  const nodes = Array.isArray(args.graphData?.nodes) ? (args.graphData?.nodes as GraphNode[]) : []
  for (const node of nodes) {
    const nodeId = String(node?.id || '').trim()
    if (!nodeId || !selectedIdSet.has(nodeId)) continue
    if (String(node?.type || '').trim() !== FLOW_GRABMAPS_DISCOVERY_NODE_TYPE_ID) continue
    return node
  }
  return null
}

function parsePlaces(jsonText: string): PlaceItem[] {
  const parsed = (() => {
    try {
      return JSON.parse(jsonText) as unknown
    } catch {
      return null
    }
  })()
  const rec = asRecord(parsed)
  if (!rec) return []
  const candidates = [rec.places, rec.results, rec.items, asRecord(rec.data)?.places, asRecord(rec.data)?.results]
  const places = candidates.find(value => Array.isArray(value)) as unknown[] | undefined
  if (!Array.isArray(places)) return []
  return places.slice(0, 8).map((item) => {
    const row = asRecord(item) || {}
    const loc = asRecord(row.location) || {}
    const lat = readNumber(row.lat ?? row.latitude ?? loc.lat ?? loc.latitude, Number.NaN)
    const lon = readNumber(row.lon ?? row.lng ?? row.longitude ?? loc.lon ?? loc.lng ?? loc.longitude, Number.NaN)
    const coordinates = Number.isFinite(lat) && Number.isFinite(lon) ? `${lat}, ${lon}` : ''
    return {
      name: readString(row.name ?? row.title, 'Unnamed place'),
      address: readString(row.formatted_address ?? row.address ?? row.vicinity, 'No address details'),
      coordinates,
    }
  })
}

async function callGrabMapsJson(args: { url: string; authorization: string }): Promise<string> {
  const response = await fetchRemoteTextDetailed(args.url, {
    useProxy: 'always',
    preflightHead: false,
    maxBytes: 350_000,
    headers: {
      Authorization: args.authorization,
      Accept: 'application/json',
    },
  })
  if ('kind' in response) throw new Error(`GrabMaps request failed: ${response.kind}`)
  return response.text
}

function buildPlannerPrompt(query: string, defaults: GrabMapsDiscoverySettingsValues): string {
  const defaultsJson = JSON.stringify({
    keywordSearch: {
      country: defaults['maps.grabmaps.mcp.searchPlaces.country'],
      location: readLocation({
        lat: defaults['maps.grabmaps.mcp.searchPlaces.lat'],
        lon: defaults['maps.grabmaps.mcp.searchPlaces.lon'],
      }),
      limit: defaults['maps.grabmaps.mcp.searchPlaces.limit'],
    },
    nearbySearch: {
      location: readLocation({
        lat: defaults['maps.grabmaps.mcp.nearbySearch.lat'],
        lon: defaults['maps.grabmaps.mcp.nearbySearch.lon'],
      }),
      radius: defaults['maps.grabmaps.mcp.nearbySearch.radius'],
      limit: defaults['maps.grabmaps.mcp.nearbySearch.limit'],
      rankBy: defaults['maps.grabmaps.mcp.nearbySearch.rankBy'],
      language: defaults['maps.grabmaps.mcp.nearbySearch.language'],
      category: defaults['maps.grabmaps.mcp.nearbySearch.category'],
    },
  }, null, 2)
  return [
    'Plan GrabMaps search operations for this user query.',
    'Return ONLY compact JSON with shape: {"operations":[{"endpoint":"keywordSearch|nearbySearch|reverseGeo","params":{...},"note":"..."}]}',
    'Allowed params:',
    '- keywordSearch: keyword(required), country, location("lat,lon"), limit',
    '- nearbySearch: location(required), radius(km), limit, rankBy(distance|popularity), language, category',
    '- reverseGeo: location(required), type(dropoff|pickup)',
    'If location is place-name text, include `anchor` and omit `location` so runtime can geocode anchor.',
    'Use defaults when user omits optional values.',
    '',
    `Defaults:\n${defaultsJson}`,
    '',
    `User query: ${query}`,
  ].join('\n')
}

async function planOperations(args: {
  query: string
  modelId: string
  chatAuthMode: 'byok' | 'serverManaged'
  chatApiKey: string
  defaults: GrabMapsDiscoverySettingsValues
}): Promise<PlannerOutput> {
  const endpoint = resolveChatEndpointForRequest(
    normalizeChatEndpointUrlInput(CHAT_DEFAULT_ENDPOINT_URL, CHAT_PROVIDER_OPENAI),
  )
  if (!endpoint) return { operations: [] }
  const payload = {
    model: args.modelId,
    stream: false,
    max_completion_tokens: 800,
    messages: [
      {
        role: 'system',
        content: 'You are a strict JSON planner for GrabMaps API requests.',
      },
      {
        role: 'user',
        content: buildPlannerPrompt(args.query, args.defaults),
      },
    ],
  }
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildChatProxyHeaders({
        provider: CHAT_PROVIDER_OPENAI,
        apiKey: args.chatAuthMode === 'byok' ? args.chatApiKey : null,
        endpointUrl: CHAT_DEFAULT_ENDPOINT_URL,
        clientRequestId: `kg-grabmaps-discovery-${Date.now().toString(36)}`,
      }),
    },
    body: JSON.stringify(payload),
  })
  if (!response.ok) return { operations: [] }
  const body = (await response.json()) as Record<string, unknown>
  const choices = Array.isArray(body.choices) ? body.choices : []
  const first = asRecord(choices[0]) || {}
  const msg = asRecord(first.message) || {}
  const raw = readString(msg.content, '{}')
  const extracted = extractJsonObject(raw)
  const parsed = (() => {
    try {
      return JSON.parse(extracted) as PlannerOutput
    } catch {
      return null
    }
  })()
  if (!parsed || !Array.isArray(parsed.operations)) return { operations: [] }
  return {
    operations: parsed.operations.filter((op): op is PlannerOperation => {
      const endpointName = String(op?.endpoint || '').trim()
      return endpointName === 'keywordSearch' || endpointName === 'nearbySearch' || endpointName === 'reverseGeo'
    }),
  }
}

export function GrabMapsDiscoveryWidgetSection(): React.ReactElement {
  const uiPanelKeyValueTextSizeClass = useGraphStore(s => s.uiPanelKeyValueTextSizeClass || 'text-xs')
  const uiPanelTextFontClass = useGraphStore(s => s.uiPanelTextFontClass || 'font-sans')
  const uiPanelMicroLabelTextSizeClass = useGraphStore(s => s.uiPanelMicroLabelTextSizeClass || 'text-[10px]')
  const grabMapsAuthMode = useGraphStore(s => s.grabMapsAuthMode)
  const grabMapsApiKey = useGraphStore(s => s.grabMapsApiKey)
  const chatAuthMode = useGraphStore(s => (s.chatAuthMode === 'byok' ? 'byok' : 'serverManaged'))
  const chatApiKey = useGraphStore(s => s.chatApiKey)
  const chatAgenticGraphWorkspacePath = useGraphStore(s => s.chatAgenticGraphWorkspacePath || null)
  const chatLocalStorageRootPath = useGraphStore(s => s.chatLocalStorageRootPath || CHAT_LOCAL_STORAGE_ROOT_PATH_DEFAULT)
  const setChatAgenticGraphWorkspacePath = useGraphStore(s => s.setChatAgenticGraphWorkspacePath)
  const setWorkspaceViewMode = useGraphStore(s => s.setWorkspaceViewMode)
  const setEditorWorkspacePane = useGraphStore(s => s.setEditorWorkspacePane)
  const selectedNodeIds = useGraphStore(s => s.selectedNodeIds ?? EMPTY_STRING_ARRAY)
  const graphData = useGraphStore(s => s.graphData || null)
  const [settingsValues, setSettingsValues] = React.useState<GrabMapsDiscoverySettingsValues>(() => readGrabMapsDiscoverySettingsValues())
  const [queryText, setQueryText] = React.useState<string>(() => readString(readGrabMapsDiscoverySettingsValues()['maps.grabmaps.mcp.searchPlaces.query']))
  const [running, setRunning] = React.useState(false)
  const [statusText, setStatusText] = React.useState<string | null>(null)
  const selectedDiscoveryNode = React.useMemo(
    () => resolveSelectedDiscoveryWidgetNode({ selectedNodeIds, graphData }),
    [graphData, selectedNodeIds],
  )
  const selectedDiscoveryOverrides = React.useMemo(
    () => (selectedDiscoveryNode?.properties || null) as Record<string, unknown> | null,
    [selectedDiscoveryNode],
  )
  const modelId = readString(settingsValues['maps.grabmaps.mcp.discovery.chatModel'], CHAT_DEFAULT_MODEL)

  const runDiscovery = React.useCallback(async () => {
    const trimmedQuery = queryText.trim()
    if (!trimmedQuery || running) return
    const authHeader = buildGrabMapsAuthHeader(grabMapsApiKey)
    if (grabMapsAuthMode !== 'byok' || !authHeader) {
      setStatusText('Set GrabMaps BYOK API key in MainPanel Maps before running chat discovery.')
      return
    }
    setRunning(true)
    setStatusText('Planning discovery query...')
    const baseSettings = {
      ...settingsValues,
      'maps.grabmaps.mcp.searchPlaces.query': trimmedQuery,
      'maps.grabmaps.mcp.discovery.chatModel': modelId,
    } as GrabMapsDiscoverySettingsValues
    const mergedSettings = resolveEffectiveGrabMapsDiscoverySettingsValues({
      globalSettings: baseSettings,
      localProperties: selectedDiscoveryOverrides,
    })
    const effectiveQuery = readString(mergedSettings['maps.grabmaps.mcp.searchPlaces.query'], trimmedQuery)
    const effectiveModelId = readString(mergedSettings['maps.grabmaps.mcp.discovery.chatModel'], modelId)
    setSettingsValues(baseSettings)
    writeGrabMapsDiscoverySettingsValues(baseSettings)
    try {
      const planner = await planOperations({
        query: effectiveQuery,
        modelId: effectiveModelId,
        chatAuthMode,
        chatApiKey,
        defaults: mergedSettings,
      })
      const fallbackLocation = readLocation({
        lat: mergedSettings['maps.grabmaps.mcp.searchPlaces.lat'],
        lon: mergedSettings['maps.grabmaps.mcp.searchPlaces.lon'],
      })
      const operations = planner.operations.length > 0
        ? planner.operations
        : [{
          endpoint: 'keywordSearch' as const,
          params: {
            keyword: effectiveQuery,
            country: mergedSettings['maps.grabmaps.mcp.searchPlaces.country'],
            location: fallbackLocation,
            limit: mergedSettings['maps.grabmaps.mcp.searchPlaces.limit'],
          },
          note: 'Fallback keyword search',
        }]

      const markdownSections: string[] = []
      const placePreviewLines: string[] = []
      for (const operation of operations.slice(0, 3)) {
        const params = asRecord(operation.params) || {}
        if (operation.endpoint === 'keywordSearch') {
          const query = readString(params.keyword, trimmedQuery)
          const country = readString(params.country, readString(mergedSettings['maps.grabmaps.mcp.searchPlaces.country']))
          const location = readString(params.location, fallbackLocation)
          const limit = readNumber(params.limit, readNumber(mergedSettings['maps.grabmaps.mcp.searchPlaces.limit'], 10))
          const searchParams = new URLSearchParams({ keyword: query })
          if (country) searchParams.set('country', country)
          if (location) searchParams.set('location', location)
          if (Number.isFinite(limit)) searchParams.set('limit', String(limit))
          const json = await callGrabMapsJson({
            url: `https://maps.grab.com/api/v1/maps/poi/v1/search?${searchParams.toString()}`,
            authorization: authHeader,
          })
          const places = parsePlaces(json)
          markdownSections.push([
            `### Keyword Search: ${query}`,
            ...places.map((place) => `- ${place.name} | ${place.address}${place.coordinates ? ` | ${place.coordinates}` : ''}`),
          ].join('\n'))
          placePreviewLines.push(
            ...places.map(place => `${place.name} | ${place.address}${place.coordinates ? ` | ${place.coordinates}` : ''}`),
          )
          continue
        }
        if (operation.endpoint === 'nearbySearch') {
          const defaultNearbyLocation = readLocation({
            lat: mergedSettings['maps.grabmaps.mcp.nearbySearch.lat'],
            lon: mergedSettings['maps.grabmaps.mcp.nearbySearch.lon'],
          })
          const location = readString(params.location, defaultNearbyLocation)
          if (!location) continue
          const radius = readNumber(params.radius, readNumber(mergedSettings['maps.grabmaps.mcp.nearbySearch.radius'], 1))
          const limit = readNumber(params.limit, readNumber(mergedSettings['maps.grabmaps.mcp.nearbySearch.limit'], 10))
          const rankBy = readString(params.rankBy, readString(mergedSettings['maps.grabmaps.mcp.nearbySearch.rankBy'], 'distance'))
          const language = readString(params.language, readString(mergedSettings['maps.grabmaps.mcp.nearbySearch.language']))
          const nearbyParams = new URLSearchParams({ location })
          nearbyParams.set('radius', String(radius))
          nearbyParams.set('limit', String(limit))
          if (rankBy) nearbyParams.set('rankBy', rankBy)
          if (language) nearbyParams.set('language', language)
          const json = await callGrabMapsJson({
            url: `https://maps.grab.com/api/v1/maps/place/v2/nearby?${nearbyParams.toString()}`,
            authorization: authHeader,
          })
          const places = parsePlaces(json)
          markdownSections.push([
            `### Nearby Search: ${location} (${radius} km)`,
            ...places.map((place) => `- ${place.name} | ${place.address}${place.coordinates ? ` | ${place.coordinates}` : ''}`),
          ].join('\n'))
          placePreviewLines.push(
            ...places.map(place => `${place.name} | ${place.address}${place.coordinates ? ` | ${place.coordinates}` : ''}`),
          )
          continue
        }
        if (operation.endpoint === 'reverseGeo') {
          const location = readString(params.location, fallbackLocation)
          if (!location) continue
          const type = readString(params.type)
          const reverseParams = new URLSearchParams({ location })
          if (type) reverseParams.set('type', type)
          const json = await callGrabMapsJson({
            url: `https://maps.grab.com/api/v1/maps/poi/v1/reverse-geo?${reverseParams.toString()}`,
            authorization: authHeader,
          })
          const places = parsePlaces(json)
          markdownSections.push([
            `### Reverse Geo: ${location}`,
            ...places.map((place) => `- ${place.name} | ${place.address}${place.coordinates ? ` | ${place.coordinates}` : ''}`),
          ].join('\n'))
          placePreviewLines.push(
            ...places.map(place => `${place.name} | ${place.address}${place.coordinates ? ` | ${place.coordinates}` : ''}`),
          )
        }
      }

      if (markdownSections.length === 0) {
        setStatusText('No runnable GrabMaps operation resolved from this prompt.')
        return
      }
      const resultSummaryText = placePreviewLines.length > 0
        ? `Found ${placePreviewLines.length} place result${placePreviewLines.length === 1 ? '' : 's'}. ${placePreviewLines.join(' | ')}`
        : 'Discovery completed.'
      setStatusText(resultSummaryText)
      const markdown = [
        '# GrabMaps Chat Discovery',
        '',
        `- Query: ${effectiveQuery}`,
        `- Model: ${effectiveModelId}`,
        ...(selectedDiscoveryNode ? ['- Value source: selected widget local values override global defaults'] : []),
        '',
        ...markdownSections,
      ].join('\n')
      try {
        const resolvedPath = await appendChatHistoryWorkspaceFile({
          requestedPath: chatAgenticGraphWorkspacePath,
          timestampMs: Date.now(),
          providerSummary: `${getGrabMapsDiscoveryWidgetLabel()} · ${effectiveModelId}`,
          userText: effectiveQuery,
          assistantText: markdown,
          storageType: 'chatAgenticGraph',
          defaultLocalRootPath: chatLocalStorageRootPath,
          onResolvedPath: setChatAgenticGraphWorkspacePath,
        })
        const canonicalPath = toCanonicalKgcWorkspacePath(resolvedPath)
        setWorkspaceViewMode('editor')
        setEditorWorkspacePane('markdown')
        useMarkdownExplorerStore.getState().setActivePath(canonicalPath)
        setStatusText(`${resultSummaryText} Discovery result written to Workspace Editor Markdown.`)
      } catch (workspaceErr) {
        const workspaceMessage = workspaceErr instanceof Error ? workspaceErr.message : String(workspaceErr || '')
        setStatusText(`${resultSummaryText} Workspace write skipped: ${workspaceMessage || 'unavailable'}`)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || '')
      setStatusText(`Discovery failed: ${message || 'Unknown error'}`)
    } finally {
      setRunning(false)
    }
  }, [
    chatApiKey,
    chatAuthMode,
    chatAgenticGraphWorkspacePath,
    chatLocalStorageRootPath,
    grabMapsApiKey,
    grabMapsAuthMode,
    modelId,
    queryText,
    running,
    setChatAgenticGraphWorkspacePath,
    setEditorWorkspacePane,
    setWorkspaceViewMode,
    settingsValues,
    selectedDiscoveryNode,
    selectedDiscoveryOverrides,
  ])

  return (
    <section className="px-3 py-2 space-y-3" aria-label={getGrabMapsDiscoveryWidgetLabel()}>
      <section className="flex items-start justify-between gap-3">
        <section className="min-w-0 flex-1">
          <section className="flex items-center gap-2">
            <Compass className="h-4 w-4" aria-hidden="true" />
            <h3 className={`font-semibold ${uiPanelTextFontClass} ${UI_THEME_TOKENS.text.primary}`}>
              {getGrabMapsDiscoveryWidgetLabel()}
            </h3>
          </section>
          <p className={`mt-2 ${uiPanelKeyValueTextSizeClass} ${UI_THEME_TOKENS.text.secondary}`}>
            Chat-style query input. Discovery defaults and model remain shared with MainPanel Integrations and MainPanel Maps.
          </p>
        </section>
        <button
          type="button"
          className={`${UI_RESPONSIVE_PANEL_TEXT_ACTION_BUTTON_CLASSNAME} inline-flex items-center gap-1 rounded border text-sm ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.headerBg} ${UI_THEME_TOKENS.text.secondary}`}
          onClick={() => openMainPanelMaps('GrabMaps MCP Configuration')}
        >
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          Open MainPanel Maps
        </button>
      </section>

      <GrabMapsDiscoverySettingsGrid
        settingsValues={settingsValues}
        setSettingsValues={setSettingsValues}
        setQueryText={setQueryText}
        selectedNodeActive={Boolean(selectedDiscoveryNode)}
        uiPanelMicroLabelTextSizeClass={uiPanelMicroLabelTextSizeClass}
      />

      <section className={`rounded border ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg} p-3 space-y-2`}>
        <label className={`block ${uiPanelMicroLabelTextSizeClass} ${UI_THEME_TOKENS.text.tertiary}`} htmlFor="grabmaps-discovery-widget-query">
          Query
        </label>
        <section className={`border rounded overflow-hidden ${UI_RESPONSIVE_MULTILINE_TEXT_INPUT_EDITOR_CLASSNAME} ${UI_THEME_TOKENS.input.border} ${UI_THEME_TOKENS.input.bg}`}>
          <PlainTextInputEditor
            id="grabmaps-discovery-widget-query"
            value={queryText}
            onChange={setQueryText}
            multiline
            className="w-full h-full border-0 rounded-none bg-transparent"
            inputClassName={uiPanelTextFontClass}
          />
        </section>
        <section className="flex items-center justify-end">
          <button
            type="button"
            className={`${UI_RESPONSIVE_PANEL_TEXT_ACTION_BUTTON_CLASSNAME} inline-flex items-center gap-1 rounded text-sm ${UI_THEME_TOKENS.button.activeBg} ${UI_THEME_TOKENS.button.activeText} disabled:opacity-50`}
            onClick={() => void runDiscovery()}
            disabled={running || !queryText.trim()}
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            {running ? 'Running...' : 'Search Places (Run Discovery)'}
          </button>
        </section>
        {statusText ? (
          <p className={`${uiPanelMicroLabelTextSizeClass} ${UI_THEME_TOKENS.text.secondary}`}>{statusText}</p>
        ) : null}
      </section>
    </section>
  )
}
