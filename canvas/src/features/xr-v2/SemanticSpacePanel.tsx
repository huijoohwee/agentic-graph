import React from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { inspectSemanticObject, selectSemanticObject, addSemanticEntityToCanvas, linkedCanvasNode, overlaySemanticObservation } from './semanticSpaceCanvas'
import { LearningOfflineControls } from '@/features/python-learning/LearningOfflineControls'
import { requestSemanticSpaceCamera } from '@/features/three/semanticSpaceCameraRuntime'
import { applySpaceAction, hashSpaceImage, MAX_SPACE_ENTITIES, MAX_SPACE_OBSERVATIONS,
  querySpaceEntities, type SpaceDocument, type SpaceRegion } from './semanticSpaceRuntime'
import { importSemanticSpace, readSemanticSpace, readSemanticSpaceSourceMirrorStatus,
  runSemanticSpaceAction, subscribeSemanticSpace } from './semanticSpaceStore'
import { exportSemanticSpacePackage } from './semanticSpaceStore'
import { emptySemanticTwin, SEMANTIC_TWIN_PREVIEW_EVENT, SEMANTIC_TWIN_TEMPLATES,
  type TwinTemplate, type TwinVector } from './semanticTwinRuntime'

const actionId = () => `action:${crypto.randomUUID()}`
const entityId = () => `entity:${crypto.randomUUID()}`
const observationId = () => `observation:${crypto.randomUUID()}`
const buttonClass = 'App-toolbar__btn min-h-11 min-w-11 text-sm'
const fieldClass = 'min-h-11 w-full rounded border border-current/30 bg-transparent px-3 text-sm'
const clamp = (value: number) => Math.min(1, Math.max(0, value))
const sourceStatus = (space: SpaceDocument) => {
  const status = readSemanticSpaceSourceMirrorStatus()
  if (!status || status.revision !== space.revision) return ''
  return status.error ? ` Source Files update failed: ${status.error}` : ` Source Files: ${status.path}`
}


