import { useMemo, useState } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { api, setToken } from '../lib/api.js'
import { useToast } from '../lib/toast.jsx'
import { IconScissors } from '../components/Icons.jsx'

const USERNAME_RE = /^[a-z][a-z0-9_]{2,19}$/

export default function Login() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const toast = useToast()
  const [mode, setMode] = useState('login')
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState(() => {
    const barber = (params.get('role') || 'barber') === 'barber'
    return {
      role: barber ? 'barber' : 'customer',
      email: barber ? 'demo@barber.test' : '',
      password: barber ? 'demo1234' : '',
      username: '',
      name: '',
      shopName: '',
      area: '',
      city: ''
    }
  })

  const isBarber = form.role === 'barber'

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  function switchRole(role) {
    setForm((f) => ({
      ...f,
      role,
      ...(role === 'barber' ? { email: 'demo@barber.test', password: 'demo1234' } : { email: '', password: '' })
    }))
  }

  const usernameError = useMemo(() => {
    if (mode !== 'register') return null
    if (!form.username) return 'اسم المستخدم مطلوب'
    if (form.username !== form.username.toLowerCase()) return 'استخدم حروفًا صغيرة فقط'
    if (!USERNAME_RE.test(form.username)) return '3–20 حرفًا إنجليزيًا: حروف وأرقام و _ فقط، يبدأ بحرف'
    return null
  }, [mode, form.username])

  async function submit(e) {
    e.preventDefault()
    if (mode === 'register' && usernameError) {
      toast(usernameError)
      return
    }
    setBusy(true)
    try {
      let res
      if (mode === 'login') {
        res = await api('/auth/login', { method: 'POST', body: { email: form.email, password: form.password } })
      } else {
        const prefix = isBarber ? '/auth/register/barber' : '/auth/register/customer'
        res = await api(prefix, {
          method: 'POST',
          body: {
            username: form.username.toLowerCase(),
            name: form.name,
            shopName: form.shopName,
            area: form.area,
            city: form.city,
            email: form.email,
            password: form.password
          }
        })
      }
      setToken(res.token)
      toast(mode === 'login' ? 'تم الدخول بنجاح' : 'تم إنشاء الحساب')
      if (res.user?.role === 'BARBER') navigate('/dashboard')
      else navigate('/')
    } catch (err) {
      if (err.message === 'bad_credentials') toast('بيانات الدخول غير صحيحة')
      else if (err.message === 'username_taken') toast('اسم المستخدم محجوز — اختر اسمًا آخر')
      else if (err.message === 'email_taken') toast('البريد مسجّل بالفعل — سجّل دخولك')
      else toast('حدث خطأ، حاول مجددًا')
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
              {mode === 'login' ? (isBarber ? 'دخول الحلّاق' : 'دخول الزبون') : isBarber ? 'حساب حلّاق جديد' : 'حساب زبون جديد'}
            </h1>
            <p style={{ color: 'var(--muted)', fontSize: 13.5, margin: '0 0 18px' }}>
              {mode === 'login'
                ? isBarber
                  ? 'سجّل دخولك لإدارة طابور الصالون.'
                  : 'دخولك يتيح لك تجميع مكافآت الولاء ومراجعة حجوزاتك.'
                : isBarber
                  ? 'أنشئ صفحتك — سيظهر رابطها للزبائن فورًا.'
                  : 'حساب واحد يجمع لك مكافآت الولاء عبر الصالونات.'}
            </p>

            <form onSubmit={submit}>
              {mode === 'register' && (
                <>
                  <div className="row" style={{ marginBottom: '14px' }}>
                    <button
                      type="button"
                      className={`btn ${isBarber ? 'btn-cta' : 'btn-secondary'}`}
                      style={{ flex: 1 }}
                      onClick={() => switchRole('barber')}
                    >
                      أنا حلّاق
                    </button>
                    <button
                      type="button"
                      className={`btn ${!isBarber ? 'btn-cta' : 'btn-secondary'}`}
                      style={{ flex: 1 }}
                      onClick={() => switchRole('customer')}
                    >
                      أنا زبون
                    </button>
                  </div>

                  <div className="field">
                    <label className="label">اسم المستخدم (بالأحرف الإنجليزية)</label>
                    <input
                      className="input"
                      dir="ltr"
                      value={form.username}
                      onChange={(e) => set('username', e.target.value)}
                      autoComplete="username"
                      required
                    />
                    {usernameError && <div className="error-box" style={{ marginTop: 6, fontSize: 12.5 }}>{usernameError}</div>}
                  </div>
                  <div className="field">
                    <label className="label">اسمك</label>
                    <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} required />
                  </div>
                  {isBarber && (
                    <>
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
                    {isBarber ? 'سجّل صالونك' : 'أنشئ حساب زبون'}
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