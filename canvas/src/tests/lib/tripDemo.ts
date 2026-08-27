import { pickExternalDemoMarkdownFile, readExternalDemoText, toDocumentPath } from '@/tests/lib/externalFixtures'

export const resolveTripDemoPath = (): string | null => {
  return pickExternalDemoMarkdownFile({
    preferBasename: 'trip-demo.md',
    envVarPathKey: 'AG_TRIP_DEMO_PATH',
  })
}

export const resolveTripDemoMmdPath = (): string | null => {
  return pickExternalDemoMarkdownFile({
    preferBasename: 'trip-demo-mmd.md',
    envVarPathKey: 'AG_TRIP_DEMO_MMD_PATH',
  })
}

export const resolveTripDemoDocumentPath = (): string | null => {
  const p = resolveTripDemoPath()
  if (!p) return null
  const docPath = toDocumentPath(p)
  return docPath || null
}

export const resolveTripDemoMmdDocumentPath = (): string | null => {
  const p = resolveTripDemoMmdPath()
  if (!p) return null
  const docPath = toDocumentPath(p)
  return docPath || null
}

export const readTripDemo = (): string | null => {
  const res = readExternalDemoText({
    preferBasename: 'trip-demo.md',
    envVarPathKey: 'AG_TRIP_DEMO_PATH',
  })
  return res?.text ?? null
}

export const readTripDemoMmd = (): string | null => {
  const res = readExternalDemoText({
    preferBasename: 'trip-demo-mmd.md',
    envVarPathKey: 'AG_TRIP_DEMO_MMD_PATH',
  })
  return res?.text ?? null
}
