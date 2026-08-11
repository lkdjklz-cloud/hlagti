import nodemailer from 'nodemailer'
import { config } from '../config.js'

let transporter = null

function getTransporter() {
  if (transporter) return transporter
  if (config.smtp.host) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: config.smtp.user
        ? { user: config.smtp.user, pass: config.smtp.pass }
        : undefined
    })
  }
  return transporter
}

export function emailConfigured() {
  return !!getTransporter()
}

export async function sendEmail({ to, subject, text }) {
  const t = getTransporter()
  if (!t) {
    // Dev fallback: no SMTP configured — log instead of failing.
    console.log(`[email:skip] to=${to} | subject=${subject} | body=${text}`)
    return false
  }
  try {
    await t.sendMail({ from: config.smtp.from, to, subject, text })
    return true
  } catch (e) {
    console.error('[email:error]', e.message)
    return false
  }
}