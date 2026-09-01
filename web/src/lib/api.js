const TOKEN_KEY = 'hlagti:jwt'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}
export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token)
}
export function setTokens({ accessToken }) {
  if (accessToken) localStorage.setItem(TOKEN_KEY, accessToken)
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
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