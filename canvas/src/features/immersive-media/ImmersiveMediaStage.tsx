import React from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  BackSide,
  BufferGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  LineBasicMaterial,
  LineLoop,
  MathUtils,
  RepeatWrapping,
  SRGBColorSpace,
  SpriteMaterial,
  ShaderMaterial,
  Texture,
  TextureLoader,
  VideoTexture,
} from 'three'
import type { Group } from 'three'
import {
  completeImmersiveMediaTransition,
  readImmersiveMediaSnapshot,
  setHoveredImmersiveMediaMarker,
  setSelectedImmersiveMediaMarker,
  subscribeImmersiveMediaSnapshot,
} from './immersiveMediaRuntime'
import type { ImmersiveMediaMarker, ImmersiveMediaSnapshot } from './immersiveMediaModel'

function createCanvas(width: number, height: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function createProceduralPanorama(snapshot: ImmersiveMediaSnapshot): CanvasTexture | null {
  const canvas = createCanvas(1024, 512)
  const context = canvas?.getContext('2d')
  if (!canvas || !context) return null
  const gradient = context.createLinearGradient(0, 0, 0, canvas.height)
  gradient.addColorStop(0, '#07182f')
  gradient.addColorStop(0.48, '#164e63')
  gradient.addColorStop(0.5, '#0f766e')
  gradient.addColorStop(1, '#020617')
  context.fillStyle = gradient
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.strokeStyle = 'rgba(103,232,249,0.22)'
  context.lineWidth = 1
  for (let x = 0; x <= canvas.width; x += 64) {
    context.beginPath()
    context.moveTo(x, 0)
    context.lineTo(x, canvas.height)
    context.stroke()
  }
  for (let y = 0; y <= canvas.height; y += 48) {
    context.beginPath()
    context.moveTo(0, y)
    context.lineTo(canvas.width, y)
    context.stroke()
  }
  context.fillStyle = 'rgba(255,255,255,0.9)'
  context.font = '600 34px system-ui, sans-serif'
  context.fillText(snapshot.title, 48, 72)
  context.fillStyle = 'rgba(207,250,254,0.74)'
  context.font = '20px system-ui, sans-serif'
  context.fillText('Local procedural panorama · zero network', 48, 108)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.wrapS = RepeatWrapping
  texture.needsUpdate = true
  return texture
}

function usePanoramaTexture(snapshot: ImmersiveMediaSnapshot): Texture | null {
  const procedural = React.useMemo(
    () => createProceduralPanorama(snapshot),
    [snapshot.title],
  )
  const [loaded, setLoaded] = React.useState<Texture | null>(null)

  React.useEffect(() => {
    setLoaded(null)
    if (snapshot.source.kind === 'procedural' || !snapshot.source.url) return
    let disposed = false
    let ownedTexture: Texture | null = null
    let video: HTMLVideoElement | null = null
    if (snapshot.source.kind === 'image') {
      new TextureLoader().load(
        snapshot.source.url,
        texture => {
          if (disposed) {
            texture.dispose()
            return
          }
          texture.colorSpace = SRGBColorSpace
          texture.wrapS = RepeatWrapping
          texture.needsUpdate = true
          ownedTexture = texture
          setLoaded(texture)
        },
        undefined,
        () => {
          if (!disposed) setLoaded(null)
        },
      )
    } else if (typeof document !== 'undefined') {
      video = document.createElement('video')
      video.src = snapshot.source.url
      video.crossOrigin = 'anonymous'
      video.muted = true
      video.loop = true
      video.playsInline = true
      const texture = new VideoTexture(video)
      texture.colorSpace = SRGBColorSpace
      ownedTexture = texture
      setLoaded(texture)
      void video.play().catch(() => undefined)
    }
    return () => {
      disposed = true
      video?.pause()
      if (video) {
        video.removeAttribute('src')
        video.load()
      }
      ownedTexture?.dispose()
    }
  }, [snapshot.source.kind, snapshot.source.url])

  React.useEffect(() => () => procedural?.dispose(), [procedural])
  return loaded || procedural
}

function markerPosition(marker: ImmersiveMediaMarker, radius = 78): [number, number, number] {
  const yaw = MathUtils.degToRad(marker.yawDegrees)
  const pitch = MathUtils.degToRad(marker.pitchDegrees)
  const horizontal = Math.cos(pitch) * radius
  return [
    Math.sin(yaw) * horizontal,
    Math.sin(pitch) * radius,
    -Math.cos(yaw) * horizontal,
  ]
}

function createMarkerTexture(marker: ImmersiveMediaMarker): CanvasTexture | null {
  const canvas = createCanvas(marker.kind === 'pin' ? 128 : 256, 128)
  const context = canvas?.getContext('2d')
  if (!canvas || !context) return null
  if (marker.kind === 'chroma') {
    context.fillStyle = '#00ff00'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = marker.color
    context.beginPath()
    context.arc(canvas.width / 2, canvas.height / 2, 36, 0, Math.PI * 2)
    context.fill()
  } else {
    context.fillStyle = 'rgba(2,6,23,0.84)'
    context.fillRect(4, 4, canvas.width - 8, canvas.height - 8)
    context.strokeStyle = marker.color
    context.lineWidth = 6
    context.strokeRect(7, 7, canvas.width - 14, canvas.height - 14)
    context.fillStyle = marker.color
    context.font = '700 22px system-ui, sans-serif'
    context.fillText(['video', 'youtube'].includes(marker.kind) ? '▶' : marker.kind === 'element' ? '◆' : '●', 18, 48)
    context.fillStyle = '#f8fafc'
    context.font = '600 17px system-ui, sans-serif'
    context.fillText(marker.label.slice(0, 18), 18, 88)
  }
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

function useMarkerTexture(marker: ImmersiveMediaMarker): Texture | null {
  const fallback = React.useMemo(() => createMarkerTexture(marker), [marker])
  const [videoTexture, setVideoTexture] = React.useState<VideoTexture | null>(null)
  React.useEffect(() => {
    if (marker.kind !== 'video' || !marker.mediaUrl || typeof document === 'undefined') return
    const video = document.createElement('video')
    video.src = marker.mediaUrl
    video.crossOrigin = 'anonymous'
    video.muted = true
    video.loop = true
    video.playsInline = true
    const texture = new VideoTexture(video)
    texture.colorSpace = SRGBColorSpace
    setVideoTexture(texture)
    void video.play().catch(() => undefined)
    return () => {
      video.pause()
      video.removeAttribute('src')
      video.load()
      texture.dispose()
    }
  }, [marker.kind, marker.mediaUrl])
  React.useEffect(() => () => fallback?.dispose(), [fallback])
  return videoTexture || fallback
}

function MarkerSurface({
  marker,
  opacity,
}: {
  marker: ImmersiveMediaMarker
  opacity: number
}) {
  const texture = useMarkerTexture(marker)
  const { camera } = useThree()
  const groupRef = React.useRef<Group | null>(null)
  const [hovered, setHovered] = React.useState(false)
  const position = React.useMemo(() => markerPosition(marker), [marker])
  const material = React.useMemo(
    () => new SpriteMaterial({ map: texture, transparent: true, opacity, depthTest: false }),
    [opacity, texture],
  )
  React.useEffect(() => () => material.dispose(), [material])
  useFrame(() => {
    if (!groupRef.current) return
    groupRef.current.quaternion.copy(camera.quaternion)
    const targetScale = hovered ? marker.hoverScale : 1
    const nextScale = groupRef.current.scale.x + (targetScale - groupRef.current.scale.x) * 0.16
    groupRef.current.scale.setScalar(nextScale)
  })
  const setHover = (next: boolean) => {
    setHovered(next)
    setHoveredImmersiveMediaMarker(next ? marker.id : null)
  }
  const width = marker.kind === 'pin' ? 7 : 14
  const height = marker.kind === 'pin' ? 7 : 7
  if (!texture) return null
  if (marker.kind === 'chroma') {
    return (
      <group
        ref={groupRef}
        position={position}
        onPointerOver={(event) => { event.stopPropagation(); setHover(true) }}
        onPointerOut={() => setHover(false)}
        onClick={(event) => {
          event.stopPropagation()
          setSelectedImmersiveMediaMarker(
            readImmersiveMediaSnapshot().selectedMarkerId === marker.id ? null : marker.id,
          )
        }}
      >
        <mesh scale={[width, height, 1]}>
          <planeGeometry args={[1, 1]} />
          <shaderMaterial
            transparent
            uniforms={{
              map: { value: texture },
              opacity: { value: opacity },
              keyColor: { value: new Color('#00ff00') },
            }}
            vertexShader="varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }"
            fragmentShader="uniform sampler2D map; uniform vec3 keyColor; uniform float opacity; varying vec2 vUv; void main(){ vec4 c=texture2D(map,vUv); if(distance(c.rgb,keyColor)<0.38) discard; gl_FragColor=vec4(c.rgb,c.a*opacity); }"
          />
        </mesh>
      </group>
    )
  }
  return (
    <group
      ref={groupRef}
      position={position}
      onPointerOver={(event) => { event.stopPropagation(); setHover(true) }}
      onPointerOut={() => setHover(false)}
      onClick={(event) => {
        event.stopPropagation()
        setSelectedImmersiveMediaMarker(
          readImmersiveMediaSnapshot().selectedMarkerId === marker.id ? null : marker.id,
        )
      }}
    >
      <sprite
        scale={[width, height, 1]}
        material={material}
      />
    </group>
  )
}

function PolygonPattern({
  markers,
  opacity,
}: {
  markers: readonly ImmersiveMediaMarker[]
  opacity: number
}) {
  const line = React.useMemo(() => {
    const geometry = new BufferGeometry()
    geometry.setAttribute(
      'position',
      new Float32BufferAttribute(markers.slice(0, 8).flatMap(marker => markerPosition(marker, 77)), 3),
    )
    const material = new LineBasicMaterial({
      color: '#f59e0b',
      transparent: true,
      opacity,
      depthTest: false,
    })
    return new LineLoop(geometry, material)
  }, [markers, opacity])
  React.useEffect(() => () => {
    line.geometry.dispose()
    ;(line.material as LineBasicMaterial).dispose()
  }, [line])
  return markers.length > 2 ? <primitive object={line} /> : null
}

export function ImmersiveMediaStage() {
  const snapshot = React.useSyncExternalStore(
    subscribeImmersiveMediaSnapshot,
    readImmersiveMediaSnapshot,
    readImmersiveMediaSnapshot,
  )
  const texture = usePanoramaTexture(snapshot)
  const materialRef = React.useRef<ShaderMaterial | null>(null)
  const transitionRef = React.useRef({
    revision: snapshot.transitionRevision,
    startedAt: 0,
    completed: false,
  })
  React.useEffect(() => {
    transitionRef.current = {
      revision: snapshot.transitionRevision,
      startedAt: 0,
      completed: false,
    }
  }, [snapshot.transitionRevision])
  useFrame(({ clock }) => {
    if (!snapshot.active || !materialRef.current) return
    const transition = transitionRef.current
    if (!transition.startedAt) transition.startedAt = clock.elapsedTime
    const durationSeconds = Math.max(0.001, snapshot.transitionDurationMs / 1000)
    const progress = Math.min(1, (clock.elapsedTime - transition.startedAt) / durationSeconds)
    materialRef.current.uniforms.opacity.value = progress
    materialRef.current.uniforms.lensStrength.value = snapshot.view.lensStrength
    if (progress >= 1 && !transition.completed) {
      transition.completed = true
      completeImmersiveMediaTransition(transition.revision)
    }
  })
  if (!snapshot.active || !texture) return null
  const phiStart = MathUtils.degToRad(snapshot.crop.horizontalStartDegrees)
  const phiLength = MathUtils.degToRad(snapshot.crop.horizontalSpanDegrees)
  const thetaStart = MathUtils.degToRad(snapshot.crop.verticalStartDegrees)
  const thetaLength = MathUtils.degToRad(snapshot.crop.verticalSpanDegrees)
  const visibleLayers = new Map(snapshot.layers.map(layer => [layer.id, layer]))
  const visibleMarkers = snapshot.markers.filter(marker => visibleLayers.get(marker.layerId)?.visible !== false)
  const markerOpacity = (marker: ImmersiveMediaMarker) => visibleLayers.get(marker.layerId)?.opacity ?? 1
  const patternLayer = visibleLayers.get('pattern')
  return (
    <group name="kg_immersive_media_stage">
      <mesh rotation={[0, Math.PI, 0]}>
        <sphereGeometry args={[86, 64, 36, phiStart, phiLength, thetaStart, thetaLength]} />
        <shaderMaterial
          ref={materialRef}
          uniforms={{
            map: { value: texture },
            opacity: { value: 0 },
            lensStrength: { value: snapshot.view.lensStrength },
          }}
          vertexShader="varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }"
          fragmentShader="uniform sampler2D map; uniform float opacity; uniform float lensStrength; varying vec2 vUv; void main(){ vec2 centered=vUv-0.5; float radial=dot(centered,centered); vec2 uv=vec2(fract(0.5+centered.x*(1.0+lensStrength*radial*0.72)), clamp(0.5+centered.y*(1.0+lensStrength*radial*0.72),0.001,0.999)); vec4 color=texture2D(map,uv); gl_FragColor=vec4(color.rgb,color.a*opacity); }"
          side={BackSide}
          transparent
          depthWrite={false}
        />
      </mesh>
      {visibleMarkers.map(marker => (
        <MarkerSurface key={marker.id} marker={marker} opacity={markerOpacity(marker)} />
      ))}
      {snapshot.polygonPattern && patternLayer?.visible ? (
        <PolygonPattern markers={visibleMarkers} opacity={patternLayer.opacity} />
      ) : null}
    </group>
  )
}

export default ImmersiveMediaStage