export function SemanticSpacePanel({ inspectorOnly = false, entityId: inspectorEntityId, spaceId: inspectorSpaceId }: { inspectorOnly?: boolean; entityId?: string; spaceId?: string } = {}) {
  const [document, setDocument] = React.useState<SpaceDocument | null>(null)
  const [status, setStatus] = React.useState('Open a local space or capture a still.')
  const [cameraActive, setCameraActive] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [imageUrl, setImageUrl] = React.useState('')
  const [urlBusy, setUrlBusy] = React.useState(false)
  const [label, setLabel] = React.useState('')
  const [category, setCategory] = React.useState('object')
  const [query, setQuery] = React.useState('')
  const [region, setRegion] = React.useState<SpaceRegion | null>(null)
  const [observationIndex, setObservationIndex] = React.useState(0)
  const [editing, setEditing] = React.useState(false)
  const [draftEntityId, setDraftEntityId] = React.useState('')
  const [twinTemplate, setTwinTemplate] = React.useState<TwinTemplate>('box')
  const [twinSize, setTwinSize] = React.useState<TwinVector>([1, 1, 1])
  const [twinPosition, setTwinPosition] = React.useState<TwinVector>([0, 0, 0])
  const [roomSize, setRoomSize] = React.useState<readonly [number, number]>([8, 8])
  const [authoredMetres, setAuthoredMetres] = React.useState(false)
  const currentDocumentRef = React.useRef<SpaceDocument | null>(null)
  currentDocumentRef.current = document
  const videoRef = React.useRef<HTMLVideoElement>(null)
  const streamRef = React.useRef<MediaStream | null>(null)
  const generation = React.useRef(0)
  const dragStart = React.useRef<{ x: number; y: number } | null>(null)
  const fileRef = React.useRef<HTMLInputElement>(null)
  const packageRef = React.useRef<HTMLInputElement>(null)
  const urlAbortRef = React.useRef<AbortController | null>(null)

  const stopCamera = React.useCallback(() => {
    generation.current += 1
    const stream = streamRef.current
    streamRef.current = null
    stream?.getTracks().forEach(track => track.stop())
    if (videoRef.current) videoRef.current.srcObject = null
    setCameraActive(false)
    setBusy(false)
  }, [])
  React.useEffect(() => {
    let alive = true
    const refresh = () => { void readSemanticSpace().then(value => {
      if (alive) setDocument(value)
    }, error => { if (alive) setStatus(String(error?.message || error)) }) }
    refresh()
    const unsubscribe = subscribeSemanticSpace(refresh)
    return () => { alive = false; stopCamera(); unsubscribe() }
  }, [stopCamera])
  React.useEffect(() => () => urlAbortRef.current?.abort(), [])
  React.useEffect(() => {
    const handle = (event: Event) => setStatus(String((event as CustomEvent<string>).detail))
    window.addEventListener('agentic-graph:semantic-twin-error', handle)
    return () => window.removeEventListener('agentic-graph:semantic-twin-error', handle)
  }, [])
  React.useEffect(() => {
    const selected = document?.entities.find(item => item.id === (inspectorEntityId || document.selectedEntityId))
    if (!selected) return
    setDraftEntityId(selected.id)
    const binding = document?.twin?.objects.find(item => item.entityId === selected.id)
    const room = document?.twin?.room || emptySemanticTwin().room
    setTwinTemplate(binding?.template || (SEMANTIC_TWIN_TEMPLATES.includes(selected.category.toLowerCase() as TwinTemplate)
      ? selected.category.toLowerCase() as TwinTemplate : 'box'))
    setTwinSize(binding?.size || [1, 1, 1])
    setTwinPosition(binding?.position || [
      Number(((selected.region.x + selected.region.width / 2 - 0.5) * room.width).toFixed(2)), 0,
      Number(((selected.region.y + selected.region.height / 2 - 0.5) * room.depth).toFixed(2)),
    ])
  }, [document?.selectedEntityId, document?.twin, document?.entities, inspectorEntityId])
  React.useEffect(() => {
    const room = document?.twin?.room
    if (room) { setRoomSize([room.width, room.depth]); setAuthoredMetres(room.unit === 'authored-metres') }
  }, [document?.twin?.room])

  const startCamera = async () => {
    if (busy || cameraActive) return
    const request = ++generation.current
    setBusy(true)
    try {
      const stream = await requestSemanticSpaceCamera()
      if (request !== generation.current) { stream.getTracks().forEach(track => track.stop()); return }
      streamRef.current = stream
      for (const track of stream.getVideoTracks()) track.addEventListener('ended', stopCamera, { once: true })
      const video = videoRef.current
      if (!video) throw Error('Camera preview is unavailable')
      video.srcObject = stream
      setCameraActive(true)
      await video.play()
      if (request !== generation.current) return
      setStatus('Camera ready. Capture a still when the view is clear.')
    } catch (error) { if (request === generation.current) { stopCamera(); setStatus(String((error as Error).message || error)) } }
    finally { setBusy(false) }
  }

  const persistImage = async (source: CanvasImageSource, width: number, height: number) => {
    if (busy) return
    setBusy(true)
    try {
      if (!width || !height) throw Error('Image pixels are not ready')
      if ((document?.observations.length || 0) >= MAX_SPACE_OBSERVATIONS) throw Error('Observation limit reached')
      const scale = Math.min(1, 1280 / Math.max(width, height))
      const canvas = window.document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(width * scale))
      canvas.height = Math.max(1, Math.round(height * scale))
      const context = canvas.getContext('2d', { alpha: false })
      if (!context) throw Error('This browser cannot prepare the still image')
      context.drawImage(source, 0, 0, canvas.width, canvas.height)
      const imageDataUrl = canvas.toDataURL('image/jpeg', 0.75)
      const next = await runSemanticSpaceAction({ operation: 'capture', requestId: actionId(),
        expectedRevision: document?.revision || 0,
        observation: { id: observationId(), capturedAtMs: Date.now(), width: canvas.width,
          height: canvas.height, imageDataUrl, sha256: await hashSpaceImage(imageDataUrl),
          orientation: 'source-pixels', scale: 'unknown' } })
      setDocument(next)
      setObservationIndex(next.observations.length - 1)
      setRegion(null)
      setStatus(`Still saved locally. Drag a region and confirm its label.${sourceStatus(next)}`)
    } catch (error) { setStatus(String((error as Error).message || error)) }
    finally { setBusy(false) }
  }

  const chooseImage = async (file: File | undefined) => {
    if (!file) return
    try {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 16 * 1024 * 1024) {
        throw Error('Choose a JPEG, PNG or WebP image under 16 MiB')
      }
      if (typeof createImageBitmap === 'function') {
        const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
        try { await persistImage(bitmap, bitmap.width, bitmap.height) } finally { bitmap.close() }
      } else {
        const url = URL.createObjectURL(file)
        try {
          const image = new Image()
          const loaded = new Promise<void>((resolve, reject) => {
            image.onload = () => resolve(); image.onerror = () => reject(Error('Image could not be decoded'))
          })
          image.src = url
          await loaded
          await persistImage(image, image.naturalWidth, image.naturalHeight)
        } finally { URL.revokeObjectURL(url) }
      }
    } catch (error) { setStatus(String((error as Error).message || error)) }
  }

  const importImageUrl = async () => {
    if (busy || urlBusy) return
    const controller = new AbortController()
    urlAbortRef.current = controller
    setUrlBusy(true)
    const deadline = window.setTimeout(() => controller.abort(), 20_000)
    try {
      const url = new URL(imageUrl.trim())
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
        throw Error('Enter an HTTP(S) image URL without embedded credentials')
      }
      const response = await fetch(url.href, { credentials: 'omit', signal: controller.signal })
      if (!response.ok || !response.body) throw Error(`Image URL did not return an image (${response.status})`)
      const mime = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()
      if (!mime || !/^image\/(jpeg|png|webp)$/.test(mime)) throw Error('Image URL must return JPEG, PNG or WebP')
      const maxBytes = 16 * 1024 * 1024
      if (Number(response.headers.get('content-length') || 0) > maxBytes) throw Error('Image URL exceeds 16 MiB')
      const reader = response.body.getReader()
      const chunks: Uint8Array[] = []
      let bytes = 0
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        bytes += value.byteLength
        if (bytes > maxBytes) { await reader.cancel(); throw Error('Image URL exceeds 16 MiB') }
        chunks.push(value)
      }
      await chooseImage(new File(chunks as BlobPart[], 'imported-image', { type: mime }))
    } catch (error) {
      setStatus(controller.signal.aborted ? 'Image URL timed out or was cancelled.'
        : `Image URL import failed: ${String((error as Error).message || error)}`)
    } finally {
      window.clearTimeout(deadline)
      if (urlAbortRef.current === controller) urlAbortRef.current = null
      setUrlBusy(false)
    }
  }

  const mutate = async (action: Parameters<typeof applySpaceAction>[1], success: string): Promise<SpaceDocument | null> => {
    if (busy) return null
    setBusy(true)
    try { const next = await runSemanticSpaceAction(action); setDocument(next);
      setStatus(`${success}${sourceStatus(next)}`); return next }
    catch (error) { setStatus(String((error as Error).message || error)); return null }
    finally { setBusy(false) }
  }
  const observation = document?.observations[observationIndex] || null
  const selected = document?.entities.find(item => item.id === (inspectorEntityId || document.selectedEntityId)) || null
  const twinBinding = document?.twin?.objects.find(item => item.entityId === selected?.id)
  const results = document ? querySpaceEntities(document, query) : []
  const imageEntities = document?.entities.filter(item => item.observationId === observation?.id) || []
  const pointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    return { x: clamp((event.clientX - bounds.left) / bounds.width),
      y: clamp((event.clientY - bounds.top) / bounds.height) }
  }
  const confirm = () => {
    if (!document || !observation || !region) { setStatus('Choose an image region first.'); return }
    void mutate({ operation: 'confirm', requestId: actionId(), expectedRevision: document.revision,
      entity: { id: entityId(), observationId: observation.id, label, category, region,
        confirmedAtMs: Date.now(), provenance: 'user-confirmed' } }, 'Entity confirmed and saved.').then(ok => {
          if (ok) { setRegion(null); setLabel('') }
        })
  }
  const exportPackage = async () => {
    if (!document || busy) return
    setBusy(true)
    try {
      const blob = new Blob([await exportSemanticSpacePackage(document)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = window.document.createElement('a')
      link.href = url; link.download = `space-${document.id}.json`; link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
      setStatus('Verified local space and editable twin package exported.')
    } catch (error) { setStatus(String((error as Error).message || error)) }
    finally { setBusy(false) }
  }
  const importPackage = async (file: File | undefined) => {
    if (!file) return
    if (file.size > 32 * 1024 * 1024) { setStatus('Space package exceeds 32 MiB.'); return }
    setBusy(true)
    try { const next = await importSemanticSpace(await file.text()); setDocument(next); setObservationIndex(0)
      setRegion(null); setStatus(`Space imported and verified. Previous local space retained as a backup.${sourceStatus(next)}`) }
    catch (error) { setStatus(String((error as Error).message || error)) }
    finally { setBusy(false) }
  }
  const addSelectedToCanvas = async (space: SpaceDocument | null = document, entity = selected) => {
    if (!space || !entity) return
    try {
      const { closeImmersiveMedia } = await import('@/features/immersive-media/immersiveMediaRuntime')
      closeImmersiveMedia()
      setStatus(await addSemanticEntityToCanvas(space, entity))
    }
    catch (error) { setStatus(String((error as Error).message || error)) }
  }
  const applyTwin = () => {
    if (!document || !selected || draftEntityId !== selected.id) return
    const action = twinBinding && twinBinding.template === twinTemplate
      ? { operation: 'edit-twin' as const, requestId: actionId(), expectedRevision: document.revision,
          entityId: selected.id, size: twinSize, position: twinPosition }
      : { operation: 'build' as const, requestId: actionId(), expectedRevision: document.revision,
          entityId: selected.id, template: twinTemplate, size: twinSize, position: twinPosition }
    void mutate(action, 'Approximate geometry saved with its source image and controls.').then(next => {
      if (next) void addSelectedToCanvas(next, selected)
    })
  }
  const previewTwin = (operation: 'drop' | 'reset') => {
    if (!document || !selected || !twinBinding) return
    const detail = { spaceId: document.id, entityId: selected.id, operation, handled: false }
    window.dispatchEvent(new CustomEvent(SEMANTIC_TWIN_PREVIEW_EVENT,
      { detail }))
    setStatus(!detail.handled ? 'Link this entity and open the 3D or XR canvas to preview physics.'
      : operation === 'drop' ? 'Local cuboid proxy preview started; source layout is unchanged.'
        : 'Physics preview reset to the authored layout.')
  }
  const exportSelectedModel = async () => {
    if (!twinBinding || !document || busy) return
    const revision = document.revision
    setBusy(true)
    try {
      const { exportTwinModel } = await import('./semanticTwinScene')
      const blob = await exportTwinModel(document, twinBinding.entityId, () => currentDocumentRef.current?.id === document.id
        && currentDocumentRef.current.revision === revision)
      const current = await readSemanticSpace()
      if (!current || current.id !== document.id || current.revision !== revision) {
        throw Error('Space changed during model export; retry with the current geometry')
      }
      const url = URL.createObjectURL(blob)
      const link = window.document.createElement('a')
      link.href = url; link.download = `${(selected?.label || 'space-object').replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80)}.glb`; link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
      setStatus('Selected model exported with its generated geometry, authored dimensions and available photo face. The full space package retains placement and evidence.')
    } catch (error) { setStatus(String((error as Error).message || error)) }
    finally { setBusy(false) }
  }

  const objectEditor = document && (selected && <div className="grid gap-2"><span>Selected ID: <code>{selected.id}</code></span>
        <div className="flex flex-wrap gap-2"><button type="button" className={buttonClass} onClick={() => { setEditing(!editing); setLabel(selected.label); setCategory(selected.category) }}>Correct label</button>
          <button type="button" className={buttonClass} onClick={() => void addSelectedToCanvas()}>Open 3D layout</button>
          <button type="button" className={buttonClass} onClick={() => {
            void overlaySemanticObservation(document, selected.observationId).then(setStatus, error => setStatus(String(error.message)))
          }}>Overlay objects on image</button></div>
        {editing && <div className="grid gap-2"><input className={fieldClass} aria-label="Corrected label" value={label} onChange={event => setLabel(event.target.value)} />
          <input className={fieldClass} aria-label="Corrected category" value={category} onChange={event => setCategory(event.target.value)} />
          <button type="button" className={buttonClass} disabled={busy || !label.trim() || !category.trim()} onClick={() => {
            void mutate({ operation: 'correct', requestId: actionId(), expectedRevision: document.revision,
              entityId: selected.id, label, category }, 'Entity correction saved.').then(ok => {
                if (!ok) return
                const state = useGraphStore.getState()
                const node = linkedCanvasNode(document, selected.id)
                if (node) state.updateNode(node.id,
                  { label, properties: { ...node.properties, category } })
                setEditing(false)
              })
          }}>Save correction</button></div>}
        <fieldset className="grid gap-2 rounded border p-2"><legend className="px-1 font-medium">Editable 3D approximation</legend>
          <label>Supported shape<select className={fieldClass} value={twinTemplate}
            onChange={event => setTwinTemplate(event.currentTarget.value as TwinTemplate)}>
            {SEMANTIC_TWIN_TEMPLATES.filter(item => !['contour', 'relief'].includes(item) || twinBinding?.template === item).map(item => <option key={item} value={item}>{item}</option>)}
          </select></label>
          <div className="grid grid-cols-3 gap-2">{(['Width', 'Height', 'Depth'] as const).map((name, axis) => <label key={name}>{name}
            <input className={fieldClass} type="number" min="0.1" max="5" step="0.1" value={twinSize[axis]}
              onChange={event => { const value = Number(event.currentTarget.value)
                setTwinSize(current => current.map((item, index) => index === axis ? value : item) as [number, number, number]) }} /></label>)}</div>
          <div className="grid grid-cols-2 gap-2">{(['X position', 'Elevation', 'Depth position'] as const).map((name, index) => {
            const axis = index
            return <label key={name}>{name}<input className={fieldClass} type="number" min={axis === 1 ? "0" : "-10"} max="10" step="0.1"
              value={twinPosition[axis]} onChange={event => { const value = Number(event.currentTarget.value)
                setTwinPosition(current => current.map((item, currentAxis) => currentAxis === axis ? value : item) as [number, number, number]) }} /></label>
          })}</div>
          <p className="m-0 text-xs">Shape, hidden surfaces and image-derived placement are editable assumptions.
            {document.twin?.room.unit === 'authored-metres' ? ' Room dimensions are user-authored metres.' : ' Units are arbitrary.'}</p>
          <div className="flex flex-wrap gap-2"><button type="button" className={buttonClass} disabled={busy || draftEntityId !== selected.id} onClick={applyTwin}>
            {twinBinding ? 'Apply geometry and placement' : 'Build and add to canvas'}</button>
            {twinBinding && <><button type="button" className={buttonClass} disabled={busy} onClick={() => previewTwin('drop')}>Drop preview</button>
              <button type="button" className={buttonClass} onClick={() => previewTwin('reset')}>Reset preview</button>
              <button type="button" className={buttonClass} disabled={busy} onClick={() => void exportSelectedModel()}>Export model GLB</button></>}
          </div>
          {twinBinding?.recipe.controls.filter(control => control.type === 'color').slice(0, 1).map(control =>
            <label key={control.id}>Model colour<input className={fieldClass} type="color"
              value={String(twinBinding.recipe.values[control.id])} disabled={busy} onChange={event => {
                void mutate({ operation: 'control-twin', requestId: actionId(), expectedRevision: document.revision,
                  entityId: selected.id, controlId: control.id, value: event.currentTarget.value }, 'Model colour saved.')
              }} /></label>)}
        </fieldset></div>)
  if (inspectorOnly && inspectorSpaceId && document?.id !== inspectorSpaceId) return <p>Choose an object in the current space.</p>
  if (inspectorOnly) return <section className="grid gap-2 p-2" aria-label="Selected 3D object inspector">
    <strong>{selected?.label || 'Choose an object'} · Object transform</strong>
    {objectEditor}<output role="status">{status}</output>
  </section>
  return <section className="grid gap-3 rounded border p-3 text-sm" aria-label="Semantic space" data-kg-semantic-space="1">
    <header><h5 className="m-0 text-base font-semibold">Semantic space</h5>
      <p className="m-0">Capture or choose a still, confirm regions, and query the same saved entities. Scale is unknown.</p></header>
    <div className="flex flex-wrap gap-2">
      <button type="button" className={buttonClass} disabled={busy || cameraActive} onClick={() => void startCamera()}>Open camera</button>
      <button type="button" className={buttonClass} disabled={!cameraActive || busy} onClick={() => {
        const video = videoRef.current; if (video) void persistImage(video, video.videoWidth, video.videoHeight)
      }}>Capture still</button>
      <button type="button" className={buttonClass} disabled={!cameraActive && !busy} onClick={stopCamera}>{cameraActive ? 'Close camera' : 'Cancel camera'}</button>
      <button type="button" className={buttonClass} disabled={busy || urlBusy} onClick={() => fileRef.current?.click()}>Import local image</button>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={event => {
        void chooseImage(event.target.files?.[0]); event.currentTarget.value = ''
      }} />
    </div>
    <div className="flex flex-wrap gap-2"><input className={`${fieldClass} min-w-0 flex-1`} type="url"
      value={imageUrl} placeholder="HTTPS image URL" aria-label="Image URL"
      onChange={event => setImageUrl(event.currentTarget.value)} />
      <button type="button" className={buttonClass} disabled={busy || urlBusy || !imageUrl.trim()}
        onClick={() => void importImageUrl()}>Import URL</button></div>
    <video ref={videoRef} className={cameraActive ? 'w-full rounded bg-black' : 'hidden'} muted playsInline aria-label="Space camera preview" />
    {observation && <>
      <label>Observation <select className={fieldClass} value={observationIndex} onChange={event => {
        setObservationIndex(Number(event.target.value)); setRegion(null)
      }}>{document!.observations.map((item, index) => <option key={item.id} value={index}>{index + 1} · {new Date(item.capturedAtMs).toLocaleString()}</option>)}</select></label>
      <div className="relative touch-none" onPointerDown={event => { dragStart.current = pointer(event); event.currentTarget.setPointerCapture(event.pointerId) }}
        onPointerUp={event => { const start = dragStart.current; dragStart.current = null; if (!start) return
          const end = pointer(event); const next = { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y),
            width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) }
          if (next.width >= 0.02 && next.height >= 0.02) setRegion(next)
        }} aria-label="Drag a region on the observation image">
        <img src={observation.imageDataUrl} alt="Captured physical space" className="block w-full rounded" />
        {imageEntities.map(item => <div key={item.id} className={`pointer-events-none absolute border-2 ${selected?.id === item.id ? 'border-amber-400' : 'border-cyan-400'}`}
          style={{ left: `${item.region.x * 100}%`, top: `${item.region.y * 100}%`, width: `${item.region.width * 100}%`, height: `${item.region.height * 100}%` }} />)}
        {region && <div className="pointer-events-none absolute border-2 border-emerald-400" style={{ left: `${region.x * 100}%`,
          top: `${region.y * 100}%`, width: `${region.width * 100}%`, height: `${region.height * 100}%` }} />}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label>Label <input className={fieldClass} value={label} maxLength={80} onChange={event => setLabel(event.target.value)} /></label>
        <label>Category <input className={fieldClass} value={category} maxLength={80} onChange={event => setCategory(event.target.value)} /></label>
      </div>
      <div className="flex flex-wrap gap-2"><button type="button" className={buttonClass} onClick={() => setRegion({ x: 0, y: 0, width: 1, height: 1 })}>Use full image</button>
        <button type="button" className={buttonClass} disabled={busy || !region || !label.trim() || (document?.entities.length || 0) >= MAX_SPACE_ENTITIES} onClick={confirm}>Confirm region</button></div>
    </>}
    {document && <>
      <fieldset className="grid gap-2 rounded border p-2"><legend className="px-1 font-medium">Approximate room floor</legend>
        <div className="grid grid-cols-2 gap-2">{(['Width', 'Depth'] as const).map((name, axis) => <label key={name}>{name}
          <input className={fieldClass} type="number" min="2" max="20" step="0.1" value={roomSize[axis]}
            onChange={event => { const value = Number(event.currentTarget.value)
              setRoomSize(current => current.map((item, index) => index === axis ? value : item) as [number, number]) }} /></label>)}</div>
        <label className="flex items-center gap-2"><input type="checkbox" checked={authoredMetres}
          onChange={event => setAuthoredMetres(event.currentTarget.checked)} />I entered these dimensions in metres</label>
        <button type="button" className={buttonClass} disabled={busy} onClick={() => {
          void mutate({ operation: 'set-room', requestId: actionId(), expectedRevision: document.revision,
            room: { width: roomSize[0], depth: roomSize[1], unit: authoredMetres ? 'authored-metres' : 'arbitrary' } },
          'Room floor dimensions saved. Image-only geometry remains approximate.')
        }}>Save floor</button>
      </fieldset>
      <label>Find entity <input className={fieldClass} value={query} onChange={event => setQuery(event.target.value)} placeholder="Label or category" /></label>
      <div className="grid max-h-48 gap-1 overflow-auto" aria-label="Matching confirmed entities">
        {results.map(item => <button type="button" key={item.id} className={`${buttonClass} text-left ${selected?.id === item.id ? 'ring-2 ring-cyan-400' : ''}`}
          onClick={() => { setObservationIndex(document.observations.findIndex(view => view.id === item.observationId));
            const linked = linkedCanvasNode(document, item.id)
            if (linked) useGraphStore.getState().selectNode(linked.id)
            void selectSemanticObject(document.id, item.id).catch(error => setStatus(String(error.message))) }}>
          {item.category} · {item.label}</button>)}
        {results.length === 0 && <span>No matching confirmed entities.</span>}
      </div>
      {selected && <button type="button" className={buttonClass} onClick={() => {
        void inspectSemanticObject(document).catch(error => setStatus(String(error.message)))
      }}>Edit selected object in Timeline</button>}
      <span>Revision {document.revision} · {document.observations.length} observations · {document.entities.length} entities</span>
    </>}
    <div className="flex flex-wrap gap-2"><button type="button" className={buttonClass} disabled={!document || busy} onClick={() => void exportPackage()}>Export space</button>
        <button type="button" className={buttonClass} disabled={busy} onClick={() => packageRef.current?.click()}>Import space</button>
        <input ref={packageRef} type="file" accept="application/json,.json" className="sr-only" onChange={event => {
          void importPackage(event.target.files?.[0]); event.currentTarget.value = ''
        }} /></div>
    <LearningOfflineControls purpose="studio" />
    <p className="m-0" role="status" aria-live="polite">{status}</p>
  </section>
}
