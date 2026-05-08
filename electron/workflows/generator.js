function generateFromProject(payload = {}) {
  const profile = payload.projectProfile || payload.project || {}
  const projectPath = profile.path || profile.projectPath || profile.root || ''
  const stack = profile.technologyStack || profile.stack || []
  const files = new Set(profile.files || [])
  const steps = []

  if (stack.some((item) => /python/i.test(item)) || files.has('requirements.txt')) {
    steps.push({ id: 'step_check_python', type: 'check_command', title: 'Check Python version', command: 'python --version', cwd: projectPath, riskLevel: 'low', requiresConfirmation: false, source: { kind: 'project_profile', projectId: profile.id || null } })
    if (files.has('requirements.txt')) steps.push({ id: 'step_install_requirements', type: 'confirm_command', title: 'Install requirements.txt', command: 'pip install -r requirements.txt', cwd: projectPath, riskLevel: 'medium', requiresNetwork: true, requiresConfirmation: true, source: { kind: 'project_profile', projectId: profile.id || null, path: 'requirements.txt' } })
    if (files.has('app.py')) steps.push({ id: 'step_start_service', type: 'start_service', title: 'Start Python service', command: 'python app.py', cwd: projectPath, riskLevel: 'medium', requiresConfirmation: true, successPatterns: ['Running on'], errorPatterns: ['Traceback', 'ModuleNotFoundError', 'EADDRINUSE'], source: { kind: 'project_profile', projectId: profile.id || null, path: 'app.py' } })
  } else {
    steps.push({ id: 'step_git_status', type: 'safe_command', title: 'Check git status', command: 'git status --short', cwd: projectPath, riskLevel: 'low', requiresConfirmation: false, source: { kind: 'project_profile', projectId: profile.id || null } })
  }

  return {
    name: payload.name || `${profile.name || 'Project'} workflow`,
    description: payload.description || 'Generated workflow draft from project profile and experience records.',
    technologyStack: stack,
    source: { kind: 'generated_from_project', projectId: profile.id || null, projectPath },
    steps
  }
}

function generateFromRun(payload = {}) {
  const run = payload.run || payload
  const steps = (run.workflowSteps || [])
    .filter((step) => {
      const result = (run.stepResults || []).find((item) => item.stepId === step.id)
      return result?.status === 'completed' && (step.confirmedByUser || step.requiresConfirmation !== true)
    })
    .map((step) => ({
      ...step,
      enabled: step.riskLevel === 'high' ? false : step.enabled !== false,
      source: step.source || { kind: 'successful_run', runId: run.runId }
    }))
  return {
    name: payload.name || `${run.workflowId || 'Run'} workflow`,
    description: payload.description || 'Generated workflow draft from a successful run.',
    technologyStack: payload.technologyStack || [],
    source: { kind: 'generated_from_run', runId: run.runId || null },
    steps
  }
}

module.exports = { generateFromProject, generateFromRun }
