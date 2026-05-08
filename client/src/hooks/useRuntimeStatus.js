import { useCallback, useEffect, useState } from 'react'
import { bootstrapRuntime, getRuntimeStatus, startRuntime, stopRuntime } from '../lib/api.js'

export function useRuntimeStatus() {
  const [runtimes, setRuntimes] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await getRuntimeStatus()
      setRuntimes(result.runtimes || [])
    } catch (err) {
      setError(err.message || '加载运行时状态失败。')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function bootstrap(runtime) {
    await bootstrapRuntime(runtime)
    await refresh()
  }

  async function start(runtime) {
    await startRuntime(runtime)
    await refresh()
  }

  async function stop(runtime) {
    await stopRuntime(runtime)
    await refresh()
  }

  return { runtimes, loading, error, refresh, bootstrap, start, stop }
}
