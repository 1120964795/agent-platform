import { test, expect, vi } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { createStreamEvent, getProvider, runTurn } = require('../services/agentLoop')

function mockDeepseek(responses) {
  let call = 0
  const chat = async ({ messages, tools, signal }) => {
    const r = responses[call]
    call += 1
    if (!r) return { content: 'done', assistant_message: { role: 'assistant', content: 'done' }, tool_calls: [] }
    return r
  }
  return { chat }
}

function mockTools(results) {
  return {
    execute: vi.fn(async (name, args, context) => {
      return results[name] || `OK: ${name}`
    }),
    getAgentLoopToolSchemas: vi.fn(() => ([
      { type: 'function', function: { name: 'read_file', description: 'Read a file', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } } }
    ]))
  }
}

function mockPolicy(decisions) {
  return {
    evaluateToolCall: vi.fn((name, args) => {
      return decisions[name] || { risk: 'low', reason: 'ok', allowed: true, requiresApproval: false }
    })
  }
}

test('no tool calls → returns immediately', async () => {
  const deepseek = mockDeepseek([
    { content: 'Hello!', assistant_message: { role: 'assistant', content: 'Hello!' }, tool_calls: [] }
  ])
  const tools = mockTools({})
  const policy = mockPolicy({})

  const result = await runTurn({ messages: [{ role: 'user', content: 'hi' }] }, { deepseek, tools, policy })

  expect(result.finalText).toBe('Hello!')
  expect(deepseek).toBeDefined()
})

test('legacy non-DeepSeek model aliases fall back to DeepSeek chat', () => {
  const deepseek = { chat: vi.fn() }

  expect(getProvider('legacy-vision', { deepseek })).toEqual({ model: 'deepseek-chat', chat: deepseek.chat })
  expect(getProvider('ep-20260510143244-hjcjf', { deepseek })).toEqual({ model: 'deepseek-chat', chat: deepseek.chat })
  expect(getProvider('deepseek-coder', { deepseek })).toEqual({ model: 'deepseek-coder', chat: deepseek.chat })
})

test('runTurn sends legacy model aliases through DeepSeek fallback', async () => {
  const deepseek = {
    chat: vi.fn(async ({ model }) => ({
      content: `model:${model}`,
      assistant_message: { role: 'assistant', content: `model:${model}` },
      tool_calls: []
    }))
  }
  const tools = { getAgentLoopToolSchemas: vi.fn(() => []) }
  const policy = mockPolicy({})

  const result = await runTurn(
    { messages: [{ role: 'user', content: 'hi' }], model: 'legacy-vision' },
    { deepseek, tools, policy }
  )

  expect(deepseek.chat).toHaveBeenCalledWith(expect.objectContaining({ model: 'deepseek-chat' }))
  expect(result.finalText).toBe('model:deepseek-chat')
})

test('single tool call → executed → result fed back → finishes', async () => {
  const deepseek = mockDeepseek([
    {
      content: null,
      assistant_message: { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'read_file', arguments: '{"path":"C:/Users/g/Desktop/foo.txt"}' } }] },
      tool_calls: [{ id: 'c1', name: 'read_file', args: { path: 'C:/Users/g/Desktop/foo.txt' }, raw: {} }]
    },
    { content: 'File contents are: hello', assistant_message: { role: 'assistant', content: 'File contents are: hello' }, tool_calls: [] }
  ])
  const tools = mockTools({ read_file: 'hello' })
  const policy = mockPolicy({ read_file: { risk: 'low', reason: 'reading file', allowed: true, requiresApproval: false } })

  const events = []
  const result = await runTurn(
    { messages: [{ role: 'user', content: 'read foo.txt' }], onEvent: (type, data) => events.push({ type, ...data }) },
    { deepseek, tools, policy }
  )

  expect(tools.execute).toHaveBeenCalledWith('read_file', { path: 'C:/Users/g/Desktop/foo.txt' }, expect.objectContaining({ skipInternalConfirm: true }))
  expect(result.finalText).toBe('File contents are: hello')
  expect(events.some(e => e.type === 'assistant_message')).toBe(true)
  expect(events.some(e => e.type === 'tool_result')).toBe(true)
})

