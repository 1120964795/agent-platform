import { useEffect, useState } from 'react'
import { useChat } from '../../hooks/useChat.js'
import { listSkills } from '../../lib/api.js'
import { parseSkillCommandLine } from '../../lib/commands.js'
import MessageList from './MessageList.jsx'
import InputBar from './InputBar.jsx'
import { loadModel } from './ModelSelector.jsx'

export default function ChatArea({ conversationId }) {
  const { messages, streaming, agentRunning, pendingConfirmation, sendUserMessage, handleAbort, updateCard, addFileCard } = useChat(conversationId)
  const [selectedModel, setSelectedModel] = useState(loadModel)
  const [pluginMode, setPluginMode] = useState(null)
  const [skills, setSkills] = useState([])

  useEffect(() => {
    let cancelled = false
    listSkills()
      .then((result) => {
        if (!cancelled) setSkills(result.skills || [])
      })
      .catch(() => {
        if (!cancelled) setSkills([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  function handleSend(text) {
    const parsed = parseSkillCommandLine(text, skills)
    const messageText = parsed?.message || text
    sendUserMessage(messageText, pluginMode === 'browser' ? 'browser-use' : selectedModel, {
      pluginMode,
      forcedSkill: parsed?.forcedSkill || null
    })
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <MessageList
        messages={messages}
        onUpdateCard={updateCard}
        onFileGenerated={addFileCard}
      />
      <InputBar
        onSend={handleSend}
        disabled={!pendingConfirmation && (streaming || agentRunning)}
        agentRunning={agentRunning}
        pendingConfirmation={pendingConfirmation}
        onCancel={handleAbort}
        selectedModel={selectedModel}
        onModelChange={setSelectedModel}
        pluginMode={pluginMode}
        onPluginModeChange={setPluginMode}
      />
    </div>
  )
}
