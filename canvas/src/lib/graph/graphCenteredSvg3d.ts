import type { GraphData, GraphEdge, GraphNode } from '@/lib/graph/types'
import { getNodeRenderRadius, getThreeConfig, type GraphSchema } from '@/lib/graph/schema'
import { getEdgeBaseStroke, getNodeBaseFill } from '@/lib/graph/visualStyles'
import { computePositions3d } from '@/lib/three/positions.impl'
import { getEdgeStrokeWidth, getLayerOpacity, getRenderNodeRadius2d, getVisualOpacity } from '@/components/GraphCanvas/helpers'
import { getNodeRectDimensions2d, getNodeRenderShape2d } from '@/components/GraphCanvas/nodeSizing2d'

import {
  SVG_NS,
  clampFinite,
  computeCenteredViewBoxForAspect,
  createCssColorAlphaResolver,
  createDepthOpacity,
  escapeXml,
  estimateLabelWidthPx,
  formatSvgNumber,
  formatSvgOpacity,
  projectPerspective,
  readCssVar,
  readCameraPoseTargetCenter,
  resolveCssColor,
  rotateX,
  rotateY,
  splitCssColorAlpha,
  type Vec3,
} from '@/lib/graph/graphCenteredSvg3d/utils'

import { computeSvgQuadraticEdgePathD3d } from '@/lib/graph/graphCenteredSvg3d/edgePath'