test('blocked tool → POLICY_BLOCKED appended, execute NOT called', async () => {
  const deepseek = mockDeepseek([
    {
      content: null,
      assistant_message: { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'read_file', arguments: '{"path":"C:/Windows/System32/SAM"}' } }] },
      tool_calls: [{ id: 'c1', name: 'read_file', args: { path: 'C:/Windows/System32/SAM' }, raw: {} }]
    },
    { content: 'Blocked, cannot read that.', assistant_message: { role: 'assistant', content: 'Blocked, cannot read that.' }, tool_calls: [] }
  ])
  const tools = mockTools({})
  const policy = mockPolicy({ read_file: { risk: 'blocked', reason: '系统路径已被阻止。', allowed: false, requiresApproval: false } })

  const events = []
  const result = await runTurn(
    { messages: [{ role: 'user', content: 'read SAM' }], onEvent: (type, data) => events.push({ type, ...data }) },
    { deepseek, tools, policy }
  )

  expect(tools.execute).not.toHaveBeenCalled()
  expect(events.some(e => e.type === 'tool_blocked')).toBe(true)
  expect(events.find(e => e.type === 'tool_blocked').call.name).toBe('read_file')
  expect(result.finalText).toBe('Blocked, cannot read that.')
})

test('approval-required tool → denied → USER_DENIED appended', async () => {
  const deepseek = mockDeepseek([
    {
      content: null,
      assistant_message: { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'run_shell_command', arguments: '{"command":"npm install react"}' } }] },
      tool_calls: [{ id: 'c1', name: 'run_shell_command', args: { command: 'npm install react' }, raw: {} }]
    },
    { content: 'Install denied by user.', assistant_message: { role: 'assistant', content: 'Install denied by user.' }, tool_calls: [] }
  ])
  const tools = mockTools({})
  const policy = mockPolicy({ run_shell_command: { risk: 'high', reason: 'install', allowed: true, requiresApproval: true } })

  let approvalRequested = null
  const result = await runTurn(
    {
      messages: [{ role: 'user', content: 'install react' }],
      requestApproval: async (req) => {
        approvalRequested = req
        return false // denied
      }
    },
    { deepseek, tools, policy }
  )

  expect(approvalRequested).not.toBeNull()
  expect(approvalRequested.call.name).toBe('run_shell_command')
  expect(tools.execute).not.toHaveBeenCalled()
})

test('medium-risk tool executes directly without approval', async () => {
  const deepseek = mockDeepseek([
    {
      content: null,
      assistant_message: { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'run_shell_command', arguments: '{"command":"echo hi"}' } }] },
      tool_calls: [{ id: 'c1', name: 'run_shell_command', args: { command: 'echo hi' }, raw: {} }]
    },
    { content: 'Command ran successfully.', assistant_message: { role: 'assistant', content: 'Command ran successfully.' }, tool_calls: [] }
  ])
  const tools = mockTools({ run_shell_command: 'hi' })
  const policy = mockPolicy({ run_shell_command: { risk: 'medium', reason: 'shell', allowed: true, requiresApproval: false } })
  const requestApproval = vi.fn(async () => true)

  await runTurn(
    {
      messages: [{ role: 'user', content: 'run echo' }],
      requestApproval
    },
    { deepseek, tools, policy }
  )

  expect(requestApproval).not.toHaveBeenCalled()
  expect(tools.execute).toHaveBeenCalledWith('run_shell_command', { command: 'echo hi' }, expect.objectContaining({ skipInternalConfirm: true }))
})

test('preauthorized scheduled run executes approval-required tools without prompting', async () => {
  const deepseek = mockDeepseek([
    {
      content: null,
      assistant_message: { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'run_shell_command', arguments: '{"command":"npm install left-pad"}' } }] },
      tool_calls: [{ id: 'c1', name: 'run_shell_command', args: { command: 'npm install left-pad' }, raw: {} }]
    },
    { content: 'Installed.', assistant_message: { role: 'assistant', content: 'Installed.' }, tool_calls: [] }
  ])
  const tools = mockTools({ run_shell_command: 'installed' })
  const policy = mockPolicy({ run_shell_command: { risk: 'high', reason: 'install', allowed: true, requiresApproval: true } })
  const requestApproval = vi.fn(async () => false)

  const result = await runTurn(
    {
      messages: [{ role: 'user', content: 'install package' }],
      preauthorized: true,
      requestApproval
    },
    { deepseek, tools, policy }
  )

  expect(requestApproval).not.toHaveBeenCalled()
  expect(tools.execute).toHaveBeenCalledWith('run_shell_command', { command: 'npm install left-pad' }, expect.objectContaining({ skipInternalConfirm: true }))
  expect(result.finalText).toBe('Installed.')
})

