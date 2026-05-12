import { useCallback, useEffect, useState } from 'react'
import { deleteScheduledTask, listScheduledTasks, runScheduledTaskNow, updateScheduledTask } from '../lib/api.js'

export function useScheduledTasks() {
  const [scheduledTasks, setScheduledTasks] = useState([])
  const [loading, setLoading] = useState(false)

  const refreshScheduledTasks = useCallback(async () => {
    setLoading(true)
    try {
      const result = await listScheduledTasks()
      setScheduledTasks(result.tasks || [])
    } catch (error) {
      console.error('[useScheduledTasks] load failed:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  const setEnabled = useCallback(async (id, enabled) => {
    const result = await updateScheduledTask(id, { enabled })
    setScheduledTasks(current => current.map(task => task.id === id ? result.task : task))
    window.dispatchEvent(new CustomEvent('aionui:scheduled-tasks-changed'))
  }, [])

  const removeScheduledTask = useCallback(async (id) => {
    await deleteScheduledTask(id)
    setScheduledTasks(current => current.filter(task => task.id !== id))
    window.dispatchEvent(new CustomEvent('aionui:scheduled-tasks-changed'))
  }, [])

  const runNow = useCallback(async (id) => {
    const result = await runScheduledTaskNow(id)
    await refreshScheduledTasks()
    return result
  }, [refreshScheduledTasks])

  useEffect(() => {
    refreshScheduledTasks()
  }, [refreshScheduledTasks])

  useEffect(() => {
    const handler = () => refreshScheduledTasks()
    window.addEventListener('aionui:scheduled-tasks-changed', handler)
    return () => window.removeEventListener('aionui:scheduled-tasks-changed', handler)
  }, [refreshScheduledTasks])

  return { scheduledTasks, loading, refreshScheduledTasks, setEnabled, removeScheduledTask, runNow }
}
