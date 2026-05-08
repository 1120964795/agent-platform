import { useCallback, useEffect, useState } from 'react'
import { exportAuditEvents, listAuditEvents } from '../lib/api.js'

export function useAuditLog(initialFilters = {}) {
  const [filters, setFilters] = useState(initialFilters)
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await listAuditEvents(filters)
      setEvents(result.events || [])
    } catch (err) {
      setError(err.message || '加载审计日志失败。')
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function exportLogs() {
    return exportAuditEvents(filters)
  }

  return { events, filters, setFilters, loading, error, refresh, exportLogs }
}
