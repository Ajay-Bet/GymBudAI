import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { getAnalytics, defaultRange, saveTimezone, dateTime, isNumber, degrees, seconds, percent, NOT_ASSESSED } from '../api/analytics'
import AnalyticsFilters from './AnalyticsFilters'
import gym_bud_logo from '../assets/gym-bud-logo.svg'

const label = (value) => value?.replace(/-/g, ' ') || NOT_ASSESSED
const count = (value) => isNumber(value) ? value : NOT_ASSESSED
const of = (value, total, unit) => isNumber(value) && isNumber(total) ? `${value} of ${total} ${unit}` : NOT_ASSESSED

function Metric({ title, children, hint }) {
    return <div><dt className="text-xs uppercase tracking-wide text-gray-600">{title}</dt><dd className="text-base font-semibold">{children}</dd>{hint && <dd className="text-xs text-gray-600">{hint}</dd>}</div>
}

function Metrics({ metrics }) {
    const m = metrics ?? {}
    return <dl className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Metric title="Workouts / sets">{count(m.workouts)} workouts / {count(m.sets)} sets</Metric>
        <Metric title="Completed reps">{count(m.completedReps)} reps</Metric>
        <Metric title="Analyzed reps">{of(m.analyzedReps, m.completedReps, 'completed reps')}</Metric>
        <Metric title="Issue-bearing reps">{of(m.issueBearingReps, m.analyzedReps, 'analyzed reps')}</Metric>
        <Metric title="No configured issue detected" hint="Detector summary, not a validated form score">{percent(m.noIssueFraction)} · {of(m.noIssueReps, m.analyzedReps, 'analyzed reps')}</Metric>
        <Metric title="Average ROM" hint={of(m.romObservedReps, m.completedReps, 'completed reps with measured ROM')}>{degrees(m.averageRomDeg)}</Metric>
        <Metric title="Median rep duration" hint={of(m.durationObservedReps, m.completedReps, 'completed reps with measured duration')}>{seconds(m.medianDurationMs)}</Metric>
        <Metric title="Tracking coverage" hint={`${of(m.coverageKnownSets, m.sets, 'sets with known tracking time')}${m.coverageComplete === false ? ' · Partial coverage data' : ''}`}>{percent(m.trackingCoverage)} · {seconds(m.trackingAssessableMs)} of {seconds(m.trackingSessionMs)}</Metric>
        <Metric title="Assessed issue episodes" hint="Continuous episodes; multiple issues may affect one rep">{count(m.assessedIssueEpisodes)} episodes</Metric>
        <Metric title="Unassessed episodes" hint="Not form claims">{count(m.unassessedIssueEpisodes)} episodes</Metric>
    </dl>
}

function Trend({ points, metric, title, format, percentage = false, eligible }) {
    const measured = points.filter((p) => isNumber(p.metrics?.[metric]))
    const comparable = eligible && measured.length >= 2
    const maximum = percentage ? 1 : Math.max(1, ...measured.map((p) => p.metrics[metric]))
    const x = (index) => 45 + index * 490 / Math.max(1, points.length - 1)
    const y = (value) => 130 - (value / maximum) * 105
    const delta = comparable ? measured.at(-1).metrics[metric] - measured[0].metrics[metric] : null
    return <figure className="min-w-0 rounded-lg bg-gray-50 p-4">
        <figcaption className="font-semibold">{title}</figcaption>
        <p className="text-xs text-gray-600 mb-2">Oldest to newest workout. Full values and denominators appear in the table below. Missing measurements leave gaps.</p>
        {comparable ? <>
            <svg viewBox="0 0 560 165" role="img" aria-label={`${title}, ${measured.length} measured workouts. See workout measurements table for values.`} className="w-full">
                <line x1="45" x2="535" y1="130" y2="130" stroke="#6b7280" />
                <text x="0" y="30" fontSize="12">{percentage ? '100%' : format(maximum)}</text><text x="0" y="134" fontSize="12">{percentage ? '0%' : format(0)}</text>
                {points.map((point, index) => {
                    const value = point.metrics?.[metric]
                    if (!isNumber(value)) return null
                    const previous = points[index - 1]?.metrics?.[metric]
                    return <g key={point.workoutId}>
                        {isNumber(previous) && <line x1={x(index - 1)} y1={y(previous)} x2={x(index)} y2={y(value)} stroke="#15803d" strokeWidth="2" />}
                        <circle cx={x(index)} cy={y(value)} r="4" fill="#15803d"><title>{point.localDate}: {format(value)}</title></circle>
                    </g>
                })}
                <text x="45" y="155" fontSize="12">{points[0]?.localDate}</text><text x="535" y="155" textAnchor="end" fontSize="12">{points.at(-1)?.localDate}</text>
            </svg>
            <p className="text-sm">First to latest measured workout: {delta >= 0 ? '+' : ''}{percentage ? `${(delta * 100).toFixed(1)} percentage points` : `${delta.toFixed(1)}°`}. Observed change only.</p>
        </> : <p className="text-sm text-gray-600">Insufficient data: {eligible ? 'at least two compatible workouts with this measurement are needed.' : 'a known matching configuration, supported camera view and at least two compatible workouts are needed.'}</p>}
    </figure>
}

