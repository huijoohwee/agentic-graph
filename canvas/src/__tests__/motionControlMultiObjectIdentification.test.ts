import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  XrSceneLibrarySubject,
} from '@/features/three/XrSceneLibrarySubject'
import {
  XR_SCENE_LIBRARY_ASSETS,
} from '@/features/three/xrSceneLibrary'
import {
  XR_MOTION_REFERENCE_MAX_SUBJECTS,
  type XrMotionReferenceSubject,
} from '@/features/three/xrMotionReferenceModel'

const source = (...parts: string[]): string => readFileSync(resolve(process.cwd(), 'src', ...parts), 'utf8')

type ElementLike = Readonly<{ props?: Readonly<Record<string, unknown>> }>

function childElements(value: unknown): readonly ElementLike[] {
  if (Array.isArray(value)) return value.flatMap(childElements)
  if (!value || typeof value !== 'object') return []
  const element = value as ElementLike
  return [element, ...childElements(element.props?.children)]
}

function authoredSubjects(): readonly XrMotionReferenceSubject[] {
  return Object.freeze(Array.from({ length: XR_MOTION_REFERENCE_MAX_SUBJECTS }, (_, index) => {
    const asset = XR_SCENE_LIBRARY_ASSETS[index % XR_SCENE_LIBRARY_ASSETS.length]!
    return Object.freeze({
      id: `subject-${index + 1}`,
      assetId: asset.id,
      category: asset.category,
      label: `${asset.label} ${index + 1}`,
      color: asset.defaultColor,
      position: Object.freeze([index % 8, 0, Math.floor(index / 8)] as const),
      rotationYDegrees: 0,
      scale: 1,
    })
  }))
}

export function testMotionControlBoundingBoxIdentifiesAllAuthoredXrSubjects() {
  const subjects = authoredSubjects()
  const names = new Set<string>()
  subjects.forEach(subject => {
    const asset = XR_SCENE_LIBRARY_ASSETS.find(candidate => candidate.id === subject.assetId)!
    const props = {
      subject,
      position: subject.position,
      stageScale: 1,
    }
    const disabled = childElements(XrSceneLibrarySubject(props))
      .find(element => String(element.props?.name || '').includes('identification_bounds'))
    if (disabled) throw new Error('expected staged XR subject identification bounds to default off')

    const enabled = childElements(XrSceneLibrarySubject({ ...props, showIdentificationBounds: true }))
    const bounds = enabled.find(element => element.props?.name === `agentic_os_xr_scene_subject_identification_bounds_${subject.id}`)
    const geometry = childElements(bounds).find(element => Array.isArray(element.props?.args))
    const userData = bounds?.props?.userData as Record<string, unknown> | undefined
    const position = bounds?.props?.position as readonly number[] | undefined
    const size = geometry?.props?.args as readonly number[] | undefined
    if (!bounds
      || !userData
      || userData.source !== 'xr-scene-library'
      || userData.subjectId !== subject.id
      || userData.assetId !== subject.assetId
      || userData.category !== subject.category
      || userData.label !== subject.label
      || position?.[2] !== asset.dimensionsMeters[1] / 2
      || size?.[0] !== asset.dimensionsMeters[0]
      || size?.[1] !== asset.dimensionsMeters[2]
      || size?.[2] !== asset.dimensionsMeters[1]) {
      throw new Error(`expected catalog dimensions and existing subject metadata for ${subject.id}`)
    }
    names.add(String(bounds.props?.name || ''))
  })
  if (names.size !== subjects.length) {
    throw new Error('expected one uniquely named identification outline for every bounded authored XR subject')
  }

  const poseProjection = source('features', 'three', 'useMotionControlAnimationPose.ts')
  const stage = source('features', 'three', 'XrMotionReferenceStage.tsx')
  const nativeStage = source('features', 'three', 'XrNativeControllerAuthoredSubjects.tsx')
  const subjectRenderer = source('features', 'three', 'XrSceneLibrarySubject.tsx')
  if (!poseProjection.includes('boundingBoxEnabled: motionControl.boundingBoxEnabled')
    || !stage.includes('showIdentificationBounds={boundingBoxEnabled}')
    || !nativeStage.includes('showIdentificationBounds={boundingBoxEnabled}')) {
    throw new Error('expected both authored XR render owners to reuse the existing Motion Control preference subscription')
  }
  for (const forbiddenClaim of ['getUserMedia', 'ObjectDetector', 'pose_detector.tflite', 'identity recognition', 'face recognition']) {
    if (subjectRenderer.includes(forbiddenClaim)) {
      throw new Error(`expected catalog-owned outlines without camera or identity claims: ${forbiddenClaim}`)
    }
  }
}
