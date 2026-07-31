import type { RegionalPoiProfile } from 'grph-shared/geospatial/regionalPoiGeo'

export type RegionalPoiPresentationStyle = Readonly<{
  color: string
  presentation: string
  tone: 'light' | 'mid' | 'dark' | 'accent'
}>

export type RegionalPoiPresentationPolicy = Readonly<{
  profileId: string
  profileRevision: string
  stylesByCategory: Readonly<Record<string, RegionalPoiPresentationStyle>>
}>

type RegionalPoiPresentationProfile = Pick<
  RegionalPoiProfile,
  'id' | 'revision'
>

const PRESENTATION_TONES = new Set<RegionalPoiPresentationStyle['tone']>([
  'accent',
  'dark',
  'light',
  'mid',
])

function assertNonEmptyString(value: string, label: string): void {
  if (!value || value.trim() !== value) {
    throw new TypeError(`${label} must be a non-empty trimmed string`)
  }
}

function clonePresentationStyle(
  category: string,
  style: RegionalPoiPresentationStyle,
): RegionalPoiPresentationStyle {
  assertNonEmptyString(category, 'Regional POI presentation category')
  if (!/^#[0-9a-f]{6}$/i.test(style.color)) {
    throw new TypeError(`${category} presentation color must be six-digit hex`)
  }
  assertNonEmptyString(
    style.presentation,
    `${category} presentation identifier`,
  )
  if (!PRESENTATION_TONES.has(style.tone)) {
    throw new TypeError(`${category} presentation tone is unsupported`)
  }
  return Object.freeze({ ...style })
}

export function createRegionalPoiPresentationPolicy(
  input: Readonly<{
    profile: RegionalPoiPresentationProfile
    stylesByCategory: Readonly<Record<string, RegionalPoiPresentationStyle>>
  }>,
): RegionalPoiPresentationPolicy {
  assertNonEmptyString(input.profile.id, 'Regional POI profile id')
  assertNonEmptyString(input.profile.revision, 'Regional POI profile revision')
  const styleEntries = Object.entries(input.stylesByCategory)
  if (styleEntries.length === 0) {
    throw new TypeError('Regional POI presentation policy requires a style')
  }
  return Object.freeze({
    profileId: input.profile.id,
    profileRevision: input.profile.revision,
    stylesByCategory: Object.freeze(Object.fromEntries(
      styleEntries.map(([category, style]) => (
        [category, clonePresentationStyle(category, style)]
      )),
    )),
  })
}

export function resolveRegionalPoiPresentationStyle(
  input: Readonly<{
    category: string
    policy: RegionalPoiPresentationPolicy
    profile: RegionalPoiPresentationProfile
  }>,
): RegionalPoiPresentationStyle {
  if (
    input.policy.profileId !== input.profile.id
    || input.policy.profileRevision !== input.profile.revision
  ) {
    throw new TypeError(
      `Regional POI presentation policy does not match profile ${input.profile.id}@${input.profile.revision}`,
    )
  }
  const style = input.policy.stylesByCategory[input.category]
  if (!style) {
    throw new TypeError(
      `Unsupported regional POI presentation category for ${input.profile.id}: ${input.category}`,
    )
  }
  return style
}
