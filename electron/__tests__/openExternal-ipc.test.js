import { describe, expect, it } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { isAllowed } = require('../ipc/openExternal')

describe('openExternal allowlist', () => {
  it('allows known https prefixes', () => {
    expect(isAllowed('https://platform.deepseek.com/api_keys')).toBe(true)
    expect(isAllowed('https://bailian.console.aliyun.com')).toBe(true)
    expect(isAllowed('https://zenmux.ai/')).toBe(true)
    expect(isAllowed('https://www.python.org/downloads/')).toBe(true)
    expect(isAllowed('https://docs.openinterpreter.com/')).toBe(true)
  })

  it('rejects http', () => {
    expect(isAllowed('http://platform.deepseek.com')).toBe(false)
  })

  it('rejects file://', () => {
    expect(isAllowed('file:///etc/passwd')).toBe(false)
  })

  it('rejects unknown hosts', () => {
    expect(isAllowed('https://evil.example')).toBe(false)
  })

  it('rejects malformed input', () => {
    expect(isAllowed('not a url')).toBe(false)
  })
})
