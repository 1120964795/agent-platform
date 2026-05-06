function suggestFromFailure(step, result) {
  const output = `${result?.stdoutTail || ''}\n${result?.stderrTail || ''}`
  const match = output.match(/(?:EADDRINUSE|address already in use).*?(\d{3,5})/i) || output.match(/:(\d{3,5})/)
  if (!match) return null
  const port = match[1]
  return {
    id: `suggestion_check_port_${port}`,
    reason: `Detected possible port ${port} conflict.`,
    suggestedStep: {
      id: `temp_check_port_${port}`,
      type: 'check_command',
      title: `Check port ${port}`,
      command: `netstat -ano | findstr :${port}`,
      cwd: step.cwd,
      riskLevel: 'low',
      requiresConfirmation: false
    },
    scope: 'current_run_only'
  }
}

module.exports = { suggestFromFailure }
