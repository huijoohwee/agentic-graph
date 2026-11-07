/** Explicit, pose-independent still-camera permission request. The caller owns stream cleanup. */
export async function requestSemanticSpaceCamera(): Promise<MediaStream> {
  const media = navigator.mediaDevices
  if (!media?.getUserMedia) throw new Error('Camera capture is unavailable here. Choose an image instead.')
  return media.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
  })
}
