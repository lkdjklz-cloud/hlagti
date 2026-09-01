import { Link } from 'react-router-dom'
import { IconScissors } from '../components/Icons.jsx'
import { markOnboarded } from '../lib/onboard.js'

export default function Welcome() {
  function goAsGuest() {
    markOnboarded()
    // Full load so the onboarding gate in App.jsx re-evaluates on the next paint.
    window.location.assign('/')
  }

  return (
    <>
      <div className="pole-ribbon" aria-hidden="true" />
      <div className="app">
        <header className="appbar">
          <div className="appbar-inner">
            <Link to="/" className="brand brand-link">
              <IconScissors width="20" height="20" color="var(--red)" />
              حلاقتي
            </Link>
          </div>
        </header>

        <main style={{ padding: '30px 16px 40px', maxWidth: 460, marginInline: 'auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 26 }}>
            <div
              className="avatar"
              aria-hidden="true"
              style={{ width: 72, height: 72, marginInline: 'auto', marginBottom: 12 }}
            >
              <IconScissors width="34" height="34" />
            </div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--navy)', fontSize: 28, margin: '0 0 6px' }}>
              أهلاً بك في حلاقتي
            </h2>
            <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0 }}>
              تذكرة الانتظار المباشرة وحجوزات صالونك المحلي.
            </p>
          </div>

          <div className="stack" style={{ gap: 12 }}>
            <button className="card" type="button" onClick={goAsGuest} style={{ display: 'block', width: '100%', textAlign: 'right', cursor: 'pointer' }}>
              <div style={{ fontWeight: 800, color: 'var(--navy)', fontSize: 16 }}>متابعة كضيف</div>
              <div style={{ color: 'var(--muted)', fontSize: 13.5 }}>تجوّل في الصالونات وحجوزات الطابور بدون حساب.</div>
            </button>
            <Link to="/login?role=customer" className="card" style={{ display: 'block' }}>
              <div style={{ fontWeight: 800, color: 'var(--navy)', fontSize: 16 }}>أنا زبون</div>
              <div style={{ color: 'var(--muted)', fontSize: 13.5 }}>أنشئ حسابك لتجميع مكافآت الولاء وحجوزاتك في مكان واحد.</div>
            </Link>
            <Link to="/login?role=barber" className="card" style={{ display: 'block' }}>
              <div style={{ fontWeight: 800, color: 'var(--navy)', fontSize: 16 }}>أنا حلّاق — أدير صالوني</div>
              <div style={{ color: 'var(--muted)', fontSize: 13.5 }}>طابور مباشر، مكافآت ولاء، ولوحة تحكم للصالون.</div>
            </Link>
          </div>
        </main>
      </div>
    </>
  )
}