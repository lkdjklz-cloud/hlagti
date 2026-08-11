import { Link } from 'react-router-dom'
import { IconShare, IconScissors } from './Icons.jsx'

export default function AppHeader({ showBack = false, onShare = null, brand = true }) {
  return (
    <header className="appbar">
      <div className="appbar-inner">
        {showBack ? (
          <Link to="/login" className="icon-btn" aria-label="لوحة التحكم">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg>
          </Link>
        ) : (
          <span className="icon-btn" aria-hidden="true" />
        )}
        {brand && (
          <Link to="/" className="brand brand-link">
            <IconScissors width="20" height="20" color="var(--red)" />
            coiffeur
          </Link>
        )}
        {onShare ? (
          <button className="icon-btn" type="button" onClick={onShare} aria-label="مشاركة هذه الصفحة">
            <IconShare />
          </button>
        ) : (
          <span className="icon-btn" aria-hidden="true" />
        )}
      </div>
    </header>
  )
}