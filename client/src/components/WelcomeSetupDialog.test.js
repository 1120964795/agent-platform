import { describe, expect, test } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

describe('first-run setup guide', () => {
  test('explains every model API with external configuration links', () => {
    const source = readProjectFile('client/src/components/WelcomeSetupDialog.jsx')

    expect(source).toContain('司南 API 配置向导')
    expect(source).toContain('DeepSeek')
    expect(source).toContain('Qwen / DashScope')
    expect(source).toContain('Doubao Vision')
    expect(source).toContain('Browser Use / ZenMux')
    expect(source).toContain('https://platform.deepseek.com/api_keys')
    expect(source).toContain('https://bailian.console.aliyun.com/')
    expect(source).toContain('https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey')
    expect(source).toContain('https://zenmux.ai/')
  })

  test('keeps installable runtime and local defaults out of the first-run guide', () => {
    const source = readProjectFile('client/src/components/WelcomeSetupDialog.jsx')

    expect(source).toContain('模型 API 配置')
    expect(source).toContain('安装与首次启动已自动准备')
    expect(source).toContain('一键检测')
    expect(source).not.toContain('Python 3.10+')
    expect(source).not.toContain('Open Interpreter')
    expect(source).not.toContain('Chrome + Midscene')
    expect(source).not.toContain('运行环境配置')
    expect(source).not.toContain('本地工作区与安全策略')
    expect(source).not.toContain('工作区根目录')
    expect(source).not.toContain('Dry Run')
    expect(source).not.toContain('安全模式')
    expect(source).not.toContain('Bridge 服务状态')
  })

  test('settings entry opens the focused API setup guide', () => {
    const source = readProjectFile('client/src/pages/SettingsPage.jsx')

    expect(source).toContain('API 配置向导')
    expect(source).not.toContain('首次配置向导')
  })

  test('uses the Electron external-link bridge for third-party configuration pages', () => {
    const source = readProjectFile('client/src/components/WelcomeSetupDialog.jsx')

    expect(source).toContain('openExternalUrl')
    expect(source).toContain('window.electronAPI?.openExternal')
    expect(source).toContain("window.electronAPI?.invoke?.('app:open-external'")
  })
})
