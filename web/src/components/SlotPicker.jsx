import { memo, useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { useToast } from '../lib/toast.jsx'
import { fmtClock, todayKey, dowShort } from '../lib/format.js'
import { getDeviceId } from '../lib/device.js'
import { IconClock } from './Icons.jsx'

function nextDays(n) {
  const out = []
  const now = new Date()
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i)
    out.push(d)
  }
  return out
}

// User-facing message for a failed booking request.
function bookingErrorMessage(e) {
  if (!e || e.status === undefined) {
    return 'تعذر إتمام الحجز، تحقق من اتصالك بالإنترنت وحاول مرة أخرى'
  }
  switch (e.message) {
    case 'already_booked':
      return 'لديك حجز نشط لدى هذا الصالون — يمكنك الحجز مرة ثانية فقط بعد إلغائه'
    case 'slot_taken':
      return 'هذا الموعد محجوز للأسف — اختر وقتًا آخر'
    case 'slot_in_past':
    case 'slot_outside_hours':
    case 'slot_outside_window':
    case 'slot_off_grid':
    case 'invalid_date':
    case 'invalid_time':
      return 'الوقت المختار غير متاح — اختر وقتًا آخر'
    default:
      return 'تعذر إتمام الحجز، تحقق من اتصالك بالإنترنت وحاول مرة أخرى'
  }
}

const errStyle = {
  color: 'var(--red)',
  fontSize: 12.5,
  margin: '-4px 0 10px',
  fontWeight: 600
}

export default memo(function SlotPicker({ barber, onBooked }) {
  const toast = useToast()
  const days = nextDays(7)
  const [date, setDate] = useState(days[0])
  const [slots, setSlots] = useState([])
  const [closed, setClosed] = useState(false)
  const [selected, setSelected] = useState(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [loadError, setLoadError] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let alive = true
    setSelected(null)
    setSubmitError('')
    setLoadError(false)
    api(`/barbers/${barber.slug}/slots?date=${todayKey(date)}`)
      .then((r) => {
        if (!alive) return
        setSlots(r.slots || [])
        setClosed(!!r.closed)
      })
      .catch(() => {
        if (alive) {
          setSlots([])
          setClosed(false)
          setLoadError(true)
        }
      })
    return () => {
      alive = false
    }
  }, [barber.slug, date, attempt])

  async function refresh() {
    const r = await api(`/barbers/${barber.slug}/slots?date=${todayKey(date)}`).catch(() => null)
    if (r) setSlots(r.slots || [])
  }

  async function book() {
    if (busy) return
    if (!selected) return

    setBusy(true)
    setSubmitError('')
    try {
      const res = await api(`/barbers/${barber.slug}/slots`, {
        method: 'POST',
        body: {
          date: todayKey(date),
          time: selected,
          customerName: name.trim() || undefined,
          deviceId: getDeviceId()
        }
      })
      toast(`تم حجز موعدك الساعة ${fmtClock(res.slot.startsAt)}`)
      if (onBooked) onBooked(res.slot, res.token)
      setSelected(null)
      setName('')
    } catch (e) {
      const msg = bookingErrorMessage(e)
      setSubmitError(msg)
    } finally {
      setBusy(false)
      await refresh()
    }
  }

  return (
    <section className="panel" aria-label="حجز موعد">
      <div className="slot-head">
        <h2>احجز موعدًا</h2>
        <span className="chip gold">الحجز بالوقت</span>
      </div>
      <p className="panel-sub">اختر اليوم والوقت المناسبين — لا داعي للانتظار.</p>

      <div className="slot-days" aria-label="اختيار اليوم">
        {days.map((d, i) => {
          const isToday = i === 0
          const active = d.getTime() === date.getTime()
          return (
            <button
              key={d.getTime()}
              type="button"
              aria-pressed={active}
              className={`day-chip ${active ? 'active' : ''}`}
              onClick={() => setDate(d)}
            >
              <span className="dow">{isToday ? 'اليوم' : dowShort(d)}</span>
              {d.getDate()}
            </button>
          )
        })}
      </div>

      {loadError ? (
        <p className="slot-empty">
          تعذّر تحميل المواعيد.{' '}
          <button type="button" className="link-btn" onClick={() => setAttempt((n) => n + 1)}>
            أعد المحاولة
          </button>
        </p>
      ) : closed ? (
        <p className="slot-empty">الصالون مغلق في هذا اليوم.</p>
      ) : slots.length === 0 ? (
        <p className="slot-empty">لا توجد أوقات متاحة في هذا اليوم.</p>
      ) : (
        <div className="slot-grid">
          {slots.map((s) => (
            <button
              key={s.time}
              type="button"
              className={`slot-chip ${selected === s.time ? 'selected' : ''}`}
              disabled={s.taken}
              onClick={() => setSelected(s.time)}
            >
              {s.time}
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="ticket-cta" style={{ marginTop: '16px' }}>
          <input
            className="input"
            style={{ marginBottom: '10px' }}
            placeholder="اسمك (اختياري)"
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="اسمك (اختياري)"
            disabled={busy}
          />
          {submitError && (
            <p style={{ ...errStyle, margin: '0 0 10px', fontWeight: 700 }}>{submitError}</p>
          )}
          <button className="btn btn-cta" type="button" disabled={busy} aria-busy={busy} onClick={book}>
            {busy ? <span className="spinner" aria-hidden="true" /> : <span>تأكيد الحجز — {selected}</span>}
          </button>
        </div>
      )}

      <p className="ticket-micro" style={{ marginTop: '10px' }}>
        <IconClock width="13" height="13" style={{ display: 'inline-block', verticalAlign: '-2px' }} />{' '}
        الموعد مضمون لك — أكّده فقط عند وصولك.
      </p>
    </section>
  )
})