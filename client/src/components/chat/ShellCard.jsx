import ToolCard from './ToolCard.jsx'

export default function ShellCard({ message, onApproveTool, onDenyTool }) {
  return <ToolCard message={message} onApproveTool={onApproveTool} onDenyTool={onDenyTool} />
}
