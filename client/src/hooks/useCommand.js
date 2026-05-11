import { useCallback, useState } from 'react'
import { matchSkillCommands } from '../lib/commands.js'

export function useCommand(skills = []) {
  const [active, setActive] = useState(false)
  const [matches, setMatches] = useState([])
  const [index, setIndex] = useState(0)

  const update = useCallback((text) => {
    if (text.startsWith('/')) {
      const nextMatches = matchSkillCommands(text, skills)
      setActive(nextMatches.length > 0)
      setMatches(nextMatches)
      setIndex(0)
      return
    }

    setActive(false)
    setMatches([])
    setIndex(0)
  }, [skills])

  const close = useCallback(() => {
    setActive(false)
    setMatches([])
    setIndex(0)
  }, [])

  const next = useCallback(() => {
    setIndex(current => (current + 1) % Math.max(1, matches.length))
  }, [matches.length])

  const prev = useCallback(() => {
    setIndex(current => (current - 1 + matches.length) % Math.max(1, matches.length))
  }, [matches.length])

  const choose = useCallback((onSelect) => {
    const command = matches[index]
    if (!active || !command) return false
    onSelect?.(command)
    close()
    return true
  }, [active, close, index, matches])

  const handleKeyDown = useCallback((event, onSelect) => {
    if (!active) return false

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      next()
      return true
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      prev()
      return true
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      return choose(onSelect)
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      close()
      return true
    }

    return false
  }, [active, choose, close, next, prev])

  return {
    active,
    matches,
    index,
    setIndex,
    update,
    close,
    next,
    prev,
    choose,
    handleKeyDown
  }
}
