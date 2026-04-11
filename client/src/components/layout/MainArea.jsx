import TopBar from './TopBar.jsx'
import ChatArea from '../chat/ChatArea.jsx'

const TITLES = {
  general: '通用对话',
  word: 'Word 助手',
  ppt: 'PPT 助手',
  paper: '论文助手',
  schedule: '日程助手'
}

export default function MainArea({ selectedAssistant = 'general', onOpenDrawer }) {
  return (
    <main className="flex-1 flex flex-col min-w-0">
      <TopBar title={TITLES[selectedAssistant] || '通用对话'} onOpenDrawer={onOpenDrawer} />
      <ChatArea />
    </main>
  )
}
