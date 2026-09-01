import { useEffect, useRef } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export default function useDialog({ open, onClose }) {
  const ref = useRef(null)
  const prevFocus = useRef(null)

  useEffect(() => {
    if (!open) return
    const node = ref.current
    if (!node) return

    // Escape closes.
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }

    // Focus first focusable inside the dialog.
    const focusable = node.querySelector(FOCUSABLE)
    prevFocus.current = document.activeElement
    ;(focusable || node).focus()

    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      if (prevFocus.current && prevFocus.current.focus) prevFocus.current.focus()
    }
  }, [open, onClose])

  // Trap focus while open.
  useEffect(() => {
    if (!open) return
    const node = ref.current
    if (!node) return
    const onKey = (e) => {
      if (e.key !== 'Tab') return
      const focusable = Array.from(node.querySelectorAll(FOCUSABLE)).filter(
        (el) => !el.hasAttribute('disabled')
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  return ref
}
