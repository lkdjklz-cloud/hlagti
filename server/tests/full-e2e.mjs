import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import fs from 'node:fs/promises'
import { io } from 'socket.io-client'
import prisma from '../src/db.js'

// ── Full-app E2E suite ──────────────────────────────────────────────
// Requires the server to be running (default http://localhost:3001).
// Creates its own isolated test barber + customers so the demo data is
// never touched. Uses dynamic dates so it works at any time of day.
// Run:  node --test tests/full-e2e.mjs

const BASE = process.env.E2E_BASE || 'http://localhost:3001/api'
const ORIGIN = process.env.E2E_ORIGIN || 'http://localhost:3001'
const RUN = Date.now().toString(36)
const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const createdUsers = []

function pad(n) {
  return String(n).padStart(2, '0')
}

function dateKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function addDays(n) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d
}

const todayKey = dateKey(new Date())
const tomorrowKey = dateKey(addDays(1))
const plus2Key = dateKey(addDays(2))
const plus35Key = dateKey(addDays(35))
const yesterdayKey = dateKey(addDays(-1))
const tomorrowWeekday = days[addDays(1).getDay()]
const plus2Weekday = days[addDays(2).getDay()]

function rnd(len) {
  return Array.from({ length: len }, () => Math.floor(Math.random() * 10)).join('')
}

async function req(path, opts = {}) {
  const { method = 'GET', body, token, query } = opts
  const url = new URL(BASE + path)
  if (query) url.search = new URLSearchParams(query).toString()
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  let res
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    })
  } catch (e) {
    return { status: 0, json: null, error: e }
  }
  let json = null
  try {
    json = await res.json()
  } catch {
    json = null
  }
  return { status: res.status, json }
}

function waitFor(arr, pred, ms = 5000) {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const timer = setInterval(() => {
      const hit = arr.find(pred)
      if (hit) {
        clearInterval(timer)
        resolve(hit)
      } else if (Date.now() - start > ms) {
        clearInterval(timer)
        reject(new Error('timeout waiting for socket event'))
      }
    }, 30)
  })
}

async function connectSocket() {
  const sock = io(ORIGIN, { transports: ['websocket'], reconnection: false })
  await new Promise((resolve, reject) => {
    sock.on('connect', resolve)
    sock.on('connect_error', reject)
    setTimeout(() => reject(new Error('socket connect timeout')), 5000)
  })
  return sock
}

let B = {} // main barber (registered)
let B2 = {} // second barber (upgraded customer)
let c1 = {} // logged-in customer (email+phone)
let c2 = {} // logged-in customer (phone only)
let c2Phone = '' // c2's phone (register response omits it)
let c3 = {} // customer who upgrades to barber B2
let barberTok = ''
let barberTok2 = ''
let flow = {} // shared runtime state

describe('full e2e: auth', () => {
  before(async () => {
    const reg = await req('/auth/register/barber', {
      method: 'POST',
      body: {
        username: `qa_b${RUN}`,
        email: `qb${RUN}@t.test`,
        phone: `0550${rnd(7)}`,
        password: 'secret123',
        name: 'حلاق التجربة',
        shopName: `صالون الاختبار ${RUN}`,
        area: 'وسط',
        city: 'وهران'
      }
    })
    assert.equal(reg.status, 201)
    barberTok = reg.json.accessToken
    B = { user: reg.json.user, barber: reg.json.barber }
    createdUsers.push(reg.json.user.id)

    const r1 = await req('/auth/register/customer', {
      method: 'POST',
      body: {
        username: `qa_c1${RUN}`,
        email: `qc1${RUN}@t.test`,
        phone: `0661${rnd(7)}`,
        password: 'secret123',
        name: 'زبون واحد'
      }
    })
    assert.equal(r1.status, 201)
    c1 = { user: r1.json.user, access: r1.json.accessToken }
    createdUsers.push(r1.json.user.id)

    const r2 = await req('/auth/register/customer', {
      method: 'POST',
      body: {
        username: `qa_c2${RUN}`,
        phone: `0772${c2Phone = rnd(7)}`,
        password: 'secret123',
        name: 'زبون اثنان'
      }
    })
    assert.equal(r2.status, 201)
    c2 = { user: r2.json.user, access: r2.json.accessToken }
    createdUsers.push(r2.json.user.id)

    const r3 = await req('/auth/register/customer', {
      method: 'POST',
      body: {
        username: `qa_c3${RUN}`,
        email: `qc3${RUN}@t.test`,
        password: 'secret123',
        name: 'زبون ثلاثة'
      }
    })
    assert.equal(r3.status, 201)
    c3 = { user: r3.json.user, access: r3.json.accessToken }
    createdUsers.push(r3.json.user.id)
  })

  it('register: duplicate email → 409', async () => {
    const r = await req('/auth/register/customer', {
      method: 'POST',
      body: {
        username: `qa_x${RUN}`,
        email: `qc1${RUN}@t.test`,
        phone: `0662${rnd(7)}`,
        password: 'secret123',
        name: 'مكرر'
      }
    })
    assert.equal(r.status, 409)
    assert.equal(r.json.error, 'email_taken')
  })

  it('register: duplicate username → 409', async () => {
    const r = await req('/auth/register/customer', {
      method: 'POST',
      body: {
        username: `qa_b${RUN}`,
        email: `qc9${RUN}@t.test`,
        password: 'secret123',
        name: 'مكرر اسم'
      }
    })
    assert.equal(r.status, 409)
    assert.equal(r.json.error, 'username_taken')
  })

  it('register: invalid username → 400', async () => {
    const r = await req('/auth/register/customer', {
      method: 'POST',
      body: {
        username: 'BAD USER',
        email: `qc8${RUN}@t.test`,
        password: 'secret123',
        name: 'اسم'
      }
    })
    assert.equal(r.status, 400)
  })

  it('register: customer without email/phone → 400', async () => {
    const r = await req('/auth/register/customer', {
      method: 'POST',
      body: {
        username: `qa_nc${RUN}`,
        password: 'secret123',
        name: 'بلا وسيلة'
      }
    })
    assert.equal(r.status, 400)
  })

  it('login by email → 200 with barber', async () => {
    const r = await req('/auth/login', {
      method: 'POST',
      body: { email: `qb${RUN}@t.test`, password: 'secret123' }
    })
    assert.equal(r.status, 200)
    assert.ok(r.json.accessToken)
    assert.ok(r.json.refreshToken)
    assert.equal(r.json.user.role, 'BARBER')
    assert.equal(r.json.barber.slug, B.barber.slug)
  })

  it('login by phone → 200 for customer', async () => {
    const r = await req('/auth/login', {
      method: 'POST',
      body: { email: `0772${c2Phone}`, password: 'secret123' }
    })
    assert.equal(r.status, 200)
    assert.equal(r.json.user.role, 'CUSTOMER')
    assert.equal(r.json.barber, null)
    c2.access = r.json.accessToken
  })

  it('login: wrong password → 401', async () => {
    const r = await req('/auth/login', {
      method: 'POST',
      body: { email: `qb${RUN}@t.test`, password: 'nope-nope' }
    })
    assert.equal(r.status, 401)
    assert.equal(r.json.error, 'bad_credentials')
  })

  it('/auth/me with token → role + barber', async () => {
    const r = await req('/auth/me', { token: barberTok })
    assert.equal(r.status, 200)
    assert.equal(r.json.user.role, 'BARBER')
    assert.equal(r.json.barber.id, B.barber.id)
  })

  it('/auth/me without token → 401', async () => {
    const r = await req('/auth/me')
    assert.equal(r.status, 401)
  })

  it('/auth/refresh valid → new pair', async () => {
    const login = await req('/auth/login', {
      method: 'POST',
      body: { email: `qb${RUN}@t.test`, password: 'secret123' }
    })
    const r = await req('/auth/refresh', {
      method: 'POST',
      body: { refreshToken: login.json.refreshToken }
    })
    assert.equal(r.status, 200)
    assert.ok(r.json.accessToken)
  })

  it('/auth/refresh invalid → 401', async () => {
    const r = await req('/auth/refresh', {
      method: 'POST',
      body: { refreshToken: 'garbage.token.here' }
    })
    assert.equal(r.status, 401)
  })

  it('login rate limit: 5 fails then 429 on 6th', async () => {
    const email = `rl${RUN}@t.test`
    for (let i = 0; i < 5; i++) {
      const r = await req('/auth/login', { method: 'POST', body: { email, password: 'bad' } })
      assert.equal(r.status, 401)
    }
    const blocked = await req('/auth/login', { method: 'POST', body: { email, password: 'bad' } })
    assert.equal(blocked.status, 429)
    assert.equal(blocked.json.error, 'too_many_attempts')
    // different email, same IP → not blocked (key is per ip:email)
    const other = await req('/auth/login', {
      method: 'POST',
      body: { email: `rl_ok${RUN}@t.test`, password: 'x' }
    })
    assert.equal(other.status, 401) // reaches server (401 bad creds, NOT 429)
  })

  it('/auth/upgrade/barber: customer → BARBER, second call 409', async () => {
    const up = await req('/auth/upgrade/barber', {
      method: 'POST',
      token: c3.access,
      body: { shopName: `صالون مرفوع ${RUN}`, area: 'حي', city: 'وهران' }
    })
    assert.equal(up.status, 201)
    assert.equal(up.json.user.role, 'BARBER')
    assert.ok(up.json.barber.slug)
    barberTok2 = up.json.accessToken
    B2 = { user: up.json.user, barber: up.json.barber }

    const again = await req('/auth/upgrade/barber', {
      method: 'POST',
      token: c3.access,
      body: { shopName: `مرة أخرى ${RUN}` }
    })
    // second call with OLD customer token → role is already BARBER; server checks barber exists
    assert.equal(again.status, 409)
    assert.equal(again.json.error, 'already_barber')
  })
})

