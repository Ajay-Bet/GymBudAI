// Same-origin development request, forwarded to FastAPI by Vite.
export async function checkHealth(signal) {
  const controller = new AbortController()
  const abort = () => controller.abort()
  let timedOut = false
  if (signal.aborted) abort()
  signal.addEventListener('abort', abort, { once: true })
  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, 5000)

  try {
    const response = await fetch('/api/health', { signal: controller.signal })
    if (!response.ok) throw new Error(`Backend returned HTTP ${response.status}.`)
    const body = await response.json()
    if (body?.status !== 'ok') throw new Error('Unexpected backend health response.')
    return body
  } catch (error) {
    if (timedOut) throw new Error('Backend health request timed out after 5 seconds.')
    throw error
  } finally {
    clearTimeout(timeout)
    signal.removeEventListener('abort', abort)
  }
}
