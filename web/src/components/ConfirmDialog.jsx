export default function ConfirmDialog({ open, title, body, confirmLabel = 'تأكيد', cancelLabel = 'إلغاء', busy, onConfirm, onClose }) {
  if (!open) return null
  return (
    <div
      className="modal-backdrop"
      onClick={busy ? undefined : onClose}
      role="presentation"
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 8px', color: 'var(--navy)', fontFamily: 'var(--font-display)' }}>{title}</h3>
        <p style={{ margin: '0 0 18px', color: 'var(--muted)', fontSize: 14, lineHeight: 1.6 }}>{body}</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button className="btn btn-secondary" type="button" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </button>
          <button className="btn btn-cta" type="button" onClick={onConfirm} disabled={busy}>
            {busy ? <span className="spinner" aria-hidden="true" /> : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}