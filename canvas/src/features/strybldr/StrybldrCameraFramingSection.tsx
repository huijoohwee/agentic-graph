import React from 'react'
import { useShallow } from 'zustand/react/shallow'
import { buildStoryboardBoardModel } from '@/components/StoryboardCanvas/storyboardModel'
import { useActiveGraphRenderData } from '@/hooks/useActiveGraphData'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import type { JSONValue } from '@/lib/graph/types'
import { PanelSelect } from '@/lib/ui/panelFormControls'
import {
  publishCameraFramingRuntime,
  readCameraFramingRuntime,
  subscribeCameraFramingRuntime,
} from './cameraFramingRuntime'
import { StrybldrCameraPanel } from './StrybldrCameraPanel'
import { readSemanticSpace, subscribeSemanticSpace } from '@/features/xr-v2/semanticSpaceStore'
import { listStrybldrImageFiles } from './strybldrImageFileRegistry'
import { readImmersiveMediaSnapshot, subscribeImmersiveMediaSnapshot } from '@/features/immersive-media/immersiveMediaRuntime'
import {
  STRYBLDR_CAMERA_PROPERTY_KEY,
  readStrybldrCameraSettings,
  serializeStrybldrCameraSettings,
  type StrybldrCameraSettings,
} from './strybldrCamera'

type StrybldrCameraStoryboardCard = ReturnType<typeof buildStoryboardBoardModel>['lanes'][number]['cards'][number]

const SHARED_CANVAS_CAMERA_ANCHOR_ID = 'canvas-camera'

const resolveStrybldrCameraPreviewImageUrl = (card: StrybldrCameraStoryboardCard | null): string | null => {
  if (!card) return null
  const media = card.media
  if (media?.thumbnailUrl) return media.thumbnailUrl
  if (media && (media.kind === 'image' || media.kind === 'svg') && media.url) return media.url
  const imageReference = card.references.find(reference => reference.kind === 'image' || reference.kind === 'svg')
  return imageReference?.url || null
}

const cameraSettingsEqual = (left: StrybldrCameraSettings, right: StrybldrCameraSettings): boolean => (
  left.angle === right.angle
  && left.level === right.level
  && left.shot === right.shot
  && left.note === right.note
  && left.orbitX === right.orbitX
  && left.orbitY === right.orbitY
  && left.sensorId === right.sensorId
  && left.focalLengthMm === right.focalLengthMm
  && left.focusDistanceMeters === right.focusDistanceMeters
  && left.aspectRatio === right.aspectRatio
)