function Group({ group, timezone, index }) {
    const c = group.configuration ?? {}
    const points = [...(group.points ?? [])].sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.workoutId.localeCompare(b.workoutId))
    return <section className="rounded-xl border border-gray-200 bg-white p-6 flex flex-col gap-5" aria-labelledby={`configuration-${index}`}>
        <h2 id={`configuration-${index}`} className="text-xl font-bold">{label(c.exerciseId)} · {label(c.side)} arm · {label(c.view)} view</h2>
        {c.mode === 'review' && <p className="text-sm text-amber-800">Experimental detector output: review mode may include rules that have not been validated.</p>}
        {c.supportedView === false && <p className="text-sm text-amber-800">Unsupported camera view: saved measurements are descriptive and cannot be compared as a progress trend.</p>}
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            {['analyzerVersion', 'featureVersion', 'rulesVersion', 'summarySchemaVersion', 'mode'].map((key) => <Metric key={key} title={label(key.replace(/([A-Z])/g, ' $1'))}>{c[key] ?? NOT_ASSESSED}</Metric>)}
            <Metric title="Assessed rules">{Array.isArray(c.assessedRuleTypes) ? (c.assessedRuleTypes.length ? c.assessedRuleTypes.map(label).join(', ') : 'None') : 'Not assessed / configuration unavailable'}</Metric>
            <Metric title="Minimum rep form coverage">{percent(c.minFormCoverage)}</Metric>
        </dl>
        <Metrics metrics={group.metrics} />
        {Object.keys(group.metrics?.episodeCountsByType ?? {}).length > 0 && <p className="text-sm">Assessed episodes by issue: {Object.entries(group.metrics.episodeCountsByType).map(([type, total]) => `${label(type)}: ${count(total)}`).join('; ')}.</p>}
        <div className="grid md:grid-cols-2 gap-4">
            <Trend points={points} metric="averageRomDeg" title="Average ROM (degrees)" format={degrees} eligible={group.comparisonEligible === true} />
            <Trend points={points.map((point) => ({ ...point, metrics: { ...point.metrics, issueFraction: isNumber(point.metrics?.analyzedReps) && point.metrics.analyzedReps > 0 && isNumber(point.metrics.issueBearingReps) ? point.metrics.issueBearingReps / point.metrics.analyzedReps : null } }))} metric="issueFraction" title="Issue-bearing rep frequency" format={percent} percentage eligible={group.comparisonEligible === true} />
        </div>
        <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
                <caption className="text-left font-semibold pb-2">Workout measurements — text equivalent of charts</caption>
                <thead className="text-left"><tr>{['Workout started', 'Completed / analyzed reps', 'Average ROM', 'Median rep duration', 'Issue-bearing reps', 'No configured issue detected', 'Assessed / unassessed episodes', 'Tracking coverage'].map((title) => <th key={title} scope="col" className="p-2">{title}</th>)}</tr></thead>
                <tbody>{points.map((p) => {
                    const m = p.metrics ?? {}
                    return <tr key={p.workoutId} className="border-t border-gray-200">
                        <th scope="row" className="p-2 text-left font-normal"><Link className="text-green-700 underline" to={`/history/${encodeURIComponent(p.workoutId)}`}>{dateTime(p.startedAt, timezone)}</Link></th>
                        <td className="p-2">{count(m.completedReps)} completed; {of(m.analyzedReps, m.completedReps, 'analyzed')}</td>
                        <td className="p-2">{degrees(m.averageRomDeg)} ({of(m.romObservedReps, m.completedReps, 'reps measured')})</td>
                        <td className="p-2">{seconds(m.medianDurationMs)} ({of(m.durationObservedReps, m.completedReps, 'reps measured')})</td>
                        <td className="p-2">{of(m.issueBearingReps, m.analyzedReps, 'analyzed reps')} ({isNumber(m.analyzedReps) && m.analyzedReps > 0 && isNumber(m.issueBearingReps) ? percent(m.issueBearingReps / m.analyzedReps) : NOT_ASSESSED})</td>
                        <td className="p-2">{percent(m.noIssueFraction)} ({of(m.noIssueReps, m.analyzedReps, 'analyzed reps')})</td>
                        <td className="p-2">{count(m.assessedIssueEpisodes)} assessed / {count(m.unassessedIssueEpisodes)} unassessed</td>
                        <td className="p-2">{percent(m.trackingCoverage)} ({seconds(m.trackingAssessableMs)} of {seconds(m.trackingSessionMs)}; {of(m.coverageKnownSets, m.sets, 'sets')}{m.coverageComplete === false ? '; partial data' : ''})</td>
                    </tr>
                })}</tbody>
            </table>
        </div>
    </section>
}

