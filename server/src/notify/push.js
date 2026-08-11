import webpush from 'web-push'
import { config } from '../config.js'

if (config.vapid.publicKey && config.vapid.privateKey) {
  webpush.setVapidDetails(config.vapid.subject, config.vapid.publicKey, config.vapid.privateKey)
}

export function pushConfigured() {
  return !!(config.vapid.publicKey && config.vapid.privateKey)
}

// Returns true = sent, 'gone' = remove subscription, false = transient error.
export async function sendPush(subscription, payload) {
  if (!pushConfigured()) {
    console.log(`[push:skip] ${subscription.endpoint?.slice(0, 40)}… payload=${JSON.stringify(payload)}`)
    return true
  }
  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth }
      },
      JSON.stringify(payload)
    )
    return true
  } catch (e) {
    if (e.statusCode === 404 || e.statusCode === 410) return 'gone'
    console.error('[push:error]', e.message)
    return false
  }
}