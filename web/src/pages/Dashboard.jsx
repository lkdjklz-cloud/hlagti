import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, clearToken, getToken } from '../lib/api.js'
import { useToast } from '../lib/toast.jsx'
import {
  joinBarberRoom,
  leaveBarberRoom,
  disconnectSocket,
  onQueueUpdate,
  onNotifyNew
} from '../lib/socket.js'
import { fmtClock, fmtRelative } from '../lib/format.js'
import { subscribePush } from '../lib/push.js'
import { IconScissors, IconPlus, IconSettings, IconBell, IconTrash, IconStar } from '../components/Icons.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'

const TABS = [
  { k: 'queue', label: 'الطابور' },
  { k: 'appointments', label: 'المواعيد' },
  { k: 'loyalty', label: 'المكافآت' }
]

export default function Dashboard() {
  const navigate = useNavigate()
  const toast = useToast()
  const [auth, setAuth] = useState(null)
  const [data, setData] = useState(null)
  const [walkName, setWalkName] = useState('')
  const [walkPhone, setWalkPhone] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [tab, setTab] = useState('queue')
  const [loyalty, setLoyalty] = useState({ enabled: false, every: null, customers: [] })
  const [notifs, setNotifs] = useState([])
  const [unread, setUnread] = useState(0)
  const [bellOpen, setBellOpen] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)
  const [bootError, setBootError] = useState(null)
  const [freeChecks, setFreeChecks] = useState({})
  const [confirmAction, setConfirmAction] = useState(null)
  const booted = useRef(false)
  const joinedBarberId = useRef(null)
  const queueDebounce = useRef(null)

  const refresh = useCallback(async () => {
    try {
      const [board, slots, appts, loy] = await Promise.all([
        api('/dashboard/queue'),
        api('/dashboard/slots').catch(() => ({ slots: [] })),
        api('/dashboard/appointments').catch(() => ({ appointments: [] })),
        api('/dashboard/loyalty').catch(() => ({ customers: [] }))
      ])
      setData((d) => (d ? { ...d, ...board, slots: slots.slots, appointments: appts.appointments } : d))
      setLoyalty(loy)
    } catch {
      /* ignore transient failures */
    }
  }, [])

  const loadNotifs = useCallback(async () => {
    try {
      const r = await api('/dashboard/notifications')
      setNotifs(r.notifications || [])
      setUnread(r.unread || 0)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    if (!getToken()) {
      navigate('/login', { replace: true })
      return
    }
    setBootError(null)
    let alive = true
    Promise.all([api('/auth/me'), api('/dashboard/queue')])
      .then(([me, board]) => {
        if (!alive) return
        if (!me.barber) {
          setBootError('هذا الحساب غير مرتبط بصالون. سجّل الخروج ثم أنشئ حساب حلّاق جديد من صفحة الدخول.')
          return
        }
        setAuth(me)
        setData((d) => ({ ...(d || {}), ...board, slots: [], appointments: [] }))
        joinBarberRoom(me.barber.id)
        joinedBarberId.current = me.barber.id
        refresh()
        loadNotifs()
      })
      .catch((err) => {
        if (!alive) return
        const code = err && err.message ? err.message : String(err || 'unknown')
        setBootError(`تعذّر فتح لوحة التحكم — ${code}. تحقق من اتصالك، أو سجّل الخروج وأعد المحاولة.`)
      })
    return () => {
      alive = false
      if (joinedBarberId.current) {
        leaveBarberRoom(joinedBarberId.current)
        joinedBarberId.current = null
      }
      disconnectSocket()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!booted.current) {
      booted.current = true
      return
    }
    const offQueue = onQueueUpdate(() => {
      if (queueDebounce.current) clearTimeout(queueDebounce.current)
      queueDebounce.current = setTimeout(() => {
        queueDebounce.current = null
        refresh()
      }, 500)
    })
    const offNotify = onNotifyNew((n) => {
      if (n && n.id) {
        setNotifs((l) => [n, ...l.filter((x) => x.id !== n.id)])
        setUnread((u) => u + (n.readAt ? 0 : 1))
      }
    })
    return () => {
      if (queueDebounce.current) {
        clearTimeout(queueDebounce.current)
        queueDebounce.current = null
      }
      offQueue()
      offNotify()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.barber?.id])

  async function act(action, id, body) {
    setBusyId(id + ':' + action)
    try {
      await api(`/dashboard/queue/${id}/${action}`, { method: 'POST', body })
      await refresh()
    } catch {
      toast('تعذّرت العملية')
    } finally {
      setBusyId(null)
    }
  }

  async function slotAct(action, id, body) {
    setBusyId('slot-' + id + ':' + action)
    try {
      await api(`/dashboard/slots/${id}/${action}`, { method: 'POST', body })
      await refresh()
    } catch {
      toast('تعذّرت العملية')
    } finally {
      setBusyId(null)
    }
  }

  function runConfirm() {
    if (!confirmAction) return
    const { kind, id } = confirmAction
    setConfirmAction(null)
    if (kind === 'queue') act(confirmAction.action, id)
    else if (kind === 'slot') slotAct(confirmAction.action, id)
  }

  const confirmBusy =
    confirmAction &&
    (confirmAction.kind === 'queue'
      ? busyId === `${confirmAction.id}:${confirmAction.action}`
      : busyId === `slot-${confirmAction.id}:${confirmAction.action}`)

  async function walkIn(e) {
    e.preventDefault()
    if (!walkName.trim()) return
    setBusyId('walkin')
    try {
      await api('/dashboard/walkin', {
        method: 'POST',
        body: { customerName: walkName, phone: walkPhone }
      })
      setWalkName('')
      setWalkPhone('')
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

  function logout() {
    disconnectSocket()
    clearToken()
    navigate('/login')
  }

  async function markRead() {
    try {
      await api('/dashboard/notifications/read', { method: 'POST' })
      setUnread(0)
      setNotifs((l) => l.map((n) => ({ ...n, readAt: new Date().toISOString() })))
    } catch {
      /* ignore */
    }
  }

  async function enablePush() {
    setPushBusy(true)
    const res = await subscribePush({})
    setPushBusy(false)
    if (res.ok) toast('تم تفعيل إشعارات المتصفح')
    else if (res.denied) toast('تم رفض الإذن من المتصفح')
    else if (res.supported === false) toast('متصفحك لا يدعم الإشعارات')
    else toast('تعذّر التفعيل — جرّب على HTTPS')
  }

  const queue = data?.queue || []
  const waiting = queue.filter((e) => e.status === 'WAITING')
  const serving = queue.filter((e) => e.status === 'IN_SERVICE')
  const appointments = data?.appointments || []
  const every = loyalty.every

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
            <div className="row" style={{ gap: 6, position: 'relative' }}>
              <button
                className="icon-btn"
                title="الإشعارات"
                aria-label="الإشعارات"
                onClick={() => setBellOpen((o) => !o)}
              >
                <IconBell />
                {unread > 0 && (
                  <span
                    style={{
                      position: 'absolute',
                      top: -2,
                      insetInlineEnd: -2,
                      background: 'var(--red)',
                      color: 'white',
                      borderRadius: 999,
                      fontSize: 10.5,
                      fontWeight: 700,
                      minWidth: 17,
                      height: 17,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '0 4px'
                    }}
                  >
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </button>
              {bellOpen && (
                <div
                  style={{
                    position: 'absolute',
                    top: 44,
                    insetInlineEnd: 0,
                    width: 320,
                    maxHeight: 360,
                    overflowY: 'auto',
                    zIndex: 50,
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 14,
                    boxShadow: '0 12px 30px rgba(0,0,0,.14)',
                    padding: 8
                  }}
                >
                  <div className="row spread" style={{ padding: '8px 6px' }}>
                    <strong style={{ fontSize: 14 }}>الإشعارات</strong>
                    <div className="row" style={{ gap: 8 }}>
                      <button className="link-btn" type="button" onClick={enablePush}>
                        {pushBusy ? '…' : 'تفعيل الإشعارات'}
                      </button>
                      <button className="link-btn" type="button" onClick={markRead}>
                        قراءة الكل
                      </button>
                    </div>
                  </div>
                  {notifs.length === 0 ? (
                    <p className="empty-state" style={{ padding: 16 }}>
                      لا إشعارات بعد.
                    </p>
                  ) : (
                    notifs.map((n) => (
                      <div
                        key={n.id}
                        style={{
                          padding: '10px 6px',
                          borderBottom: '1px solid var(--border)',
                          opacity: n.readAt ? 0.7 : 1
                        }}
                      >
                        <strong style={{ fontSize: 13.5 }}>{n.title}</strong>
                        <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '2px 0 0' }}>{n.body}</p>
                        <span style={{ fontSize: 11, color: 'var(--muted-2, color-mix(in srgb, var(--muted) 60%, transparent))' }}>
                          {new Date(n.createdAt).toLocaleString('ar-DZ')}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}
              <Link to="/dashboard/services" className="btn btn-secondary" style={{ width: 'auto', padding: '8px 12px', fontSize: 13 }}>
                الخدمات والأسعار
              </Link>
              <Link to="/dashboard/settings" className="icon-btn" title="الإعدادات" aria-label="الإعدادات">
                <IconSettings />
              </Link>
              <button className="btn btn-secondary" style={{ width: 'auto', padding: '8px 14px', fontSize: 13 }} onClick={logout}>
                خروج
              </button>
            </div>
          </div>
        </header>

        {bootError ? (
          <div className="app" style={{ paddingTop: 40 }}>
            <div className="card" style={{ maxWidth: 420, marginInline: 'auto', textAlign: 'center' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--navy)', fontSize: 18, margin: '0 0 8px' }}>
                تعذّر فتح لوحة التحكم
              </h2>
              <p style={{ color: 'var(--muted)', fontSize: 14, margin: '0 0 16px' }}>{bootError}</p>
              <button className="btn btn-cta" style={{ width: 'auto', padding: '10px 20px' }} onClick={logout}>
                تسجيل الخروج
              </button>
            </div>
          </div>
        ) : !data || !auth ? (
          <div className="app" style={{ paddingTop: 40, textAlign: 'center', color: 'var(--muted)' }}>
            جارٍ التحميل…
          </div>
        ) : (
          <main style={{ padding: '20px 16px' }}>
            <div className="row spread" style={{ marginBottom: 12 }}>
              <div>
                <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--navy)', fontSize: 22, margin: 0 }}>
                  {data.barber.shopName}
                </h1>
                <p style={{ color: 'var(--muted)', fontSize: 13, margin: '2px 0 0' }}>
                  صفحتك العامة: <Link to={`/barber/${data.barber.slug}`}>/barber/{data.barber.slug}</Link>
                </p>
              </div>
              <button className={`btn ${data.barber.open ? 'btn-secondary' : 'btn-cta'}`} style={{ width: 'auto', padding: '10px 18px', fontSize: 14 }} onClick={toggleOpen}>
                {data.barber.open ? 'مفتوح — أغلق؟' : 'مغلق — افتح؟'}
              </button>
            </div>

            <div className="row" style={{ gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
              {TABS.map((t) => (
                <button
                  key={t.k}
                  type="button"
                  className={`chip ${tab === t.k ? 'gold' : ''}`}
                  style={{ cursor: 'pointer', padding: '8px 16px', fontSize: 13.5, fontWeight: 700 }}
                  onClick={() => setTab(t.k)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {tab === 'queue' && (
              <div className="stack">
                <div className="row" style={{ marginBottom: 6, gap: 10 }}>
                  <span className="chip red">المنتظرون: {data.statWaiting}</span>
                  <span className="chip gold">قيد الخدمة: {data.statInService}</span>
                  <span className="chip green">مكتمل اليوم: {data.doneToday.length}</span>
                </div>

                {serving.length > 0 && (
                  <section className="card" style={{ marginBottom: 12, background: 'color-mix(in srgb, var(--gold) 8%, var(--surface))', borderColor: 'color-mix(in srgb, var(--gold) 40%, var(--border))' }}>
                    {serving.map((e) => (
                      <div key={e.id} className="row spread" style={{ padding: '6px 0' }}>
                        <div className="row">
                          <span className="chip gold">قيد الخدمة</span>
                          <strong>{e.customerName}</strong>
                          <span style={{ color: 'var(--muted)', fontSize: 13 }}>رقم {e.number}</span>
                          {e.customerPhone && <span style={{ color: 'var(--muted)', fontSize: 12 }}>• {e.customerPhone}</span>}
                          {e.loyaltyNextFree && (
                            <span className="chip gold" style={{ fontSize: 11.5 }}>
                              🎁 حلاقة مجانية — علّمها مجانية
                            </span>
                          )}
                        </div>
                        <div className="row" style={{ gap: 6 }}>
                          <label className="label" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, margin: 0, fontSize: 12.5 }}>
                            <input
                              type="checkbox"
                              checked={!!freeChecks[e.id]}
                              onChange={(ev) => setFreeChecks((c) => ({ ...c, [e.id]: ev.target.checked }))}
                              style={{ width: 16, height: 16 }}
                            />
                            مجانية
                          </label>
                          <button
                            className="btn btn-cta"
                            style={{ width: 'auto', padding: '10px 18px', fontSize: 14 }}
                            disabled={busyId === `${e.id}:done`}
                            onClick={() => act('done', e.id, { paid: !freeChecks[e.id] })}
                          >
                            {busyId === `${e.id}:done` ? <span className="spinner" aria-hidden="true" /> : 'إنهاء'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </section>
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
                          <div style={{ color: 'var(--muted)', fontSize: 12.5 }}>
                            انضم قبل {fmtRelative(e.joinedAt)}
                            {e.customerPhone ? ` • ${e.customerPhone}` : ''}
                          </div>
                          {e.loyaltyNextFree && (
                            <span className="chip gold" style={{ fontSize: 11, marginTop: '6px' }}>
                              🎁 هذه الحلاقة مجانية
                            </span>
                          )}
                        </div>
                        {i === 0 ? (
                          <button className="btn btn-cta" style={{ width: 'auto', padding: '10px 16px', fontSize: 13 }} disabled={busyId === `${e.id}:start`} onClick={() => act('start', e.id)}>
                            {busyId === `${e.id}:start` ? <span className="spinner" aria-hidden="true" /> : 'البدء'}
                          </button>
                        ) : (
                          <span className="chip">{i} قبله</span>
                        )}
                        <button className="icon-btn" title="إلغاء" aria-label="إلغاء" disabled={busyId === `${e.id}:cancel`} onClick={() => setConfirmAction({ kind: 'queue', action: 'cancel', id: e.id })}>
                          <IconTrash />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <form onSubmit={walkIn} className="row" style={{ marginTop: 14, flexWrap: 'wrap', gap: 8 }}>
                  <input className="input" style={{ flex: 1, minWidth: 140 }} placeholder="زبون حضر واقفًا — أدخل اسمه" value={walkName} onChange={(e) => setWalkName(e.target.value)} maxLength={60} />
                  <input className="input" style={{ width: 130 }} placeholder="هاتفه (اختياري)" dir="ltr" value={walkPhone} onChange={(e) => setWalkPhone(e.target.value)} maxLength={20} />
                  <button className="btn btn-secondary" style={{ width: 'auto', padding: '12px 18px' }} disabled={busyId === 'walkin'}>
                    <IconPlus width="16" height="16" /> إضافة
                  </button>
                </form>

                <section className="card">
                  <div className="row spread" style={{ marginBottom: 12 }}>
                    <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--navy)', fontSize: 18, margin: 0 }}>
                      مواعيد اليوم
                    </h2>
                    <button className="link-btn" type="button" style={{ fontSize: 13 }} onClick={() => setTab('appointments')}>
                      كل المواعيد ←
                    </button>
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
                            <strong style={{ flex: 1 }}>{s.customerName || 'زبون'}{s.customerPhone ? ` • ${s.customerPhone}` : ''}</strong>
                            {s.loyaltyNextFree && <span className="chip gold" style={{ fontSize: 11 }}>🎁 مجانية قادمة</span>}
                            <button className="btn btn-secondary" style={{ width: 'auto', padding: '8px 14px', fontSize: 13 }} onClick={() => setConfirmAction({ kind: 'slot', action: 'cancel', id: s.id })}>
                              إلغاء
                            </button>
                          </div>
                        ))}
                    </div>
                  )}
                </section>
              </div>
            )}

            {tab === 'appointments' && (
              <section className="card">
                <div className="row spread" style={{ marginBottom: 12 }}>
                  <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--navy)', fontSize: 18, margin: 0 }}>
                    الزبائن الذين حجزوا — اليوم والأيام القادمة
                  </h2>
                  <span className="chip gold">{appointments.length} حجز</span>
                </div>
                {appointments.length === 0 ? (
                  <p className="empty-state">لا توجد مواعيد قادمة — شارك رابط صفحتك ليحجز الزبائن.</p>
                ) : (
                  <div className="stack">
                    {appointments.map((s) => (
                      <div key={s.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', flexWrap: 'wrap' }}>
                        <div style={{ minWidth: 120 }}>
                          <strong className="num" style={{ fontSize: 16, color: 'var(--navy)' }}>{fmtClock(s.startsAt)}</strong>
                          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                            {new Date(s.startsAt).toLocaleDateString('ar-DZ', { weekday: 'short', day: 'numeric', month: 'short' })}
                          </div>
                        </div>
                        <div style={{ flex: 1, minWidth: 120 }}>
                          <strong style={{ fontSize: 15 }}>{s.customerName || 'زبون'}</strong>
                          <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                            {s.customerPhone || 'بدون هاتف'}
                          </div>
                          {s.loyaltyNextFree && (
                            <span className="chip gold" style={{ fontSize: 11, marginTop: 4 }}>
                              🎁 حلاقته قادمة مجانية
                            </span>
                          )}
                        </div>
                        {s.status === 'ARRIVED' ? (
                          <>
                            <span className="chip gold">حضر</span>
                            <label className="label" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, margin: 0, fontSize: 12.5 }}>
                              <input
                                type="checkbox"
                                checked={!!freeChecks[`s${s.id}`]}
                                onChange={(ev) => setFreeChecks((c) => ({ ...c, [`s${s.id}`]: ev.target.checked }))}
                                style={{ width: 16, height: 16 }}
                              />
                              مجانية
                            </label>
                            <button
                              className="btn btn-cta"
                              style={{ width: 'auto', padding: '9px 14px', fontSize: 13 }}
                              disabled={busyId === `slot-${s.id}:done`}
                              onClick={() => slotAct('done', s.id, { paid: !freeChecks[`s${s.id}`] })}
                            >
                              {busyId === `slot-${s.id}:done` ? <span className="spinner" aria-hidden="true" /> : 'غادر وتم'}
                            </button>
                          </>
                        ) : (
                          <>
                            <button className="btn btn-secondary" style={{ width: 'auto', padding: '9px 14px', fontSize: 13 }} disabled={busyId === `slot-${s.id}:arrive`} onClick={() => slotAct('arrive', s.id)}>
                              {busyId === `slot-${s.id}:arrive` ? <span className="spinner" aria-hidden="true" /> : 'حضر'}
                            </button>
                            <button className="btn btn-secondary" style={{ width: 'auto', padding: '9px 14px', fontSize: 13 }} disabled={busyId === `slot-${s.id}:cancel`} onClick={() => setConfirmAction({ kind: 'slot', action: 'cancel', id: s.id })}>
                              حذف
                            </button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <p className="ticket-micro" style={{ marginTop: 12 }}>
                  «حضر» تعني وصول الزبون لموعده، و«غادر وتم» تحذف الموعد بعد خروجه من الصالون.
                </p>
              </section>
            )}

            {tab === 'loyalty' && (
              <div className="stack">
                <section className="card">
                  <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--navy)', fontSize: 18, margin: '0 0 8px' }}>
                    <IconStar width="18" height="18" style={{ display: 'inline-block', verticalAlign: '-3px', color: 'var(--gold)' }} /> برنامج الولاء
                  </h2>
                  {!loyalty.enabled ? (
                    <p className="empty-state">
                      الولاء غير مفعّل. فعّله من <Link to="/dashboard/settings">الإعدادات</Link> — مثال: «حلاقة مجانية بعد 9 حلقات مدفوعة».
                    </p>
                  ) : (
                    <p style={{ color: 'var(--muted)', fontSize: 13.5 }}>
                      الزبون يحصل على حلاقة مجانية بعد <b>{every}</b> زيارات مدفوعة. عند «إنهاء» أو «غادر وتم» يمكنك
                      تعليم الحلاقة <b>مجانية</b> حتى لا تُحتسب ضمن الزيارات المدفوعة.
                    </p>
                  )}
                </section>

                {loyalty.enabled && (
                  <section className="card">
                    <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--navy)', fontSize: 18, margin: '0 0 10px' }}>
                      تقدم الزبائن
                    </h2>
                    {loyalty.customers.length === 0 ? (
                      <p className="empty-state">لا توجد زيارات مكتملة بعد اليوم.</p>
                    ) : (
                      <div className="stack">
                        {loyalty.customers.map((c) => (
                          <div key={c.name + c.phone} className="card" style={{ padding: '12px 16px' }}>
                            <div className="row spread">
                              <div>
                                <strong>{c.name}</strong>
                                <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                                  {c.phone || 'بدون هاتف'} • {c.paid} مدفوعة{c.free ? ` • ${c.free} مجانية` : ''}
                                </div>
                              </div>
                              {c.nextFree ? (
                                <span className="chip gold">الزيارة القادمة مجانية!</span>
                              ) : (
                                <span className="chip">{c.inCycle} من {every}</span>
                              )}
                            </div>
                            <div
                              style={{
                                marginTop: 10,
                                height: 8,
                                borderRadius: 999,
                                background: 'color-mix(in srgb, var(--border) 70%, transparent)',
                                overflow: 'hidden'
                              }}
                            >
                              <div
                                style={{
                                  width: `${Math.min(100, (c.inCycle / every) * 100)}%`,
                                  height: '100%',
                                  background: c.nextFree ? 'var(--gold)' : 'linear-gradient(90deg, var(--red), var(--gold))',
                                  borderRadius: 999
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                )}
              </div>
            )}
          </main>
        )}
      </div>
      <ConfirmDialog
        open={!!confirmAction}
        title={confirmAction && confirmAction.action === 'cancel' ? 'تأكيد الإلغاء' : 'تأكيد العملية'}
        body={
          confirmAction && confirmAction.action === 'cancel'
            ? 'سيتم إلغاء هذا البند ولا يمكن التراجع. هل تريد المتابعة؟'
            : 'هل تريد تنفيذ هذه العملية؟'
        }
        confirmLabel={confirmAction && confirmAction.action === 'cancel' ? 'إلغاء' : 'تأكيد'}
        busy={!!confirmBusy}
        onConfirm={runConfirm}
        onClose={() => setConfirmAction(null)}
      />
    </>
  )
}