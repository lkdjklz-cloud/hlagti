import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../lib/api.js'
import { useToast } from '../lib/toast.jsx'
import {
  joinBarberRoom,
  onQueueUpdate,
  onTicketUpdate,
  onTicketRemoved,
  joinTicketRoom
} from '../lib/socket.js'
import { saveTicket, loadTicket, clearTicket } from '../lib/ticket.js'
import { fmtClock } from '../lib/format.js'
import AppHeader from '../components/AppHeader.jsx'
import BarberBanner from '../components/BarberBanner.jsx'
import TicketState from '../components/TicketState.jsx'
import { ConfirmTicket } from '../components/ConfirmTicket.jsx'
import SlotPicker from '../components/SlotPicker.jsx'
import ServicesMenu from '../components/ServicesMenu.jsx'

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
  const [busy, setBusy] = useState(false)
  const lastAnnounced = useRef(null)

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
    return () => {
      alive = false
    }
  }, [slug])

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
    })
    return () => {
      offQueue()
      offTicket()
      offRemoved()
    }
  }, [barber, ticket, toast])

  const join = useCallback(
    async (name) => {
      setBusy(true)
      try {
        const res = await api(`/barbers/${slug}/queue/join`, {
          method: 'POST',
          body: { customerName: name }
        })
        saveTicket(slug, res.token)
        joinTicketRoom(res.token)
        lastAnnounced.current = null

        const mine = await api(`/queue/my?token=${encodeURIComponent(res.token)}`)
        setTicket(mine.ticket)
        toast('تم تأكيد حجزك')
      } catch (e) {
        toast(e.message === 'forbidden' ? 'حدث خطأ — حاول مجددًا' : 'تعذّر الحجز')
      } finally {
        setBusy(false)
      }
    },
    [slug, toast]
  )

  const cancel = useCallback(async () => {
    if (!ticket) return
    setBusy(true)
    const token = loadTicket(slug)
    try {
      await api(`/queue/${ticket.id}?token=${encodeURIComponent(token)}`, { method: 'DELETE' })
      clearTicket(slug)
      setTicket(null)
      lastAnnounced.current = null
      toast('أُلغِي الحجز')
    } catch {
      toast('تعذّر الإلغاء')
    } finally {
      setBusy(false)
    }
  }, [ticket, slug, toast])

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

          <section className="ticket-zone" aria-label="تذكرة الانتظار والحجز">
            {ticket ? (
              <ConfirmTicket ticket={ticket} barber={barber} busy={busy} onCancel={cancel} />
            ) : (
              <TicketState barber={barber} board={board} busy={busy} onJoin={join} />
            )}
            {!ticket && board.etaMinutes !== null && (
              <p className="ticket-micro">
                يبدأ دورك تقريبًا الساعة <b className="num">{estStart}</b> — ونُعلمك عندما يبقى
                شخص واحد فقط قبلك.
              </p>
            )}
          </section>

          {barber.slotsEnabled && <SlotPicker barber={barber} />}

          <ServicesMenu services={barber.services} />
        </main>

        <footer className="pagefoot">
          <p className="foot-brand">coiffeur</p>
          <p>اعرف دورك قبل ما تعرف يقابل تصل — صالونك المحلي بلمسة ثقة.</p>
          <p className="micro">عدد الانتظار يتم تحديثه مباشرة عند الحلّاق · © 2026 حلاقتي</p>
        </footer>
      </div>
    </>
  )
}