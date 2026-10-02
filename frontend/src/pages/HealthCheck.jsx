import { useEffect, useRef, useState } from 'react'
import { checkHealth } from '../api/health'

export default function HealthCheck() {
  const request = useRef(null)
  const [state, setState] = useState('idle')
  const [message, setMessage] = useState('Ready to check the local backend.')

  useEffect(() => () => request.current?.abort(), [])

  async function runCheck() {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setState('loading')
    setMessage('Checking FastAPI…')

    try {
      await checkHealth(controller.signal)
      if (controller.signal.aborted) return
      setState('success')
      setMessage('Connected to FastAPI. Backend status: ok.')
    } catch (error) {
      if (controller.signal.aborted) return
      setState('error')
      setMessage(`Health check failed: ${error.message} Confirm FastAPI is running on port 8080, then retry.`)
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 p-8 text-white">
      <div className="mx-auto max-w-xl space-y-6">
        <h1 className="text-3xl font-bold">Development health check</h1>
        <p>Check that React can reach the local FastAPI backend through the Vite development proxy.</p>
        <button
          type="button"
          onClick={runCheck}
          disabled={state === 'loading'}
          className="rounded bg-blue-600 px-4 py-2 font-semibold disabled:opacity-50"
        >
          {state === 'loading' ? 'Checking…' : 'Check backend'}
        </button>
        <p role="status" aria-live="polite" data-health-state={state}>{message}</p>
        <a className="inline-block underline" href="/">Back to GymBud</a>
      </div>
    </main>
  )
}
