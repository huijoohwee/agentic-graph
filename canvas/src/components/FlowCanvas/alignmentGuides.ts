import type { FlowNativeRuntime } from '@/components/FlowCanvas/nativeRuntime'
import {
  alignmentGuideScreenPosition,
  type AlignmentGuide,
} from '@/lib/canvas/alignmentGuides'

const pendingGuideFrameByCanvas = new WeakMap<HTMLCanvasElement, number>()

export function cancelFlowAlignmentGuideFrame(runtime: FlowNativeRuntime): void {
  const pending = pendingGuideFrameByCanvas.get(runtime.canvas)
  if (pending == null) return
  cancelAnimationFrame(pending)
  pendingGuideFrameByCanvas.delete(runtime.canvas)
}

export function scheduleFlowAlignmentGuides(
  runtime: FlowNativeRuntime,
  guides: AlignmentGuide[],
): void {
  cancelFlowAlignmentGuideFrame(runtime)
  if (guides.length === 0) return
  const snapshot = guides.map(guide => ({ ...guide }))
  const frame = requestAnimationFrame(() => {
    pendingGuideFrameByCanvas.delete(runtime.canvas)
    const ctx = runtime.ctx
    const dpr = Number.isFinite(runtime.dpr) && runtime.dpr > 0 ? runtime.dpr : 1
    ctx.save()
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.strokeStyle = runtime.theme.edgeSelected
    ctx.lineWidth = 1.25
    ctx.globalAlpha = 0.92
    ctx.setLineDash([6, 4])
    ctx.beginPath()
    for (const guide of snapshot) {
      const screenPosition = alignmentGuideScreenPosition(guide, runtime.transform)
      const crispPosition = Math.round(screenPosition) + 0.5
      if (guide.axis === 'x') {
        ctx.moveTo(crispPosition, 0)
        ctx.lineTo(crispPosition, runtime.viewportH)
      } else {
        ctx.moveTo(0, crispPosition)
        ctx.lineTo(runtime.viewportW, crispPosition)
      }
    }
    ctx.stroke()
    ctx.restore()
  })
  pendingGuideFrameByCanvas.set(runtime.canvas, frame)
}