test('signal aborted mid-invoke → returns cancelled, no further model calls', async () => {
  const controller = new AbortController()
  let callCount = 0
  const deepseek = { chat: async ({ messages, tools, signal }) => {
    callCount += 1
    if (callCount === 1) {
      return {
        content: null,
        assistant_message: { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'run_shell_command', arguments: '{"command":"sleep 30"}' } }] },
        tool_calls: [{ id: 'c1', name: 'run_shell_command', args: { command: 'sleep 30' }, raw: {} }]
      }
    }
    return { content: 'should not reach', assistant_message: { role: 'assistant', content: 'should not reach' }, tool_calls: [] }
  } }

  const tools = {
    execute: vi.fn(async (name, args, context) => {
      // Abort during execution
      context.signal.addEventListener('abort', () => {
        // Signal received
      })
      controller.abort()
      throw Object.assign(new Error('aborted'), { name: 'AbortError' })
    }),
    getAgentLoopToolSchemas: vi.fn(() => [])
  }

  const policy = mockPolicy({ run_shell_command: { risk: 'medium', reason: 'shell', allowed: true, requiresApproval: false } })

  const result = await runTurn(
    { messages: [{ role: 'user', content: 'sleep' }], signal: controller.signal },
    { deepseek, tools, policy }
  )

  expect(result.finalText).toBe('操作已取消')
  expect(callCount).toBe(1) // no second model call
})

test('MAX_STEPS reached → returns step-limit message', async () => {
  let callCount = 0
  const deepseek = { chat: async ({ messages, tools, signal }) => {
    callCount += 1
    return {
      content: null,
      assistant_message: { role: 'assistant', content: null, tool_calls: [{ id: `c${callCount}`, type: 'function', function: { name: 'read_file', arguments: '{"path":"foo.txt"}' } }] },
      tool_calls: [{ id: `c${callCount}`, name: 'read_file', args: { path: 'foo.txt' }, raw: {} }]
    }
  } }
  const tools = mockTools({ read_file: 'content' })
  const policy = mockPolicy({ read_file: { risk: 'low', reason: 'ok', allowed: true, requiresApproval: false } })

  const result = await runTurn(
    { messages: [{ role: 'user', content: 'read foo' }] },
    { deepseek, tools, policy }
  )

  expect(result.finalText).toMatch(/步/)
  expect(callCount).toBe(30)
})

test('tool throws non-abort error → error appended, loop continues', async () => {
  const deepseek = mockDeepseek([
    {
      content: null,
      assistant_message: { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'write_file', arguments: '{"path":"C:/locked/file.txt"}' } }] },
      tool_calls: [{ id: 'c1', name: 'write_file', args: { path: 'C:/locked/file.txt' }, raw: {} }]
    },
    { content: 'Failed to write.', assistant_message: { role: 'assistant', content: 'Failed to write.' }, tool_calls: [] }
  ])
  const tools = {
    execute: vi.fn(async () => { throw new Error('Permission denied') }),
    getAgentLoopToolSchemas: vi.fn(() => [])
  }
  const policy = mockPolicy({ write_file: { risk: 'medium', reason: 'write', allowed: true, requiresApproval: false } })

  const result = await runTurn(
    { messages: [{ role: 'user', content: 'write file' }] },
    { deepseek, tools, policy }
  )

  expect(result.finalText).toBe('Failed to write.')
})

