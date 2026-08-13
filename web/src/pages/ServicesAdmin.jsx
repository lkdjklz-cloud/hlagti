import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, getToken } from '../lib/api.js'
import { useToast } from '../lib/toast.jsx'
import { IconPlus, IconTrash, IconScissors } from '../components/Icons.jsx'
import { fmtPrice } from '../lib/format.js'

const empty = { name: '', price: '', durationMinutes: '20' }

export default function ServicesAdmin() {
  const navigate = useNavigate()
  const toast = useToast()
  const [services, setServices] = useState([])
  const [draft, setDraft] = useState({ ...empty })
  const [busy, setBusy] = useState(false)

  const load = () =>
    api('/dashboard/services')
      .then((r) => setServices(r.services))
      .catch(() => navigate('/login', { replace: true }))

  useEffect(() => {
    if (!getToken()) return navigate('/login', { replace: true })
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function add(e) {
    e.preventDefault()
    if (!draft.name.trim()) return
    setBusy(true)
    try {
      await api('/dashboard/services', {
        method: 'POST',
        body: { name: draft.name, price: Number(draft.price) || 0, durationMinutes: Number(draft.durationMinutes) || 20 }
      })
      setDraft({ ...empty })
      await load()
    } catch {
      toast('تعذّرت الإضافة')
    } finally {
      setBusy(false)
    }
  }

  async function remove(id) {
    try {
      await api(`/dashboard/services/${id}`, { method: 'DELETE' })
      await load()
    } catch {
      toast('تعذّر الحذف')
    }
  }

  return (
    <>
      <div className="pole-ribbon" aria-hidden="true" />
      <div className="app-wide">
        <header className="appbar">
          <div className="appbar-inner" style={{ maxWidth: 1024, marginInline: 'auto', width: '100%' }}>
            <Link to="/dashboard" className="brand brand-link">
              <IconScissors width="20" height="20" color="var(--red)" />
              الخدمات والأسعار
            </Link>
            <Link to="/dashboard" className="link-btn">← عودة</Link>
          </div>
        </header>

        <main style={{ padding: '20px 16px', maxWidth: 640, marginInline: 'auto' }}>
          <form onSubmit={add} className="card" style={{ marginBottom: 16 }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--navy)', fontSize: 18, margin: '0 0 14px' }}>
              <IconPlus width="18" height="18" style={{ display: 'inline-block', verticalAlign: '-3px' }} /> خدمة جديدة
            </h2>
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <div className="field" style={{ flex: 2, minWidth: 140, marginBottom: 0 }}>
                <label className="label">اسم الخدمة</label>
                <input className="input" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="مثال: قصّة" />
              </div>
              <div className="field" style={{ flex: 1, minWidth: 100, marginBottom: 0 }}>
                <label className="label">السعر (دج)</label>
                <input className="input" type="number" min={0} value={draft.price} onChange={(e) => setDraft((d) => ({ ...d, price: e.target.value }))} />
              </div>
              <div className="field" style={{ flex: 1, minWidth: 100, marginBottom: 0 }}>
                <label className="label">المدة (دق)</label>
                <input className="input" type="number" min={5} max={240} value={draft.durationMinutes} onChange={(e) => setDraft((d) => ({ ...d, durationMinutes: e.target.value }))} />
              </div>
              <button className="btn btn-cta" style={{ width: 'auto', padding: '12px 18px' }} disabled={busy}>
                {busy ? <span className="spinner" aria-hidden="true" /> : 'إضافة'}
              </button>
            </div>
          </form>

          <div className="card">
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--navy)', fontSize: 18, margin: '0 0 8px' }}>
              الخدمات الحالية
            </h2>
            {services.length === 0 && <p className="empty-state">أضف أول خدمة لك.</p>}
            <div className="menu">
              {services.map((s) => (
                <div className="menu-row" key={s.id}>
                  <span className="menu-name">{s.name}</span>
                  <span className="dots" aria-hidden="true" />
                  <span className="menu-price">{fmtPrice(s.price)} دج</span>
                  <span className="chip" style={{ fontSize: 12 }}>{s.durationMinutes} د</span>
                  <button className="icon-btn" title="حذف" aria-label="حذف" onClick={() => remove(s.id)}>
                    <IconTrash />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    </>
  )
}
