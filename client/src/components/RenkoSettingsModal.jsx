import { useState, useEffect } from 'react'

export default function RenkoSettingsModal({
  isOpen,
  onClose,
  config = { method: 'traditional', boxSize: 10, atrLength: 14 },
  onSave
}) {
  const [method, setMethod] = useState('traditional') // 'traditional' | 'atr'
  const [boxSize, setBoxSize] = useState(10)
  const [atrLength, setAtrLength] = useState(14)

  useEffect(() => {
    if (isOpen) {
      setMethod(config?.method || 'traditional')
      setBoxSize(config?.boxSize || 10)
      setAtrLength(config?.atrLength || 14)
    }
  }, [isOpen, config])

  if (!isOpen) return null

  const handleSave = () => {
    onSave({
      method,
      boxSize: Math.max(0.1, Number(boxSize) || 10),
      atrLength: Math.max(1, Number(atrLength) || 14)
    })
    onClose()
  }

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-xs animate-fadeIn"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-md bg-[#131722] text-[#d1d4dc] border border-[#2a2e39] rounded-xl shadow-2xl overflow-hidden font-sans"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2a2e39] bg-[#181c27]">
          <h3 className="text-base font-semibold text-white tracking-wide">Chart settings</h3>
          <button 
            onClick={onClose}
            className="text-[#787b86] hover:text-white transition-colors p-1 rounded-md hover:bg-[#2a2e39]"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 space-y-6">
          <div className="text-[11px] font-semibold text-[#787b86] tracking-wider uppercase">RENKO</div>

          {/* Box Size Assignment Method */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-[#9db2c6]">Box size assignment method</label>
            <div className="relative">
              <select
                value={method}
                onChange={e => setMethod(e.target.value)}
                className="w-full bg-[#1e222d] text-white text-xs border border-[#2a2e39] rounded-lg px-3.5 py-2.5 outline-none focus:border-[#2962ff] transition-colors appearance-none cursor-pointer"
              >
                <option value="atr">ATR</option>
                <option value="traditional">Traditional</option>
              </select>
              <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#787b86]">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
            </div>
          </div>

          {/* Dynamic Field: ATR length or Box size */}
          {method === 'atr' ? (
            <div className="space-y-2 animate-fadeIn">
              <label className="block text-xs font-medium text-[#9db2c6]">ATR length</label>
              <input
                type="number"
                min="1"
                max="100"
                value={atrLength}
                onChange={e => setAtrLength(e.target.value)}
                className="w-full bg-[#1e222d] text-white text-xs border border-[#2a2e39] rounded-lg px-3.5 py-2.5 outline-none focus:border-[#2962ff] transition-colors"
                placeholder="14"
              />
              <p className="text-[11px] text-[#787b86]">Calculates dynamic Renko brick size using ATR(14) volatility.</p>
            </div>
          ) : (
            <div className="space-y-2 animate-fadeIn">
              <label className="block text-xs font-medium text-[#9db2c6]">Box size</label>
              <input
                type="number"
                min="0.1"
                step="any"
                value={boxSize}
                onChange={e => setBoxSize(e.target.value)}
                className="w-full bg-[#1e222d] text-white text-xs border border-[#2a2e39] rounded-lg px-3.5 py-2.5 outline-none focus:border-[#2962ff] transition-colors"
                placeholder="10"
              />
              <p className="text-[11px] text-[#787b86]">Uses a fixed point size for each Renko brick.</p>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#2a2e39] bg-[#181c27]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-[#d1d4dc] bg-[#2a2e39] hover:bg-[#363a45] rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2 text-xs font-semibold text-white bg-[#2962ff] hover:bg-[#1e53e5] rounded-lg shadow-md transition-colors"
          >
            Ok
          </button>
        </div>
      </div>
    </div>
  )
}
