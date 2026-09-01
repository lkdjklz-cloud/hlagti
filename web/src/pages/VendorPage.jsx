import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api, getToken } from '../lib/api.js'
import { useToast } from '../lib/toast.jsx'
import {
  joinBarberRoom,
  onQueueUpdate,
  onTicketUpdate,
  onTicketRemoved,
  onLoyaltyCelebrate,
  joinTicketRoom
} from '../lib/socket.js'
import {
  saveTicket,
  loadTicket,
  clearTicket,
  saveBookingToken,
  loadBookingToken,
  clearBookingToken
} from '../lib/ticket.js'
import { getDeviceId } from '../lib/device.js'
import { subscribePush, isSubscribed } from '../lib/push.js'
import { fmtClock, dowName } from '../lib/format.js'
import AppHeader from '../components/AppHeader.jsx'
import ShopMap from '../components/ShopMap.jsx'
import BarberBanner from '../components/BarberBanner.jsx'
import TicketState from '../components/TicketState.jsx'
import { ConfirmTicket } from '../components/ConfirmTicket.jsx'
import SlotPicker from '../components/SlotPicker.jsx'
import ServicesMenu from '../components/ServicesMenu.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'

function estStartMinutes(etaMinutes) {
  const d = new Date(Date.now() + (etaMinutes || 0) * 60000)
  return fmtClock(d)
}