test('tool returning ok false emits tool_error and feeds diagnostic error to model', async () => {
  const deepseek = mockDeepseek([
    {
      content: null,
      assistant_message: { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'browser_task', arguments: '{"goal":"Open https://example.com","start_url":"https://example.com"}' } }] },
      tool_calls: [{ id: 'c1', name: 'browser_task', args: { goal: 'Open https://example.com', start_url: 'https://example.com' }, raw: {} }]
    },
    { content: 'Browser task did not return a usable result.', assistant_message: { role: 'assistant', content: 'Browser task did not return a usable result.' }, tool_calls: [] }
  ])
  const failedResult = {
    ok: false,
    summary: 'browser-use did not return a usable page result.',
    final_url: 'about:blank',
    error: { code: 'BROWSER_TASK_INCOMPLETE', message: 'summary_missing, final_url_about_blank' },
    diagnostics: { issues: ['summary_missing', 'final_url_about_blank'] }
  }
  const tools = {
    execute: vi.fn(async () => failedResult),
    getAgentLoopToolSchemas: vi.fn(() => [])
  }
  const policy = mockPolicy({ browser_task: { risk: 'medium', reason: 'browser', allowed: true, requiresApproval: false } })
  const events = []

  const result = await runTurn(
    { messages: [{ role: 'user', content: 'open example.com' }], onEvent: (type, data) => events.push({ type, ...data }) },
    { deepseek, tools, policy }
  )

  expect(events.some(e => e.type === 'tool_error' && e.error.code === 'BROWSER_TASK_INCOMPLETE')).toBe(true)
  expect(events.some(e => e.type === 'tool_result')).toBe(false)
  expect(result.history[2].role).toBe('tool')
  expect(result.history[2].content).toContain('ERROR: BROWSER_TASK_INCOMPLETE')
  expect(result.finalText).toBe('Browser task did not return a usable result.')
})

test('repeated tool approval includes previous failure summary', async () => {
  const toolCallArgs = { goal: 'Open https://example.com', start_url: 'https://example.com' }
  const deepseek = mockDeepseek([
    {
      content: null,
      assistant_message: { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'browser_task', arguments: JSON.stringify(toolCallArgs) } }] },
      tool_calls: [{ id: 'c1', name: 'browser_task', args: toolCallArgs, raw: {} }]
    },
    {
      content: null,
      assistant_message: { role: 'assistant', content: null, tool_calls: [{ id: 'c2', type: 'function', function: { name: 'browser_task', arguments: JSON.stringify(toolCallArgs) } }] },
      tool_calls: [{ id: 'c2', name: 'browser_task', args: toolCallArgs, raw: {} }]
    },
    { content: 'Still failed.', assistant_message: { role: 'assistant', content: 'Still failed.' }, tool_calls: [] }
  ])
  const failedResult = {
    ok: false,
    error: { code: 'BROWSER_TASK_INCOMPLETE', message: 'final_url_about_blank' }
  }
  const tools = {
    execute: vi.fn(async () => failedResult),
    getAgentLoopToolSchemas: vi.fn(() => [])
  }
  const policy = mockPolicy({ browser_task: { risk: 'medium', reason: 'browser', allowed: true, requiresApproval: true } })
  const events = []
  const approvalRequests = []

  await runTurn(
    {
      messages: [{ role: 'user', content: 'open example.com' }],
      requestApproval: async (request) => {
        approvalRequests.push(request)
        return true
      },
      onEvent: (type, data) => events.push({ type, ...data })
    },
    { deepseek, tools, policy }
  )

  const approvals = events.filter(e => e.type === 'approval_request')
  expect(approvals).toHaveLength(2)
  expect(approvals[0].retry).toBeUndefined()
  expect(approvals[1].retry).toEqual({
    attempt: 2,
    previousError: { code: 'BROWSER_TASK_INCOMPLETE', message: 'final_url_about_blank' }
  })
  expect(approvalRequests).toHaveLength(2)
  expect(approvalRequests[0].retry).toBeUndefined()
  expect(approvalRequests[1].retry).toEqual({
    attempt: 2,
    previousError: { code: 'BROWSER_TASK_INCOMPLETE', message: 'final_url_about_blank' }
  })
})