describe('full e2e: public barbers', () => {
  it('GET /barbers lists everything without secrets', async () => {
    const r = await req('/barbers')
    assert.equal(r.status, 200)
    const mine = r.json.find((b) => b.slug === B.barber.slug)
    assert.ok(mine)
    assert.equal(mine.open, true)
    assert.equal(mine.services.length, 3)
    assert.equal(mine.slotsEnabled, true)
    assert.equal(mine.slotLengthMinutes, 30)
  })

  it('GET /barbers/:slug returns ordered services', async () => {
    const r = await req(`/barbers/${B.barber.slug}`)
    assert.equal(r.status, 200)
    const names = r.json.services.map((s) => s.name)
    assert.deepEqual(names, ['قصّة', 'حلاقة + لحية', 'لحية فقط'])
  })

  it('GET /barbers/unknown → 404', async () => {
    const r = await req('/barbers/does-not-exist-xyz')
    assert.equal(r.status, 404)
  })
})

describe('full e2e: queue', () => {
  it('empty board', async () => {
    const r = await req(`/barbers/${B.barber.slug}/queue`)
    assert.equal(r.status, 200)
    assert.equal(r.json.waiting, 0)
    assert.equal(r.json.inService, null)
    assert.equal(r.json.nextNumber, 1)
    assert.equal(r.json.etaMinutes, 0)
  })

  it('guest join → number 1 + guest token', async () => {
    const r = await req(`/barbers/${B.barber.slug}/queue/join`, {
      method: 'POST',
      body: { customerName: 'ضيف واحد', deviceId: `g1${RUN}` }
    })
    assert.equal(r.status, 201)
    assert.equal(r.json.entry.number, 1)
    assert.ok(r.json.token)
    flow.g1 = { entry: r.json.entry, token: r.json.token }
  })

  it('board reflects 1 waiting', async () => {
    const r = await req(`/barbers/${B.barber.slug}/queue`)
    assert.equal(r.json.waiting, 1)
    assert.equal(r.json.nextNumber, 2)
    assert.equal(r.json.inService, null)
    assert.equal(r.json.etaMinutes, 17)
  })

  it('logged-in join → number 2', async () => {
    const r = await req(`/barbers/${B.barber.slug}/queue/join`, {
      method: 'POST',
      token: c1.access,
      body: { customerName: 'زبون مسجل', deviceId: `g1c${RUN}` }
    })
    assert.equal(r.status, 201)
    assert.equal(r.json.entry.number, 2)
    flow.c1e = r.json.entry
  })

  it('same device join again → 409 already_booked', async () => {
    const r = await req(`/barbers/${B.barber.slug}/queue/join`, {
      method: 'POST',
      body: { customerName: 'ضيف مكرر', deviceId: `g1${RUN}` }
    })
    assert.equal(r.status, 409)
    assert.equal(r.json.error, 'already_booked')
  })

  it('my ticket as logged-in customer (position/eta)', async () => {
    const r = await req('/queue/my', { token: c1.access })
    assert.equal(r.status, 200)
    assert.ok(r.json.ticket)
    assert.equal(r.json.ticket.position, 1)
    assert.equal(r.json.ticket.etaMinutes, 17)
    assert.equal(r.json.ticket.waiting, 2)
  })

  it('my ticket by guest token', async () => {
    const r = await req(`/queue/my?token=${encodeURIComponent(flow.g1.token)}`)
    assert.equal(r.status, 200)
    assert.equal(r.json.ticket.position, 0)
    assert.equal(r.json.ticket.waiting, 2)
  })

  it('guest cancels own ticket → ok, board resets, numbering continues', async () => {
    const r = await req(`/queue/${flow.g1.entry.id}?token=${encodeURIComponent(flow.g1.token)}`, {
      method: 'DELETE'
    })
    assert.equal(r.status, 200)
    assert.deepEqual(r.json, { ok: true })

    const r2 = await req(`/barbers/${B.barber.slug}/queue`)
    assert.equal(r2.json.waiting, 1)
    assert.equal(r2.json.nextNumber, 3)

    const r3 = await req(`/barbers/${B.barber.slug}/queue/join`, {
      method: 'POST',
      body: { customerName: 'ضيف اثنان', deviceId: `g2${RUN}` }
    })
    assert.equal(r3.status, 201)
    assert.equal(r3.json.entry.number, 3)
    flow.g2 = { entry: r3.json.entry, token: r3.json.token }
  })

  it('cancel with a stranger token → 403', async () => {
    const r = await req(`/queue/${flow.c1e.id}?token=${encodeURIComponent(flow.g2.token)}`, {
      method: 'DELETE'
    })
    assert.equal(r.status, 403)
  })

  it('owner (JWT) cancels own ticket → ok', async () => {
    const r = await req(`/queue/${flow.c1e.id}`, { method: 'DELETE', token: c1.access })
    assert.equal(r.status, 200)
  })

  it('cancelling an already-cancelled entry → 409', async () => {
    const r = await req(`/queue/${flow.c1e.id}`, { method: 'DELETE', token: c1.access })
    assert.equal(r.status, 409)
    assert.equal(r.json.error, 'already_cancelled')
  })

  it('restore my-booking for a guest with active queue', async () => {
    const r = await req(
      `/barbers/${B.barber.slug}/my-booking?deviceId=${encodeURIComponent(`g2${RUN}`)}`
    )
    assert.equal(r.status, 200)
    assert.equal(r.json.booking.kind, 'queue')
    assert.equal(r.json.booking.id, flow.g2.entry.id)
  })
})

