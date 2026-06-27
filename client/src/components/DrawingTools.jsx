import { useState } from 'react'

const TOOLS = [
  { id: 'cursor', label: 'Crosshair' },
  { id: 'trend_line', label: 'Trend Line' },
  { id: 'horizontal_line', label: 'Horizontal Line' },
  { id: 'horizontal_ray', label: 'Horizontal Ray' },
  { id: 'vertical_line', label: 'Vertical Line' },
  { id: 'rectangle', label: 'Rectangle' },
  { id: 'fibonacci', label: 'Fibonacci' },
  { id: 'text_label', label: 'Text Label' },
  { id: 'sep1', separator: true },
  { id: 'eraser', label: 'Eraser', action: true },
  { id: 'clear_all', label: 'Clear All', action: true },
]

const ICONS = {
  cursor: (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="2" fill="currentColor" />
      <line x1="8" y1="1" x2="8" y2="5" strokeLinecap="round" />
      <line x1="8" y1="11" x2="8" y2="15" strokeLinecap="round" />
      <line x1="1" y1="8" x2="5" y2="8" strokeLinecap="round" />
      <line x1="11" y1="8" x2="15" y2="8" strokeLinecap="round" />
    </svg>
  ),
  trend_line: (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="2" y1="13.5" x2="14" y2="2.5" />
      <circle cx="2" cy="13.5" r="2" fill="currentColor" stroke="none" />
      <circle cx="14" cy="2.5" r="2" fill="currentColor" stroke="none" />
    </svg>
  ),
  horizontal_line: (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="2" y1="8" x2="14" y2="8" />
      <circle cx="2" cy="8" r="2" fill="currentColor" stroke="none" />
    </svg>
  ),
  horizontal_ray: (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="2" y1="8" x2="10" y2="8" />
      <circle cx="2" cy="8" r="2" fill="currentColor" stroke="none" />
      <polygon points="11.5,6.5 11.5,9.5 14,8" fill="currentColor" stroke="none" />
    </svg>
  ),
  vertical_line: (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="8" y1="2" x2="8" y2="14" />
      <circle cx="8" cy="2" r="2" fill="currentColor" stroke="none" />
    </svg>
  ),
  rectangle: (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <rect x="2" y="3" width="12" height="10" rx="1" />
    </svg>
  ),
  fibonacci: (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="2" y1="2" x2="14" y2="2" strokeWidth="1.2" />
      <line x1="3" y1="5" x2="13" y2="5" strokeWidth="1" opacity="0.65" />
      <line x1="4" y1="8" x2="12" y2="8" strokeWidth="1" opacity="0.4" />
      <line x1="3" y1="11" x2="13" y2="11" strokeWidth="1" opacity="0.65" />
      <line x1="2" y1="14" x2="14" y2="14" strokeWidth="1.2" />
      <line x1="2" y1="2" x2="2" y2="14" strokeWidth="0.5" opacity="0.25" />
    </svg>
  ),
  text_label: (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 3h8v2H8v8H6V5H4V3z" fill="currentColor" stroke="none" />
    </svg>
  ),
  eraser: (
    <svg viewBox="0 0 18 18" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4.5" width="12" height="8" rx="1.5" />
      <path d="M3 11h12v2H3z" fill="currentColor" stroke="none" />
    </svg>
  ),
  clear_all: (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="3" y1="3" x2="13" y2="13" />
      <line x1="13" y1="3" x2="3" y2="13" />
    </svg>
  ),
}

export default function DrawingTools({
  activeTool,
  onToolSelect,
  drawings,
  onClearDrawings,
}) {
  const [hoveredTool, setHoveredTool] = useState(null)
  const hasDrawings = Array.isArray(drawings) && drawings.length > 0

  const handleClick = (tool) => {
    if (tool.id === 'eraser') {
      if (hasDrawings) {
        onToolSelect?.('eraser')
      }
      return
    }
    if (tool.id === 'clear_all') {
      if (hasDrawings) {
        onClearDrawings?.()
      }
      return
    }
    onToolSelect?.(tool.id)
  }

  return (
    <div className="absolute left-0 top-0 bottom-0 z-20 flex pointer-events-none">
      <div className="w-10 bg-[#0d0f14] border-r border-[#252a36] flex flex-col items-center py-1.5 gap-0.5 pointer-events-auto">
        {TOOLS.map((tool) => {
          if (tool.separator) {
            return (
              <div
                key={tool.id}
                className="w-6 h-px bg-[#252a36] my-0.5"
              />
            )
          }

          const isActive = activeTool === tool.id
          const isAction = tool.action
          const isDisabled = isAction && !hasDrawings

          return (
            <div key={tool.id} className="relative group/tool">
              <button
                onClick={() => handleClick(tool)}
                disabled={isDisabled}
                onMouseEnter={() => setHoveredTool(tool.id)}
                onMouseLeave={() => setHoveredTool(null)}
                className={`
                  w-8 h-8 flex items-center justify-center rounded transition-colors duration-75
                  ${isActive
                    ? 'bg-[#4f9cf9] text-white'
                    : isDisabled
                      ? 'text-[#555] cursor-not-allowed'
                      : 'text-[#8A8A8A] hover:bg-[#2A2A2A] hover:text-[#c8c8c8]'
                  }
                `}
                aria-label={tool.label}
              >
                {ICONS[tool.id]}
              </button>

              {hoveredTool === tool.id && !isDisabled && (
                <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2.5 px-2.5 py-1 bg-[#1e2330] text-white text-[11px] leading-tight font-medium whitespace-nowrap rounded shadow-lg border border-[#252a36] z-50 pointer-events-none">
                  {tool.label}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