test('preserves conversation history through tool turns', async () => {
  const deepseek = mockDeepseek([
    {
      content: null,
      assistant_message: { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'read_file', arguments: '{"path":"notes.txt"}' } }] },
      tool_calls: [{ id: 'c1', name: 'read_file', args: { path: 'notes.txt' }, raw: {} }]
    },
    { content: 'File says: hello world', assistant_message: { role: 'assistant', content: 'File says: hello world' }, tool_calls: [] }
  ])
  const tools = mockTools({ read_file: 'hello world' })
  const policy = mockPolicy({ read_file: { risk: 'low', reason: 'ok', allowed: true, requiresApproval: false } })

  const result = await runTurn(
    { messages: [{ role: 'user', content: 'read notes' }] },
    { deepseek, tools, policy }
  )

  expect(result.history).toBeDefined()
  expect(result.history.length).toBe(4) // user, assistant(tool_call), tool(result), assistant(final)
  expect(result.history[2].role).toBe('tool')
  expect(result.history[2].content).toBe('hello world')
})

test('passes skipInternalConfirm to tools.execute', async () => {
  const deepseek = mockDeepseek([
    {
      content: null,
      assistant_message: { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'write_file', arguments: '{"path":"foo.txt","content":"hi"}' } }] },
      tool_calls: [{ id: 'c1', name: 'write_file', args: { path: 'foo.txt', content: 'hi' }, raw: {} }]
    },
    { content: 'Done.', assistant_message: { role: 'assistant', content: 'Done.' }, tool_calls: [] }
  ])
  const tools = mockTools({ write_file: { path: 'foo.txt', bytes_written: 2 } })
  const policy = mockPolicy({ write_file: { risk: 'medium', reason: 'write', allowed: true, requiresApproval: false } })

  await runTurn(
    { messages: [{ role: 'user', content: 'write file' }] },
    { deepseek, tools, policy }
  )

  expect(tools.execute).toHaveBeenCalledWith('write_file', { path: 'foo.txt', content: 'hi' }, expect.objectContaining({ skipInternalConfirm: true }))
})

test('desktop_task streams desktop events while tool is running', async () => {
  const streamEvents = []
  const desktopEvent = { type: 'observe', summary: 'Looking at desktop' }
  const tools = {
    getAgentLoopToolSchemas: () => [],
    execute: vi.fn(async (_name, _args, context) => {
      context.onDesktopEvent(desktopEvent)
      return { goal: 'open', metadata: { summary: 'done' } }
    })
  }
  const policy = mockPolicy({ desktop_task: { risk: 'low', reason: 'desktop', allowed: true, requiresApproval: false } })

  await runTurn({
    messages: [{ role: 'user', content: 'open notepad' }],
    forceTool: 'desktop_task',
    convId: 'conv-desktop',
    onStreamEvent: event => streamEvents.push(event),
    requestApproval: async () => true
  }, { tools, policy })

  expect(streamEvents).toContainEqual(expect.objectContaining({
    type: 'desktop_event',
    summary: 'Looking at desktop',
    desktopEvent
  }))
})

test('returns history on abort for audit trail', async () => {
  const controller = new AbortController()
  const deepseek = mockDeepseek([
    {
      content: null,
      assistant_message: { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'read_file', arguments: '{"path":"foo.txt"}' } }] },
      tool_calls: [{ id: 'c1', name: 'read_file', args: { path: 'foo.txt' }, raw: {} }]
    }
  ])

  const tools = {
    execute: vi.fn(async (name, args, context) => {
      controller.abort()
      throw Object.assign(new Error('aborted'), { name: 'AbortError' })
    }),
    getAgentLoopToolSchemas: vi.fn(() => [])
  }

  const policy = mockPolicy({ read_file: { risk: 'low', reason: 'ok', allowed: true, requiresApproval: false } })

  const result = await runTurn(
    { messages: [{ role: 'user', content: 'read foo' }], signal: controller.signal },
    { deepseek, tools, policy }
  )

  expect(result.finalText).toBe('操作已取消')
  expect(result.history.length).toBeGreaterThanOrEqual(2) // user + assistant at minimum
})

test('browser plugin mode creates a browser_task tool call', async () => {
  const deepseek = mockDeepseek([
    { content: 'Browser summary', assistant_message: { role: 'assistant', content: 'Browser summary' }, tool_calls: [] }
  ])
  const tools = {
    execute: vi.fn(async () => ({ ok: true, summary: 'Example Domain' })),
    getAgentLoopToolSchemas: vi.fn(() => [])
  }
  const policy = mockPolicy({ browser_task: { risk: 'medium', reason: 'browser', allowed: true, requiresApproval: false } })

  await runTurn(
    {
      messages: [{ role: 'user', content: '打开 https://example.com 看标题' }],
      model: 'browser-use',
      forceTool: 'browser_task',
    },
    { deepseek, tools, policy }
  )

  expect(tools.execute).toHaveBeenCalledWith('browser_task', expect.objectContaining({
    goal: expect.stringContaining('https://example.com')
  }), expect.objectContaining({ skipInternalConfirm: true }))
})

