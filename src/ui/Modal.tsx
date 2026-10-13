import { useEffect, useRef, useState, type ReactNode, type TouchEvent } from 'react'

interface Props {
  title: string
  onClose?: () => void
  children: ReactNode
}

/** How far a downward swipe on the handle or header has to travel to dismiss. */
const SWIPE_CLOSE_PX = 80

/**
 * A sheet. Centred dialog on wide screens; on phones it rises from the bottom,
 * never taller than the visible viewport, with the title pinned at the top,
 * any `.sheet-actions` pinned at the bottom, and only the middle scrolling.
 * Dismiss with the ×, a tap outside, a swipe down on the header, or the
 * browser's back button.
 */
export default function Modal({ title, onClose, children }: Props) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const [drag, setDrag] = useState(0)
  const startY = useRef<number | null>(null)

  // Escape closes.
  useEffect(() => {
    if (!onClose) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Back closes: one history entry is pushed while any closable sheet is open.
  // Switching sheet to sheet keeps that entry; the final close pops it.
  useEffect(() => {
    if (!onClose) return
    if (!window.history.state?.sheet) window.history.pushState({ sheet: true }, '')
    const onPop = () => closeRef.current?.()
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [onClose])

  const close = () => {
    if (!onClose) return
    if (window.history.state?.sheet) window.history.back()
    else onClose()
  }

  const onTouchStart = (e: TouchEvent) => {
    startY.current = e.touches[0].clientY
  }
  const onTouchMove = (e: TouchEvent) => {
    if (startY.current === null) return
    setDrag(Math.max(0, e.touches[0].clientY - startY.current))
  }
  const onTouchEnd = () => {
    const far = drag > SWIPE_CLOSE_PX
    startY.current = null
    setDrag(0)
    if (far) close()
  }

  return (
    <div className="scrim" onClick={onClose ? close : undefined}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={drag ? { transform: `translateY(${drag}px)`, transition: 'none' } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="sheet-grip"
          onTouchStart={onClose ? onTouchStart : undefined}
          onTouchMove={onClose ? onTouchMove : undefined}
          onTouchEnd={onClose ? onTouchEnd : undefined}
        >
          <span className="sheet-handle" aria-hidden />
          <header className="sheet-head">
            <h2>{title}</h2>
            {onClose && (
              <button className="icon" onClick={close} aria-label="Close">
                &times;
              </button>
            )}
          </header>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  )
}
