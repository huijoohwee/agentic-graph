let activePlatformTeardownCount = 0

export function motionCapturePlatformTeardownActive(): boolean {
  return activePlatformTeardownCount > 0
}

export function beginMotionCapturePlatformTeardown(): () => void {
  activePlatformTeardownCount += 1
  let finished = false
  return () => {
    if (finished) return
    finished = true
    activePlatformTeardownCount = Math.max(0, activePlatformTeardownCount - 1)
  }
}
