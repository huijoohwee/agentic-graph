/** Strict civil dates and offset instants shared by query and Calendar projection. */
export type DataViewDate = { kind: 'civil' | 'instant'; value: number; day: string }
export function parseDataViewDate(raw: string): DataViewDate | null {
  const value = raw.trim()
  const civil = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  const instant = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/i.exec(value)
  const day = civil ? value : instant?.[1]
  if (!day || !/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(day)) return null
  const midnight = Date.parse(`${day}T00:00:00Z`)
  if (!Number.isFinite(midnight) || new Date(midnight).toISOString().slice(0, 10) !== day) return null
  if (civil) return { kind: 'civil', value: midnight, day }
  if (!instant || Number(instant[2]) > 23 || Number(instant[3]) > 59 || Number(instant[4]) > 59) return null
  const offset = instant[5]
  if (offset !== 'Z' && offset !== 'z' && (Number(offset.slice(1, 3)) > 23 || Number(offset.slice(4)) > 59)) return null
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? { kind: 'instant', value: ms, day } : null
}
export function isDataViewTimeZone(zone: string): boolean {
  try { new Intl.DateTimeFormat('en', { timeZone: zone }).format(0); return !!zone } catch { return false }
}
export function dayInDataViewZone(ms: number, zone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(ms)
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)?.value).join('-')
}
export const addCivilDays = (day: string, amount: number): string => new Date(Date.parse(`${day}T00:00:00Z`) + amount * 86_400_000).toISOString().slice(0, 10)
