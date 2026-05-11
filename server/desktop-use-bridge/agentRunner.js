function createAgentRunner({ driver } = {}) {
  let cancelled = false

  return {
    ready: () => Boolean(driver),

    async runTask({ goal, maxSteps = 12 }) {
      cancelled = false
      const observation = driver?.observe ? await driver.observe() : null
      if (cancelled) return { ok: false, summary: 'desktop task cancelled', steps: [] }
      return {
        ok: true,
        summary: `Desktop task accepted: ${goal}`,
        steps: [{ type: 'observe', ok: Boolean(observation) }],
        maxSteps
      }
    },

    async cancel() {
      cancelled = true
      return { ok: true }
    }
  }
}

module.exports = { createAgentRunner }
