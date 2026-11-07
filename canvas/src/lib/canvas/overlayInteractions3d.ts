import { Matrix4, Quaternion, Vector3, type Camera } from 'three'
import type { ThreeCameraPose } from '@/hooks/store/types'

export function computeThreeCameraPoseAfterOverlayPan(args: {
  pose: ThreeCameraPose
  dxClientPx: number
  dyClientPx: number
  shiftKey: boolean
  verticalProjectionScale: number
  viewportH: number
}): ThreeCameraPose {
  const pose = args.pose
  const dx = Number(args.dxClientPx) || 0
  const dy = Number(args.dyClientPx) || 0
  const isPan = args.shiftKey === true

  const target = new Vector3(pose.target.x, pose.target.y, pose.target.z)
  const pos0 = new Vector3(pose.position.x, pose.position.y, pose.position.z)
  const startQuat = new Quaternion(pose.quaternion.x, pose.quaternion.y, pose.quaternion.z, pose.quaternion.w)
  const worldUp = new Vector3(0, 1, 0)
  const offset = pos0.clone().sub(target)

  if (isPan) {
    const dist = Math.max(1e-3, offset.length())
    const scale = 2 * dist / (Math.max(0.001, Math.abs(args.verticalProjectionScale)) * Math.max(1, args.viewportH))
    const right = new Vector3(1, 0, 0).applyQuaternion(startQuat).normalize()
    const up = new Vector3(0, 1, 0).applyQuaternion(startQuat).normalize()
    const delta = right.multiplyScalar(-dx * scale).add(up.multiplyScalar(dy * scale))
    const nextTarget = target.clone().add(delta)
    const nextPos = pos0.clone().add(delta)
    const m = new Matrix4().lookAt(nextPos, nextTarget, worldUp)
    const q = new Quaternion().setFromRotationMatrix(m)
    return {
      position: { x: nextPos.x, y: nextPos.y, z: nextPos.z },
      quaternion: { x: q.x, y: q.y, z: q.z, w: q.w },
      target: { x: nextTarget.x, y: nextTarget.y, z: nextTarget.z },
    }
  }

  const sensitivity = 0.0025
  const yaw = -dx * sensitivity
  const pitch = -dy * sensitivity
  const right = new Vector3(1, 0, 0).applyQuaternion(startQuat).normalize()
  const qYaw = new Quaternion().setFromAxisAngle(worldUp, yaw)
  const qPitch = new Quaternion().setFromAxisAngle(right, pitch)
  offset.applyQuaternion(qYaw).applyQuaternion(qPitch)
  const nextPos = target.clone().add(offset)
  const m = new Matrix4().lookAt(nextPos, target, worldUp)
  const q = new Quaternion().setFromRotationMatrix(m)
  return {
    position: { x: nextPos.x, y: nextPos.y, z: nextPos.z },
    quaternion: { x: q.x, y: q.y, z: q.z, w: q.w },
    target: { x: target.x, y: target.y, z: target.z },
  }
}

export function computeOverlayDragStartScreenSpace3d(args: {
  camera: Camera
  world: { x: number; y: number; z: number }
  viewportW: number
  viewportH: number
}): { sx: number; sy: number; ndcZ: number; w: number; h: number } {
  const w = Math.max(1, Math.floor(Number(args.viewportW) || 1))
  const h = Math.max(1, Math.floor(Number(args.viewportH) || 1))
  const world = new Vector3(args.world.x, args.world.y, args.world.z)
  const ndc = world.clone().project(args.camera)
  const sx = (ndc.x * 0.5 + 0.5) * w
  const sy = (-ndc.y * 0.5 + 0.5) * h
  return { sx, sy, ndcZ: ndc.z, w, h }
}

export function computeOverlayDraggedWorldPos3d(args: {
  camera: Camera
  startSx: number
  startSy: number
  dxClientPx: number
  dyClientPx: number
  ndcZ: number
  viewportW: number
  viewportH: number
}): { x: number; y: number; z: number } | null {
  const w = Math.max(1, Math.floor(Number(args.viewportW) || 1))
  const h = Math.max(1, Math.floor(Number(args.viewportH) || 1))
  const sx = Number(args.startSx) + Number(args.dxClientPx)
  const sy = Number(args.startSy) + Number(args.dyClientPx)
  const ndcX = (sx / w) * 2 - 1
  const ndcY = -((sy / h) * 2 - 1)
  const ndcZ = Number(args.ndcZ)
  if (!Number.isFinite(ndcX) || !Number.isFinite(ndcY) || !Number.isFinite(ndcZ)) return null
  const nextWorld = new Vector3(ndcX, ndcY, ndcZ).unproject(args.camera)
  return { x: nextWorld.x, y: nextWorld.y, z: nextWorld.z }
}
