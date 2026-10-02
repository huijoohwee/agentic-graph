import React from 'react'
import type { WorkspaceDataViewFloatingBinding } from './workspaceDataViewFloatingStore'
import { PanelSelect, PanelTextInput } from '@/lib/ui/panelFormControls'
import { isDataViewTimeZone } from './workspaceDataViewDates'

export function WorkspaceDataViewSettingsCalendarSection(props: Pick<WorkspaceDataViewFloatingBinding, 'columns' | 'viewConfig' | 'setViewConfig'>) {
  const calendar = props.viewConfig.calendar ?? { startColumnId: null, endColumnId: null, timeZone: 'UTC', month: new Date().toISOString().slice(0, 7) }
  const [zone, setZone] = React.useState(calendar.timeZone)
  React.useEffect(() => setZone(calendar.timeZone), [calendar.timeZone])
  const patch = (change: Partial<typeof calendar>) => props.setViewConfig({ ...props.viewConfig, v: 3, calendar: { ...calendar, ...change } })
  const dateColumns = props.columns.filter(column => ['date', 'created-time'].includes(props.viewConfig.columnTypesById?.[column.id] || column.kind))
  return <fieldset className="space-y-2 rounded border p-2"><legend>Calendar</legend>
    <label className="block text-xs">Calendar by<PanelSelect aria-label="Calendar by" className="w-full" value={calendar.startColumnId || ''} onValueChange={value => patch({ startColumnId: value || null })}><option value="">Choose date property</option>{dateColumns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</PanelSelect></label>
    <label className="block text-xs">End date<PanelSelect aria-label="Calendar end date" className="w-full" value={calendar.endColumnId || ''} onValueChange={value => patch({ endColumnId: value || null })}><option value="">None</option>{dateColumns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</PanelSelect></label>
    {!dateColumns.length && <p className="text-xs">Set a property's type to Date in Properties, then choose it here.</p>}
    <label className="block text-xs">Display timezone<PanelTextInput aria-label="Calendar display timezone" className="w-full" value={zone} onChange={event => { const value = event.target.value; setZone(value); if (isDataViewTimeZone(value)) patch({ timeZone: value }) }} /></label>
    {!isDataViewTimeZone(zone) && <p role="alert" className="text-xs">Enter a valid IANA timezone, such as UTC. The previous zone remains active.</p>}
    <p className="text-xs">Civil dates stay on their authored day. Offset timestamps use the display timezone.</p>
  </fieldset>
}
