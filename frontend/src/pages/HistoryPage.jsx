/**
 * Workout history (Sprint 5, GB 504). Lists the signed-in user's saved workouts (newest first, paged)
 * and shows every saved summary field with units and denominators. Dates use the browser timezone.
 * Missing values read "Not assessed", never 0 or "good form".
 */
import { useCallback, useEffect, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import gym_bud_logo from "../assets/gym-bud-logo.svg"
import { useAuth } from "../auth/AuthContext"
import { getWorkout, listWorkouts } from "../api/workouts"

const NA = "Not assessed"
const PAGE_SIZE = 20

const isNum = (value) => typeof value === "number" && Number.isFinite(value)
const browserTimeZone = () => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "local time" } catch { return "local time" }
}

function formatDate(iso) {
    if (!iso) return NA
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return NA
    return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(date)
}
const formatMs = (ms) => (isNum(ms) ? `${(ms / 1000).toFixed(1)} s` : NA)
const formatDeg = (deg) => (isNum(deg) ? `${deg.toFixed(1)}°` : NA)
const formatPct = (fraction) => (isNum(fraction) ? `${(fraction * 100).toFixed(0)}%` : NA)
const ofCount = (count, total, unit = "reps") => (isNum(count) && isNum(total) ? `${count} of ${total} ${unit}` : NA)
const text = (value) => (value === null || value === undefined || value === "" ? NA : String(value))
const pick = (...values) => values.find((value) => value !== undefined && value !== null) ?? null
const label = (key) => key.replace(/-/g, " ")

function Field({ name, children, hint }) {
    return (
        <div className="flex flex-col">
            <dt className="text-xs uppercase tracking-wide text-gray-500">{name}</dt>
            <dd className="text-sm font-medium text-[#1c1c1a]">{children}</dd>
            {hint && <dd className="text-xs text-gray-500">{hint}</dd>}
        </div>
    )
}

function CountsList({ counts, empty = "None" }) {
    const entries = Object.entries(counts ?? {})
    if (!entries.length) return <span>{empty}</span>
    return (
        <ul className="list-none">
            {entries.map(([key, value]) => <li key={key}>{label(key)}: {isNum(value) ? value : NA}</li>)}
        </ul>
    )
}