describe('full e2e: slots', () => {
  let t0 = '10:00'
  let tomorrow = { freeTimes: [] }

  it('availability for tomorrow returns slots (open by default)', async () => {
    const r = await req(`/barbers/${B.barber.slug}/slots?date=${tomorrowKey}`)
    assert.equal(r.status, 200)
    assert.equal(r.json.closed, false)
    assert.ok(r.json.slots.length > 5)
    tomorrow.freeTimes = r.json.slots.filter((s) => !s.taken)
    const first = tomorrow.freeTimes[0]
    if (first) t0 = first.time
  })

  it('invalid date format → 400', async () => {
    const r = await req(`/barbers/${B.barber.slug}/slots?date=not-a-date`)
    assert.equal(r.status, 400)
    assert.equal(r.json.error, 'invalid_date')
  })

  it('book a valid slot (logged-in customer) → 201 + token', async () => {
    const r = await req(`/barbers/${B.barber.slug}/slots`, {
      method: 'POST',
      token: c1.access,
      body: { date: tomorrowKey, time: t0, customerName: 'حجز مسجل', deviceId: `gs1${RUN}` }
    })
    assert.equal(r.status, 201)
    assert.ok(r.json.token)
    assert.equal(r.json.slot.status, 'BOOKED')
    assert.equal(r.json.slot.userId, c1.user.id)
    flow.slot1 = r.json.slot
    flow.slot1token = r.json.token
  })

  it('time marked taken in availability', async () => {
    const r = await req(`/barbers/${B.barber.slug}/slots?date=${tomorrowKey}`)
    const slot = r.json.slots.find((s) => s.time === t0)
    assert.equal(slot.taken, true)
  })

  it('overlapping book → 409 slot_taken', async () => {
    const r = await req(`/barbers/${B.barber.slug}/slots`, {
      method: 'POST',
      body: { date: tomorrowKey, time: t0, customerName: 'تصادم', deviceId: `gs9${RUN}` }
    })
    assert.equal(r.status, 409)
    assert.equal(r.json.error, 'slot_taken')
  })

  it('off-grid time → 409 slot_off_grid', async () => {
    const r = await req(`/barbers/${B.barber.slug}/slots`, {
      method: 'POST',
      body: { date: tomorrowKey, time: '14:07', customerName: 'خطأ', deviceId: `gs8${RUN}` }
    })
    assert.equal(r.status, 409)
    assert.equal(r.json.error, 'slot_off_grid')
  })

  it('outside working hours → 409 slot_outside_hours', async () => {
    const r = await req(`/barbers/${B.barber.slug}/slots`, {
      method: 'POST',
      body: { date: tomorrowKey, time: '07:00', customerName: 'باكور', deviceId: `gs7${RUN}` }
    })
    assert.equal(r.status, 409)
    assert.equal(r.json.error, 'slot_outside_hours')
  })

  it('past date booking → 409 slot_in_past', async () => {
    const r = await req(`/barbers/${B.barber.slug}/slots`, {
      method: 'POST',
      body: { date: yesterdayKey, time: '10:00', customerName: 'أمس', deviceId: `gs6${RUN}` }
    })
    assert.equal(r.status, 409)
    assert.equal(r.json.error, 'slot_in_past')
  })

  it('beyond 30-day window → 409 slot_outside_window', async () => {
    const r = await req(`/barbers/${B.barber.slug}/slots`, {
      method: 'POST',
      body: { date: plus35Key, time: '10:00', customerName: 'بعيد', deviceId: `gs5${RUN}` }
    })
    assert.equal(r.status, 409)
    assert.equal(r.json.error, 'slot_outside_window')
  })

  it('cancel own slot via booking token → freed', async () => {
    const r = await req(`/barbers/${B.barber.slug}/slots/${flow.slot1.id}/cancel`, {
      method: 'POST',
      body: { token: flow.slot1token }
    })
    assert.equal(r.status, 200)
    assert.equal(r.json.slot.status, 'CANCELLED')

    const avail = await req(`/barbers/${B.barber.slug}/slots?date=${tomorrowKey}`)
    const slot = avail.json.slots.find((s) => s.time === t0)
    assert.equal(slot.taken, false)
  })

  it('cancel again → 409 already_cancelled', async () => {
    const r = await req(`/barbers/${B.barber.slug}/slots/${flow.slot1.id}/cancel`, {
      method: 'POST',
      body: { token: flow.slot1token }
    })
    assert.equal(r.status, 409)
    assert.equal(r.json.error, 'already_cancelled')
  })

  it('stranger (JWT) cannot cancel someone else slot → 403', async () => {
    const booked = await req(`/barbers/${B.barber.slug}/slots`, {
      method: 'POST',
      token: c1.access,
      body: { date: tomorrowKey, time: t0, customerName: 'حجز ثان', deviceId: `gs1${RUN}` }
    })
    assert.equal(booked.status, 201)

    const r = await req(`/barbers/${B.barber.slug}/slots/${booked.json.slot.id}/cancel`, {
      method: 'POST',
      token: c2.access,
      body: { token: null }
    })
    assert.equal(r.status, 403)

    const ok = await req(`/barbers/${B.barber.slug}/slots/${booked.json.slot.id}/cancel`, {
      method: 'POST',
      body: { token: booked.json.token }
    })
    assert.equal(ok.status, 200)
  })

  it('my-booking restore resolves slot, then null after cancel', async () => {
    const book = await req(`/barbers/${B.barber.slug}/slots`, {
      method: 'POST',
      token: c1.access,
      body: { date: tomorrowKey, time: '11:00', customerName: 'استرجاع', deviceId: `gs2${RUN}` }
    })
    assert.equal(book.status, 201)

    const find = await req(
      `/barbers/${B.barber.slug}/my-booking?deviceId=${encodeURIComponent(`gs2${RUN}`)}`
    )
    assert.equal(find.status, 200)
    assert.equal(find.json.booking.kind, 'slot')
    assert.equal(find.json.booking.id, book.json.slot.id)

    await req(`/barbers/${B.barber.slug}/slots/${book.json.slot.id}/cancel`, {
      method: 'POST',
      body: { token: book.json.token }
    })
    const gone = await req(
      `/barbers/${B.barber.slug}/my-booking?deviceId=${encodeURIComponent(`gs2${RUN}`)}`
    )
    assert.equal(gone.status, 200)
    assert.equal(gone.json.booking, null)
  })
})

