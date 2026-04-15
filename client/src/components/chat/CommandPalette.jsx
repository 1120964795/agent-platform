export default function CommandPalette({ matches, index, onSelect, onHover }) {
  if (!matches.length) return null

  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 bg-[color:var(--bg-primary)] border border-[color:var(--border)] rounded-lg shadow-lg overflow-hidden">
      {matches.map((command, currentIndex) => {
        const Icon = command.icon
        const selected = currentIndex === index

        return (
          <button
            key={command.id}
            type="button"
            onMouseEnter={() => onHover?.(currentIndex)}
            onClick={() => onSelect(command)}
            className={`w-full flex items-center gap-3 px-4 py-3 text-sm text-left ${selected ? 'bg-[color:var(--bg-tertiary)]' : 'hover:bg-[color:var(--bg-tertiary)]'}`}
          >
            <Icon size={16} className="text-[color:var(--accent)]" />
            <div className="flex-1 min-w-0">
              <div className="font-medium">{command.label}</div>
              <div className="text-xs text-[color:var(--text-muted)] truncate">{command.description}</div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