function SetDetail({ set }) {
    const summary = set.summary ?? {}
    const completed = pick(set.completedReps, summary.completedReps)
    const analyzed = pick(set.analyzedReps, summary.analyzedReps)
    const issueBearing = pick(set.issueBearingReps, summary.issueBearingReps)
    const noIssue = pick(set.noIssueReps, summary.noIssueReps)
    const noIssueFraction = pick(set.noIssueFraction, summary.noIssueFraction)
    const assessableMs = pick(set.trackingAssessableMs, summary.trackingCoverage?.assessableMs)
    const sessionMs = pick(set.trackingSessionMs, summary.trackingCoverage?.sessionMs)
    const coverage = pick(set.trackingCoverage, summary.trackingCoverage?.fraction)
    const interrupted = pick(set.interruptedAttempts, summary.interruptedAttempts) ?? {}
    const episodeCounts = pick(set.episodeCountsByType, summary.episodeCountsByType)
    const reps = set.reps ?? []
    const events = set.formEvents ?? []

    return (
        <section className="rounded-xl border border-gray-200 bg-white p-6 flex flex-col gap-y-5" aria-label={`Set ${set.setIndex}`}>
            <header className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-lg font-bold">Set {text(set.setIndex)}</h3>
                <span className="text-sm text-gray-500">{formatDate(set.startedAt)} to {formatDate(set.endedAt)}</span>
            </header>

            <dl className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Field name="Completed reps">{isNum(completed) ? `${completed} reps` : NA}</Field>
                <Field name="Analyzed reps" hint={pick(set.notAnalyzedReason, summary.notAnalyzedReason) ? `Not analyzed: ${label(pick(set.notAnalyzedReason, summary.notAnalyzedReason))}` : null}>
                    {ofCount(analyzed, completed, "completed reps")}
                </Field>
                <Field name="Issue-bearing reps">{ofCount(issueBearing, analyzed, "analyzed reps")}</Field>
                <Field name="No-issue reps">{ofCount(noIssue, analyzed, "analyzed reps")}</Field>
                <Field name="No configured issue detected" hint="Detector summary, not a validated form score">
                    {isNum(noIssueFraction) ? `${formatPct(noIssueFraction)} (${noIssue} of ${analyzed} analyzed reps)` : NA}
                </Field>
                <Field name="Tracking coverage" hint="Assessable time of set time">
                    {isNum(coverage) ? `${formatPct(coverage)} (${formatMs(assessableMs)} of ${formatMs(sessionMs)})` : NA}
                </Field>
                <Field name="Minimum rep form coverage">{formatPct(summary.minFormCoverage)}</Field>
                <Field name="Interrupted attempts">
                    {isNum(interrupted.total) ? `${interrupted.total} attempts` : NA}
                    {isNum(interrupted.closedAtFinish) && interrupted.closedAtFinish > 0 && ` (${interrupted.closedAtFinish} closed at finish)`}
                </Field>
            </dl>

            <dl className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Field name="Interrupted by reason"><CountsList counts={interrupted.byReason} /></Field>
                <Field name="Issue episodes (assessed rules)"><CountsList counts={episodeCounts} empty="No assessed rules" /></Field>
                <Field name="Episodes of rules not assessed" hint="Not form claims"><CountsList counts={summary.unassessedEpisodeCountsByType} /></Field>
                <Field name="Assessed rules">{summary.assessedRuleTypes?.length ? summary.assessedRuleTypes.map(label).join(", ") : "None"}</Field>
                <Field name="Mode">{text(pick(set.mode, summary.mode))}</Field>
                <Field name="Side">{text(pick(set.side, summary.side))}</Field>
                <Field name="Camera view">{text(pick(set.view, summary.view))}</Field>
                <Field name="Set ID"><span className="break-all font-mono text-xs">{text(set.clientSetId ?? summary.setId)}</span></Field>
                <Field name="Summary schema">{text(pick(set.summarySchemaVersion, summary.schemaVersion))}</Field>
                <Field name="Analyzer version">{text(pick(set.analyzerVersion, summary.analyzerVersion))}</Field>
                <Field name="Feature version">{text(pick(set.featureVersion, summary.featureVersion))}</Field>
                <Field name="Rules version">{text(pick(set.rulesVersion, summary.rulesVersion))}</Field>
                <Field name="Feedback version">{text(pick(set.feedbackVersion, summary.feedbackVersion))}</Field>
            </dl>

            <div className="overflow-x-auto">
                <h4 className="font-semibold mb-2">Reps</h4>
                {reps.length === 0 ? <p className="text-sm text-gray-500">No completed reps in this set.</p> : (
                    <table className="min-w-full text-sm">
                        <thead className="text-left text-gray-500">
                            <tr>
                                <th className="pr-4 py-1">#</th><th className="pr-4">Duration</th><th className="pr-4">Min flexion</th>
                                <th className="pr-4">Max flexion</th><th className="pr-4">ROM</th><th className="pr-4">Form coverage</th>
                                <th className="pr-4">Analyzed</th><th className="pr-4">Issues</th>
                            </tr>
                        </thead>
                        <tbody>
                            {reps.map((rep) => (
                                <tr key={rep.clientRepId ?? rep.repIndex} className="border-t border-gray-100">
                                    <td className="pr-4 py-1">{text(rep.repIndex)}</td>
                                    <td className="pr-4">{formatMs(rep.durationMs)}</td>
                                    <td className="pr-4">{formatDeg(rep.minFlexionDeg)}</td>
                                    <td className="pr-4">{formatDeg(rep.maxFlexionDeg)}</td>
                                    <td className="pr-4">{formatDeg(rep.romDeg)}</td>
                                    <td className="pr-4">{formatPct(rep.formCoverage)}</td>
                                    <td className="pr-4">{rep.analyzed ? "Yes" : "No"}</td>
                                    <td className="pr-4">{!rep.analyzed ? NA : rep.issueTypes?.length ? rep.issueTypes.map(label).join(", ") : "None detected"}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            <div className="overflow-x-auto">
                <h4 className="font-semibold mb-2">Form events</h4>
                {events.length === 0 ? <p className="text-sm text-gray-500">No form events recorded.</p> : (
                    <table className="min-w-full text-sm">
                        <thead className="text-left text-gray-500">
                            <tr>
                                <th className="pr-4 py-1">Issue</th><th className="pr-4">Start</th><th className="pr-4">End</th>
                                <th className="pr-4">Peak</th><th className="pr-4">Assessed</th><th className="pr-4">Reps</th><th className="pr-4">Rules version</th>
                            </tr>
                        </thead>
                        <tbody>
                            {events.map((event) => (
                                <tr key={event.clientEventId} className="border-t border-gray-100">
                                    <td className="pr-4 py-1">{label(text(event.issueType))}</td>
                                    <td className="pr-4">{formatMs(event.startMs)}</td>
                                    <td className="pr-4">{isNum(event.endMs) ? formatMs(event.endMs) : "Open at finish"}</td>
                                    <td className="pr-4">{isNum(event.peak) ? `${event.peak.toFixed(1)} ${event.peakUnit ?? ""}`.trim() : NA}</td>
                                    <td className="pr-4">{event.assessed ? "Yes" : "No (not a form claim)"}</td>
                                    <td className="pr-4">{event.repClientIds?.length
                                        ? event.repClientIds.map((id) => reps.find((rep) => rep.clientRepId === id)?.repIndex ?? id).join(", ")
                                        : "None"}</td>
                                    <td className="pr-4">{text(event.rulesVersion)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
                <p className="mt-1 text-xs text-gray-500">Event times are from the start of the set.</p>
            </div>
        </section>
    )
}

function WorkoutDetail({ workoutId, token }) {
    const [state, setState] = useState({ status: "loading", workout: null, error: null })
    const [attempt, setAttempt] = useState(0)

    useEffect(() => {
        const controller = new AbortController()
        getWorkout(workoutId, token, { signal: controller.signal })
            .then((workout) => setState({ status: "ready", workout, error: null }))
            .catch((error) => {
                if (error?.code !== "aborted") setState({ status: "error", workout: null, error })
            })
        return () => controller.abort()
    }, [workoutId, token, attempt])

    const retry = () => { setState({ status: "loading", workout: null, error: null }); setAttempt((n) => n + 1) }

    if (state.status === "loading") return <p role="status">Loading workout…</p>
    if (state.status === "error") {
        return (
            <div role="alert" className="flex flex-col gap-2">
                <p className="text-red-600">{state.error?.status === 404 ? "Workout not found." : `Could not load the workout: ${state.error?.message}`}</p>
                {state.error?.status !== 404 && <button type="button" onClick={retry} className="self-start rounded-lg bg-green-600 px-4 py-2 text-white font-semibold">Retry</button>}
            </div>
        )
    }
    const { workout } = state
    const totals = workout.totals ?? {}
    return (
        <article className="flex flex-col gap-y-6">
            <div className="rounded-xl border border-gray-200 bg-white p-6 flex flex-col gap-y-4">
                <h2 className="text-2xl font-bold">{workout.exerciseId === "dumbbell-curl" ? "Dumbbell curl" : text(workout.exerciseId)}</h2>
                <dl className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Field name="Started">{formatDate(workout.startedAt)}</Field>
                    <Field name="Ended">{workout.endedAt ? formatDate(workout.endedAt) : "Not finished"}</Field>
                    <Field name="Status">{workout.status === "finalized" ? "Finished" : "Open (not finalized)"}</Field>
                    <Field name="Recorded timezone">{text(workout.timezone)}</Field>
                    <Field name="Sets">{isNum(totals.sets) ? totals.sets : NA}</Field>
                    <Field name="Completed reps">{isNum(totals.completedReps) ? `${totals.completedReps} reps` : NA}</Field>
                    <Field name="Analyzed reps">{ofCount(totals.analyzedReps, totals.completedReps, "completed reps")}</Field>
                    <Field name="Issue-bearing reps">{ofCount(totals.issueBearingReps, totals.analyzedReps, "analyzed reps")}</Field>
                    <Field name="Workout ID"><span className="break-all font-mono text-xs">{text(workout.clientSessionId)}</span></Field>
                </dl>
                {workout.notes && <p className="text-sm"><span className="text-gray-500">Notes: </span>{workout.notes}</p>}
            </div>
            {(workout.sets ?? []).map((set) => <SetDetail key={set.clientSetId ?? set.id ?? set.setIndex} set={set} />)}
            {!(workout.sets ?? []).length && <p className="text-sm text-gray-500">No sets saved in this workout.</p>}
        </article>
    )
}

function WorkoutList({ token }) {
    const [items, setItems] = useState([])
    const [nextBefore, setNextBefore] = useState(null)
    const [status, setStatus] = useState("loading")
    const [error, setError] = useState(null)

    const load = useCallback(async (before, signal) => {
        setStatus("loading")
        setError(null)
        try {
            const page = await listWorkouts({ limit: PAGE_SIZE, before }, token, { signal })
            setItems((current) => (before ? [...current, ...(page.items ?? [])] : page.items ?? []))
            setNextBefore(page.nextBefore ?? null)
            setStatus("ready")
        } catch (err) {
            if (err?.code === "aborted") return
            setError(err)
            setStatus("error")
        }
    }, [token])

    useEffect(() => {
        const controller = new AbortController()
        // Initial page load; load() sets state only after the request settles.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        load(null, controller.signal)
        return () => controller.abort()
    }, [load])

    return (
        <div className="flex flex-col gap-y-3">
            {items.length === 0 && status === "ready" && (
                <p className="text-gray-600">No saved workouts yet. Finish a set on the <Link to="/" className="text-green-600 underline">camera page</Link> while signed in to save one.</p>
            )}
            <ul className="flex flex-col gap-y-3">
                {items.map((item) => {
                    const totals = item.totals ?? {}
                    return (
                        <li key={item.id}>
                            <Link to={`/history/${encodeURIComponent(item.id)}`} className="block rounded-xl border border-gray-200 bg-white p-4 hover:border-green-600 transition">
                                <div className="flex flex-wrap justify-between gap-2">
                                    <span className="font-semibold">{item.exerciseId === "dumbbell-curl" ? "Dumbbell curl" : text(item.exerciseId)}</span>
                                    <span className="text-sm text-gray-500">{formatDate(item.startedAt)}</span>
                                </div>
                                <div className="text-sm text-gray-600 mt-1">
                                    {isNum(totals.sets) ? `${totals.sets} ${totals.sets === 1 ? "set" : "sets"}` : NA}
                                    {" · "}{isNum(totals.completedReps) ? `${totals.completedReps} completed reps` : NA}
                                    {" · "}{ofCount(totals.analyzedReps, totals.completedReps, "analyzed")}
                                    {" · "}{item.status === "finalized" ? "Finished" : "Open"}
                                </div>
                            </Link>
                        </li>
                    )
                })}
            </ul>
            {status === "loading" && <p role="status">Loading workouts…</p>}
            {status === "error" && (
                <div role="alert" className="flex flex-col gap-2">
                    <p className="text-red-600">Could not load workouts: {error?.message}</p>
                    <button type="button" onClick={() => load(items.length ? nextBefore : null)} className="self-start rounded-lg bg-green-600 px-4 py-2 text-white font-semibold">Retry</button>
                </div>
            )}
            {status === "ready" && nextBefore && (
                <button type="button" onClick={() => load(nextBefore)} className="self-start rounded-lg border border-gray-300 px-4 py-2 font-semibold hover:bg-gray-50">Load older workouts</button>
            )}
        </div>
    )
}

const HistoryPage = () => {
    const { status, token, user, logout } = useAuth()
    const { workoutId } = useParams()
    const navigate = useNavigate()
    const here = workoutId ? `/history/${encodeURIComponent(workoutId)}` : "/history"

    async function handleSignOut() {
        await logout()
        navigate("/login", { replace: true })
    }

    return (
        <main className="min-h-screen bg-[#f9f9fa] text-[#1c1c1a]">
            <nav className="bg-white px-6 md:px-12 py-4 flex flex-row justify-between items-center border-b border-gray-200">
                <Link to="/"><img src={gym_bud_logo} alt="GymBud home" className="h-8" /></Link>
                <div className="flex items-center gap-x-4 text-sm">
                    {status === "signed-in" && <span className="text-gray-600">{user?.displayName || user?.email}</span>}
                    {status === "signed-in" && (
                        <button type="button" onClick={handleSignOut} className="rounded-lg border border-gray-300 px-3 py-1.5 font-semibold hover:bg-gray-50">Sign out</button>
                    )}
                </div>
            </nav>
            <div className="mx-auto max-w-5xl px-6 py-8 flex flex-col gap-y-6">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h1 className="text-3xl font-bold">Workout history</h1>
                    {workoutId && <Link to="/history" className="text-green-600 font-semibold hover:underline">All workouts</Link>}
                </div>
                <p className="text-xs text-gray-500">Times shown in {browserTimeZone()}.</p>
                {status === "loading" && <p role="status">Checking sign-in…</p>}
                {status === "signed-out" && (
                    <p>
                        <Link to={`/login?next=${encodeURIComponent(here)}`} className="text-green-600 font-semibold underline">Sign in</Link> to see your saved workouts.
                    </p>
                )}
                {status === "signed-in" && token && (workoutId
                    ? <WorkoutDetail key={workoutId} workoutId={workoutId} token={token} />
                    : <WorkoutList token={token} />)}
            </div>
        </main>
    )
}

export default HistoryPage
