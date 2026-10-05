import { useState } from 'react'
import { validTimezone } from '../api/analytics'

/** Submit the whole selection together; invalid edits never start an API request. */
export default function AnalyticsFilters({ value, onApply, dates = true }) {
    const [draft, setDraft] = useState(value)
    const [error, setError] = useState('')
    function apply(event) {
        event.preventDefault()
        if (!validTimezone(draft.timezone)) { setError('Enter a valid IANA timezone, such as America/New_York or UTC.'); return }
        if (dates) {
            const start = Date.parse(`${draft.startDate}T00:00:00Z`)
            const end = Date.parse(`${draft.endDate}T00:00:00Z`)
            if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || (end - start) / 86400000 >= 366) {
                setError('Choose an inclusive date range of 1 to 366 days.'); return
            }
        }
        setError('')
        onApply(draft)
    }
    return <form onSubmit={apply} className="rounded-xl border border-gray-200 bg-white p-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-3">
            {dates && <>
                <label className="text-sm flex flex-col gap-1">Start date<input required type="date" value={draft.startDate} onChange={(e) => setDraft({ ...draft, startDate: e.target.value })} className="rounded border border-gray-300 px-3 py-2" /></label>
                <label className="text-sm flex flex-col gap-1">End date<input required type="date" value={draft.endDate} onChange={(e) => setDraft({ ...draft, endDate: e.target.value })} className="rounded border border-gray-300 px-3 py-2" /></label>
            </>}
            <label className="text-sm flex flex-col gap-1">Display timezone<input required type="text" list="analytics-timezones" value={draft.timezone} onChange={(e) => setDraft({ ...draft, timezone: e.target.value })} className="rounded border border-gray-300 px-3 py-2" /></label>
            <datalist id="analytics-timezones">{['UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Europe/London', 'Asia/Kolkata'].map((zone) => <option key={zone} value={zone} />)}</datalist>
            <button type="submit" className="rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white">Apply {dates ? 'date range' : 'timezone'}</button>
        </div>
        <p className="text-xs text-gray-600">{dates ? 'Dates include both endpoints. A workout belongs to the day it started in the selected timezone.' : 'All saved workouts, newest first. Times use the selected timezone.'}</p>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </form>
}