test('desktop plugin mode creates a desktop_task tool call', async () => {
  const deepseek = mockDeepseek([
    { content: 'Desktop summary', assistant_message: { role: 'assistant', content: 'Desktop summary' }, tool_calls: [] }
  ])
  const tools = {
    execute: vi.fn(async () => ({ ok: true, metadata: { summary: 'Notepad opened' } })),
    getAgentLoopToolSchemas: vi.fn(() => [])
  }
  const policy = mockPolicy({ desktop_task: { risk: 'high', reason: 'desktop automation', allowed: true, requiresApproval: true } })
  const requestApproval = vi.fn(async () => true)

  await runTurn(
    {
      messages: [{ role: 'user', content: 'Open Notepad and type hello' }],
      forceTool: 'desktop_task',
      requestApproval,
    },
    { deepseek, tools, policy }
  )

  expect(requestApproval).toHaveBeenCalledWith(expect.objectContaining({
    call: expect.objectContaining({ name: 'desktop_task' })
  }))
  expect(requestApproval).toHaveBeenCalledWith(expect.objectContaining({
    call: expect.objectContaining({
      name: 'desktop_task',
      args: expect.objectContaining({ max_steps: 30 })
    })
  }))
  expect(tools.execute).toHaveBeenCalledWith('desktop_task', expect.objectContaining({
    goal: 'Open Notepad and type hello',
    max_steps: 30
  }), expect.objectContaining({ skipInternalConfirm: true }))
})

test('desktop plugin mode finishes from the desktop task result without another model turn', async () => {
  const deepseek = {
    chat: vi.fn(async () => {
      throw new Error('model should not be called after forced desktop task')
    })
  }
  const tools = {
    execute: vi.fn(async () => ({ ok: true, metadata: { summary: 'QQ opened' } })),
    getAgentLoopToolSchemas: vi.fn(() => [])
  }
  const policy = mockPolicy({ desktop_task: { risk: 'high', reason: 'desktop automation', allowed: true, requiresApproval: true } })

  const result = await runTurn(
    {
      messages: [{ role: 'user', content: 'Open QQ' }],
      forceTool: 'desktop_task',
      requestApproval: async () => true
    },
    { deepseek, tools, policy }
  )

  expect(result.finalText).toBe('QQ opened')
  expect(deepseek.chat).not.toHaveBeenCalled()
  expect(tools.getAgentLoopToolSchemas).not.toHaveBeenCalled()
})

test('desktop forced tool reasoning names Computer Use instead of browser', async () => {
  const events = []
  const deepseek = {
    chat: vi.fn(async () => ({ content: 'unused', assistant_message: { role: 'assistant', content: 'unused' }, tool_calls: [] }))
  }
  const tools = {
    execute: vi.fn(async () => ({ ok: true, metadata: { summary: 'done' } })),
    getAgentLoopToolSchemas: vi.fn(() => [])
  }
  const policy = mockPolicy({ desktop_task: { risk: 'medium', reason: 'desktop', allowed: true, requiresApproval: false } })

  await runTurn({
    messages: [{ role: 'user', content: 'open qq' }],
    forceTool: 'desktop_task',
    onStreamEvent: event => events.push(event)
  }, { deepseek, tools, policy })

  const text = events.find(event => event.type === 'reasoning_summary')?.text || ''
  expect(text).toContain('Computer Use')
  expect(text).not.toContain('浏览器')
})

