export function releaseMotionControlCapture(stream: MediaStream | null, video: HTMLVideoElement | null): void {
  video?.pause()
  if (video) video.srcObject = null
  stream?.getTracks().forEach(track => track.stop())
}

export function hasLiveMotionControlVideoTrack(stream: MediaStream | null): boolean {
  const tracks = stream?.getVideoTracks() || []
  return tracks.length > 0 && tracks.some(track => track.readyState !== 'ended')
}