export function StrybldrCameraFramingSection() {
  const activeSourcePath = useMarkdownExplorerStore(state => state.activePath)
  const immersiveMedia = React.useSyncExternalStore(subscribeImmersiveMediaSnapshot, readImmersiveMediaSnapshot, readImmersiveMediaSnapshot)
  const [spacePreviewImageUrl, setSpacePreviewImageUrl] = React.useState<string | null>(null)
  React.useEffect(() => {
    let active = true
    const refresh = () => { void readSemanticSpace().then(space => {
      if (active) setSpacePreviewImageUrl(space?.observations.at(-1)?.imageDataUrl || null)
    }, () => { if (active) setSpacePreviewImageUrl(null) }) }
    refresh()
    const unsubscribe = subscribeSemanticSpace(refresh)
    return () => { active = false; unsubscribe() }
  }, [])
  const activeGraphData = useActiveGraphRenderData(true)
  const {
    rawGraphData,
    graphDataRevision,
    selectedNodeId,
    selectNode,
    updateNode,
    addHistory,
    pushUiToast,
  } = useGraphStore(
    useShallow(state => ({
      rawGraphData: state.graphData,
      graphDataRevision: state.graphDataRevision,
      selectedNodeId: String(state.selectedNodeId || '').trim(),
      selectNode: state.selectNode,
      updateNode: state.updateNode,
      addHistory: state.addHistory,
      pushUiToast: state.pushUiToast,
    })),
  )
  const runtime = React.useSyncExternalStore(
    subscribeCameraFramingRuntime,
    readCameraFramingRuntime,
    readCameraFramingRuntime,
  )
  const graphData = activeGraphData || rawGraphData
  const board = React.useMemo(
    () => buildStoryboardBoardModel({ graphData, graphRevision: graphDataRevision }),
    [graphData, graphDataRevision],
  )
  const cards = React.useMemo(() => board.lanes.flatMap(lane => lane.cards), [board])
  const editableCards = React.useMemo(() => {
    const elementCards = cards.filter(card => card.lane === 'Elements')
    return elementCards.length > 0 ? elementCards : cards
  }, [cards])
  const selectedCard = React.useMemo(
    () => editableCards.find(card => card.id === selectedNodeId) || null,
    [editableCards, selectedNodeId],
  )
  const selectedCardProperties = React.useMemo(() => {
    if (!graphData || !selectedCard) return {}
    const node = (Array.isArray(graphData.nodes) ? graphData.nodes : []).find(item => item.id === selectedCard.id)
    return node?.properties && typeof node.properties === 'object' && !Array.isArray(node.properties)
      ? node.properties as Record<string, unknown>
      : {}
  }, [graphData, selectedCard])
  const persistedSettings = React.useMemo(
    () => readStrybldrCameraSettings(selectedCardProperties[STRYBLDR_CAMERA_PROPERTY_KEY]),
    [selectedCardProperties],
  )
  const cameraAnchorId = selectedCard?.id || SHARED_CANVAS_CAMERA_ANCHOR_ID
  const settings = selectedCard
    ? runtime.anchorId === selectedCard.id
      ? runtime.settings
      : persistedSettings
    : runtime.settings
  const previewImageUrl = React.useMemo(
    () => resolveStrybldrCameraPreviewImageUrl(selectedCard)
      || listStrybldrImageFiles().find(file => file.workspacePath === activeSourcePath?.replace(/^\/+/, ''))?.objectUrl
      || (immersiveMedia.source.kind === 'image' ? immersiveMedia.source.url : null)
      || spacePreviewImageUrl,
    [selectedCard, activeSourcePath, immersiveMedia.source.kind, immersiveMedia.source.url, spacePreviewImageUrl],
  )

  React.useEffect(() => {
    if (!selectedCard) return
    const current = readCameraFramingRuntime()
    if (
      current.anchorId === selectedCard.id
      && (current.source !== 'document' || cameraSettingsEqual(current.settings, persistedSettings))
    ) {
      return
    }
    publishCameraFramingRuntime({
      anchorId: selectedCard.id,
      settings: persistedSettings,
      source: 'document',
    })
  }, [persistedSettings, selectedCard])

  const changeSettings = React.useCallback((nextSettings: StrybldrCameraSettings) => {
    publishCameraFramingRuntime({
      anchorId: selectedCard?.id || SHARED_CANVAS_CAMERA_ANCHOR_ID,
      settings: nextSettings,
      source: 'panel',
    })
  }, [selectedCard])

  const reframeSelectedCardCamera = React.useCallback((nextSettings: StrybldrCameraSettings) => {
    if (!selectedCard) {
      publishCameraFramingRuntime({
        anchorId: SHARED_CANVAS_CAMERA_ANCHOR_ID,
        settings: nextSettings,
        source: 'panel',
      })
      addHistory('Shared camera reframe')
      pushUiToast({
        id: 'strybldr:camera:reframe',
        kind: 'success',
        message: 'Shared camera reframed.',
      })
      return
    }
    const currentGraphData = useGraphStore.getState().graphData || graphData
    const currentNode = (Array.isArray(currentGraphData?.nodes) ? currentGraphData.nodes : []).find(node => node.id === selectedCard.id) || null
    const currentProperties = currentNode?.properties && typeof currentNode.properties === 'object' && !Array.isArray(currentNode.properties)
      ? currentNode.properties as Record<string, JSONValue>
      : {}
    updateNode(selectedCard.id, {
      properties: {
        ...currentProperties,
        [STRYBLDR_CAMERA_PROPERTY_KEY]: serializeStrybldrCameraSettings(nextSettings),
        evidenceKind: 'user-edit',
        strybldrUserApprovedAtMs: Date.now(),
      },
    })
    publishCameraFramingRuntime({
      anchorId: selectedCard.id,
      settings: nextSettings,
      source: 'document',
    })
    addHistory('Strybldr camera reframe')
    pushUiToast({
      id: 'strybldr:camera:reframe',
      kind: 'success',
      message: 'Strybldr camera reframed.',
    })
  }, [addHistory, graphData, pushUiToast, selectedCard, updateNode])

  return (
    <section
      className="space-y-2"
      aria-label="Shared camera framing"
      data-kg-camera-framing-anchor={cameraAnchorId}
      data-kg-camera-framing-mode={selectedCard ? 'storyboard' : 'shared'}
      data-kg-camera-framing-source={selectedCard && runtime.anchorId !== selectedCard.id ? 'document' : runtime.source}
      data-kg-camera-framing-revision={runtime.revision}
    >
      {editableCards.length ? (
        <PanelSelect
          value={selectedCard?.id || ''}
          aria-label="Camera card"
          onChange={event => {
            const cardId = event.target.value
            selectNode(cardId || null)
            if (cardId) return
            const current = readCameraFramingRuntime()
            publishCameraFramingRuntime({
              anchorId: SHARED_CANVAS_CAMERA_ANCHOR_ID,
              settings: current.settings,
              source: 'panel',
            })
          }}
        >
          <option value="">Canvas camera</option>
          {editableCards.map(card => (
            <option key={card.id} value={card.id}>
              {card.lane}: {card.title}
            </option>
          ))}
        </PanelSelect>
      ) : null}
      <StrybldrCameraPanel
        selectedCardTitle={selectedCard?.title || 'Canvas camera'}
        settings={settings}
        previewImageUrl={previewImageUrl}
        onSettingsChange={changeSettings}
        onReframe={reframeSelectedCardCamera}
      />
    </section>
  )
}