test('forcedSkill loads the skill before the normal model turn', async () => {
  const calls = []
  let chatMessages = null
  const deepseek = {
    chat: vi.fn(async ({ messages }) => {
      chatMessages = messages
      calls.push(['chat', messages.map((message) => message.role)])
      return { content: 'Used skill.', assistant_message: { role: 'assistant', content: 'Used skill.' }, tool_calls: [] }
    })
  }
  const tools = {
    execute: vi.fn(async (name, args, context) => {
      calls.push(['tool', name, args, context.convId])
      return { name: args.name, content: '# Skill body' }
    }),
    getAgentLoopToolSchemas: vi.fn(() => [])
  }
  const policy = mockPolicy({ load_skill: { risk: 'low', reason: 'skill', allowed: true, requiresApproval: false } })

  const result = await runTurn(
    { convId: 'conv-skill', messages: [{ role: 'user', content: 'write tests' }], forcedSkill: 'superpowers' },
    { deepseek, tools, policy }
  )

  expect(calls[0]).toEqual(['tool', 'load_skill', { name: 'superpowers' }, 'conv-skill'])
  expect(calls[1][0]).toBe('chat')
  const skillCallMessage = chatMessages.find((message) => (
    message.role === 'assistant' &&
    message.tool_calls?.[0]?.function?.name === 'load_skill'
  ))
  expect(skillCallMessage).toBeDefined()
  const skillToolMessage = chatMessages.find((message) => (
    message.role === 'tool' &&
    message.tool_call_id === skillCallMessage.tool_calls[0].id
  ))
  expect(skillToolMessage).toBeDefined()
  expect(skillToolMessage.content).toContain('# Skill body')
  expect(result.finalText).toBe('Used skill.')
})

test('forcedSkill load failure stops before model and browser work', async () => {
  const events = []
  const deepseek = {
    chat: vi.fn(async () => ({
      content: 'should not run',
      assistant_message: { role: 'assistant', content: 'should not run' },
      tool_calls: []
    }))
  }
  const tools = {
    execute: vi.fn(async (name) => {
      if (name === 'load_skill') return { error: { code: 'PATH_NOT_FOUND', message: 'missing skill' } }
      return { ok: true, summary: 'Example Domain' }
    }),
    getAgentLoopToolSchemas: vi.fn(() => [])
  }
  const policy = mockPolicy({
    load_skill: { risk: 'low', reason: 'skill', allowed: true, requiresApproval: false },
    browser_task: { risk: 'medium', reason: 'browser', allowed: true, requiresApproval: false }
  })

  const result = await runTurn(
    {
      convId: 'conv-skill-fail',
      messages: [{ role: 'user', content: 'open https://example.com' }],
      forcedSkill: 'superpowers',
      forceTool: 'browser_task',
      onEvent: (type, data) => events.push({ type, ...data })
    },
    { deepseek, tools, policy }
  )

  expect(result.finalText).toBe('Unable to load forced skill superpowers: missing skill')
  expect(deepseek.chat).not.toHaveBeenCalled()
  expect(tools.execute).toHaveBeenCalledTimes(1)
  expect(tools.execute).toHaveBeenCalledWith('load_skill', { name: 'superpowers' }, expect.any(Object))
  expect(events.some((event) => event.type === 'tool_error' && event.error.code === 'PATH_NOT_FOUND')).toBe(true)
  expect(result.history.some((message) => message.role === 'tool' && message.content.includes('PATH_NOT_FOUND'))).toBe(true)
})

test('forcedSkill already_loaded without prior skill history stops before model work', async () => {
  const loadSkillResults = [
    { name: 'superpowers', content: '# Skill body' },
    { name: 'superpowers', already_loaded: true, content: '' }
  ]
  const deepseek = {
    chat: vi.fn(async () => {
      const content = deepseek.chat.mock.calls.length === 1 ? 'First done.' : 'should not run'
      return {
        content,
        assistant_message: { role: 'assistant', content },
        tool_calls: []
      }
    })
  }
  const tools = {
    execute: vi.fn(async () => loadSkillResults.shift()),
    getAgentLoopToolSchemas: vi.fn(() => [])
  }
  const policy = mockPolicy({ load_skill: { risk: 'low', reason: 'skill', allowed: true, requiresApproval: false } })

  const first = await runTurn(
    {
      convId: 'conv-skill-cache',
      messages: [{ role: 'user', content: 'first task' }],
      forcedSkill: 'superpowers'
    },
    { deepseek, tools, policy }
  )
  const result = await runTurn(
    {
      convId: 'conv-skill-cache',
      messages: [{ role: 'user', content: 'second task' }],
      forcedSkill: 'superpowers'
    },
    { deepseek, tools, policy }
  )

  expect(first.finalText).toBe('First done.')
  expect(result.finalText).toBe('Unable to load forced skill superpowers: cached skill content is unavailable.')
  expect(deepseek.chat).toHaveBeenCalledTimes(1)
  expect(tools.execute).toHaveBeenCalledWith('load_skill', { name: 'superpowers' }, expect.any(Object))
})

