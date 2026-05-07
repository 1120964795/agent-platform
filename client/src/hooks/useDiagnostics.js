import { useCallback, useEffect, useState } from 'react'
import {
  listDiagnostics,
  getDiagnosticsStatus,
  listDiagnosticTargets,
  selectDiagnosticsRegion,
  startDiagnostics,
  stopDiagnostics,
  resumeDiagnosticsNow,
  ignoreDiagnosisSignature,
  listExperiences
} from '../lib/api.js'

function mergeById(items, nextItem, key = 'id') {
  if (!nextItem) return items
  return [
    nextItem,
    ...items.filter((item) => item?.[key] !== nextItem?.[key])
  ]
}

function mergeListById(items = [], incoming = [], key = 'id') {
  const map = new Map()
  for (const item of [...incoming, ...items]) {
    if (!item?.[key]) continue
    if (!map.has(item[key])) map.set(item[key], item)
  }
  return [...map.values()]
}

export function useDiagnostics(currentUser) {
  const username = currentUser?.username || 'guest'
  const [status, setStatus] = useState({ session: null, hasModel: false, advancedRiskExecutionEnabled: false, libraryNotice: '' })
  const [diagnostics, setDiagnostics] = useState([])
  const [experiences, setExperiences] = useState([])
  const [targets, setTargets] = useState([])
  const [loadingTargets, setLoadingTargets] = useState(false)

  const refreshStatus = useCallback(async () => {
    const result = await getDiagnosticsStatus(username)
    setStatus({
      session: result.session || null,
      hasModel: Boolean(result.hasModel),
      advancedRiskExecutionEnabled: Boolean(result.advancedRiskExecutionEnabled),
      libraryNotice: result.libraryNotice || ''
    })
    return result
  }, [username])

  const refreshDiagnostics = useCallback(async () => {
    const result = await listDiagnostics(username)
    setDiagnostics(result.items || [])
    return result
  }, [username])

  const refreshExperiences = useCallback(async (nextStatus = '') => {
    const result = await listExperiences(username, nextStatus || undefined)
    setExperiences(result.items || [])
    return result
  }, [username])

  const refreshTargets = useCallback(async () => {
    setLoadingTargets(true)
    try {
      const result = await listDiagnosticTargets()
      setTargets(result.targets || [])
      return result.targets || []
    } finally {
      setLoadingTargets(false)
    }
  }, [])

  const chooseRegion = useCallback(async () => {
    const result = await selectDiagnosticsRegion()
    return result.region || null
  }, [])

  const start = useCallback(async (payload) => {
    const result = await startDiagnostics({ ...payload, username })
    await refreshStatus()
    return result.session
  }, [refreshStatus, username])

  const stop = useCallback(async () => {
    const result = await stopDiagnostics()
    await refreshStatus()
    return result.session
  }, [refreshStatus])

  const resumeNow = useCallback(async () => {
    const result = await resumeDiagnosticsNow()
    await refreshStatus()
    return result.session
  }, [refreshStatus])

  const ignoreSignature = useCallback(async (signature) => {
    await ignoreDiagnosisSignature(signature, username)
    await refreshStatus()
  }, [refreshStatus, username])

  useEffect(() => {
    let disposed = false
    Promise.allSettled([
      refreshStatus(),
      refreshDiagnostics(),
      refreshExperiences()
    ]).catch(() => {})

    const unsubscribe = window.electronAPI?.on?.('diagnostics:event', (payload = {}) => {
      if (disposed) return

      if (payload.type === 'diagnosis-created') {
        if (payload.diagnosis?.username && payload.diagnosis.username !== username) return
        setDiagnostics((current) => mergeById(current, payload.diagnosis))
        if (payload.experience) {
          setExperiences((current) => mergeById(current, payload.experience))
        }
        refreshStatus().catch(() => {})
        window.dispatchEvent(new CustomEvent('agentdev:diagnosis-created', { detail: payload }))
      }

      if (payload.type === 'fix-executed') {
        if (payload.diagnosis?.username && payload.diagnosis.username !== username) return
        setDiagnostics((current) => mergeById(current, payload.diagnosis))
        if (payload.experience) {
          setExperiences((current) => mergeById(current, payload.experience))
        }
        refreshStatus().catch(() => {})
      }

      if (payload.type === 'popup-open-all') {
        window.dispatchEvent(new CustomEvent('agentdev:open-diagnostics', { detail: payload }))
      }

      if (payload.type === 'popup-open-diagnosis-explanation') {
        window.dispatchEvent(new CustomEvent('agentdev:open-diagnostics', { detail: {
          ...payload,
          explain: true
        } }))
      }
    })

    return () => {
      disposed = true
      unsubscribe?.()
    }
  }, [refreshDiagnostics, refreshExperiences, refreshStatus, username])

  return {
    username,
    status,
    diagnostics,
    experiences,
    targets,
    loadingTargets,
    setDiagnostics: (items) => setDiagnostics((current) => mergeListById(current, items || [])),
    setExperiences: (items) => setExperiences((current) => mergeListById(current, items || [])),
    refreshStatus,
    refreshDiagnostics,
    refreshExperiences,
    refreshTargets,
    chooseRegion,
    start,
    stop,
    resumeNow,
    ignoreSignature
  }
}

export default useDiagnostics
