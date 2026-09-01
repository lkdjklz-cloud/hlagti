import useDialog from './useDialog.js'

export default function Lightbox({ src, alt, onClose }) {
  const lightboxRef = useDialog({ open: true, onClose })

  return (
    <div ref={lightboxRef} className="lightbox" role="dialog" aria-modal="true" aria-label={alt || 'صورة مكبّرة'} onClick={onClose}>
      <button className="lightbox-close" type="button" aria-label="إغلاق" onClick={onClose}>✕</button>
      <img className="lightbox-img" src={src} alt={alt || ''} onClick={(e) => e.stopPropagation()} />
    </div>
  )
}