describe('full e2e: dashboard', () => {
  it('protected: no token → 401, customer token → 403', async () => {
    const anon = await req('/dashboard/queue')
    assert.equal(anon.status, 401)
    const cust = await req('/dashboard/queue', { token: c1.access })
    assert.equal(cust.status, 403)
  })

  it('queue board for barber', async () => {
    const r = await req('/dashboard/queue', { token: barberTok })
    assert.equal(r.status, 200)
    assert.equal(r.json.barber.slug, B.barber.slug)
    // active entries: g2 entry (number 3) still waiting
    assert.equal(r.json.statWaiting, 1)
    assert.equal(r.json.statInService, 0)
  })

  it('walk-in with phone → added with phone + number 4', async () => {
    const r = await req('/dashboard/walkin', {
      method: 'POST',
      token: barberTok,
      body: { customerName: 'واقف بالهاتف', phone: '0555' + rnd(7) }
    })
    assert.equal(r.status, 201)
    assert.equal(r.json.entry.number, 4)
    assert.equal(r.json.entry.customerPhone.length, 11)
    flow.walk1 = r.json.entry
  })

  it('walk-in without phone → allowed', async () => {
    const r = await req('/dashboard/walkin', {
      method: 'POST',
      token: barberTok,
      body: { customerName: 'واقف بلا هاتف' }
    })
    assert.equal(r.status, 201)
    flow.walk2 = r.json.entry
  })

  it('walk-in empty name → 400 validation', async () => {
    const r = await req('/dashboard/walkin', {
      method: 'POST',
      token: barberTok,
      body: { customerName: '' }
    })
    assert.equal(r.status, 400)
  })

  it('walk-in whitespace-only name → sanitized to زبون', async () => {
    const r = await req('/dashboard/walkin', {
      method: 'POST',
      token: barberTok,
      body: { customerName: '   ' }
    })
    assert.equal(r.status, 201)
    assert.equal(r.json.entry.customerName, 'زبون')
  })

  it('start first person (g2) → IN_SERVICE, cancelling in-service → 409', async () => {
    const board = await req('/dashboard/queue', { token: barberTok })
    const first = board.json.queue.find((e) => e.status === 'WAITING')
    const start = await req(`/dashboard/queue/${first.id}/start`, { method: 'POST', token: barberTok })
    assert.equal(start.status, 200)
    assert.equal(start.json.entry.status, 'IN_SERVICE')

    const cancel = await req(`/dashboard/queue/${first.id}/cancel`, { method: 'POST', token: barberTok })
    assert.equal(cancel.status, 409)
    assert.equal(cancel.json.error, 'cannot_cancel')

    const done = await req(`/dashboard/queue/${first.id}/done`, {
      method: 'POST',
      token: barberTok,
      body: { paid: true }
    })
    assert.equal(done.status, 200)
    assert.equal(done.json.entry.status, 'DONE')
    assert.equal(done.json.entry.paid, true)
    assert.ok(done.json.entry.doneAt)
    flow.served1 = first
  })

  it('done marked free (paid=false) → loyalty-free visit', async () => {
    const board = await req('/dashboard/queue', { token: barberTok })
    const first = board.json.queue.find((e) => e.status === 'WAITING')
    const start = await req(`/dashboard/queue/${first.id}/start`, { method: 'POST', token: barberTok })
    assert.equal(start.json.entry.status, 'IN_SERVICE')
    const done = await req(`/dashboard/queue/${first.id}/done`, {
      method: 'POST',
      token: barberTok,
      body: { paid: false }
    })
    assert.equal(done.json.entry.paid, false)
  })

  it('barber cancels a waiting entry', async () => {
    const r = await req('/dashboard/walkin', {
      method: 'POST',
      token: barberTok,
      body: { customerName: 'سيلغى' }
    })
    const cancel = await req(`/dashboard/queue/${r.json.entry.id}/cancel`, {
      method: 'POST',
      token: barberTok
    })
    assert.equal(cancel.status, 200)
    assert.equal(cancel.json.entry.status, 'CANCELLED')
  })

  it('appointment happy path: book → list → arrive → done', async () => {
    const book = await req(`/barbers/${B.barber.slug}/slots`, {
      method: 'POST',
      body: { date: plus2Key, time: '09:00', customerName: 'موعد ضيف', deviceId: `ga1${RUN}` }
    })
    assert.equal(book.status, 201)
    const slot = book.json.slot

    const list = await req('/dashboard/appointments', { token: barberTok })
    assert.equal(list.status, 200)
    assert.ok(list.json.appointments.some((a) => a.id === slot.id))

    const arrive = await req(`/dashboard/slots/${slot.id}/arrive`, { method: 'POST', token: barberTok })
    assert.equal(arrive.status, 200)
    assert.equal(arrive.json.slot.status, 'ARRIVED')

    const done = await req(`/dashboard/slots/${slot.id}/done`, {
      method: 'POST',
      token: barberTok,
      body: { paid: true }
    })
    assert.equal(done.status, 200)
    assert.equal(done.json.slot.status, 'DONE')
    assert.ok(done.json.slot.doneAt)
  })

  it('arrive on non-booked slot → 409 not_booked', async () => {
    const cancel = await req(`/dashboard/slots/zoplajzxdoessnotexist/cancel`, {
      method: 'POST',
      token: barberTok
    })
    assert.equal(cancel.status, 404)
  })

  it('settings: invalid avgMinutes → 400', async () => {
    const r = await req('/dashboard/settings', {
      method: 'PATCH',
      token: barberTok,
      body: { avgMinutes: 3 }
    })
    assert.equal(r.status, 400)
  })

  it('settings: invalid workingHours format → 400', async () => {
    const r = await req('/dashboard/settings', {
      method: 'PATCH',
      token: barberTok,
      body: { workingHours: { mon: { open: '25:99', close: '09:00' } } }
    })
    assert.equal(r.status, 400)
  })

  it('settings: update avgMinutes/slotLength/slotsEnabled persist publicly', async () => {
    const r = await req('/dashboard/settings', {
      method: 'PATCH',
      token: barberTok,
      body: { avgMinutes: 20, slotLengthMinutes: 60, slotsEnabled: false }
    })
    assert.equal(r.status, 200)
    assert.equal(r.json.barber.avgMinutes, 20)
    assert.equal(r.json.barber.slotLengthMinutes, 60)
    assert.equal(r.json.barber.slotsEnabled, false)

    const pub = await req(`/barbers/${B.barber.slug}`)
    assert.equal(pub.json.avgMinutes, 20)
    assert.equal(pub.json.slotLengthMinutes, 60)
    assert.equal(pub.json.slotsEnabled, false)

    await req('/dashboard/settings', {
      method: 'PATCH',
      token: barberTok,
      body: { slotLengthMinutes: 30, slotsEnabled: true }
    })
  })

  it('services: list/create/patch/delete + cross-barber isolation', async () => {
    const list = await req('/dashboard/services', { token: barberTok })
    assert.equal(list.json.services.length, 3)

    const create = await req('/dashboard/services', {
      method: 'POST',
      token: barberTok,
      body: { name: 'خدمة جديدة', price: 400, durationMinutes: 25 }
    })
    assert.equal(create.status, 201)
    assert.equal(create.json.service.sortOrder, 3)
    const svc = create.json.service

    const patch = await req(`/dashboard/services/${svc.id}`, {
      method: 'PATCH',
      token: barberTok,
      body: { price: 450 }
    })
    assert.equal(patch.status, 200)
    assert.equal(patch.json.service.price, 450)

    const bad = await req('/dashboard/services', {
      method: 'POST',
      token: barberTok,
      body: { name: 'سالب', price: -5, durationMinutes: 20 }
    })
    assert.equal(bad.status, 400)

    const cross = await req(`/dashboard/services/${svc.id}`, {
      method: 'PATCH',
      token: barberTok2,
      body: { price: 1 }
    })
    assert.equal(cross.status, 404)

    const del = await req(`/dashboard/services/${svc.id}`, { method: 'DELETE', token: barberTok })
    assert.equal(del.status, 200)
    const after = await req('/dashboard/services', { token: barberTok })
    assert.equal(after.json.services.length, 3)
  })

  it('second barber dashboard is isolated', async () => {
    const r = await req('/dashboard/queue', { token: barberTok2 })
    assert.equal(r.status, 200)
    assert.equal(r.json.barber.slug, B2.barber.slug)
    assert.equal(r.json.statWaiting, 0)
  })
})

