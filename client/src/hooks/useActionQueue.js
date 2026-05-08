import { useCallback, useEffect, useMemo, useState } from 'react'
import { approveAction, denyAction, emergencyStop, listActions } from '../lib/api.js'

export function useActionQueue() {
  const [actions, setActions] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await listActions()
      setActions(result.actions || [])
    } catch (err) {
      setError(err.message || '加载动作队列失败。')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const handler = () => refresh()
    window.addEventListener('aionui:actions-changed', handler)
    return () => window.removeEventListener('aionui:actions-changed', handler)
  }, [refresh])

  async function approve(id) {
    await approveAction(id)
    await refresh()
  }

  async function deny(id) {
    await denyAction(id, '用户在控制中心拒绝。')
    await refresh()
  }

  async function stop() {
    await emergencyStop()
    await refresh()
  }

  const grouped = useMemo(() => {
    const groups = { pending: [], running: [], completed: [], failed: [], denied: [], blocked: [], cancelled: [] }
    for (const action of actions) {
      const key = groups[action.status] ? action.status : 'failed'
      groups[key].push(action)
    }
    return groups
  }, [actions])

  return { actions, grouped, loading, error, refresh, approve, deny, stop }
}
