import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const markdownComponents = {
  a: ({ node, ...props }) => (
    <a {...props} target="_blank" rel="noreferrer" />
  ),
  table: ({ node, ...props }) => (
    <div className="markdown-table-wrap">
      <table {...props} />
    </div>
  )
}

export default function MessageBubble({ role, content, streaming }) {
  const isUser = role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div
        className={`max-w-[75%] px-4 py-3 rounded-2xl text-sm break-words ${
          isUser
            ? 'whitespace-pre-wrap bg-[color:var(--accent)] text-white rounded-br-sm'
            : 'bg-[color:var(--bg-secondary)] text-[color:var(--text-primary)] rounded-bl-sm border border-[color:var(--border)]'
        }`}
      >
        {isUser ? (
          content
        ) : (
          <div className="markdown-body">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={markdownComponents}
            >
              {content || ''}
            </ReactMarkdown>
          </div>
        )}
        {streaming && <span className="inline-block w-1 h-4 bg-current ml-1 animate-pulse align-middle" />}
      </div>
    </div>
  )
}