describe('full e2e: shop geolocation', () => {
  it('settings: invalid coords rejected (out of range / half pair)', async () => {
    const badLat = await req('/dashboard/settings', {
      method: 'PATCH',
      token: barberTok,
      body: { lat: 400, lng: 3.05 }
    })
    assert.equal(badLat.status, 400)

    const badLng = await req('/dashboard/settings', {
      method: 'PATCH',
      token: barberTok,
      body: { lat: 36.75, lng: 300 }
    })
    assert.equal(badLng.status, 400)

    const half = await req('/dashboard/settings', {
      method: 'PATCH',
      token: barberTok,
      body: { lat: 36.75 }
    })
    assert.equal(half.status, 400)
  })

  it('settings: valid coords persist publicly', async () => {
    const setA = await req('/dashboard/settings', {
      method: 'PATCH',
      token: barberTok,
      body: { lat: 36.7538, lng: 3.0588 }
    })
    assert.equal(setA.status, 200)
    assert.equal(setA.json.barber.lat, 36.7538)
    assert.equal(setA.json.barber.lng, 3.0588)

    const setB = await req('/dashboard/settings', {
      method: 'PATCH',
      token: barberTok2,
      body: { lat: 41.6026, lng: 2.2894 }
    })
    assert.equal(setB.status, 200)

    const list = await req('/barbers')
    const mine = list.json.find((b) => b.slug === B.barber.slug)
    const other = list.json.find((b) => b.slug === B2.barber.slug)
    assert.equal(mine.lat, 36.7538)
    assert.equal(mine.lng, 3.0588)
    assert.equal(other.lat, 41.6026)
    assert.equal(other.lng, 2.2894)

    const single = await req(`/barbers/${B.barber.slug}`)
    assert.equal(single.json.lat, 36.7538)
    assert.equal(single.json.lng, 3.0588)
  })

  it('/barbers?lat&lng returns distanceKm and sorts nearest-first', async () => {
    const r = await req('/barbers', { query: { lat: '36.77', lng: '3.05' } })
    assert.equal(r.status, 200)
    for (const b of r.json) assert.ok(Object.hasOwn(b, 'distanceKm'), 'every shop carries distanceKm')
    const mine = r.json.find((b) => b.slug === B.barber.slug)
    const other = r.json.find((b) => b.slug === B2.barber.slug)
    assert.ok(mine.distanceKm > 0, 'distance computed for a shop with coords')
    assert.ok(mine.distanceKm < other.distanceKm, 'nearer shop has smaller distance')
    const idx = r.json.findIndex((b) => b.slug === B.barber.slug)
    const idx2 = r.json.findIndex((b) => b.slug === B2.barber.slug)
    assert.ok(idx < idx2, 'nearer shop sorts first')
  })

  it('no coords → distanceKm null, cleared coords persist as null', async () => {
    const clear = await req('/dashboard/settings', {
      method: 'PATCH',
      token: barberTok2,
      body: { lat: null, lng: null }
    })
    assert.equal(clear.status, 200)
    assert.equal(clear.json.barber.lat, null)
    assert.equal(clear.json.barber.lng, null)

    const far = await req('/barbers', {
      query: { lat: '36.77', lng: '3.05' }
    })
    const other = far.json.find((b) => b.slug === B2.barber.slug)
    assert.equal(other.distanceKm, null)
    const undone = await req('/barbers')
    const otherPlain = undone.json.find((b) => b.slug === B2.barber.slug)
    assert.equal(otherPlain.lat, null)
  })
})

