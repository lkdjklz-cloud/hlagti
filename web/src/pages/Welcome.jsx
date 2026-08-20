import { Link, useNavigate } from 'react-router-dom'
import { IconScissors } from '../components/Icons.jsx'
import { markOnboarded } from '../lib/onboard.js'

export default function Welcome() {
  const navigate = useNavigate()

  function goAsGuest() {
    markOnboarded()
    navigate('/', { replace: true })
  }

  return (
    <>
      <div className="pole-ribbon" aria-hidden="true" />
      <div className="app">
        <main style={{ padding: '34px 16px 40px', maxWidth: 460, marginInline: 'auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 26 }}>
            <div
              className="avatar"
              aria-hidden="true"
              style={{ width: 72, height: 72, marginInline: 'auto', marginBottom: 12 }}
            >
              <IconScissors width="34" height="34" />
            </div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--navy)', fontSize: 28, margin: '0 0 6px' }}>
              أهلاً بك في حلاقتي
            </h1>
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