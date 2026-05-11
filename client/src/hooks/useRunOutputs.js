import { useCallback, useEffect, useState } from 'react'
import { exportRunOutputs, listRunOutputs, openRunOutput } from '../lib/api.js'

export function useRunOutputs(initialFilters = {}) {
  const [filters, setFilters] = useState(initialFilters)
  const [outputs, setOutputs] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await listRunOutputs(filters)
      setOutputs(result.outputs || [])
    } catch (err) {
      setError(err.message || '加载运行输出失败。')
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function open(output) {
    if (output?.path) await openRunOutput(output.path)
  }

  async function exportOutputs() {
    return exportRunOutputs(filters)
  }

  return { outputs, filters, setFilters, loading, error, refresh, open, exportOutputs }
}
