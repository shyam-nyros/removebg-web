import { useState, useRef, useCallback } from 'react'

export default function BeforeAfter({ before, after, checkerAfter = false }) {
  const [pos, setPos] = useState(50)
  const wrapRef  = useRef(null)
  const dragging = useRef(false)

  const move = useCallback((clientX) => {
    if (!wrapRef.current) return
    const rect = wrapRef.current.getBoundingClientRect()
    setPos(Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)))
  }, [])

  return (
    <div
      ref={wrapRef}
      className={`ba-wrap${checkerAfter ? ' checker' : ''}`}
      onMouseMove={(e) => dragging.current && move(e.clientX)}
      onMouseUp={() => { dragging.current = false }}
      onMouseLeave={() => { dragging.current = false }}
      onTouchMove={(e) => { e.preventDefault(); move(e.touches[0].clientX) }}
      onTouchEnd={() => { dragging.current = false }}
      onClick={(e) => move(e.clientX)}
    >
      {/* After — sets the layout height */}
      <img src={after} className="ba-after-img" alt="after" draggable={false} />

      {/* Before — clipped to left of handle */}
      <div
        className="ba-before-layer"
        style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
      >
        <img src={before} alt="before" draggable={false} />
      </div>

      {/* Divider + handle */}
      <div className="ba-divider" style={{ left: `${pos}%` }}>
        <div
          className="ba-handle-btn"
          onMouseDown={(e) => { dragging.current = true; e.preventDefault() }}
          onTouchStart={(e) => { dragging.current = true; e.preventDefault() }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
            <polyline points="9 18 15 12 9 6" transform="translate(0,0) scale(-1,1) translate(-24,0)"/>
          </svg>
        </div>
      </div>

      {/* Labels */}
      <div className="ba-lbl" style={{ left: 10 }}>Before</div>
      <div className="ba-lbl" style={{ right: 10 }}>After</div>
    </div>
  )
}
