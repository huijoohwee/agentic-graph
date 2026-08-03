import {
  XR_V2_STEREO_PAIR_SCHEMA,
  type XrV2DepthEstimate,
  type XrV2StereoPair,
  type XrV2StereoSynthesizer,
} from './captureContracts'

export type XrV2RgbaFrame = Readonly<{
  width: number
  height: number
  data: Uint8ClampedArray
}>

export type XrV2NormalizedDepthMap = Readonly<{
  width: number
  height: number
  values: Float32Array
}>

export type XrV2StereoSynthesisConfiguration = Readonly<{
  maxDisparityPixels: number
}>

function assertDimensions(width: number, height: number, name: string): void {
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new Error(`${name} dimensions must be positive integers`)
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function copyPixel(
  source: Uint8ClampedArray,
  target: Uint8ClampedArray,
  sourcePixelIndex: number,
  targetPixelIndex: number,
): void {
  const sourceOffset = sourcePixelIndex * 4
  const targetOffset = targetPixelIndex * 4
  target[targetOffset] = source[sourceOffset]
  target[targetOffset + 1] = source[sourceOffset + 1]
  target[targetOffset + 2] = source[sourceOffset + 2]
  target[targetOffset + 3] = source[sourceOffset + 3]
}

export function synthesizeXrV2RgbaStereoPair(input: Readonly<{
  frameIndex: number
  capturedAtMs: number
  frame: XrV2RgbaFrame
  estimate: XrV2DepthEstimate<XrV2NormalizedDepthMap>
  configuration: XrV2StereoSynthesisConfiguration
}>): XrV2StereoPair<XrV2RgbaFrame> {
  assertDimensions(input.frame.width, input.frame.height, 'frame')
  assertDimensions(input.estimate.depth.width, input.estimate.depth.height, 'depth map')
  if (
    input.frame.width !== input.estimate.depth.width
    || input.frame.height !== input.estimate.depth.height
  ) {
    throw new Error('frame and depth map dimensions must match')
  }

  const pixelCount = input.frame.width * input.frame.height
  if (input.frame.data.length !== pixelCount * 4) {
    throw new Error('RGBA frame data length does not match its dimensions')
  }
  if (input.estimate.depth.values.length !== pixelCount) {
    throw new Error('depth map data length does not match its dimensions')
  }
  if (
    !Number.isInteger(input.configuration.maxDisparityPixels)
    || input.configuration.maxDisparityPixels < 0
  ) {
    throw new Error('maxDisparityPixels must be a non-negative integer')
  }

  const leftData = new Uint8ClampedArray(input.frame.data.length)
  const rightData = new Uint8ClampedArray(input.frame.data.length)
  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    const depth = input.estimate.depth.values[pixelIndex]
    if (!Number.isFinite(depth)) throw new Error('depth map values must be finite')
    const x = pixelIndex % input.frame.width
    const y = Math.floor(pixelIndex / input.frame.width)
    const disparity = Math.round(
      (1 - clamp(depth, 0, 1)) * input.configuration.maxDisparityPixels,
    )
    const leftSourceX = clamp(x + disparity, 0, input.frame.width - 1)
    const rightSourceX = clamp(x - disparity, 0, input.frame.width - 1)
    copyPixel(
      input.frame.data,
      leftData,
      y * input.frame.width + leftSourceX,
      pixelIndex,
    )
    copyPixel(
      input.frame.data,
      rightData,
      y * input.frame.width + rightSourceX,
      pixelIndex,
    )
  }

  return Object.freeze({
    schema: XR_V2_STEREO_PAIR_SCHEMA,
    frameIndex: input.frameIndex,
    capturedAtMs: input.capturedAtMs,
    left: Object.freeze({
      width: input.frame.width,
      height: input.frame.height,
      data: leftData,
    }),
    right: Object.freeze({
      width: input.frame.width,
      height: input.frame.height,
      data: rightData,
    }),
  })
}

export function createXrV2RgbaStereoSynthesizer(
  configuration: XrV2StereoSynthesisConfiguration,
): XrV2StereoSynthesizer<
  XrV2RgbaFrame,
  XrV2NormalizedDepthMap,
  XrV2RgbaFrame
> {
  return Object.freeze({
    synthesize: ({ frame, estimate }) => synthesizeXrV2RgbaStereoPair({
      frameIndex: frame.frameIndex,
      capturedAtMs: frame.capturedAtMs,
      frame: frame.frame,
      estimate,
      configuration,
    }),
  })
}
