import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, clearToken, getToken } from '../lib/api.js'
import { useToast } from '../lib/toast.jsx'
import { joinBarberRoom, onQueueUpdate } from '../lib/socket.js'
import { fmtClock, fmtRelative } from '../lib/format.js'
import { IconScissors, IconPlus, IconSettings } from '../components/Icons.jsx'

export default function Dashboard() {
  const navigate = useNavigate()
  const toast = useToast()
  const [auth, setAuth] = useState(null)
  const [data, setData] = useState(null)
  const [walkName, setWalkName] = useState('')
  const [busyId, setBusyId] = useState(null)
  const booted = useRef(false)

  useEffect(() => {
    if (!getToken()) {
      navigate('/login', { replace: true })
      return
    }
    let alive = true
    Promise.all([api('/auth/me'), api('/dashboard/queue'), api('/dashboard/slots')])
      .then(([me, board, slots]) => {
        if (!alive || !me.barber) return navigate('/login', { replace: true })
        setAuth(me)
        setData({ ...board, slots: slots.slots })
        joinBarberRoom(me.barber.id)
      })
      .catch(() => alive && navigate('/login', { replace: true }))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!booted.current) {
      booted.current = true
      return
    }
const off = onQueueUpdate(() => {
      refresh()
    })
    return off
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.barber?.id])

  const refresh = useCallback(async () => {
    try {
      const [board, slots] = await Promise.all([api('/dashboard/queue'), api('/dashboard/slots')])
      setData((d) => (d ? { ...d, ...board, slots: slots.slots } : d))
    } catch {
      /* ignore transient failures */
    }
  }, [])

  async function act(action, id) {
    setBusyId(id)
    try {
      await api(`/dashboard/queue/${id}/${action}`, { method: 'POST' })
      await refresh()
    } catch {
      toast('تعذّرت العملية')
    } finally {
      setBusyId(null)
    }
  }

  async function walkIn(e) {
    e.preventDefault()
    if (!walkName.trim()) return
    setBusyId('walkin')
    try {
      await api('/dashboard/walkin', { method: 'POST', body: { customerName: walkName } })
      setWalkName('')
      await refresh()
      toast('تمت إضافة الزبون')
    } catch {
      toast('تعذّرت الإضافة')
    } finally {
      setBusyId(null)
    }
  }

  async function toggleOpen() {
    try {
      await api('/dashboard/settings', {
        method: 'PATCH',
        body: { open: !data?.barber?.open }
      })
      await refresh()
    } catch {
      toast('تعذّر الحفظ')
    }
  }

  async function cancelSlot(id) {
    try {
      await api(`/dashboard/slots/${id}/cancel`, { method: 'POST' })
      await refresh()
    } catch {
      toast('تعذّر الإلغاء')
    }
  }

  function logout() {
    clearToken()
    navigate('/login')
  }

  const queue = data?.queue || []
  const waiting = queue.filter((e) => e.status === 'WAITING')
  const serving = queue.filter((e) => e.status === 'IN_SERVICE')

  return (
    <>
      <div className="pole-ribbon" aria-hidden="true" />
      <div className="app-wide">
        <header className="appbar">
          <div className="appbar-inner" style={{ maxWidth: 1024, marginInline: 'auto', width: '100%' }}>
            <span className="brand">
              <IconScissors width="20" height="20" color="var(--red)" />
              لوحة التحكم
            </span>
            <div className="row" style={{ gap: 6 }}>
              <Link to="/dashboard/settings" className="icon-btn" title="الإعدادات" aria-label="الإعدادات">
                <IconSettings />
              </Link>
              <button className="btn btn-secondary" style={{ width: 'auto', padding: '8px 14px', fontSize: 13 }} onClick={logout}>
                خروج
              </button>
            </div>
          </div>
        </header>

        {!data || !auth ? (
          <div className="app" style={{ paddingTop: 40, textAlign: 'center', color: 'var(--muted)' }}>
            جارٍ التحميل…
          </div>
        ) : (
          <main style={{ padding: '20px 16px' }}>
            <div className="row spread" style={{ marginBottom: 16 }}>
              <div>
                <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--navy)', fontSize: 22, margin: 0 }}>
                  {data.barber.shopName}
                </h1>
                <p style={{ color: 'var(--muted)', fontSize: 13, margin: '2px 0 0' }}>
                  slug: /barber/{data.barber.slug}
                </p>
              </div>
              <button className={`btn ${data.barber.open ? 'btn-secondary' : 'btn-cta'}`} style={{ width: 'auto', padding: '10px 18px', fontSize: 14 }} onClick={toggleOpen}>
                {data.barber.open ? 'مفتوح — أغلق؟' : 'مغلق — افتح؟'}
              </button>
            </div>

            <div className="row" style={{ marginBottom: 18, gap: 10 }}>
              <span className="chip red">المنتظرون: {data.statWaiting}</span>
              <span className="chip gold">قيد الخدمة: {data.statInService}</span>
              <span className="chip green">مكتمل اليوم: {data.doneToday.length}</span>
            </div>

            <div className="stack">
              {/* Queue board */}
              <section className="card">
                <div className="row spread" style={{ marginBottom: 12 }}>
                  <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--navy)', fontSize: 18, margin: 0 }}>
                    الطابور المباشر
                  </h2>
                  <span className="live"><span className="dot" aria-hidden="true" />مباشر</span>
                </div>

                {serving.length > 0 && (
                  <div className="card" style={{ marginBottom: 12, background: 'color-mix(in srgb, var(--gold) 8%, var(--surface))', borderColor: 'color-mix(in srgb, var(--gold) 40%, var(--border))' }}>
                    <div className="row spread">
                      <div className="row">
                        <span className="chip gold">قيد الخدمة</span>
                        <strong>{serving[0].customerName}</strong>
                        <span style={{ color: 'var(--muted)', fontSize: 13 }}>رقم {serving[0].number}</span>
                      </div>
                      <button className="btn btn-cta" style={{ width: 'auto', padding: '10px 18px', fontSize: 14 }} disabled={busyId === serving[0].id} onClick={() => act('done', serving[0].id)}>
                        إنهاء
                      </button>
                    </div>
                  </div>
                )}

                {waiting.length === 0 ? (
                  <p className="empty-state">لا يوجد منتظرون الآن.</p>
                ) : (
                  <div className="stack">
                    {waiting.map((e, i) => (
                      <div key={e.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
                        <span className="tcell-num num" style={{ fontSize: 30 }}>{String(e.number).padStart(2, '0')}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <strong style={{ fontSize: 15 }}>{e.customerName}</strong>
                          <div style={{ color: 'var(--muted)', fontSize: 12.5 }}>انضم قبل {fmtRelative(e.joinedAt)}</div>
                        </div>
                        {i === 0 ? (
                          <button className="btn btn-cta" style={{ width: 'auto', padding: '10px 16px', fontSize: 13 }} disabled={busyId === e.id} onClick={() => act('start', e.id)}>
                            البدء
                          </button>
                        ) : (
                          <span className="chip">{i} قبله</span>
                        )}
                        <button className="icon-btn" title="إلغاء" aria-label="إلغاء" disabled={busyId === e.id} onClick={() => act('cancel', e.id)}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <form onSubmit={walkIn} className="row" style={{ marginTop: 14 }}>
                  <input className="input" style={{ flex: 1 }} placeholder="زبون حضر واقفًا — أدخل اسمه" value={walkName} onChange={(e) => setWalkName(e.target.value)} maxLength={60} />
                  <button className="btn btn-secondary" style={{ width: 'auto', padding: '12px 18px' }} disabled={busyId === 'walkin'}>
                    <IconPlus width="16" height="16" /> إضافة
                  </button>
                </form>
              </section>

              {/* Horaires: today's bookings */}
              <section className="card">
                <div className="row spread" style={{ marginBottom: 12 }}>
                  <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--navy)', fontSize: 18, margin: 0 }}>
                    مواعيد اليوم
                  </h2>
                  <Link to="/dashboard/settings" className="link-btn" style={{ fontSize: 13 }}>
                    تعديل ساعات العمل
                  </Link>
                </div>
                {data.slots.length === 0 ? (
                  <p className="empty-state">لا توجد حجوزات اليوم.</p>
                ) : (
                  <div className="stack">
                    {data.slots
                      .filter((s) => s.status !== 'CANCELLED')
                      .map((s) => (
                        <div key={s.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
                          <span className="chip" style={{ fontSize: 15 }}>{fmtClock(s.startsAt)}</span>
                          <strong style={{ flex: 1 }}>{s.customerName || 'زبون'}</strong>
                          <button className="btn btn-secondary" style={{ width: 'auto', padding: '8px 14px', fontSize: 13 }} onClick={() => cancelSlot(s.id)}>
                            إلغاء
                          </button>
                        </div>
                      ))}
                  </div>
                )}
              </section>

              {/* Recently done */}
              {data.doneToday.length > 0 && (
                <section className="card">
                  <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--navy)', fontSize: 18, margin: '0 0 10px' }}>
                    أُنجِز اليوم
                  </h2>
                  <div className="row">
                    {data.doneToday.map((e) => (
                      <span key={e.id} className="chip green">{e.customerName} · {fmtClock(e.doneAt)}</span>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </main>
        )}
      </div>
    </>
  )
}