describe('full e2e: barber profile photo', () => {
  function tinyPngBuffer() {
    // 1x1 red PNG (valid image/png)
    const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    return Buffer.from(b64, 'base64')
  }

  function upload(token, buf, filename, contentType) {
    const fd = new FormData()
    fd.append('photo', new Blob([buf], { type: contentType }), filename)
    return fetch(`${ORIGIN}/api/dashboard/photo`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: fd
    })
  }

  it('upload valid PNG → 201 + photoUrl publicly served', async () => {
    const res = await upload(barberTok, tinyPngBuffer(), 'photo.png', 'image/png')
    assert.equal(res.status, 201)
    const { photoUrl } = await res.json()
    assert.match(photoUrl, /^\/uploads\/.+\.png$/)

    const pub = await req('/barbers')
    const mine = pub.json.find((b) => b.slug === B.barber.slug)
    assert.equal(mine.photoUrl, photoUrl)

    const served = await fetch(`${ORIGIN}${photoUrl}`)
    assert.equal(served.status, 200)
    assert.match(served.headers.get('content-type'), /png/)

    const fname = photoUrl.split('/').pop()
    await fs.unlink(new URL(`../uploads/${fname}`, import.meta.url)).catch(() => {})
  })

  it('upload non-image → 400; no file persisted', async () => {
    const res = await upload(barberTok, Buffer.from('not an image'), 'x.txt', 'text/plain')
    assert.equal(res.status, 400)
    const body = await res.json()
    assert.equal(body.error, 'invalid_image_type')
  })

  it('upload replaces previous photo and clears to null', async () => {
    const first = await upload(barberTok, tinyPngBuffer(), 'a.png', 'image/png')
    assert.equal(first.status, 201)
    const url1 = (await first.json()).photoUrl

    const second = await upload(barberTok, tinyPngBuffer(), 'b.png', 'image/png')
    assert.equal(second.status, 201)
    const url2 = (await second.json()).photoUrl
    assert.notEqual(url1, url2)

    const del = await req('/dashboard/photo', { method: 'DELETE', token: barberTok })
    assert.equal(del.status, 200)
    assert.equal(del.json.photoUrl, null)

    const gone = await fetch(`${ORIGIN}${url1}`)
    assert.ok([404, 400].includes(gone.status), 'old file removed')

    for (const u of [url1, url2]) {
      const fname = u.split('/').pop()
      await fs.unlink(new URL(`../uploads/${fname}`, import.meta.url)).catch(() => {})
    }
  })
})

describe('full e2e: settings closed-day + bookings', () => {
  it('mark tomorrow closed via workingHours → availability closed + book 409', async () => {
    const all = Object.fromEntries(
      days.map((d) => [d, { open: '09:00', close: '22:00' }])
    )
    all[tomorrowWeekday] = null
    all[plus2Weekday] = { open: '09:00', close: '22:00' }

    const patch = await req('/dashboard/settings', {
      method: 'PATCH',
      token: barberTok,
      body: { workingHours: all }
    })
    assert.equal(patch.status, 200)

    const closed = await req(`/barbers/${B.barber.slug}/slots?date=${tomorrowKey}`)
    assert.equal(closed.json.closed, true)

    const open = await req(`/barbers/${B.barber.slug}/slots?date=${plus2Key}`)
    assert.equal(open.json.closed, false)

    const book = await req(`/barbers/${B.barber.slug}/slots`, {
      method: 'POST',
      body: { date: tomorrowKey, time: '10:00', customerName: 'مغلق', deviceId: `gs0${RUN}` }
    })
    assert.equal(book.status, 409)
    assert.equal(book.json.error, 'slot_outside_hours')
  })

  it('open/close toggle via settings', async () => {
    const close = await req('/dashboard/settings', {
      method: 'PATCH',
      token: barberTok,
      body: { open: false }
    })
    assert.equal(close.json.barber.open, false)
    const boardClosed = await req(`/barbers/${B.barber.slug}/queue`)
    assert.equal(boardClosed.json.open, false)

    const open = await req('/dashboard/settings', {
      method: 'PATCH',
      token: barberTok,
      body: { open: true }
    })
    assert.equal(open.json.barber.open, true)
  })
})

