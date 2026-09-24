import React from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { requestSemanticSpaceCamera } from '@/features/three/semanticSpaceCameraRuntime'
import { applySpaceAction, hashSpaceImage, MAX_SPACE_ENTITIES, MAX_SPACE_OBSERVATIONS,
  querySpaceEntities, type SpaceDocument, type SpaceRegion } from './semanticSpaceRuntime'
import { importSemanticSpace, readSemanticSpace, runSemanticSpaceAction, subscribeSemanticSpace } from './semanticSpaceStore'

const actionId = () => `action:${crypto.randomUUID()}`
const entityId = () => `entity:${crypto.randomUUID()}`
const observationId = () => `observation:${crypto.randomUUID()}`
const buttonClass = 'App-toolbar__btn min-h-11 min-w-11 text-sm'
const fieldClass = 'min-h-11 w-full rounded border border-current/30 bg-transparent px-3 text-sm'
const clamp = (value: number) => Math.min(1, Math.max(0, value))

export function SemanticSpacePanel() {
  const [document, setDocument] = React.useState<SpaceDocument | null>(null)
  const [status, setStatus] = React.useState('Open a local space or capture a still.')
  const [cameraActive, setCameraActive] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [label, setLabel] = React.useState('')
  const [category, setCategory] = React.useState('object')
  const [query, setQuery] = React.useState('')
  const [region, setRegion] = React.useState<SpaceRegion | null>(null)
  const [observationIndex, setObservationIndex] = React.useState(0)
  const [editing, setEditing] = React.useState(false)
  const videoRef = React.useRef<HTMLVideoElement>(null)
  const streamRef = React.useRef<MediaStream | null>(null)
  const generation = React.useRef(0)
  const dragStart = React.useRef<{ x: number; y: number } | null>(null)
  const fileRef = React.useRef<HTMLInputElement>(null)
  const packageRef = React.useRef<HTMLInputElement>(null)

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
      setStatus('Still saved locally. Drag a region and confirm its label.')
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

  const mutate = async (action: Parameters<typeof applySpaceAction>[1], success: string): Promise<boolean> => {
    if (busy) return false
    setBusy(true)
    try { const next = await runSemanticSpaceAction(action); setDocument(next); setStatus(success); return true }
    catch (error) { setStatus(String((error as Error).message || error)); return false }
    finally { setBusy(false) }
  }
  const observation = document?.observations[observationIndex] || null
  const selected = document?.entities.find(item => item.id === document.selectedEntityId) || null
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
  const exportPackage = () => {
    if (!document) return
    const blob = new Blob([JSON.stringify(document)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = window.document.createElement('a')
    link.href = url; link.download = `space-${document.id}.json`; link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
    setStatus('Complete local space package exported.')
  }
  const importPackage = async (file: File | undefined) => {
    if (!file) return
    if (file.size > 32 * 1024 * 1024) { setStatus('Space package exceeds 32 MiB.'); return }
    setBusy(true)
    try { const next = await importSemanticSpace(await file.text()); setDocument(next); setObservationIndex(0)
      setRegion(null); setStatus('Space imported and verified. Previous local space retained as a backup.') }
    catch (error) { setStatus(String((error as Error).message || error)) }
    finally { setBusy(false) }
  }
  const addSelectedToCanvas = () => {
    if (!document || !selected) return
    const state = useGraphStore.getState()
    const id = selected.id
    const existing = state.graphData?.nodes.find(node => node.id === id)
    if (existing && existing.properties?.spaceId !== document.id) {
      setStatus('The active canvas already uses this entity ID. Open another canvas document.')
      return
    }
    if (!existing) {
      state.addNode({ id, label: selected.label, type: 'semantic-space-entity',
        properties: { spaceId: document.id, entityId: selected.id,
          observationId: selected.observationId, category: selected.category, region: selected.region,
          evidenceSha256: document.observations.find(item => item.id === selected.observationId)?.sha256 || '' } })
    } else if (existing.label !== selected.label || existing.properties?.category !== selected.category) {
      state.updateNode(id, { label: selected.label, properties: { ...existing.properties, category: selected.category } })
    }
    if (!useGraphStore.getState().graphData?.nodes.some(node => node.id === id)) {
      setStatus('The active canvas did not accept this entity. Check its edit permissions.')
      return
    }
    useGraphStore.getState().selectNode(id)
    setStatus('Entity linked to the active canvas. Its evidence remains in this local space.')
  }

  return <section className="grid gap-3 rounded border p-3 text-sm" aria-label="Semantic space" data-kg-semantic-space="1">
    <header><h5 className="m-0 text-base font-semibold">Semantic space</h5>
      <p className="m-0">Capture or choose a still, confirm regions, and query the same saved entities. Scale is unknown.</p></header>
    <div className="flex flex-wrap gap-2">
      <button type="button" className={buttonClass} disabled={busy || cameraActive} onClick={() => void startCamera()}>Open camera</button>
      <button type="button" className={buttonClass} disabled={!cameraActive || busy} onClick={() => {
        const video = videoRef.current; if (video) void persistImage(video, video.videoWidth, video.videoHeight)
      }}>Capture still</button>
      <button type="button" className={buttonClass} disabled={!cameraActive && !busy} onClick={stopCamera}>{cameraActive ? 'Close camera' : 'Cancel camera'}</button>
      <button type="button" className={buttonClass} disabled={busy} onClick={() => fileRef.current?.click()}>Choose image</button>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={event => {
        void chooseImage(event.target.files?.[0]); event.currentTarget.value = ''
      }} />
    </div>
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
      <label>Find entity <input className={fieldClass} value={query} onChange={event => setQuery(event.target.value)} placeholder="Label or category" /></label>
      <div className="grid max-h-48 gap-1 overflow-auto" aria-label="Matching confirmed entities">
        {results.map(item => <button type="button" key={item.id} className={`${buttonClass} text-left ${selected?.id === item.id ? 'ring-2 ring-cyan-400' : ''}`}
          onClick={() => { setObservationIndex(document.observations.findIndex(view => view.id === item.observationId));
            if (useGraphStore.getState().graphData?.nodes.some(node => node.id === item.id)) useGraphStore.getState().selectNode(item.id)
            void mutate({ operation: 'select', requestId: actionId(), expectedRevision: document.revision, entityId: item.id }, 'Entity selected.') }}>
          {item.category} · {item.label}</button>)}
        {results.length === 0 && <span>No matching confirmed entities.</span>}
      </div>
      {selected && <div className="grid gap-2"><span>Selected ID: <code>{selected.id}</code></span>
        <div className="flex flex-wrap gap-2"><button type="button" className={buttonClass} onClick={() => { setEditing(!editing); setLabel(selected.label); setCategory(selected.category) }}>Correct label</button>
          <button type="button" className={buttonClass} onClick={addSelectedToCanvas}>Add to canvas</button></div>
        {editing && <div className="grid gap-2"><input className={fieldClass} aria-label="Corrected label" value={label} onChange={event => setLabel(event.target.value)} />
          <input className={fieldClass} aria-label="Corrected category" value={category} onChange={event => setCategory(event.target.value)} />
          <button type="button" className={buttonClass} disabled={busy || !label.trim() || !category.trim()} onClick={() => {
            void mutate({ operation: 'correct', requestId: actionId(), expectedRevision: document.revision,
              entityId: selected.id, label, category }, 'Entity correction saved.').then(ok => {
                if (!ok) return
                const state = useGraphStore.getState()
                const node = state.graphData?.nodes.find(item => item.id === selected.id)
                if (node?.properties?.spaceId === document.id) state.updateNode(selected.id,
                  { label, properties: { ...node.properties, category } })
                setEditing(false)
              })
          }}>Save correction</button></div>}</div>}
      <span>Revision {document.revision} · {document.observations.length} observations · {document.entities.length} entities</span>
    </>}
    <div className="flex flex-wrap gap-2"><button type="button" className={buttonClass} disabled={!document} onClick={exportPackage}>Export space</button>
        <button type="button" className={buttonClass} disabled={busy} onClick={() => packageRef.current?.click()}>Import space</button>
        <input ref={packageRef} type="file" accept="application/json,.json" className="sr-only" onChange={event => {
          void importPackage(event.target.files?.[0]); event.currentTarget.value = ''
        }} /></div>
    <p className="m-0" role="status" aria-live="polite">{status}</p>
  </section>
}
