import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, getToken } from '../lib/api.js'
import { useToast } from '../lib/toast.jsx'
import { IconScissors } from '../components/Icons.jsx'

const DAYS = [
  { key: 'sun', label: 'Ø§Ù„Ø£Ø­Ø¯' },
  { key: 'mon', label: 'Ø§Ù„Ø¥Ø«Ù†ÙŠÙ†' },
  { key: 'tue', label: 'Ø§Ù„Ø«Ù„Ø§Ø«Ø§Ø¡' },
  { key: 'wed', label: 'Ø§Ù„Ø£Ø±Ø¨Ø¹Ø§Ø¡' },
  { key: 'thu', label: 'Ø§Ù„Ø®Ù…ÙŠØ³' },
  { key: 'fri', label: 'Ø§Ù„Ø¬Ù…Ø¹Ø©' },
  { key: 'sat', label: 'Ø§Ù„Ø³Ø¨Øª' }
]

export default function Settings() {
  const navigate = useNavigate()
  const toast = useToast()
  const [form, setForm] = useState(null)
  const [hours, setHours] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!getToken()) return navigate('/login', { replace: true })
    api('/auth/me')
      .then((me) => {
        if (!me.barber) return navigate('/login', { replace: true })
        let wh = {}
        try {
          wh = JSON.parse(me.barber.workingHours || '{}')
        } catch {
          wh = {}
        }
        setForm({
          shopName: me.barber.shopName,
          area: me.barber.area || '',
          city: me.barber.city || '',
          bio: me.barber.bio || '',
          avgMinutes: me.barber.avgMinutes,
          slotsEnabled: me.barber.slotsEnabled,
          slotLengthMinutes: me.barber.slotLengthMinutes
        })
        setHours(wh)
      })
      .catch(() => navigate('/login', { replace: true }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  function setDay(key, sub, value) {
    setHours((h) => {
      const day = h[key] || {}
      const next = { ...h, [key]: { ...day, [sub]: value } }
      if (!next[key].open && !next[key].close) next[key] = null
      return next
    })
  }

  function dayOff(key) {
    setHours((h) => {
      const next = { ...h, [key]: null }
      return next
    })
  }

  async function save(e) {
    e.preventDefault()
    setBusy(true)
    const cleanHours = { ...hours }
    for (const k of Object.keys(cleanHours)) {
      const d = cleanHours[k]
      if (d && !d.open && !d.close) cleanHours[k] = null
    }
    try {
      await api('/dashboard/settings', {
        method: 'PATCH',
        body: {
          ...form,
          avgMinutes: Number(form.avgMinutes) || 17,
          slotLengthMinutes: Number(form.slotLengthMinutes) || 30,
          workingHours: cleanHours
        }
      })
      toast('ØªÙ… Ø­ÙØ¸ Ø§Ù„Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª')
    } catch {
      toast('ØªØ¹Ø°Ù‘Ø± Ø§Ù„Ø­ÙØ¸')
    } finally {
      setBusy(false)
    }
  }

  if (!form) {
    return (
      <div className="app" style={{ paddingTop: 40, textAlign: 'center', color: 'var(--muted)' }}>
        Ø¬Ø§Ø±Ù Ø§Ù„ØªØ­Ù…ÙŠÙ„â€¦
      </div>
    )
  }

  return (
    <>
      <div className="pole-ribbon" aria-hidden="true" />
      <div className="app-wide">
        <header className="appbar">
          <div className="appbar-inner" style={{ maxWidth: 1024, marginInline: 'auto', width: '100%' }}>
            <Link to="/dashboard" className="brand brand-link">
              <IconScissors width="20" height="20" color="var(--red)" />
              Ø§Ù„Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª
            </Link>
            <Link to="/dashboard" className="link-btn">â† Ø¹ÙˆØ¯Ø©</Link>
          </div>
        </header>

        <main style={{ padding: '20px 16px', maxWidth: 640, marginInline: 'auto' }}>
          <form onSubmit={save} className="card">
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--navy)', fontSize: 19, margin: '0 0 16px' }}>
              Ù…Ø¹Ù„ÙˆÙ…Ø§Øª Ø§Ù„ØµØ§Ù„ÙˆÙ†
            </h2>
            <div className="field">
              <label className="label">Ø§Ø³Ù… Ø§Ù„ØµØ§Ù„ÙˆÙ†</label>
              <input className="input" value={form.shopName} onChange={(e) => set('shopName', e.target.value)} />
            </div>
            <div className="row">
              <div className="field inline-field">
                <label className="label">Ø§Ù„Ø­ÙŠ / Ø§Ù„Ù…Ù†Ø·Ù‚Ø©</label>
                <input className="input" value={form.area} onChange={(e) => set('area', e.target.value)} />
              </div>
              <div className="field inline-field">
                <label className="label">Ø§Ù„Ù…Ø¯ÙŠÙ†Ø©</label>
                <input className="input" value={form.city} onChange={(e) => set('city', e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label className="label">Ù†Ø¨Ø°Ø©</label>
              <textarea className="textarea" value={form.bio} onChange={(e) => set('bio', e.target.value)} />
            </div>

            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--navy)', fontSize: 19, margin: '20px 0 12px' }}>
              Ø§Ù„Ø·Ø§Ø¨ÙˆØ± ÙˆØ§Ù„ØªÙ‚Ø¯ÙŠØ±Ø§Øª
            </h2>
            <div className="row">
              <div className="field inline-field">
                <label className="label">Ù…ØªÙˆØ³Ø· Ù…Ø¯Ø© Ø§Ù„Ø­Ù„Ø§Ù‚Ø© (Ø¯Ù‚ÙŠÙ‚Ø©)</label>
                <input className="input" type="number" min={5} max={120} value={form.avgMinutes} onChange={(e) => set('avgMinutes', e.target.value)} />
              </div>
              <div className="field inline-field">
                <label className="label">Ù…Ø¯Ø© Ø§Ù„Ù…ÙˆØ¹Ø¯ (Ø¯Ù‚ÙŠÙ‚Ø©)</label>
                <input className="input" type="number" min={15} max={120} step={5} value={form.slotLengthMinutes} onChange={(e) => set('slotLengthMinutes', e.target.value)} />
              </div>
            </div>

            <label className="chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.slotsEnabled} onChange={(e) => set('slotsEnabled', e.target.checked)} />
              ØªÙØ¹ÙŠÙ„ Ø§Ù„Ø­Ø¬Ø² Ø¨Ù…ÙˆØ¹Ø¯ (ÙˆÙ‚Øª Ù…Ø­Ø¯Ø¯)
            </label>

            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--navy)', fontSize: 19, margin: '20px 0 12px' }}>
              Ø³Ø§Ø¹Ø§Øª Ø§Ù„Ø¹Ù…Ù„
            </h2>
            <div className="stack">
              {DAYS.map((d) => {
                const day = hours?.[d.key] || null
                return (
                  <div key={d.key} className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px' }}>
                    <strong style={{ width: 90, fontSize: 14 }}>{d.label}</strong>
                    {day === null ? (
                      <>
                        <span className="chip red">Ù…ØºÙ„Ù‚</span>
                        <button className="link-btn" type="button" style={{ marginLeft: 'auto' }} onClick={() => setHours((h) => ({ ...h, [d.key]: { open: '09:00', close: '22:00' } }))}>
                          ÙØªØ­ØŸ
                        </button>
                      </>
                    ) : (
                      <>
                        <input className="input" type="time" value={day.open || ''} onChange={(e) => setDay(d.key, 'open', e.target.value)} style={{ width: 110 }} />
                        <span style={{ color: 'var(--muted)' }}>Ø¥Ù„Ù‰</span>
                        <input className="input" type="time" value={day.close || ''} onChange={(e) => setDay(d.key, 'close', e.target.value)} style={{ width: 110 }} />
                        <button className="link-btn" type="button" style={{ marginLeft: 'auto' }} onClick={() => dayOff(d.key)}>
                          Ø£ØºÙ„Ù‚ØŸ
                        </button>
                      </>
                    )}
                  </div>
                )
              })}
            </div>

            <button className="btn btn-cta" type="submit" style={{ marginTop: 18 }} disabled={busy}>
              {busy ? <span className="spinner" aria-hidden="true" /> : 'Ø­ÙØ¸ Ø§Ù„ØªØºÙŠÙŠØ±Ø§Øª'}
            </button>
          </form>
        </main>
      </div>
    </>
  )
}