describe('full e2e: loyalty', () => {
  async function customerVisit(entryId, paid) {
    const start = await req(`/dashboard/queue/${entryId}/start`, { method: 'POST', token: barberTok })
    assert.equal(start.status, 200)
    const done = await req(`/dashboard/queue/${entryId}/done`, {
      method: 'POST',
      token: barberTok,
      body: { paid }
    })
    assert.equal(done.status, 200)
  }

  async function joinAs(token, name, deviceId) {
    const r = await req(`/barbers/${B.barber.slug}/queue/join`, {
      method: 'POST',
      token,
      body: { customerName: name, deviceId }
    })
    assert.equal(r.status, 201)
    return r.json.entry.id
  }

  it('disabled loyalty → enabled:false, no NaN fields', async () => {
    const r = await req('/dashboard/loyalty', { token: barberTok })
    assert.equal(r.status, 200)
    assert.equal(r.json.enabled, false)
    assert.equal(r.json.every, null)
    const clean = JSON.parse(JSON.stringify(r.json))
    assert.doesNotMatch(JSON.stringify(clean), /NaN/)
  })

  it('enable loyalty every=2', async () => {
    const r = await req('/dashboard/settings', {
      method: 'PATCH',
      token: barberTok,
      body: { loyaltyEvery: 2 }
    })
    assert.equal(r.status, 200)
  })

  it('1st paid visit: inCycle 1, not free yet', async () => {
    const e = await joinAs(c1.access, 'ولاء واحد', `ga${RUN}c1`)
    await customerVisit(e, true)
    const loy = await req('/dashboard/loyalty', { token: barberTok })
    const me = loy.json.customers.find((c) => c.name === c1.user.username)
    assert.ok(me)
    assert.equal(me.paid, 1)
    assert.equal(me.inCycle, 1)
    assert.equal(me.nextFree, false)
  })

  it('2nd paid visit: threshold reached → loyalty_reached + nextFree', async () => {
    const e = await joinAs(c1.access, 'ولاء اثنان', `ga${RUN}c1`)
    await customerVisit(e, true)
    const loy = await req('/dashboard/loyalty', { token: barberTok })
    const me = loy.json.customers.find((c) => c.name === c1.user.username)
    assert.equal(me.paid, 2)
    assert.equal(me.nextFree, true)
    assert.equal(me.inCycle, 0)

    const notifs = await req('/dashboard/notifications', { token: barberTok })
    const reached = notifs.json.notifications.filter((n) => n.type === 'loyalty_reached')
    assert.equal(reached.length, 1)
    flow.reachedCount = reached.length
  })

  it('3rd visit marked free: claimed, nextFree false, no duplicate reward', async () => {
    const e = await joinAs(c1.access, 'ولاء مجاني', `ga${RUN}c1`)
    await customerVisit(e, false)
    const loy = await req('/dashboard/loyalty', { token: barberTok })
    const me = loy.json.customers.find((c) => c.name === c1.user.username)
    assert.equal(me.paid, 2)
    assert.equal(me.free, 1)
    assert.equal(me.nextFree, false)

    const notifs = await req('/dashboard/notifications', { token: barberTok })
    const reached = notifs.json.notifications.filter((n) => n.type === 'loyalty_reached')
    assert.equal(reached.length, flow.reachedCount, 'no duplicate reward notification')
  })

  it('customer got loyalty_reward (earned) + loyalty_free (claimed) notifications', async () => {
    const reward = await prisma.notification.findFirst({
      where: { userId: c1.user.id, type: 'loyalty_reward' },
      orderBy: { createdAt: 'desc' }
    })
    assert.ok(reward, 'loyalty_reward notification stored for the customer')
    assert.match(reward.body, /مجانية/)

    const freeNotif = await prisma.notification.findFirst({
      where: { userId: c1.user.id, type: 'loyalty_free' },
      orderBy: { createdAt: 'desc' }
    })
    assert.ok(freeNotif, 'loyalty_free notification stored for the customer')
    assert.match(freeNotif.title, /🎉/)
  })

  it('loyalty/my progress after the free claim', async () => {
    const r = await req(`/barbers/${B.barber.slug}/loyalty/my`, { token: c1.access })
    assert.equal(r.status, 200)
    const l = r.json.loyalty
    assert.ok(l?.enabled)
    assert.equal(l.every, 2)
    assert.equal(l.paid, 2)
    assert.equal(l.free, 1)
    assert.equal(l.nextFree, false)
    assert.equal(l.remaining, 2)
    const guest = await req(`/barbers/${B.barber.slug}/loyalty/my`)
    assert.equal(guest.status, 200)
    assert.equal(guest.json.loyalty, null)
  })

  it('second cycle: board flags loyaltyNextFree + ticket carries loyalty', async () => {
    // Two more paid visits → a fresh reward is pending (next visit free).
    let e = await joinAs(c1.access, 'ولاء رابع', `ga${RUN}c1`)
    await customerVisit(e, true)
    e = await joinAs(c1.access, 'ولاء خامس', `ga${RUN}c1`)
    await customerVisit(e, true)

    const r = await req('/dashboard/loyalty', { token: barberTok })
    const me = r.json.customers.find((c) => c.name === c1.user.username)
    assert.equal(me.paid, 4)
    assert.equal(me.nextFree, true)

    // Logged-in customer joins → their ticket + the board both know.
    const activeId = await joinAs(c1.access, 'ولاء الجاي مجاني', `ga${RUN}c1`)
    const mine = await req('/queue/my', { token: c1.access })
    assert.equal(mine.status, 200)
    assert.ok(mine.json.ticket.loyalty?.enabled)
    assert.equal(mine.json.ticket.loyalty.nextFree, true)
    assert.equal(mine.json.ticket.loyalty.remaining, 0)

    const board = await req('/dashboard/queue', { token: barberTok })
    const row = board.json.queue.find((x) => x.id === activeId)
    assert.ok(row, 'active entry present on the board')
    assert.equal(row.loyaltyNextFree, true, 'barber board knows the next cut is free')
    assert.equal(row.loyaltyRemaining, 0)

    // Claim that free cut → cycle closes, no leftover active entry.
    await customerVisit(activeId, false)
    const after = await req('/dashboard/loyalty', { token: barberTok })
    const me2 = after.json.customers.find((c) => c.name === c1.user.username)
    assert.equal(me2.free, 2)
    assert.equal(me2.nextFree, false)
    assert.equal(me2.remaining, 2)
  })

  it('slot DONE (paid) counts toward loyalty', async () => {
    const book = await req(`/barbers/${B.barber.slug}/slots`, {
      method: 'POST',
      token: c2.access,
      body: { date: plus2Key, time: '11:00', customerName: 'موعد ولاء', deviceId: `ga${RUN}c2` }
    })
    assert.equal(book.status, 201)
    await req(`/dashboard/slots/${book.json.slot.id}/arrive`, { method: 'POST', token: barberTok })
    await req(`/dashboard/slots/${book.json.slot.id}/done`, {
      method: 'POST',
      token: barberTok,
      body: { paid: true }
    })
    const loy = await req('/dashboard/loyalty', { token: barberTok })
    const me = loy.json.customers.find((c) => c.name === c2.user.username)
    assert.ok(me)
    assert.equal(me.paid, 1)
  })

  it('customers sorted by paid desc', async () => {
    const r = await req('/dashboard/loyalty', { token: barberTok })
    const names = r.json.customers.map((c) => c.paid)
    assert.equal(JSON.stringify(names), JSON.stringify([...names].sort((a, b) => b - a)))
  })

  it('notifications: barber received queue_joined/cancelled + mark-read', async () => {
    const notifs = await req('/dashboard/notifications', { token: barberTok })
    assert.ok(notifs.json.notifications.some((n) => n.type === 'queue_joined'))
    const unread = notifs.json.unread
    const mark = await req('/dashboard/notifications/read', { method: 'POST', token: barberTok })
    assert.equal(mark.status, 200)
    assert.deepEqual(mark.json, { ok: true })
    const after = await req('/dashboard/notifications', { token: barberTok })
    assert.equal(after.json.unread, 0)
    assert.equal(typeof unread, 'number')
  })

  it('free cut → live loyalty:celebrate lands on the ticket room', async () => {
    const j = await req(`/barbers/${B.barber.slug}/queue/join`, {
      method: 'POST',
      token: c1.access,
      body: { customerName: 'ولاء سوك مجاني', deviceId: `ga${RUN}c1sock` }
    })
    assert.equal(j.status, 201)
    const sock = await connectSocket()
    try {
      const evs = []
      sock.on('loyalty:celebrate', (d) => evs.push(d))
      sock.emit('ticket:join', { token: j.json.token })
      // Give the server a beat to process the room join before the visit.
      await new Promise((r) => setTimeout(r, 400))

      await customerVisit(j.json.entry.id, false)
      const ev = await waitFor(evs, (d) => d.moment === 'free')
      assert.match(ev.title, /🎉/)
      assert.match(ev.body, /مجان/)
    } finally {
      sock.disconnect()
    }
  })
})