export default function VendorPage() {
  const { slug } = useParams()
  const toast = useToast()

  const [barber, setBarber] = useState(null)
  const [notFound, setNotFound] = useState(false)
  const [board, setBoard] = useState({ waiting: null, etaMinutes: null })
  const [ticket, setTicket] = useState(null) // active ticket (joined)
  const [appt, setAppt] = useState(null) // active appointment
  const [blocked, setBlocked] = useState(null) // active queue booking restored via device/JWT
  const [confirm, setConfirm] = useState(null) // 'queue' | 'slot' | 'blocked'
  const [busy, setBusy] = useState(false)
  const [pushEnabled, setPushEnabled] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)
  const [loy, setLoy] = useState(null)
  const [celebration, setCelebration] = useState(null)
  const lastAnnounced = useRef(null)
  const deviceId = useMemo(() => getDeviceId(), [])

  // Load barber + board + restore persisted ticket.
  useEffect(() => {
    let alive = true
    api(`/barbers/${slug}`)
      .then((b) => {
        if (!alive) return
        setBarber(b)
        joinBarberRoom(b.id)
      })
      .catch(() => alive && setNotFound(true))

    api(`/barbers/${slug}/queue`)
      .then((snap) => alive && setBoard(snap))
      .catch(() => {})

    const saved = loadTicket(slug)
    if (saved) {
      api(`/queue/my?token=${encodeURIComponent(saved)}`)
        .then((r) => {
          if (!alive) return
          if (r.ticket && r.ticket.status !== 'CANCELLED') {
            setTicket(r.ticket)
            joinTicketRoom(saved)
          } else {
            clearTicket(slug)
          }
        })
        .catch(() => clearTicket(slug))
    }

    // Restore an active booking (guests via deviceId, owners via JWT).
    if (deviceId) {
      api(`/barbers/${slug}/my-booking?deviceId=${encodeURIComponent(deviceId)}`)
        .then((r) => {
          if (!alive || !r.booking) return
          if (r.booking.kind === 'slot' && r.booking.status !== 'CANCELLED') {
            setAppt({ ...r.booking.slot, token: loadBookingToken(slug) })
          } else if (r.booking.kind === 'queue' && !loadTicket(slug)) {
            setBlocked(r.booking.queue)
          }
        })
        .catch(() => {})
    }
    return () => {
      alive = false
    }
  }, [slug, deviceId])

  // The caller's own loyalty progress at this salon (logged-in customers only).
  useEffect(() => {
    if (!barber || !getToken()) return
    let alive = true
    api(`/barbers/${barber.slug}/loyalty/my`)
      .then((r) => {
        if (!alive) return
        setLoy(r.loyalty || null)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [barber])

  // Live board + ticket updates.
  useEffect(() => {
    if (!barber) return
    const offQueue = onQueueUpdate((snap) => {
      setBoard(snap)
      setBarber((b) => (b ? { ...b, open: snap.open } : b))
    })
    const offTicket = onTicketUpdate((upd) => {
      if (!ticket || !upd || upd.id !== ticket.id) return
      setTicket((t) =>
        t
          ? { ...t, position: upd.position, etaMinutes: upd.etaMinutes, waiting: upd.waiting }
          : t
      )
      if (upd.position === 1 && lastAnnounced.current !== 'one') {
        lastAnnounced.current = 'one'
        toast('شخص واحد فقط قبلك — كن جاهزًا، دورك التالي!')
      } else if (upd.position === 0 && lastAnnounced.current !== 'zero') {
        lastAnnounced.current = 'zero'
        toast('أتى دورك! لا أحد قبلك الآن — كن جاهزًا.')
      }
    })
    const offRemoved = onTicketRemoved(() => {
      // Ticket no longer active (cancelled/done by barber).
      setTicket(null)
      // A finished visit changes the loyalty count — refresh the progress line.
      if (getToken()) {
        api(`/barbers/${slug}/loyalty/my`)
          .then((r) => r.loyalty && setLoy(r.loyalty))
          .catch(() => {})
      }
    })
    const offCelebrate = onLoyaltyCelebrate((ev) => {
      if (!ev || !ev.moment) return
      setCelebration({ ...ev })
      // Progress likely changed (the free claim just happened) — refresh.
      if (getToken()) {
        api(`/barbers/${slug}/loyalty/my`)
          .then((r) => r.loyalty && setLoy(r.loyalty))
          .catch(() => {})
      }
    })
    return () => {
      offQueue()
      offTicket()
      offRemoved()
      offCelebrate()
    }
  }, [barber, ticket, toast, slug])

  const join = useCallback(
    async (name) => {
      setBusy(true)
      try {
        const res = await api(`/barbers/${slug}/queue/join`, {
          method: 'POST',
          body: { customerName: (name || '').trim() || undefined, deviceId }
        })
        saveTicket(slug, res.token)
        joinTicketRoom(res.token)
        lastAnnounced.current = null

        const mine = await api(`/queue/my?token=${encodeURIComponent(res.token)}`)
        setTicket(mine.ticket)
        setCelebration(null)
        if (mine.ticket?.loyalty) setLoy(mine.ticket.loyalty)
        setBlocked(null)
        toast('تم تأكيد حجزك')
      } catch (e) {
        toast(
          e.message === 'already_booked'
            ? 'لديك حجز نشط لدى هذا الصالون — ألغِ حجزك الحالي أولًا'
            : e.message === 'forbidden'
              ? 'حدث خطأ — حاول مجددًا'
              : 'تعذّر الحجز'
        )
      } finally {
        setBusy(false)
      }
    },
    [slug, toast, deviceId]
  )

  const cancel = useCallback(async () => {
    if (!ticket) return
    setBusy(true)
    const token = loadTicket(slug) || null
    try {
      const q = new URLSearchParams()
      if (token) q.set('token', token)
      if (deviceId) q.set('deviceId', deviceId)
      await api(`/queue/${ticket.id}?${q.toString()}`, { method: 'DELETE' })
      clearTicket(slug)
      setTicket(null)
      lastAnnounced.current = null
      toast('أُلغِي الحجز')
    } catch {
      toast('تعذّر الإلغاء')
    } finally {
      setBusy(false)
    }
  }, [ticket, slug, toast, deviceId])

  const cancelBlocked = useCallback(async () => {
    if (!blocked) return
    setBusy(true)
    try {
      const q = new URLSearchParams()
      if (deviceId) q.set('deviceId', deviceId)
      await api(`/queue/${blocked.id}?${q.toString()}`, { method: 'DELETE' })
      setBlocked(null)
      toast('أُلغِي حجزك')
    } catch {
      toast('تعذّر الإلغاء')
    } finally {
      setBusy(false)
    }
  }, [blocked, toast, deviceId])

  const onBooked = useCallback(
    (slot, token) => {
      saveBookingToken(slug, token)
      clearTicket(slug)
      setTicket(null)
      setBlocked(null)
      lastAnnounced.current = null
      setAppt({ ...slot, token })
      toast(`تم حجز موعدك — ${dowName(slot.startsAt)} الساعة ${fmtClock(slot.startsAt)}`)
    },
    [slug, toast]
  )

  const cancelAppt = useCallback(async () => {
    if (!appt) return
    setBusy(true)
    try {
      await api(`/barbers/${slug}/slots/${appt.id}/cancel`, {
        method: 'POST',
        body: { token: appt.token || null, deviceId }
      })
      clearBookingToken(slug)
      setAppt(null)
      toast('أُلغِي حجز الموعد')
    } catch {
      toast('تعذّر الإلغاء')
    } finally {
      setBusy(false)
    }
  }, [appt, slug, toast, deviceId])

  function onConfirmCancel() {
    if (confirm === 'queue') cancel()
    else if (confirm === 'slot') cancelAppt()
    else if (confirm === 'blocked') cancelBlocked()
  }

  const push = ticket
    ? {
        enabled: pushEnabled,
        busy: pushBusy,
        onEnable: async () => {
          setPushBusy(true)
          const token = loadTicket(slug)
          const res = await subscribePush({ ticketToken: token })
          setPushBusy(false)
          if (res.ok) {
            setPushEnabled(true)
            toast('تم تفعيل الإشعارات')
          } else if (res.denied) {
            toast('تم رفض الإذن من المتصفح')
          } else if (res.supported === false) {
            toast('متصفحك لا يدعم الإشعارات')
          } else {
            toast('تعذّر التفعيل — جرّب على HTTPS')
          }
        }
      }
    : null

  // Reflect an already-active subscription when a ticket is shown.
  useEffect(() => {
    if (ticket) {
      isSubscribed().then(setPushEnabled)
    }
  }, [ticket])

  async function share() {
    const url = window.location.href
    const title = `${barber?.shopName || 'صالون'} — تذكرة الانتظار`
    if (navigator.share) {
      try {
        await navigator.share({ title, url })
      } catch {
        /* user cancelled */
      }
    } else if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(url)
        toast('تم نسخ رابط الصالون')
      } catch {
        toast('رابط الصالون جاهز')
      }
    } else {
      toast('رابط الصالون جاهز')
    }
  }

  if (notFound) {
    return (
      <>
        <AppHeader />
        <div className="app">
          <div className="empty-state">
            <h2>الصالون غير موجود</h2>
            <p>تأكد من رابط الصفحة أو عد إلى القائمة.</p>
          </div>
        </div>
      </>
    )
  }

  if (!barber) {
    return (
      <>
        <AppHeader />
        <div className="app" style={{ paddingTop: 40, textAlign: 'center', color: 'var(--muted)' }}>
          جارٍ التحميل…
        </div>
      </>
    )
  }

  const estStart = estStartMinutes(board.etaMinutes)

  return (
    <>
      <div className="pole-ribbon" aria-hidden="true" />
      <div className="app">
        <AppHeader onShare={share} />

        <main>
          <BarberBanner barber={barber} />

          {barber.lat !== undefined && barber.lat !== null && barber.lng !== undefined && barber.lng !== null && (
            <section className="card" aria-label="موقع الصالون" style={{ margin: '12px 16px', padding: 14 }}>
              <ShopMap lat={barber.lat} lng={barber.lng} shopName={barber.shopName} />
              <div style={{ marginTop: 10, textAlign: 'center' }}>
                <a
                  className="link-btn"
                  href={`https://www.google.com/maps/search/?api=1&query=${barber.lat},${barber.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: 13.5 }}
                >
                  افتح في الخرائط ↗
                </a>
              </div>
            </section>
          )}

          <section className="ticket-zone" aria-label="تذكرة الانتظار والحجز">
            {celebration && !ticket && !appt && !blocked && (
              <article
                className="ticket"
                role="status"
                style={{
                  border: '2px solid var(--gold)',
                  background: 'linear-gradient(135deg, color-mix(in srgb, var(--gold) 22%, var(--surface)), var(--surface))'
                }}
              >
                <span className="ticket-num" aria-hidden="true">🎉</span>
                <p className="ticket-title" style={{ marginTop: 0 }}>{celebration.title}</p>
                <p className="ticket-info">{celebration.body}</p>
                <div className="ticket-actions">
                  <button className="btn btn-cta" type="button" onClick={() => setCelebration(null)}>
                    حلووووو 🎊
                  </button>
                </div>
              </article>
            )}
            {appt ? (
              <article className="ticket" aria-label="حجز الموعد">
                <span className="ticket-num num">{dowName(appt.startsAt)}</span>
                <p className="ticket-title">حجزك في {barber.shopName}</p>
                <p className="ticket-info">
                  موعدك <b className="num">{fmtClock(appt.startsAt)}</b>
                  <br />
                  {appt.status === 'ARRIVED' ? (
                    <span style={{ color: 'var(--orange)', fontWeight: 700 }}>أنت قادم الآن — جاهز؟</span>
                  ) : (
                    'ستظهر حالتك هنا فور وصولك.'
                  )}
                </p>
                <div className="ticket-actions">
                  <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => setConfirm('slot')}>
                    {busy ? '…' : 'إلغاء الموعد'}
                  </button>
                </div>
              </article>
            ) : blocked ? (
              <article className="ticket" aria-label="حجز نشط">
                <span className="ticket-num num">{blocked.number}</span>
                <p className="ticket-title">لديك دور نشط في هذا الصالون</p>
                <p className="ticket-info">
                  إنه مزاول حاليًا — {blocked.status === 'IN_SERVICE' ? 'دورك الآن' : 'أنت في طابور الانتظار'}.
                </p>
                <div className="ticket-actions">
                  <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => setConfirm('blocked')}>
                    {busy ? '…' : 'إلغاء الحجز'}
                  </button>
                </div>
              </article>
            ) : ticket ? (
              <ConfirmTicket
                ticket={ticket}
                barber={barber}
                busy={busy}
                onCancel={() => setConfirm('queue')}
                push={push}
              />
            ) : (
              <TicketState barber={barber} board={board} busy={busy} loyalty={loy} onJoin={join} />
            )}
            {!ticket && !appt && !blocked && board.etaMinutes !== null && (
              <p className="ticket-micro">
                يبدأ دورك تقريبًا الساعة <b className="num">{estStart}</b> — ونُعلمك عندما يبقى
                شخص واحد فقط قبلك.
              </p>
            )}
          </section>

          {barber.slotsEnabled && !appt && <SlotPicker barber={barber} onBooked={onBooked} />}

          <ServicesMenu services={barber.services} />
        </main>

        <footer className="pagefoot">
          <p className="foot-brand">coiffeur</p>
          <p>اعرف دورك قبل ما تعرف يقابل تصل — صالونك المحلي بلمسة ثقة.</p>
          <p className="micro">عدد الانتظار يتم تحديثه مباشرة عند الحلّاق · © 2026 حلاقتي</p>
        </footer>
      </div>

      <ConfirmDialog
        open={!!confirm}
        title={confirm === 'slot' ? 'إلغاء حجز الموعد' : 'إلغاء حجز الدور'}
        body={
          confirm === 'slot'
            ? 'هل أنت متأكد؟ سيتم إلغاء الموعد نهائيًا وفتحه لحجز زبون آخر.'
            : 'سيتم إلغاء دورك في الطابور نهائيًا ولن تحتفظ برقمك.'
        }
        confirmLabel="إلغاء الحجز"
        busy={busy}
        onConfirm={onConfirmCancel}
        onClose={() => setConfirm(null)}
      />
    </>
  )
}