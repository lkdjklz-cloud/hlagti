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
      toast('تم الدخول بنجاح')
      navigate('/dashboard')
    } catch (err) {
      toast(err.message === 'bad_credentials' ? 'بيانات الدخول غير صحيحة' : 'حدث خطأ، حاول مجددًا')
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
              حلاقتي
            </Link>
          </div>
        </header>

        <main style={{ padding: '28px 16px 0' }}>
          <div className="card" style={{ maxWidth: 420, marginInline: 'auto' }}>
            <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--navy)', fontSize: 22, margin: '0 0 4px' }}>
              {mode === 'login' ? 'دخول الحلّاق' : 'حساب حلّاق جديد'}
            </h1>
            <p style={{ color: 'var(--muted)', fontSize: 13.5, margin: '0 0 18px' }}>
              {mode === 'login'
                ? 'سجّل دخولك لإدارة طابور الصالون.'
                : 'أنشئ صفحتك — سيظهر رابطها للزبائن فورًا.'}
            </p>

            <form onSubmit={submit}>
              {mode === 'register' && (
                <>
                  <div className="field">
                    <label className="label">اسمك</label>
                    <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} required />
                  </div>
                  <div className="field">
                    <label className="label">اسم الصالون</label>
                    <input className="input" value={form.shopName} onChange={(e) => set('shopName', e.target.value)} required />
                  </div>
                  <div className="row" style={{ marginBottom: '14px' }}>
                    <div className="field inline-field">
                      <label className="label">الحي / المنطقة</label>
                      <input className="input" value={form.area} onChange={(e) => set('area', e.target.value)} />
                    </div>
                    <div className="field inline-field">
                      <label className="label">المدينة</label>
                      <input className="input" value={form.city} onChange={(e) => set('city', e.target.value)} />
                    </div>
                  </div>
                </>
              )}

              <div className="field">
                <label className="label">البريد الإلكتروني</label>
                <input className="input" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} required />
              </div>
              <div className="field">
                <label className="label">كلمة المرور</label>
                <input className="input" type="password" value={form.password} onChange={(e) => set('password', e.target.value)} required minLength={6} />
              </div>

              <button className="btn btn-cta" type="submit" disabled={busy}>
                {busy ? <span className="spinner" aria-hidden="true" /> : mode === 'login' ? 'دخول' : 'إنشاء الحساب'}
              </button>
            </form>

            <p style={{ textAlign: 'center', marginTop: 16, fontSize: 14 }}>
              {mode === 'login' ? (
                <>
                  ليس لديك حساب؟{' '}
                  <button className="link-btn" type="button" onClick={() => setMode('register')}>
                    سجّل صالونك
                  </button>
                </>
              ) : (
                <>
                  لديك حساب؟{' '}
                  <button className="link-btn" type="button" onClick={() => setMode('login')}>
                    دخول
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
