import { api } from './api.js'

export function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

export async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('/sw.js')
      return true
    } catch {
      return false
    }
  }
  return false
}

export async function isSubscribed() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    return !!sub
  } catch {
    return false
  }
}

// Returns { ok: true } | { supported: false } | { denied: true } | { error }
export async function subscribePush({ ticketToken } = {}) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { supported: false }
  }
  try {
    await registerServiceWorker()
    const reg = await navigator.serviceWorker.ready
    const existing = await reg.pushManager.getSubscription()

    const perm =
      existing || Notification.permission === 'granted'
        ? 'granted'
        : await Notification.requestPermission()
    if (perm !== 'granted') return { denied: true }

    let sub = existing
    if (!sub) {
      const cfg = await api('/config/public')
      if (!cfg.vapidPublicKey) return { error: 'no_vapid' }
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(cfg.vapidPublicKey)
      })
    }
    await api('/push/subscribe', {
      method: 'POST',
      body: { subscription: sub.toJSON(), ticketToken }
    })
    return { ok: true }
  } catch (e) {
    return { error: e.message || 'push_error' }
  }
}

export async function unsubscribePush() {
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (sub) {
      await api('/push/unsubscribe', {
        method: 'POST',
        body: { endpoint: sub.endpoint }
      })
      await sub.unsubscribe()
    }
  } catch {
    /* ignore */
  }
}