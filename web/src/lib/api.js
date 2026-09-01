const TOKEN_KEY = 'hlagti:jwt'
const REFRESH_KEY = 'hlagti:refresh'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}
export function getRefreshToken() {
  return localStorage.getItem(REFRESH_KEY)
}
export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token)
}
export function setRefreshToken(token) {
  localStorage.setItem(REFRESH_KEY, token)
}
export function setTokens({ accessToken, refreshToken }) {
  if (accessToken) localStorage.setItem(TOKEN_KEY, accessToken)
  if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken)
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REFRESH_KEY)
}

export async function api(path, { method = 'GET', body, token } = {}) {
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const t = token ?? getToken()
  if (t) headers['Authorization'] = `Bearer ${t}`

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw Object.assign(new Error(err.error || 'request_failed'), {
      status: res.status,
      issues: err.issues
    })
  }
  return res.json()
}

export async function apiUpload(path, formData, { method = 'POST', token } = {}) {
  const headers = {}
  const t = token ?? getToken()
  if (t) headers['Authorization'] = `Bearer ${t}`
  const res = await fetch(`/api${path}`, { method, headers, body: formData })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw Object.assign(new Error(err.error || 'request_failed'), { status: res.status })
  }
  return res.json()
}