export function exportGraphAsCentered3dSvgMarkup(args: {
  graphData: GraphData
  schema: GraphSchema
  widthPx?: number
  heightPx?: number
  paddingPx?: number
  includeXmlDeclaration?: boolean
  animated?: boolean
  includeInternalScript?: boolean
  exportIncludeLabels?: boolean
  durationSec?: number
  frames?: number
  threeEdgeRenderer?: 'mesh' | 'shaderLine' | 'tubeBridge'
  exportShaderLineWidthPx?: number
  exportAutoRotate?: boolean
  exportAutoRotateSpeed?: number
  exportMotionIntensityMultiplier?: number
  exportTiltXRad?: number
  exportCameraZ?: number
  exportYaw0Rad?: number
  exportDepthOpacityMin?: number
  exportDepthOpacityMax?: number
  positionsById?: Record<string, [number, number, number]>
  exportCameraPose?: {
    position: { x: number; y: number; z: number }
    quaternion: { x: number; y: number; z: number; w: number }
    target: { x: number; y: number; z: number }
    fov?: number
    zoom?: number
  }
}): string | null {
  try {
    const graph = args.graphData
    const schema = args.schema
    const nodesRaw = Array.isArray(graph.nodes) ? (graph.nodes as GraphNode[]) : []
    const edgesRaw = Array.isArray(graph.edges) ? (graph.edges as GraphEdge[]) : []
    const nodes: GraphNode[] = nodesRaw.filter(n => n && String(n.id || '').trim())
    const edges: GraphEdge[] = edgesRaw.filter(e => e && String(e.source || '').trim() && String(e.target || '').trim())
    if (nodes.length === 0) return null

    const widthPx = Math.max(1, Math.floor(clampFinite(args.widthPx, 1, 16384) || 1280))
    const heightPx = Math.max(1, Math.floor(clampFinite(args.heightPx, 1, 16384) || 720))
    const paddingPx = clampFinite(args.paddingPx, 0, 2000) || 96
    const includeXmlDeclaration = args.includeXmlDeclaration !== false
    const animated = args.animated !== false
    const includeInternalScript = args.includeInternalScript !== false
    const durationSec = clampFinite(args.durationSec, 1, 60) || 6
    const frames = Math.max(6, Math.min(60, Math.floor(clampFinite(args.frames, 1, 200) || 24)))
    const threeEdgeRenderer = args.threeEdgeRenderer === 'shaderLine' ? 'shaderLine' : 'mesh'
    const includeLabels = args.exportIncludeLabels !== false
    const shaderLineWidthPx = typeof args.exportShaderLineWidthPx === 'number' && Number.isFinite(args.exportShaderLineWidthPx)
      ? Math.max(0.5, Math.min(20, args.exportShaderLineWidthPx))
      : 2

    const canvasBg = resolveCssColor(readCssVar('--kg-canvas-bg', 'white'), 'white')
    const labelFillResolved = resolveCssColor(
      readCssVar('--kg-canvas-label-fill', readCssVar('--kg-text-primary', 'rgba(0,0,0,0.86)')),
      'rgba(0,0,0,0.86)',
    )
    const nodeStrokeResolved = resolveCssColor(
      readCssVar('--kg-canvas-node-stroke', readCssVar('--kg-border', 'rgba(0,0,0,0.45)')),
      'rgba(0,0,0,0.45)',
    )
    const labelFillParsed = splitCssColorAlpha(labelFillResolved)
    const nodeStrokeParsed = splitCssColorAlpha(nodeStrokeResolved)

    const positions = args.positionsById || computePositions3d(nodes, schema)
    const posById = new Map<string, Vec3>()
    for (let i = 0; i < nodes.length; i += 1) {
      const n = nodes[i]!
      const id = String(n.id || '').trim()
      const p = positions[id]
      if (!id || !p) continue
      posById.set(id, [p[0], p[1], p[2]])
    }
    if (posById.size === 0) return null

    let sumX = 0, sumY = 0, sumZ = 0, count = 0
    for (const p of posById.values()) {
      sumX += p[0]
      sumY += p[1]
      sumZ += p[2]
      count += 1
    }
    if (!(count > 0)) return null

    const centerFromPose = readCameraPoseTargetCenter(args.exportCameraPose)

    const cx = centerFromPose ? centerFromPose.x : (sumX / count)
    const cy = centerFromPose ? centerFromPose.y : (sumY / count)
    const cz = centerFromPose ? centerFromPose.z : (sumZ / count)

    const fontSizePx = 12
    const labelPadY = 8
    const cameraZ = typeof args.exportCameraZ === 'number' && Number.isFinite(args.exportCameraZ)
      ? Math.max(80, Math.min(1200, args.exportCameraZ))
      : 220
    const tiltX = typeof args.exportTiltXRad === 'number' && Number.isFinite(args.exportTiltXRad)
      ? Math.max(-Math.PI * 0.45, Math.min(Math.PI * 0.45, args.exportTiltXRad))
      : 0
    const yaw0 = typeof args.exportYaw0Rad === 'number' && Number.isFinite(args.exportYaw0Rad) ? args.exportYaw0Rad : 0

    let minZ = Infinity
    let maxZ = -Infinity
    for (const p of posById.values()) {
      if (p[2] < minZ) minZ = p[2]
      if (p[2] > maxZ) maxZ = p[2]
    }
    if (!Number.isFinite(minZ) || !Number.isFinite(maxZ)) {
      minZ = -1
      maxZ = 1
    }
    const depthOpacity = createDepthOpacity({
      minZ,
      maxZ,
      opacityMin: args.exportDepthOpacityMin,
      opacityMax: args.exportDepthOpacityMax,
    })

    let maxAbsX = 1
    let maxAbsY = 1

    const threeCfg = getThreeConfig(schema)
    const motionRaw = threeCfg.nodeMotionIntensity
    const motionBase = typeof motionRaw === 'number' ? Math.max(0, Math.min(2, motionRaw)) : 1
    const motionMulRaw = typeof args.exportMotionIntensityMultiplier === 'number' && Number.isFinite(args.exportMotionIntensityMultiplier)
      ? args.exportMotionIntensityMultiplier
      : 1
    const motion = Math.max(0, Math.min(3, motionBase * Math.max(0, Math.min(3, motionMulRaw))))

    const amp = 0.2 * motion

    const autoRotateBase = !!threeCfg.cameraAutoRotate
    const autoRotate = autoRotateBase || args.exportAutoRotate === true
    const autoRotateSpeedBase = typeof threeCfg.cameraAutoRotateSpeed === 'number' ? threeCfg.cameraAutoRotateSpeed : 0.4
    const autoRotateSpeed = typeof args.exportAutoRotateSpeed === 'number' && Number.isFinite(args.exportAutoRotateSpeed)
      ? args.exportAutoRotateSpeed
      : autoRotateSpeedBase
    const omega = (Math.PI * 2 / 60) * (autoRotate ? (autoRotateSpeed || 0) : 0)

    const angleSamples = (() => {
      if (!animated || !autoRotate || omega === 0) return [0]
      const out: number[] = []
      for (let f = 0; f < frames; f += 1) {
        out.push((Math.PI * 2 * f) / frames)
      }
      out.push(out[0]!)
      return out
    })()

    const nodeById = (() => {
      const m = new Map<string, GraphNode>()
      for (let i = 0; i < nodes.length; i += 1) {
        const n = nodes[i]
        const id = String(n?.id || '').trim()
        if (!id) continue
        m.set(id, n)
      }
      return m
    })()

    for (let ai = 0; ai < angleSamples.length; ai += 1) {
      const angY = angleSamples[ai]!
      for (const [id, p0] of posById.entries()) {
        const t = 0
        const wobX = amp > 0 ? Math.sin(t * 0.2 + id.length) * amp : 0
        const wobY = amp > 0 ? Math.cos(t * 0.25 + id.length) * amp : 0
        const p: Vec3 = [p0[0] - cx + wobX, p0[1] - cy + wobY, p0[2] - cz]
        const ry = rotateY(p, angY)
        const rxy = rotateX(ry, tiltX)
        const pr = projectPerspective(rxy, cameraZ)
        const node = nodeById.get(id)
        const baseR = Math.max(4, node ? (getNodeRenderRadius(node, schema) || 10) : 10)
        const r = baseR * pr.k
        const label = String(node?.label || id)
        const labelW = estimateLabelWidthPx(label, fontSizePx)
        const left = pr.x - Math.max(r, labelW / 2)
        const right = pr.x + Math.max(r, labelW / 2)
        const top = pr.y - r - (fontSizePx + labelPadY)
        const bottom = pr.y + r
        maxAbsX = Math.max(maxAbsX, Math.abs(left), Math.abs(right))
        maxAbsY = Math.max(maxAbsY, Math.abs(top), Math.abs(bottom))
      }
    }

    const vb = computeCenteredViewBoxForAspect({ halfW: maxAbsX, halfH: maxAbsY, outAspect: widthPx / heightPx, padding: paddingPx })

    const fmt = formatSvgNumber
    const fmtOp = formatSvgOpacity

    const resolveColorAlpha = createCssColorAlphaResolver()

    const nodeData = nodes.map(n => {
      const id = String(n.id || '').trim()
      const p = posById.get(id) || [0, 0, 0]
      const baseR = Math.max(4, getRenderNodeRadius2d(n, schema) || 10)
      const fillRaw = String(getNodeBaseFill(n, schema) || '')
      const fillParsed = resolveColorAlpha(fillRaw)
      const label = String(n.label || id)
      const layerOpacity = Math.max(0, Math.min(1, getLayerOpacity(n, schema) * getVisualOpacity(n)))
      const shape = getNodeRenderShape2d(n, schema)
      const rectDims = shape === 'circle' ? null : getNodeRectDimensions2d(n, schema)
      const props = (n.properties || {}) as Record<string, unknown>
      const deg = typeof props['degree'] === 'number' ? (props['degree'] as number) : undefined
      const scale = deg ? Math.max(0.9, Math.min(1.6, 0.95 + Math.sqrt(Math.max(1, deg)) * 0.15)) : 1
      return { id, p, baseR, fill: fillParsed.color, fillAlpha: fillParsed.alpha, label, layerOpacity, shape, rectDims, scale }
    }).filter(x => x.id)

    const arrowLenDefault = typeof threeCfg.linkDirectionalArrowLength === 'number' ? Math.max(2, Math.min(24, threeCfg.linkDirectionalArrowLength)) : 8
    const linkOpacityDefault = typeof threeCfg.linkOpacity === 'number' ? Math.max(0, Math.min(1, threeCfg.linkOpacity)) : 0.6
    const linkCurvatureDefault = typeof threeCfg.linkCurvature === 'number' ? Math.max(0, Math.min(1.5, threeCfg.linkCurvature)) : 0
    const curveRotationDefault = typeof threeCfg.linkCurveRotation === 'number' ? threeCfg.linkCurveRotation : 0
    const arrowRelPosDefault = typeof threeCfg.linkDirectionalArrowRelPos === 'number'
      ? Math.max(0, Math.min(1, threeCfg.linkDirectionalArrowRelPos))
      : 0.85
    const particlesDefault = typeof threeCfg.linkDirectionalParticles === 'number'
      ? Math.max(0, Math.min(64, Math.floor(threeCfg.linkDirectionalParticles)))
      : 0
    const particleSpeedDefault = typeof threeCfg.linkDirectionalParticleSpeed === 'number'
      ? Math.max(0.01, Math.min(5, threeCfg.linkDirectionalParticleSpeed))
      : 0.6
    const opacityByLabel: Record<string, number> = threeCfg.edgeOpacityByLabel || {}

    const edgeData = edges.map(e => {
      const id = String(e.id || '').trim()
      const s = String(e.source || '').trim()
      const t = String(e.target || '').trim()
      const props = (e.properties || {}) as Record<string, unknown>
      const rawStroke = String(getEdgeBaseStroke(e, schema) || '')
      const strokeParsed = resolveColorAlpha(rawStroke)
      const baseWidth = (() => {
        const w = getEdgeStrokeWidth(e, schema)
        const clamped = Math.max(0.5, Math.min(5, w))
        return clamped
      })()
      const propOpacity = typeof props['opacity'] === 'number' ? Math.max(0, Math.min(1, props['opacity'] as number)) : null
      const cfgOpacity = typeof opacityByLabel[e.label] === 'number' ? Math.max(0, Math.min(1, opacityByLabel[e.label] as number)) : linkOpacityDefault
      const opacity = propOpacity == null ? (strokeParsed.alpha < 1 ? strokeParsed.alpha : cfgOpacity) : propOpacity
      const curvature = typeof props['curvature'] === 'number' ? Math.max(0, Math.min(1.5, props['curvature'] as number)) : linkCurvatureDefault
      const curveRotation = typeof props['curveRotation'] === 'number' ? (props['curveRotation'] as number) : curveRotationDefault
      const arrowLen = typeof props['arrowLength'] === 'number' ? Math.max(2, Math.min(24, props['arrowLength'] as number)) : arrowLenDefault
      const arrowRelPos = typeof props['arrowRelPos'] === 'number' ? Math.max(0, Math.min(1, props['arrowRelPos'] as number)) : arrowRelPosDefault
      const arrowColor = typeof props['arrowColor'] === 'string' ? String(props['arrowColor']) : strokeParsed.color
      const particles = typeof props['linkDirectionalParticles'] === 'number'
        ? Math.max(0, Math.min(64, Math.floor(props['linkDirectionalParticles'] as number)))
        : particlesDefault
      const particleSpeed = typeof props['linkDirectionalParticleSpeed'] === 'number'
        ? Math.max(0.01, Math.min(5, props['linkDirectionalParticleSpeed'] as number))
        : particleSpeedDefault
      return { id, s, t, stroke: strokeParsed.color, baseWidth, opacity, curvature, curveRotation, arrowLen, arrowRelPos, arrowColor, particles, particleSpeed }
    }).filter(x => x.id && x.s && x.t)

    const projectAt = (id: string, p0: Vec3, angY: number, tSec: number) => {
      const wobX = amp > 0 ? Math.sin(tSec * 0.2 + id.length) * amp : 0
      const wobY = amp > 0 ? Math.cos(tSec * 0.25 + id.length) * amp : 0
      const p: Vec3 = [p0[0] - cx + wobX, p0[1] - cy + wobY, p0[2] - cz]
      const ry = rotateY(p, angY)
      const rxy = rotateX(ry, tiltX)
      return projectPerspective(rxy, cameraZ)
    }

    const nodeParts: string[] = []
    const nodeFrame0 = new Map<string, { x: number; y: number; k: number; z: number }>()
    for (let i = 0; i < nodeData.length; i += 1) {
      const nd = nodeData[i]!
      const pr = projectAt(nd.id, nd.p as Vec3, yaw0, 0)
      nodeFrame0.set(nd.id, pr)
      const r = nd.baseR * (typeof nd.scale === 'number' && Number.isFinite(nd.scale) ? nd.scale : 1) * pr.k
      const op = depthOpacity(pr.z) * Math.max(0, Math.min(1, nd.layerOpacity))
      const fillOp = op * (typeof nd.fillAlpha === 'number' && Number.isFinite(nd.fillAlpha) ? Math.max(0, Math.min(1, nd.fillAlpha)) : 1)
      const strokeOp = op * Math.max(0, Math.min(1, nodeStrokeParsed.alpha))
      const textOp = op * Math.max(0, Math.min(1, labelFillParsed.alpha))
      const shape = String((nd as any).shape || 'circle')
      const rectDims = (nd as any).rectDims as { width: number; height: number } | null
      const w0 = rectDims ? Math.max(2, rectDims.width) : Math.max(2, nd.baseR * 2)
      const h0 = rectDims ? Math.max(2, rectDims.height) : Math.max(2, nd.baseR * 2)
      const w = w0 * pr.k
      const h = h0 * pr.k
      const cx0 = pr.x
      const cy0 = pr.y
      const shapeMarkup = (() => {
        if (includeInternalScript) {
          return `<circle data-role="node-circle" cx="${fmt(cx0)}" cy="${fmt(cy0)}" r="${fmt(r)}" fill="${escapeXml(nd.fill)}" stroke="${escapeXml(nodeStrokeParsed.color)}" stroke-width="1" fill-opacity="${fmtOp(fillOp)}" stroke-opacity="${fmtOp(strokeOp)}"/>`
        }
        if (shape === 'rect' || shape === 'diamond') {
          const x = cx0 - w / 2
          const y = cy0 - h / 2
          const rot = shape === 'diamond' ? ` transform="rotate(45 ${fmt(cx0)} ${fmt(cy0)})"` : ''
          const rx = Math.max(0, Math.min(w, h) * 0.12)
          return `<rect data-role="node-shape" x="${fmt(x)}" y="${fmt(y)}" width="${fmt(w)}" height="${fmt(h)}" rx="${fmt(rx)}" ry="${fmt(rx)}"${rot} fill="${escapeXml(nd.fill)}" stroke="${escapeXml(nodeStrokeParsed.color)}" stroke-width="1" fill-opacity="${fmtOp(fillOp)}" stroke-opacity="${fmtOp(strokeOp)}"/>`
        }
        if (shape === 'hex') {
          const rr = Math.max(2, Math.min(w, h) / 2)
          const pts: string[] = []
          for (let k = 0; k < 6; k += 1) {
            const a = (Math.PI / 3) * k
            const px = cx0 + rr * Math.cos(a)
            const py = cy0 + rr * Math.sin(a)
            pts.push(`${fmt(px)},${fmt(py)}`)
          }
          return `<polygon data-role="node-shape" points="${pts.join(' ')}" fill="${escapeXml(nd.fill)}" stroke="${escapeXml(nodeStrokeParsed.color)}" stroke-width="1" fill-opacity="${fmtOp(fillOp)}" stroke-opacity="${fmtOp(strokeOp)}"/>`
        }
        return `<circle data-role="node-shape" cx="${fmt(cx0)}" cy="${fmt(cy0)}" r="${fmt(r)}" fill="${escapeXml(nd.fill)}" stroke="${escapeXml(nodeStrokeParsed.color)}" stroke-width="1" fill-opacity="${fmtOp(fillOp)}" stroke-opacity="${fmtOp(strokeOp)}"/>`
      })()
      const labelMarkup = includeLabels
        ? `<text data-role="node-label" x="${fmt(pr.x)}" y="${fmt(pr.y - r - labelPadY)}" font-size="${fontSizePx}" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial" text-anchor="middle" fill="${escapeXml(labelFillParsed.color)}" opacity="${fmtOp(textOp)}">${escapeXml(nd.label)}</text>`
        : ''
      nodeParts.push(`<g data-node-id="${escapeXml(nd.id)}">${shapeMarkup}${labelMarkup}</g>`)
    }

    const edgeParts: string[] = []
    for (let i = 0; i < edgeData.length; i += 1) {
      const ed = edgeData[i]!
      const ps = nodeFrame0.get(ed.s)
      const pt = nodeFrame0.get(ed.t)
      if (!ps || !pt) continue
      const kAvg = (ps.k + pt.k) * 0.5
      const w = threeEdgeRenderer === 'shaderLine' ? shaderLineWidthPx : Math.max(0.25, ed.baseWidth * kAvg)
      const op = (threeEdgeRenderer === 'shaderLine' ? 1 : Math.min(depthOpacity(ps.z), depthOpacity(pt.z))) * Math.max(0, Math.min(1, ed.opacity))
      if (includeInternalScript) {
        edgeParts.push(
          `<line data-edge-id="${escapeXml(ed.id)}" data-source="${escapeXml(ed.s)}" data-target="${escapeXml(ed.t)}" x1="${fmt(ps.x)}" y1="${fmt(ps.y)}" x2="${fmt(pt.x)}" y2="${fmt(pt.y)}" stroke="${escapeXml(ed.stroke)}" stroke-width="${fmt(w)}" stroke-opacity="${fmtOp(op)}" stroke-linecap="round"/>`,
        )
      } else {
        const d = computeSvgQuadraticEdgePathD3d({
          sourceId: ed.s,
          targetId: ed.t,
          sourceScreen: ps,
          targetScreen: pt,
          posById,
          curvature: ed.curvature,
          curveRotation: ed.curveRotation,
          fmt,
          amp,
          cx,
          cy,
          cz,
          yaw0,
          tiltX,
          cameraZ,
        })
        edgeParts.push(
          `<path data-edge-id="${escapeXml(ed.id)}" data-source="${escapeXml(ed.s)}" data-target="${escapeXml(ed.t)}" d="${d}" fill="none" stroke="${escapeXml(ed.stroke)}" stroke-width="${fmt(w)}" stroke-opacity="${fmtOp(op)}" stroke-linecap="round"/>`,
        )
        if (threeEdgeRenderer === 'mesh' && ed.arrowLen > 0) {
          const ctrl = (() => {
            const m = d.match(/Q\s*([-0-9.]+)\s+([-0-9.]+)\s+([-0-9.]+)\s+([-0-9.]+)/)
            if (!m) return null
            const x = Number(m[1])
            const y = Number(m[2])
            return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null
          })()
          const tArrow = Math.max(0, Math.min(1, typeof ed.arrowRelPos === 'number' && Number.isFinite(ed.arrowRelPos) ? ed.arrowRelPos : 0.85))
          const arrowLen = Math.max(2, Number.isFinite(ed.arrowLen) ? ed.arrowLen : 8)
          const aSize = Math.max(2, arrowLen * kAvg)
          const ax = (() => {
            if (!ctrl) return ps.x + (pt.x - ps.x) * tArrow
            const omt = 1 - tArrow
            return omt * omt * ps.x + 2 * omt * tArrow * ctrl.x + tArrow * tArrow * pt.x
          })()
          const ay = (() => {
            if (!ctrl) return ps.y + (pt.y - ps.y) * tArrow
            const omt = 1 - tArrow
            return omt * omt * ps.y + 2 * omt * tArrow * ctrl.y + tArrow * tArrow * pt.y
          })()
          const tangent = (() => {
            if (!ctrl) return { x: pt.x - ps.x, y: pt.y - ps.y }
            const omt = 1 - tArrow
            const tx = 2 * omt * (ctrl.x - ps.x) + 2 * tArrow * (pt.x - ctrl.x)
            const ty = 2 * omt * (ctrl.y - ps.y) + 2 * tArrow * (pt.y - ctrl.y)
            return { x: tx, y: ty }
          })()
          const tlen = Math.max(1e-6, Math.hypot(tangent.x, tangent.y))
          const tx = tangent.x / tlen
          const ty = tangent.y / tlen
          const bx0 = ax - tx * aSize
          const by0 = ay - ty * aSize
          const nx = -ty
          const ny = tx
          const hw = aSize * 0.35
          const lx = bx0 + nx * hw
          const ly = by0 + ny * hw
          const rx0 = bx0 - nx * hw
          const ry0 = by0 - ny * hw
          const arrowD = `M${fmt(ax)} ${fmt(ay)} L${fmt(lx)} ${fmt(ly)} L${fmt(rx0)} ${fmt(ry0)} Z`
          edgeParts.push(
            `<path data-edge-arrow-id="${escapeXml(ed.id)}" d="${arrowD}" fill="${escapeXml(ed.arrowColor || ed.stroke)}" fill-opacity="${fmtOp(op)}"/>`,
          )
        }
        if (threeEdgeRenderer === 'mesh' && ed.particles > 0) {
          const count = Math.max(0, Math.min(24, Math.floor(ed.particles)))
          const ctrl = (() => {
            const m = d.match(/Q\s*([-0-9.]+)\s+([-0-9.]+)\s+([-0-9.]+)\s+([-0-9.]+)/)
            if (!m) return null
            const x = Number(m[1])
            const y = Number(m[2])
            return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null
          })()
          const pr = Math.max(0.6, 1.6 * kAvg)
          for (let pi = 0; pi < count; pi += 1) {
            const tt = count > 1 ? pi / count : 0
            const px2 = (() => {
              if (!ctrl) return ps.x + (pt.x - ps.x) * tt
              const omt2 = 1 - tt
              return omt2 * omt2 * ps.x + 2 * omt2 * tt * ctrl.x + tt * tt * pt.x
            })()
            const py2 = (() => {
              if (!ctrl) return ps.y + (pt.y - ps.y) * tt
              const omt2 = 1 - tt
              return omt2 * omt2 * ps.y + 2 * omt2 * tt * ctrl.y + tt * tt * pt.y
            })()
            edgeParts.push(`<circle data-edge-particle-edge-id="${escapeXml(ed.id)}" data-edge-particle-i="${pi}" cx="${fmt(px2)}" cy="${fmt(py2)}" r="${fmt(pr)}" fill="${escapeXml(ed.stroke)}" fill-opacity="${fmtOp(op)}"/>`)
          }
        }
      }
    }

    const scriptPayload = escapeXml(
      JSON.stringify({
        cameraZ,
        tiltX,
        yaw0,
        threeEdgeRenderer,
        shaderLineWidthPx,
        cx,
        cy,
        cz,
        minZ,
        maxZ,
        depthOpacityMin: typeof args.exportDepthOpacityMin === 'number' && Number.isFinite(args.exportDepthOpacityMin) ? args.exportDepthOpacityMin : 0.35,
        depthOpacityMax: typeof args.exportDepthOpacityMax === 'number' && Number.isFinite(args.exportDepthOpacityMax) ? args.exportDepthOpacityMax : 1,
        cameraPose: args.exportCameraPose || null,
        cameraCfg: {
          dampingFactor: typeof threeCfg.cameraDampingFactor === 'number' ? threeCfg.cameraDampingFactor : 0.08,
          rotateSpeed: typeof threeCfg.cameraRotateSpeed === 'number' ? threeCfg.cameraRotateSpeed : 0.6,
          zoomSpeed: typeof threeCfg.cameraZoomSpeed === 'number' ? threeCfg.cameraZoomSpeed : 0.8,
          panSpeed: typeof threeCfg.cameraPanSpeed === 'number' ? threeCfg.cameraPanSpeed : 0.5,
        },
        fontSizePx,
        labelPadY,
        animated,
        autoRotate,
        autoRotateSpeed,
        motion,
        nodeStrokeAlpha: nodeStrokeParsed.alpha,
        labelFillAlpha: labelFillParsed.alpha,
        nodes: nodeData.map(n => ({
          id: n.id,
          p: n.p,
          baseR: n.baseR,
          fill: (n as any).fill,
          layerOpacity: n.layerOpacity,
          fillAlpha: typeof n.fillAlpha === 'number' && Number.isFinite(n.fillAlpha) ? n.fillAlpha : 1,
          shape: (n as any).shape,
          rectDims: (n as any).rectDims,
          scale: (n as any).scale,
        })),
        edges: edgeData,
      }),
    )

    const script = includeInternalScript
      ? `<script><![CDATA[` +
        `(function(){` +
          `var root=(document.currentScript&&document.currentScript.ownerSVGElement)||document.documentElement;` +
          `if(!root||String(root.nodeName||'').toLowerCase()!=='svg')return;` +
          `var payload=JSON.parse(root.getAttribute('data-kg-3d-payload')||'{}');` +
          `if(!payload||payload.animated!==true)return;` +
          `var nodes=Array.isArray(payload.nodes)?payload.nodes:[];` +
          `var edges=Array.isArray(payload.edges)?payload.edges:[];` +
          `var cameraZ=Number(payload.cameraZ)||220;` +
          `var tiltX=Number(payload.tiltX)||0;` +
          `var yaw0=Number(payload.yaw0)||0;` +
          `var cx=Number(payload.cx)||0,cy=Number(payload.cy)||0,cz=Number(payload.cz)||0;` +
          `var minZ=Number(payload.minZ),maxZ=Number(payload.maxZ);if(!isFinite(minZ))minZ=-1;if(!isFinite(maxZ))maxZ=1;` +
          `var zSpan=Math.max(1e-6,maxZ-minZ);var oMin=Math.max(0,Math.min(1,Number(payload.depthOpacityMin)));var oMax=Math.max(oMin,Math.min(1,Number(payload.depthOpacityMax)));` +
          `var depthOpacity=function(z){var t=(Number(z)-minZ)/zSpan;if(!isFinite(t))t=0;t=Math.max(0,Math.min(1,t));return oMin+(oMax-oMin)*t;};` +
          `var nodeStrokeAlpha=Number(payload.nodeStrokeAlpha);if(!isFinite(nodeStrokeAlpha))nodeStrokeAlpha=1;` +
          `var labelFillAlpha=Number(payload.labelFillAlpha);if(!isFinite(labelFillAlpha))labelFillAlpha=1;` +
          `var motionRaw=Number(payload.motion);var motion=(isFinite(motionRaw)?Math.max(0,Math.min(2,motionRaw)):1);` +
          `var amp=0.2*motion;` +
          `var autoRotate=payload.autoRotate===true;` +
          `var autoRotateSpeed=Number(payload.autoRotateSpeed);` +
          `if(!isFinite(autoRotateSpeed))autoRotateSpeed=0.4;` +
          `var omega=(Math.PI*2/60)*(autoRotate?autoRotateSpeed:0);` +
          `var labelPadY=Number(payload.labelPadY);if(!isFinite(labelPadY))labelPadY=8;` +
          `var nodeEls=new Map();` +
          `var nodeOffsetById=root.__kgNodeOffsetById||(root.__kgNodeOffsetById={});` +
          `var nodeGs=root.querySelectorAll('[data-node-id]');` +
          `for(var gi=0;gi<nodeGs.length;gi++){var g=nodeGs[gi];var gid=String(g.getAttribute('data-node-id')||'');if(!gid)continue;var c=g.querySelector('[data-role="node-circle"]');var t=g.querySelector('[data-role="node-label"]');if(c&&t)nodeEls.set(gid,{g:g,c:c,t:t});}` +
          `var edgeElById=new Map();` +
          `var edgeLs=root.querySelectorAll('[data-edge-id]');` +
          `for(var li=0;li<edgeLs.length;li++){var el=edgeLs[li];var eid=String(el.getAttribute('data-edge-id')||'');if(eid)edgeElById.set(eid,el);}` +
          `var edgeEls=[];` +
          `for(var j=0;j<edges.length;j++){var eid=String(edges[j].id||'');if(!eid)continue;var el=edgeElById.get(eid);if(!el)continue;edgeEls.push({id:eid,el:el,s:String(edges[j].s||edges[j].source||''),t:String(edges[j].t||edges[j].target||''),baseWidth:Number(edges[j].baseWidth)||1,opacity:isFinite(edges[j].opacity)?Number(edges[j].opacity):0.6});}` +
          `var rotateY=function(x,y,z,a){var c=Math.cos(a),s=Math.sin(a);return [x*c+z*s,y,-x*s+z*c];};` +
          `var rotateX=function(x,y,z,a){var c=Math.cos(a),s=Math.sin(a);return [x,y*c-z*s,y*s+z*c];};` +
          `var project=function(x,y,z){var denom=Math.max(1e-3,cameraZ-z);var k=cameraZ/denom;return {x:x*k,y:y*k,k:k,z:z};};` +
          `var started=(typeof performance!=='undefined'&&performance.now)?performance.now():Date.now();` +
          `var lastSortAt=0;` +
          `var tick=function(){` +
            `var now=(typeof performance!=='undefined'&&performance.now)?performance.now():Date.now();` +
            `var tSec=(now-started)/1000;` +
            `var ang=omega*tSec+yaw0;` +
            `var projById=new Map();` +
            `var nodeOrder=[];` +
            `for(var i2=0;i2<nodes.length;i2++){` +
              `var nd=nodes[i2];var id=String(nd.id||'');if(!id)continue;` +
              `var p=nd.p||[0,0,0];` +
              `var wobX=amp>0?Math.sin(tSec*0.2+id.length)*amp:0;` +
              `var wobY=amp>0?Math.cos(tSec*0.25+id.length)*amp:0;` +
              `var x=(Number(p[0])||0)-cx+wobX;var y=(Number(p[1])||0)-cy+wobY;var z=(Number(p[2])||0)-cz;` +
              `var r1=rotateY(x,y,z,ang);var r2=rotateX(r1[0],r1[1],r1[2],tiltX);` +
              `var pr=project(r2[0],r2[1],r2[2]);` +
              `var off=nodeOffsetById[id];if(off){pr.x+=Number(off.x)||0;pr.y+=Number(off.y)||0;}` +
              `projById.set(id,pr);` +
              `nodeOrder.push({id:id,z:pr.z});` +
              `var el=nodeEls.get(id);if(!el)continue;` +
              `var baseR=Number(nd.baseR)||10;var r=baseR*pr.k;` +
              `var op=depthOpacity(pr.z)*(isFinite(nd.layerOpacity)?Math.max(0,Math.min(1,nd.layerOpacity)):1);` +
              `var fillAlpha=isFinite(nd.fillAlpha)?Math.max(0,Math.min(1,Number(nd.fillAlpha))):1;` +
              `el.c.setAttribute('cx',String(pr.x));el.c.setAttribute('cy',String(pr.y));el.c.setAttribute('r',String(r));` +
              `el.c.setAttribute('fill-opacity',String(op*fillAlpha));el.c.setAttribute('stroke-opacity',String(op*nodeStrokeAlpha));` +
              `el.t.setAttribute('x',String(pr.x));el.t.setAttribute('y',String(pr.y-r-labelPadY));el.t.setAttribute('opacity',String(op*labelFillAlpha));` +
            `}` +
            `var edgeOrder=[];` +
            `for(var e2=0;e2<edgeEls.length;e2++){` +
              `var ed=edgeEls[e2];var ps=projById.get(ed.s);var pt=projById.get(ed.t);` +
              `if(!ps||!pt)continue;` +
              `var opEdge=(payload.threeEdgeRenderer==='shaderLine'?1:Math.min(depthOpacity(ps.z),depthOpacity(pt.z)))*Math.max(0,Math.min(1,ed.opacity));` +
              `var kAvg=(ps.k+pt.k)*0.5;` +
              `var w=payload.threeEdgeRenderer==='shaderLine'?Number(payload.shaderLineWidthPx):Math.max(0.25,(ed.baseWidth||1)*kAvg);` +
              `ed.el.setAttribute('x1',String(ps.x));ed.el.setAttribute('y1',String(ps.y));ed.el.setAttribute('x2',String(pt.x));ed.el.setAttribute('y2',String(pt.y));` +
              `ed.el.setAttribute('stroke-opacity',String(opEdge));ed.el.setAttribute('stroke-width',String(w));` +
              `edgeOrder.push({id:ed.id,z:(ps.z+pt.z)*0.5,el:ed.el});` +
            `}` +
            `var nodesGroup=root.querySelector('[data-layer="nodes"]');` +
            `var edgesGroup=root.querySelector('[data-layer="edges"]');` +
            `if(nodesGroup&&edgesGroup){` +
              `if(now-lastSortAt>33){` +
                `lastSortAt=now;` +
                `nodeOrder.sort(function(a,b){return a.z-b.z;});` +
                `for(var si=0;si<nodeOrder.length;si++){var ne=nodeEls.get(nodeOrder[si].id);if(ne&&ne.g)nodesGroup.appendChild(ne.g);}` +
                `edgeOrder.sort(function(a,b){return a.z-b.z;});` +
                `for(var sj=0;sj<edgeOrder.length;sj++){edgesGroup.appendChild(edgeOrder[sj].el);}` +
              `}` +
            `}` +
            `requestAnimationFrame(tick);` +
          `};` +
          `requestAnimationFrame(tick);` +
        `})();` +
      `]]></script>`
      : ''

    const svg =
      `<svg xmlns="${SVG_NS}" width="${widthPx}" height="${heightPx}" viewBox="${vb.x} ${vb.y} ${vb.w} ${vb.h}" preserveAspectRatio="xMidYMid meet" data-kg-3d-payload="${scriptPayload}">` +
        `<rect x="${vb.x}" y="${vb.y}" width="${vb.w}" height="${vb.h}" fill="${escapeXml(canvasBg)}"/>` +
        `<g data-layer="edges">${edgeParts.join('')}</g>` +
        `<g data-layer="nodes">${nodeParts.join('')}</g>` +
        script +
      `</svg>`

    return includeXmlDeclaration ? `<?xml version="1.0" encoding="UTF-8"?>\n${svg}\n` : svg
  } catch {
    return null
  }
}
