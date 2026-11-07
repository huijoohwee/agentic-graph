/** Shared image plane and view fit; arbitrary presentation units, not recovered depth. */
export const PHOTO_DISTANCE = 80
export const PHOTO_HEIGHT = 60
export type ImmersivePhoto = Readonly<{ width: number; height: number; evidenceSha256?: string }>
export function photoDimensions(photo: ImmersivePhoto) {
  return { width: PHOTO_HEIGHT * photo.width / photo.height, height: PHOTO_HEIGHT }
}
export function photoFieldOfView(photo: ImmersivePhoto, aspect: number, zoomDegrees = 68) {
  const size = photoDimensions(photo)
  const halfHeight = Math.max(size.height, size.width / Math.max(0.1, aspect)) / 2
  return Math.max(5, Math.min(150, 2 * Math.atan(halfHeight * 1.08 / PHOTO_DISTANCE) * 180 / Math.PI * zoomDegrees / 68))
}