function ProgressResults({ range, token }) {
    const [state, setState] = useState({ status: 'loading' })
    const [attempt, setAttempt] = useState(0)
    useEffect(() => {
        const controller = new AbortController()
        getAnalytics(range, token, { signal: controller.signal })
            .then((data) => { if (!controller.signal.aborted) setState({ status: 'ready', data }) })
            .catch((error) => { if (!controller.signal.aborted) setState({ status: 'error', error }) })
        return () => controller.abort()
    }, [range, token, attempt])
    if (state.status === 'loading') return <p role="status">Loading progress…</p>
    if (state.status === 'error') return <div role="alert"><p>Could not load progress: {state.error?.message}</p><button type="button" className="mt-2 rounded border px-4 py-2" onClick={() => { setState({ status: 'loading' }); setAttempt((n) => n + 1) }}>Retry</button><p className="text-sm mt-2">For a large history, choose a shorter date range.</p></div>
    const data = state.data
    return <>
        <section className="rounded-xl border border-gray-200 bg-white p-6 flex flex-col gap-4">
            <h2 className="text-xl font-bold">Selected period</h2>
            <p className="text-sm">{data.range?.startDate ?? range.startDate} to {data.range?.endDate ?? range.endDate} in {range.timezone}. Finished workouts with saved sets only.</p>
            <p className="text-sm text-gray-600">Totals describe this period across configurations. Comparisons are shown separately below.</p>
            <Metrics metrics={data.totals} />
            <p className="text-sm text-gray-600">Excluded: {count(data.excluded?.openWorkouts)} open workouts and {count(data.excluded?.emptyWorkouts)} finished workouts without saved sets.</p>
        </section>
        {!data.groups?.length ? <p>No finished workouts with saved sets in this date range. Choose other dates or save a workout from the <Link className="text-green-700 underline" to="/">camera page</Link>.</p> : <>
            {data.groups.length > 1 && <p role="note" className="rounded-lg bg-amber-50 p-4 text-sm">Configuration differences: these groups remain separate because exercise, view, side, detector versions, mode, assessed rules or minimum coverage differ. No trend crosses a configuration boundary.</p>}
            <p className="text-sm text-gray-600">Comparisons match saved configuration only. Calibration targets, physical load and camera position are not recorded. Observed ROM or detector-frequency changes do not establish better form or clinical progress.</p>
            {data.groups.map((group, index) => <Group key={group.id} group={group} index={index} timezone={range.timezone} />)}
        </>}
    </>
}

export default function ProgressPage() {
    const { status, token } = useAuth()
    const [range, setRange] = useState(() => defaultRange())
    function apply(value) { saveTimezone(value.timezone); setRange({ ...value }) }
    return <main className="min-h-screen bg-[#f9f9fa] text-[#1c1c1a]">
        <nav className="bg-white border-b border-gray-200 px-6 md:px-12 py-4 flex justify-between items-center"><Link to="/"><img src={gym_bud_logo} alt="GymBud home" className="h-8" /></Link><Link to="/history" className="text-green-700 font-semibold hover:underline">Workout history</Link></nav>
        <div className="mx-auto max-w-6xl px-6 py-8 flex flex-col gap-6">
            <h1 className="text-3xl font-bold">Workout progress</h1>
            <p className="text-gray-600">Review measured movement and detector summaries from your saved workouts.</p>
            <AnalyticsFilters value={range} onApply={apply} />
            {status === 'loading' && <p role="status">Checking sign-in…</p>}
            {status === 'signed-out' && <p><Link className="text-green-700 underline" to="/login?next=%2Fprogress">Sign in</Link> to see your workout progress.</p>}
            {status === 'signed-in' && token && <ProgressResults key={`${token}:${range.startDate}:${range.endDate}:${range.timezone}`} range={range} token={token} />}
        </div>
    </main>
}