test('forcedSkill and browser forceTool run in skill then browser order', async () => {
  const order = []
  const deepseek = mockDeepseek([
    { content: 'Browser summary', assistant_message: { role: 'assistant', content: 'Browser summary' }, tool_calls: [] }
  ])
  const tools = {
    execute: vi.fn(async (name, args) => {
      order.push(name)
      return name === 'load_skill' ? { name: args.name, content: '# Browser skill' } : { ok: true, summary: 'Example Domain' }
    }),
    getAgentLoopToolSchemas: vi.fn(() => [])
  }
  const policy = mockPolicy({
    load_skill: { risk: 'low', reason: 'skill', allowed: true, requiresApproval: false },
    browser_task: { risk: 'medium', reason: 'browser', allowed: true, requiresApproval: false }
  })

  await runTurn(
    {
      convId: 'conv-browser-skill',
      messages: [{ role: 'user', content: 'open https://example.com' }],
      forcedSkill: 'browser-skill',
      forceTool: 'browser_task'
    },
    { deepseek, tools, policy }
  )

  expect(order).toEqual(['load_skill', 'browser_task'])
})

test('forcedSkill and desktop forceTool run in skill then desktop order', async () => {
  const order = []
  const deepseek = mockDeepseek([
    { content: 'Desktop summary', assistant_message: { role: 'assistant', content: 'Desktop summary' }, tool_calls: [] }
  ])
  const tools = {
    execute: vi.fn(async (name, args) => {
      order.push(name)
      return name === 'load_skill' ? { name: args.name, content: '# Desktop skill' } : { ok: true, metadata: { summary: 'Done' } }
    }),
    getAgentLoopToolSchemas: vi.fn(() => [])
  }
  const policy = mockPolicy({
    load_skill: { risk: 'low', reason: 'skill', allowed: true, requiresApproval: false },
    desktop_task: { risk: 'high', reason: 'desktop automation', allowed: true, requiresApproval: true }
  })

  await runTurn(
    {
      convId: 'conv-desktop-skill',
      messages: [{ role: 'user', content: 'open notepad' }],
      forcedSkill: 'desktop-skill',
      forceTool: 'desktop_task',
      requestApproval: async () => true
    },
    { deepseek, tools, policy }
  )

  expect(order).toEqual(['load_skill', 'desktop_task'])
})

test('agent loop emits user-visible reasoning and tool stream events', async () => {
  const streamEvent = createStreamEvent('reasoning_summary', {
    text: '我正在判断用户意图并准备需要的工具。',
    ts: 1,
    id: 'reasoning-1',
  })

  expect(streamEvent).toEqual({
    id: 'reasoning-1',
    type: 'reasoning_summary',
    ts: 1,
    text: '我正在判断用户意图并准备需要的工具。',
  })

  const deepseek = mockDeepseek([
    {
      content: null,
      assistant_message: { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'browser_task', arguments: '{"goal":"Open https://example.com"}' } }] },
      tool_calls: [{ id: 'c1', name: 'browser_task', args: { goal: 'Open https://example.com' }, raw: {} }]
    },
    { content: 'Done.', assistant_message: { role: 'assistant', content: 'Done.' }, tool_calls: [] }
  ])
  const tools = mockTools({ browser_task: { ok: true, summary: 'Example Domain' } })
  const policy = mockPolicy({ browser_task: { risk: 'medium', reason: 'browser', allowed: true, requiresApproval: false } })
  const events = []

  await runTurn(
    {
      messages: [{ role: 'user', content: 'open example.com' }],
      onStreamEvent: event => events.push(event)
    },
    { deepseek, tools, policy }
  )

  expect(events.map(event => event.type)).toEqual(expect.arrayContaining([
    'reasoning_summary',
    'tool_start',
    'tool_progress',
    'tool_result',
  ]))
  expect(events.find(event => event.type === 'reasoning_summary').text).toContain('判断')
})
