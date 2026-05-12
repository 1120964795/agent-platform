import { describe, expect, test } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { matchSkillCommands, parseSkillCommandLine } from '../../lib/commands.js'

const root = process.cwd()

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

describe('unified chat UI wiring', () => {
  test('InputBar has no chat/execute mode toggle', () => {
    const source = readProjectFile('client/src/components/chat/InputBar.jsx')

    expect(source).toContain('export default function InputBar({ onSend, disabled, agentRunning, pendingConfirmation, onCancel, selectedModel, onModelChange, pluginMode, onPluginModeChange })')
    expect(source).toContain('输入消息或任务')
    expect(source).not.toContain('onModeChange')
    expect(source).not.toContain('MessageSquare')
    expect(source).not.toContain('const isExecute')
  })

  test('ChatArea sends every message through sendUserMessage', () => {
    const source = readProjectFile('client/src/components/chat/ChatArea.jsx')

    expect(source).toContain('export default function ChatArea({ conversationId })')
    expect(source).toContain('parseSkillCommandLine(text, skills)')
    expect(source).toContain('shouldRouteToDesktopTask')
    expect(source).toContain("if (pluginMode === 'desktop') setPluginMode(null)")
    expect(source).toContain('forcedSkill')
    expect(source).not.toContain('sendAgentMessage')
    expect(source).not.toContain('onModeChange')
  })

  test('ModelSelector exposes only DeepSeek chat models plus automation plugin chips', () => {
    const source = readProjectFile('client/src/components/chat/ModelSelector.jsx')

    expect(source).toContain("{ id: 'deepseek-chat'")
    expect(source).toContain("{ id: 'deepseek-coder'")
    expect(source).toContain('BROWSER_USE_OPTION')
    expect(source).toContain('DESKTOP_USE_OPTION')
    expect(source).not.toMatch(/doubao/i)
    expect(source).not.toMatch(/qwen/i)
  })

  test('MainArea and TopBar no longer expose execution mode copy', () => {
    const mainArea = readProjectFile('client/src/components/layout/MainArea.jsx')
    const topBar = readProjectFile('client/src/components/layout/TopBar.jsx')
    const messageList = readProjectFile('client/src/components/chat/MessageList.jsx')

    expect(mainArea).not.toContain('useState')
    expect(mainArea).not.toContain('executionMode')
    expect(topBar).not.toContain('executionMode')
    expect(topBar).not.toContain('聊天模式')
    expect(messageList).not.toContain('执行模式')
  })

  test('chat confirmation replaces inline approval controls for pending tools', () => {
    const chatArea = readProjectFile('client/src/components/chat/ChatArea.jsx')
    const useChat = readProjectFile('client/src/hooks/useChat.js')

    expect(chatArea).toContain('pendingConfirmation')
    expect(chatArea).not.toContain('handleApproveTool')
    expect(useChat).not.toContain('approveChatTool')
    expect(useChat).not.toContain('denyChatTool')
    expect(useChat).toContain('onConfirmationRequest')
  })

  test('layout uses chat history sidebar without legacy drawer navigation', () => {
    const sidebar = readProjectFile('client/src/components/layout/Sidebar.jsx')
    const layout = readProjectFile('client/src/components/layout/Layout.jsx')
    const topBar = readProjectFile('client/src/components/layout/TopBar.jsx')

    expect(sidebar).toContain('onSelectConversation')
    expect(sidebar).toContain('搜索聊天')
    expect(sidebar).toContain('重命名')
    expect(sidebar).toContain('永久删除')
    expect(sidebar).not.toContain('控制中心')
    expect(sidebar).not.toContain('模型与运行时')
    expect(sidebar).not.toContain('运行输出')

    expect(layout).toContain('useConversations')
    expect(layout).toContain('SettingsPage')
    expect(layout).not.toContain('RightDrawer')
    expect(layout).not.toContain('onOpenDrawer')

    expect(topBar).not.toContain('Activity')
    expect(topBar).not.toContain('ShieldCheck')
    expect(topBar).not.toContain('FileText')
    expect(topBar).not.toContain('Settings')
    expect(topBar).toContain('统一对话工作台')
  })

  test('SettingsPage shows external-link buttons for active model and automation API keys', () => {
    const settings = readProjectFile('client/src/pages/SettingsPage.jsx')

    expect(settings).toContain('ExternalLink')
    expect(settings.match(/<ApiKeyInput /g)).toHaveLength(3)
    expect(settings).toContain('id="settings-deepseek-api-key"')
    expect(settings).toContain('id="settings-browser-use-api-key"')
    expect(settings).toContain('id="settings-desktop-use-api-key"')
    expect(settings).toContain("deepseekApiKey: ''")
    expect(settings).toContain("browserUseApiKey: ''")
    expect(settings).toContain("desktopUseApiKey: ''")
    expect(settings).toContain('https://platform.deepseek.com/api_keys')
    expect(settings).toContain('https://zenmux.ai/')
    expect(settings).not.toMatch(/qwen/i)
    expect(settings).not.toMatch(/doubao/i)
  })

  test('SettingsPage keeps masked API key state visible after save or reload', () => {
    const settings = readProjectFile('client/src/pages/SettingsPage.jsx')

    expect(settings).toContain('maskedKeys')
    expect(settings).toContain('setMaskedKeys')
    expect(settings).toContain('applyConfig(result.config || {})')
    expect(settings).toContain("placeholder={maskedKeys.deepseekApiKey || 'sk-...'}")
    expect(settings).toContain("placeholder={maskedKeys.browserUseApiKey || 'ZenMux API Key'}")
    expect(settings).toContain("placeholder={maskedKeys.desktopUseApiKey || 'ZenMux API Key'}")
    expect(settings).toContain('savedValue={maskedKeys.deepseekApiKey}')
    expect(settings).toContain('savedValue={maskedKeys.browserUseApiKey}')
    expect(settings).toContain('savedValue={maskedKeys.desktopUseApiKey}')
  })

  test('SettingsPage exposes Browser Use endpoint model and vision toggle', () => {
    const settings = readProjectFile('client/src/pages/SettingsPage.jsx')

    expect(settings).toContain('Browser Use')
    expect(settings).toContain('browserUseEndpoint')
    expect(settings).toContain('browserUseModel')
    expect(settings).toContain('browserUseVisionEnabled')
    expect(settings).toContain('https://zenmux.ai/api/v1')
    expect(settings).toContain('openai/gpt-5.5')
    expect(settings).toContain('checked={form.browserUseVisionEnabled !== false}')
    expect(settings).toContain('Vision enabled')
  })

  test('settings keeps artifacts tab and removes qwen doubao settings', () => {
    const settings = readProjectFile('client/src/pages/SettingsPage.jsx')
    expect(settings).toContain("['artifacts'")
    expect(settings).toContain('deleteArtifact')
    expect(settings).toContain('listArtifacts')
    expect(settings).toContain('agentdev:artifact-created')
    expect(settings).toContain('desktopUseApiKey')
    expect(settings).toContain('browserUseApiKey')
    expect(settings).not.toMatch(/qwenApiKey|doubaoVisionApiKey|qwenVisionApiKey/)
  })

  test('welcome setup does not request removed provider keys', () => {
    const welcome = readProjectFile('client/src/components/WelcomeSetupDialog.jsx')
    expect(welcome).toContain('browserUse')
    expect(welcome).not.toMatch(/qwenApiKey|doubaoVisionApiKey|qwenVisionApiKey/)
  })

  test('action updates are summarized in chat instead of rendered as action cards', () => {
    const messageList = readProjectFile('client/src/components/chat/MessageList.jsx')
    const chatArea = readProjectFile('client/src/components/chat/ChatArea.jsx')
    const useChat = readProjectFile('client/src/hooks/useChat.js')

    expect(messageList).not.toContain("message.role === 'actions'")
    expect(messageList).not.toContain("import ActionCard")
    expect(chatArea).not.toContain('handleApproveAction')
    expect(chatArea).not.toContain('onApproveAction')
    expect(useChat).toContain('cancelAction')
    expect(useChat).toContain('appendActionSummary')
    expect(useChat).toContain('5 * 60 * 1000')
  })

  test('obsolete drawer panels and hooks are removed', () => {
    const obsolete = [
      'client/src/panels/ControlCenterPanel.jsx',
      'client/src/panels/RuntimeStatusPanel.jsx',
      'client/src/panels/RunOutputsPanel.jsx',
      'client/src/panels/LogsPanel.jsx',
      'client/src/components/layout/RightDrawer.jsx',
      'client/src/components/actions/ActionConfirmModal.jsx',
      'client/src/hooks/useActionQueue.js',
      'client/src/hooks/useAuditLog.js'
    ]

    for (const relativePath of obsolete) {
      expect(fs.existsSync(path.join(root, relativePath))).toBe(false)
    }
  })

  test('development startup does not force DevTools open by default', () => {
    const main = readProjectFile('electron/main.js')

    expect(main).toContain("process.env.AIONUI_OPEN_DEVTOOLS === '1'")
    expect(main).toContain('if (shouldOpenDevTools) mainWindow.webContents.openDevTools()')
    expect(main).not.toContain('if (isDev) mainWindow.webContents.openDevTools()')
  })

  test('bridge failures navigate to runtime diagnostics', () => {
    const layout = readProjectFile('client/src/components/layout/Layout.jsx')
    const statusBar = readProjectFile('client/src/components/BridgeStatusBar.jsx')
    const settings = readProjectFile('client/src/pages/SettingsPage.jsx')

    expect(layout).toContain('initialTab')
    expect(statusBar).toContain('lastError')
    expect(statusBar).toContain('title=')
    expect(settings).toContain("bridge:status")
    expect(settings).toContain('restartBridge')
    expect(settings).toContain("window.electronAPI?.invoke?.('bridge:restart'")
    expect(settings).toContain('onRestart')
    expect(settings).toContain('bridgeKey="browserUse"')
    expect(settings).toContain("bridgeKey={bridges.desktopUse ? 'desktopUse' : 'uitars'}")
    expect(settings).toContain('BridgeDetailCard')
    expect(settings).toContain('nextSteps')
    expect(settings).toContain('stdoutLog')
    expect(settings).toContain('stderrLog')
  })

  test('InputBar exposes Codex-style plugin menu and Browser plugin label', () => {
    const source = readProjectFile('client/src/components/chat/InputBar.jsx')

    expect(source).toContain('插件')
    expect(source).toContain('浏览器')
    expect(source).toContain('Browser Use')
    expect(source).toContain('Desktop Use')
    expect(source).toContain("mode: 'desktop'")
    expect(source).toContain('onPluginModeChange')
  })

  test('ModelSelector can display Browser Use and Desktop Use model chips for plugin modes', () => {
    const source = readProjectFile('client/src/components/chat/ModelSelector.jsx')

    expect(source).toContain('browser-use')
    expect(source).toContain('desktop-use')
    expect(source).toContain('openai/gpt-5.5')
    expect(source).toContain('pluginMode')
    expect(source).toContain("pluginMode === 'desktop'")
  })

  test('ApprovalCard is limited to confirmation controls', () => {
    const source = readProjectFile('client/src/components/chat/ApprovalCard.jsx')

    expect(source).toContain('onApprove')
    expect(source).toContain('onReject')
    expect(source).not.toContain('final_answer')
    expect(source).not.toContain('reasoning_summary')
  })

  test('MessageBubble renders streamed reasoning and tool progress entries', () => {
    const source = readProjectFile('client/src/components/chat/MessageBubble.jsx')

    expect(source).toContain('reasoning_summary')
    expect(source).toContain('tool_progress')
    expect(source).toContain('stream')
  })

  test('slash commands are backed by installed skills instead of legacy cards', () => {
    const commands = readProjectFile('client/src/lib/commands.js')
    const useCommand = readProjectFile('client/src/hooks/useCommand.js')
    const palette = readProjectFile('client/src/components/chat/CommandPalette.jsx')

    expect(commands).toContain('parseSkillCommandLine')
    expect(commands).toContain('matchSkillCommands')
    expect(commands).not.toContain("id: 'paper'")
    expect(commands).not.toContain("id: 'plan'")
    expect(commands).not.toContain("id: 'schedule'")
    expect(commands).not.toContain("cardType: 'paper'")
    expect(useCommand).toContain('skills = []')
    expect(useCommand).toContain('matchSkillCommands(text, skills)')
    expect(palette).toContain('Sparkles')
    expect(palette).not.toContain('const Icon = command.icon')
  })

  test('skill slash helpers match and parse installed skills case-insensitively', () => {
    const skills = [
      { name: 'superpowers', description: 'Structured development workflows' },
      { name: 'documents', description: 'Document editing' }
    ]

    expect(matchSkillCommands('/sup', skills).map((command) => command.id)).toEqual(['superpowers'])
    expect(matchSkillCommands('/SUP', skills).map((command) => command.id)).toEqual(['superpowers'])
    expect(parseSkillCommandLine('/superpowers do work', skills)).toEqual({
      forcedSkill: 'superpowers',
      message: 'do work'
    })
    expect(parseSkillCommandLine('/SUPERPOWERS do work', skills)).toEqual({
      forcedSkill: 'superpowers',
      message: 'do work'
    })
    expect(parseSkillCommandLine('/missing do work', skills)).toBeNull()
    expect(parseSkillCommandLine('/superpowers', skills)).toBeNull()
    expect(parseSkillCommandLine('normal text', skills)).toBeNull()
  })

  test('renderer routes confirmation replies through chat input', () => {
    const useChat = readProjectFile('client/src/hooks/useChat.js')
    const api = readProjectFile('client/src/lib/api.js')

    expect(useChat).toContain('pendingConfirmation')
    expect(useChat).toContain('confirmationReply: true')
    expect(useChat).toContain('respondToConfirmation')
    expect(useChat).toContain('onConfirmationRequest')
    expect(useChat).toContain('onConfirmationCleared')
    expect(useChat).toContain('setPendingConfirmation(null)')
    expect(useChat).not.toContain('approveChatTool')
    expect(useChat).not.toContain('denyChatTool')
    expect(api).toContain('onConfirmationRequest')
    expect(api).toContain("listen('chat:confirmation-request'")
    expect(api).toContain("listen('chat:confirmation-cleared'")
  })

  test('InputBar exposes pending confirmation status and installed skill slash picker', () => {
    const input = readProjectFile('client/src/components/chat/InputBar.jsx')
    const chatArea = readProjectFile('client/src/components/chat/ChatArea.jsx')
    const messageBubble = readProjectFile('client/src/components/chat/MessageBubble.jsx')

    expect(input).toContain('pendingConfirmation')
    expect(input).toContain('CommandPalette')
    expect(input).toContain('useCommand(skills)')
    expect(input).toContain('等待确认')
    expect(input).toContain('请选择')
    expect(input).toContain('listSkills')
    expect(chatArea).toContain('pendingConfirmation')
    expect(chatArea).toContain('respondToConfirmation')
    expect(chatArea).toContain('parseSkillCommandLine')
    expect(chatArea).toContain('forcedSkill')
    expect(messageBubble).toContain('确定')
    expect(messageBubble).toContain('取消')
  })

  test('MessageList renders chat stream entries instead of approval tool and action cards', () => {
    const messageList = readProjectFile('client/src/components/chat/MessageList.jsx')
    const useChat = readProjectFile('client/src/hooks/useChat.js')

    expect(messageList).not.toContain("import ToolCard")
    expect(messageList).not.toContain("import ShellCard")
    expect(messageList).not.toContain("import ActionCard")
    expect(messageList).not.toContain("message.role === 'tool'")
    expect(messageList).not.toContain("message.role === 'actions'")
    expect(messageList).toContain("message.cardType === 'word'")
    expect(messageList).toContain("message.cardType === 'ppt'")
    expect(messageList).toContain("message.cardType === 'file'")
    expect(useChat).not.toContain("case 'UPDATE_TOOL'")
    expect(useChat).not.toContain("case 'ADD_ACTIONS'")
    expect(useChat).toContain('appendActionSummary')
  })
})
