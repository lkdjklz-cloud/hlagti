import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, getToken, setTokens, clearToken } from '../lib/api.js'
import { useToast } from '../lib/toast.jsx'
import { disconnectSocket } from '../lib/socket.js'
import { IconPin, IconScissors } from '../components/Icons.jsx'
import Lightbox from '../components/Lightbox.jsx'
import { getPosition, formatKm } from '../lib/geo.js'

export default function Home() {
  const toast = useToast()
  const navigate = useNavigate()
  const [barbers, setBarbers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [me, setMe] = useState(null)
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const [upgradeBusy, setUpgradeBusy] = useState(false)
  const [upgrade, setUpgrade] = useState({ shopName: '', area: '', city: '' })
  const [near, setNear] = useState(null)
  const [locBusy, setLocBusy] = useState(false)
  const [zoom, setZoom] = useState(null)

  useEffect(() => {
    let alive = true
    const q = near ? `?lat=${near.lat}&lng=${near.lng}` : ''
    api(`/barbers${q}`)
      .then((list) => alive && setBarbers(list))
      .catch(() => alive && setError(true))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [near])

  useEffect(() => {
    if (!getToken()) return
    let alive = true
    api('/auth/me')
      .then((r) => alive && setMe(r))
      .catch(() => alive && setMe(null))
    return () => {
      alive = false
    }
  }, [])

  async function upgradeBarber(e) {
    e.preventDefault()
    if (upgradeBusy) return
    setUpgradeBusy(true)
    try {
      const res = await api('/auth/upgrade/barber', { method: 'POST', body: upgrade })
      setTokens(res)
      setUpgradeOpen(false)
      toast('أصبحت حلّاقًا — لوحة تحكمك جاهزة!')
      navigate('/dashboard')
    } catch (err) {
      toast(err.message === 'already_barber' ? 'أنت حلّاق بالفعل' : 'حدث خطأ، حاول مجددًا')
    } finally {
      setUpgradeBusy(false)
    }
  }

  function logout() {
    disconnectSocket()
    clearToken()
    setMe(null)
    navigate('/')
    toast('تم تسجيل الخروج')
  }

  async function locate() {
    if (locBusy) return
    setLocBusy(true)
    try {
      const pos = await getPosition()
      setNear(pos)
      toast('تم تحديد موقعك — تُعرض الأقرب أولاً')
    } catch (err) {
      toast(err.message === 'geolocation_denied' ? 'مشاركة الموقع غير مفعّلة' : 'تعذّر تحديد موقعك')
    } finally {
      setLocBusy(false)
    }
  }

  function resetNear() {
    setNear(null)
  }

  const isBarber = me?.user?.role === 'BARBER'

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
            {me ? (
              <div className="row" style={{ gap: 8 }}>
                {isBarber ? (
                  <Link to="/dashboard" className="btn btn-cta" style={{ fontSize: 13.5 }}>
                    لوحة التحكم
                  </Link>
                ) : (
                  <button className="btn btn-cta" type="button" style={{ fontSize: 13.5 }} onClick={() => setUpgradeOpen(true)}>
                    أصبح حلّاقًا
                  </button>
                )}
                <button className="btn btn-ghost" type="button" style={{ fontSize: 13.5 }} onClick={logout}>
                  خروج
                </button>
              </div>
            ) : (
              <Link to="/login" className="link-btn">
                دخول / حساب
              </Link>
            )}
          </div>
        </header>

        <main style={{ padding: '20px 16px 0' }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--navy)', fontSize: 26, margin: '8px 0 4px' }}>
            اعرف دورك قبل أن تصل
          </h1>
          <p style={{ color: 'var(--muted)', margin: '0 0 22px', fontSize: 14.5 }}>
            تذكرة الانتظار المباشرة لصالونك المحلي — لا مزيد من الانتظار الطويل.
          </p>

          <div className="row" style={{ gap: 10, marginBottom: 18 }}>
            <button className="btn btn-ghost" type="button" onClick={locate} disabled={locBusy} style={{ fontSize: 13.5 }}>
              {locBusy ? <span className="spinner" aria-hidden="true" /> : <IconPin width="14" height="14" />}
              استعمل موقعي
            </button>
            {near && (
              <button className="link-btn" type="button" onClick={resetNear} style={{ fontSize: 13 }}>
                كل الصالونات
              </button>
            )}
          </div>

          {error && (
            <div className="error-box">تعذّر تحميل الصالونات — تأكد أن الخادم يعمل.</div>
          )}
          {loading && <p className="empty-state">جارٍ التحميل…</p>}

          <div className="stack">
            {barbers.map((b) => (
              <Link key={b.id} to={`/barber/${b.slug}`} className="card" style={{ display: 'block' }}>
                <div className="row spread">
                  <div className="row">
                    {b.photoUrl ? (
                      <button
                        className="avatar avatar-button"
                        type="button"
                        aria-label={`كبّر صورة ${b.shopName}`}
                        style={{ width: 44, height: 44 }}
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          setZoom({ src: b.photoUrl, alt: b.shopName })
                        }}
                      >
                        <img src={b.photoUrl} alt={b.shopName} />
                      </button>
                    ) : (
                      <div className="avatar" aria-hidden="true" style={{ width: 44, height: 44 }}>
                        <IconScissors width="22" height="22" />
                      </div>
                    )}
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
                      {near && b.distanceKm !== null && b.distanceKm !== undefined && (
                        <div className="shop-area" style={{ color: 'var(--success)' }}>
                          <IconPin width="13" height="13" />
                          {formatKm(b.distanceKm)} من موقعك
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

      {upgradeOpen && (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="أصبح حلّاقًا"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 4px', color: 'var(--navy)', fontFamily: 'var(--font-display)' }}>أصبح حلّاقًا</h3>
            <p style={{ margin: '0 0 16px', color: 'var(--muted)', fontSize: 13.5 }}>
              قم بترقية حسابك لفتح لوحة تحكم صالونك — بدون تكرار التسجيل.
            </p>
            <form onSubmit={upgradeBarber}>
              <div className="field">
                <label className="label">اسم الصالون</label>
                <input className="input" required value={upgrade.shopName} onChange={(e) => setUpgrade((f) => ({ ...f, shopName: e.target.value }))} />
              </div>
              <div className="row" style={{ marginBottom: 14 }}>
                <div className="field inline-field">
                  <label className="label">الحي / المنطقة</label>
                  <input className="input" value={upgrade.area} onChange={(e) => setUpgrade((f) => ({ ...f, area: e.target.value }))} />
                </div>
                <div className="field inline-field">
                  <label className="label">المدينة</label>
                  <input className="input" value={upgrade.city} onChange={(e) => setUpgrade((f) => ({ ...f, city: e.target.value }))} />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button className="btn btn-secondary" type="button" onClick={() => setUpgradeOpen(false)} disabled={upgradeBusy}>
                  إلغاء
                </button>
                <button className="btn btn-cta" type="submit" disabled={upgradeBusy}>
                  {upgradeBusy ? <span className="spinner" aria-hidden="true" /> : 'أنشئ صالوني'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {zoom && <Lightbox src={zoom.src} alt={zoom.alt} onClose={() => setZoom(null)} />}
    </>
  )
}