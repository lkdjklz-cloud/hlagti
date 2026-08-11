import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { api, setToken } from '../lib/api.js'
import { useToast } from '../lib/toast.jsx'
import { IconScissors } from '../components/Icons.jsx'

export default function Login() {
  const navigate = useNavigate()
  const toast = useToast()
  const [mode, setMode] = useState('login')
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({
    email: 'demo@barber.test',
    password: 'demo1234',
    name: '',
    shopName: '',
    area: '',
    city: ''
  })

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    try {
      const body = mode === 'login' ? { email: form.email, password: form.password } : { ...form }
      const path = mode === 'login' ? '/auth/login' : '/auth/register/barber'
      const res = await api(path, { method: 'POST', body })
      setToken(res.token)
      toast('ØªÙ… Ø§Ù„Ø¯Ø®ÙˆÙ„ Ø¨Ù†Ø¬Ø§Ø­')
      navigate('/dashboard')
    } catch (err) {
      toast(err.message === 'bad_credentials' ? 'Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ø¯Ø®ÙˆÙ„ ØºÙŠØ± ØµØ­ÙŠØ­Ø©' : 'Ø­Ø¯Ø« Ø®Ø·Ø£ØŒ Ø­Ø§ÙˆÙ„ Ù…Ø¬Ø¯Ø¯Ù‹Ø§')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="pole-ribbon" aria-hidden="true" />
      <div className="app">
        <header className="appbar">
          <div className="appbar-inner">
            <Link to="/" className="brand brand-link">
              <IconScissors width="20" height="20" color="var(--red)" />
              Ø­Ù„Ø§Ù‚ØªÙŠ
            </Link>
          </div>
        </header>

        <main style={{ padding: '28px 16px 0' }}>
          <div className="card" style={{ maxWidth: 420, marginInline: 'auto' }}>
            <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--navy)', fontSize: 22, margin: '0 0 4px' }}>
              {mode === 'login' ? 'Ø¯Ø®ÙˆÙ„ Ø§Ù„Ø­Ù„Ù‘Ø§Ù‚' : 'Ø­Ø³Ø§Ø¨ Ø­Ù„Ù‘Ø§Ù‚ Ø¬Ø¯ÙŠØ¯'}
            </h1>
            <p style={{ color: 'var(--muted)', fontSize: 13.5, margin: '0 0 18px' }}>
              {mode === 'login'
                ? 'Ø³Ø¬Ù‘Ù„ Ø¯Ø®ÙˆÙ„Ùƒ Ù„Ø¥Ø¯Ø§Ø±Ø© Ø·Ø§Ø¨ÙˆØ± Ø§Ù„ØµØ§Ù„ÙˆÙ†.'
                : 'Ø£Ù†Ø´Ø¦ ØµÙØ­ØªÙƒ â€” Ø³ÙŠØ¸Ù‡Ø± Ø±Ø§Ø¨Ø·Ù‡Ø§ Ù„Ù„Ø²Ø¨Ø§Ø¦Ù† ÙÙˆØ±Ù‹Ø§.'}
            </p>

            <form onSubmit={submit}>
              {mode === 'register' && (
                <>
                  <div className="field">
                    <label className="label">Ø§Ø³Ù…Ùƒ</label>
                    <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} required />
                  </div>
                  <div className="field">
                    <label className="label">Ø§Ø³Ù… Ø§Ù„ØµØ§Ù„ÙˆÙ†</label>
                    <input className="input" value={form.shopName} onChange={(e) => set('shopName', e.target.value)} required />
                  </div>
                  <div className="row" style={{ marginBottom: '14px' }}>
                    <div className="field inline-field">
                      <label className="label">Ø§Ù„Ø­ÙŠ / Ø§Ù„Ù…Ù†Ø·Ù‚Ø©</label>
                      <input className="input" value={form.area} onChange={(e) => set('area', e.target.value)} />
                    </div>
                    <div className="field inline-field">
                      <label className="label">Ø§Ù„Ù…Ø¯ÙŠÙ†Ø©</label>
                      <input className="input" value={form.city} onChange={(e) => set('city', e.target.value)} />
                    </div>
                  </div>
                </>
              )}

              <div className="field">
                <label className="label">Ø§Ù„Ø¨Ø±ÙŠØ¯ Ø§Ù„Ø¥Ù„ÙƒØªØ±ÙˆÙ†ÙŠ</label>
                <input className="input" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} required />
              </div>
              <div className="field">
                <label className="label">ÙƒÙ„Ù…Ø© Ø§Ù„Ù…Ø±ÙˆØ±</label>
                <input className="input" type="password" value={form.password} onChange={(e) => set('password', e.target.value)} required minLength={6} />
              </div>

              <button className="btn btn-cta" type="submit" disabled={busy}>
                {busy ? <span className="spinner" aria-hidden="true" /> : mode === 'login' ? 'Ø¯Ø®ÙˆÙ„' : 'Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„Ø­Ø³Ø§Ø¨'}
              </button>
            </form>

            <p style={{ textAlign: 'center', marginTop: 16, fontSize: 14 }}>
              {mode === 'login' ? (
                <>
                  Ù„ÙŠØ³ Ù„Ø¯ÙŠÙƒ Ø­Ø³Ø§Ø¨ØŸ{' '}
                  <button className="link-btn" type="button" onClick={() => setMode('register')}>
                    Ø³Ø¬Ù‘Ù„ ØµØ§Ù„ÙˆÙ†Ùƒ
                  </button>
                </>
              ) : (
                <>
                  Ù„Ø¯ÙŠÙƒ Ø­Ø³Ø§Ø¨ØŸ{' '}
                  <button className="link-btn" type="button" onClick={() => setMode('login')}>
                    Ø¯Ø®ÙˆÙ„
                  </button>
                </>
              )}
            </p>
          </div>
        </main>
      </div>
    </>
  )
}
