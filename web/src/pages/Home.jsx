import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api.js'
import { IconPin, IconScissors } from '../components/Icons.jsx'

export default function Home() {
  const [barbers, setBarbers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let alive = true
    api('/barbers')
      .then((list) => alive && setBarbers(list))
      .catch(() => alive && setError(true))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [])

  return (
    <>
      <div className="pole-ribbon" aria-hidden="true" />
      <div className="app">
        <header className="appbar">
          <div className="appbar-inner">
            <span className="brand">
              <IconScissors width="20" height="20" color="var(--red)" />
              حلاقتي
            </span>
            <Link to="/login" className="link-btn">
              دخول الحلّاق
            </Link>
          </div>
        </header>

        <main style={{ padding: '20px 16px 0' }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--navy)', fontSize: 26, margin: '8px 0 4px' }}>
            اعرف دورك قبل أن تصل
          </h1>
          <p style={{ color: 'var(--muted)', margin: '0 0 22px', fontSize: 14.5 }}>
            تذكرة الانتظار المباشرة لصالونك المحلي — لا مزيد من الانتظار الطويل.
          </p>

          {error && (
            <div className="error-box">تعذّر تحميل الصالونات — تأكد أن الخادم يعمل.</div>
          )}
          {loading && <p className="empty-state">جارٍ التحميل…</p>}

          <div className="stack">
            {barbers.map((b) => (
              <Link key={b.id} to={`/barber/${b.slug}`} className="card" style={{ display: 'block' }}>
                <div className="row spread">
                  <div className="row">
                    <div className="avatar" aria-hidden="true" style={{ width: 44, height: 44 }}>
                      <IconScissors width="22" height="22" />
                    </div>
                    <div>
                      <div style={{ fontWeight: 800, color: 'var(--navy)', fontSize: 16 }}>
                        {b.shopName}
                      </div>
                      {(b.area || b.city) && (
                        <div className="shop-area">
                          <IconPin width="13" height="13" />
                          {[b.area, b.city].filter(Boolean).join('، ')}
                        </div>
                      )}
                    </div>
                  </div>
                  <span className={`status ${b.open ? '' : 'closed'}`}>
                    <span className="dot" aria-hidden="true" />
                    {b.open ? 'مفتوح' : 'مغلق'}
                  </span>
                </div>
              </Link>
            ))}
            {!loading && !error && barbers.length === 0 && (
              <p className="empty-state">لا توجد صالونات بعد.</p>
            )}
          </div>
        </main>
      </div>
    </>
  )
}