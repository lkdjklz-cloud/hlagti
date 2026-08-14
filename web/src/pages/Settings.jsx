import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, getToken } from '../lib/api.js'
import { useToast } from '../lib/toast.jsx'
import { IconScissors } from '../components/Icons.jsx'

const DAYS = [
  { key: 'sun', label: 'الأحد' },
  { key: 'mon', label: 'الإثنين' },
  { key: 'tue', label: 'الثلاثاء' },
  { key: 'wed', label: 'الأربعاء' },
  { key: 'thu', label: 'الخميس' },
  { key: 'fri', label: 'الجمعة' },
  { key: 'sat', label: 'السبت' }
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
          slotLengthMinutes: me.barber.slotLengthMinutes,
          loyaltyEvery: me.barber.loyaltyEvery || 0,
          loyaltyEnabled: !!me.barber.loyaltyEvery
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
          loyaltyEvery: form.loyaltyEnabled ? Number(form.loyaltyEvery) || 9 : null,
          workingHours: cleanHours
        }
      })
      toast('تم حفظ الإعدادات')
    } catch {
      toast('تعذّر الحفظ')
    } finally {
      setBusy(false)
    }
  }

  if (!form) {
    return (
      <div className="app" style={{ paddingTop: 40, textAlign: 'center', color: 'var(--muted)' }}>
        جارٍ التحميل…
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
              الإعدادات
            </Link>
            <Link to="/dashboard" className="link-btn">← عودة</Link>
          </div>
        </header>

        <main style={{ padding: '20px 16px', maxWidth: 640, marginInline: 'auto' }}>
          <form onSubmit={save} className="card">
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--navy)', fontSize: 19, margin: '0 0 16px' }}>
              معلومات الصالون
            </h2>
            <div className="field">
              <label className="label">اسم الصالون</label>
              <input className="input" value={form.shopName} onChange={(e) => set('shopName', e.target.value)} />
            </div>
            <div className="row">
              <div className="field inline-field">
                <label className="label">الحي / المنطقة</label>
                <input className="input" value={form.area} onChange={(e) => set('area', e.target.value)} />
              </div>
              <div className="field inline-field">
                <label className="label">المدينة</label>
                <input className="input" value={form.city} onChange={(e) => set('city', e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label className="label">نبذة</label>
              <textarea className="textarea" value={form.bio} onChange={(e) => set('bio', e.target.value)} />
            </div>

            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--navy)', fontSize: 19, margin: '20px 0 12px' }}>
              الطابور والتقديرات
            </h2>
            <div className="row">
              <div className="field inline-field">
                <label className="label">متوسط مدة الحلاقة (دقيقة)</label>
                <input className="input" type="number" min={5} max={120} value={form.avgMinutes} onChange={(e) => set('avgMinutes', e.target.value)} />
              </div>
              <div className="field inline-field">
                <label className="label">مدة الموعد (دقيقة)</label>
                <input className="input" type="number" min={15} max={120} step={5} value={form.slotLengthMinutes} onChange={(e) => set('slotLengthMinutes', e.target.value)} />
              </div>
            </div>

<label className="chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.slotsEnabled} onChange={(e) => set('slotsEnabled', e.target.checked)} />
              تفعيل الحجز بموعد (وقت محدد)
            </label>

            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--navy)', fontSize: 19, margin: '20px 0 12px' }}>
              برنامج الولاء
            </h2>
            <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 12px' }}>
              تمنح زبائنك حلاقة مجانية بعد عدد معيّن من الحلاقات المدفوعة.
            </p>
            <div className="row" style={{ gap: 10 }}>
              <label className="chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: 10, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={form.loyaltyEnabled}
                  onChange={(e) => set('loyaltyEnabled', e.target.checked)}
                />
                تفعيل برنامج الولاء
              </label>
              {form.loyaltyEnabled && (
                <div className="field inline-field">
                  <label className="label">حلاقة مجانية بعد</label>
                  <input
                    className="input"
                    type="number"
                    min={2}
                    max={50}
                    value={form.loyaltyEvery}
                    onChange={(e) => set('loyaltyEvery', e.target.value)}
                  />
                </div>
              )}
            </div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--navy)', fontSize: 19, margin: '20px 0 12px' }}>
              ساعات العمل
            </h2>
            <div className="stack">
              {DAYS.map((d) => {
                const day = hours?.[d.key] || null
                return (
                  <div key={d.key} className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px' }}>
                    <strong style={{ width: 90, fontSize: 14 }}>{d.label}</strong>
                    {day === null ? (
                      <>
                        <span className="chip red">مغلق</span>
                        <button className="link-btn" type="button" style={{ marginLeft: 'auto' }} onClick={() => setHours((h) => ({ ...h, [d.key]: { open: '09:00', close: '22:00' } }))}>
                          فتح؟
                        </button>
                      </>
                    ) : (
                      <>
                        <input className="input" type="time" value={day.open || ''} onChange={(e) => setDay(d.key, 'open', e.target.value)} style={{ width: 110 }} />
                        <span style={{ color: 'var(--muted)' }}>إلى</span>
                        <input className="input" type="time" value={day.close || ''} onChange={(e) => setDay(d.key, 'close', e.target.value)} style={{ width: 110 }} />
                        <button className="link-btn" type="button" style={{ marginLeft: 'auto' }} onClick={() => dayOff(d.key)}>
                          أغلق؟
                        </button>
                      </>
                    )}
                  </div>
                )
              })}
            </div>

            <button className="btn btn-cta" type="submit" style={{ marginTop: 18 }} disabled={busy}>
              {busy ? <span className="spinner" aria-hidden="true" /> : 'حفظ التغييرات'}
            </button>
          </form>
        </main>
      </div>
    </>
  )
}