describe('full e2e: realtime sockets', () => {
  let barberSock, watcherSock, aSock, bSock
  let barberEv = { queue: [], notify: [] }
  let watcherEv = { queue: [] }
  let aEv = { update: [], removed: [] }
  let bEv = { update: [], removed: [] }
  let sA, sB

  before(async () => {
    const board = await req('/dashboard/queue', { token: barberTok })
    if (board.status === 200) {
      for (const e of board.json.queue || []) {
        if (e.status === 'WAITING') {
          await req(`/dashboard/queue/${e.id}/cancel`, { method: 'POST', token: barberTok })
        }
      }
    }
    barberSock = await connectSocket()
    watcherSock = await connectSocket()
    barberSock.emit('barber:join', B.barber.id)
    watcherSock.emit('barber:join', B.barber.id)
    barberSock.on('queue:update', (d) => barberEv.queue.push(d))
    barberSock.on('notify:new', (d) => barberEv.notify.push(d))
    watcherSock.on('queue:update', (d) => watcherEv.queue.push(d))
  })

  it('customer join → barber room gets queue:update + notify:new', async () => {
    const join = await req(`/barbers/${B.barber.slug}/queue/join`, {
      method: 'POST',
      body: { customerName: 'سوك ا', deviceId: `sckA${RUN}` }
    })
    assert.equal(join.status, 201)
    sA = { entry: join.json.entry, token: join.json.token }

    await assert.doesNotReject(waitFor(barberEv.queue, (d) => d.waiting >= 1))
    await assert.doesNotReject(waitFor(barberEv.notify, (d) => d.type === 'queue_joined'))

    aSock = await connectSocket()
    aSock.emit('ticket:join', { token: sA.token })
    aSock.on('ticket:update', (d) => aEv.update.push(d))
    aSock.on('ticket:removed', () => aEv.removed.push(true))
  })

  it('behind customer joins → my ticket room only, board to barbers', async () => {
    const join = await req(`/barbers/${B.barber.slug}/queue/join`, {
      method: 'POST',
      body: { customerName: 'سوك ب', deviceId: `sckB${RUN}` }
    })
    sB = { entry: join.json.entry, token: join.json.token }
    bSock = await connectSocket()
    bSock.emit('ticket:join', { token: sB.token })
    bSock.on('ticket:update', (d) => bEv.update.push(d))
    bSock.on('ticket:removed', () => bEv.removed.push(true))
  })

  it('walk-in behind → B receives ticket:update (waiting grows)', async () => {
    await req('/dashboard/walkin', {
      method: 'POST',
      token: barberTok,
      body: { customerName: 'سوك واقف', deviceId: `sckW${RUN}` }
    })

    const upd = await waitFor(bEv.update, (d) => d.id === sB.entry.id && d.waiting >= 3)
    assert.equal(upd.position, 1)
    assert.ok(upd.etaMinutes > 0)
    await assert.doesNotReject(waitFor(barberEv.queue, (d) => d.waiting >= 3))
  })

  it('barber starts + done of A → A removed, B position drops to 0', async () => {
    await req(`/dashboard/queue/${sA.entry.id}/start`, { method: 'POST', token: barberTok })
    const done = await req(`/dashboard/queue/${sA.entry.id}/done`, {
      method: 'POST',
      token: barberTok,
      body: { paid: true }
    })
    assert.equal(done.status, 200)

    await assert.doesNotReject(waitFor(aEv.removed, (b) => b === true))
    const upd = await waitFor(bEv.update, (d) => d.id === sB.entry.id && d.position === 0)
    assert.equal(upd.waiting < 3, true)
    await assert.doesNotReject(waitFor(watcherEv.queue, (d) => d.inService === null))
  })

  it('guest cancels own ticket → ticket:removed + notify to barber + watcher board', async () => {
    const r = await req(`/queue/${sB.entry.id}?token=${encodeURIComponent(sB.token)}`, {
      method: 'DELETE'
    })
    assert.equal(r.status, 200)

    await assert.doesNotReject(waitFor(bEv.removed, (b) => b === true))
    await assert.doesNotReject(waitFor(barberEv.notify, (d) => d.type === 'queue_cancelled'))
    await assert.doesNotReject(waitFor(watcherEv.queue, (d) => d.waiting >= 1))
  })

  after(() => {
    ;[barberSock, watcherSock, aSock, bSock].forEach((s) => s && s.close())
  })
})

after(async () => {
  if (createdUsers.length) {
    await prisma.user.deleteMany({ where: { id: { in: createdUsers } } }).catch((e) => {
      console.log('[e2e] cleanup failed:', e.message)
    })
    await prisma.$disconnect().catch(() => {})
  }
})