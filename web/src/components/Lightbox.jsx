import { useEffect } from 'react'

export default function Lightbox({ src, alt, onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={alt || 'صورة مكبّرة'} onClick={onClose}>
      <button className="lightbox-close" type="button" aria-label="إغلاق" onClick={onClose}>✕</button>
      <img className="lightbox-img" src={src} alt={alt || ''} onClick={(e) => e.stopPropagation()} />
    </div>
  )
}