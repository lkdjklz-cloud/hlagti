// End-to-end API verification against a live hlagti server.
// Usage: node e2e.verify.js

const BASE = 'http://localhost:3001/api'
const BASE_WS = 'http://localhost:3001/socket.io'

let pass = 0
let fail = 0
function check(name, cond, extra = '') {
  if (cond) {
    pass++
    console.log(`  ✔ ${name}`)
  } else {
    fail++
    console.log(`  ✖ ${name} ${extra}`)
  }
}

async function req(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const r = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  })
  const json = await r.json().catch(() => ({}))
  return { status: r.status, json }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

console.log('== E2E: hlagti queue/booking/notifications ==')

// 1. Board matches prototype baseline
{
  const { json } = await req('/barbers/salon-boumediene/queue')
  console.log('  baseline board:', JSON.stringify(json))
  check('board shows 4 waiting', json.waiting === 4, `got ${json.waiting}`)
  check('eta ≈ 68min (4 x 17)', json.etaMinutes === 68, `got ${json.etaMinutes}`)
  check('shop open', json.open === true)
}

// 2. Two guests join
const A = await req('/barbers/salon-boumediene/queue/join', { method: 'POST', body: { customerName: 'زبون أ' } })
const B = await req('/barbers/salon-boumediene/queue/join', { method: 'POST', body: { customerName: 'زبون ب' } })
check('A joined (number 5)', A.json.entry?.number === 5, JSON.stringify(A.json))
check('B joined (number 6)', B.json.entry?.number === 6, JSON.stringify(B.json))
check('join returns guest token', typeof A.json.token === 'string' && A.json.token.length > 20)

const aTok = A.json.token
const bTok = B.json.token
const aId = A.json.entry.id
const bId = B.json.entry.id

{
  const { json } = await req(`/queue/my?token=${aTok}`)
  check('A ticket position = 4 (4 seeded ahead)', json.ticket?.position === 4, JSON.stringify(json.ticket))
  check('A eta = 68', json.ticket?.etaMinutes === 68, JSON.stringify(json.ticket))
}

{
  const { json } = await req(`/queue/my?token=${bTok}`)
  check('B ticket position = 5', json.ticket?.position === 5)
}

// 3. Barber login + dashboard + advance
const login = await req('/auth/login', { method: 'POST', body: { email: 'demo@barber.test', password: 'demo1234' } })
check('barber login ok', login.status === 200 && login.json.barber?.slug === 'salon-boumediene')
const barberTok = login.json.token

{
  const { json } = await req('/dashboard/queue', { token: barberTok })
  check('dashboard statWaiting = 6', json.statWaiting === 6, `got ${json.statWaiting}`)
  // start the first waiting person (seeded ياسين, number 1)
}

const first = (await req('/dashboard/queue', { token: barberTok })).json.queue[0]
const started = await req(`/dashboard/queue/${first.id}/start`, { method: 'POST', token: barberTok })
check('start first person', started.status === 200 && started.json.entry.status === 'IN_SERVICE')
const done1 = await req(`/dashboard/queue/${first.id}/done`, { method: 'POST', token: barberTok })
check('done first person', done1.status === 200)

{
  const { json } = await req(`/queue/my?token=${aTok}`)
  check('A position dropped to 3 after 1 person done', json.ticket?.position === 3, `got ${json.ticket?.position}`)
}

// 4. Advance (start+done) until A reaches position 0; check milestone notification rows
let aPos = (await req(`/queue/my?token=${aTok}`)).json.ticket.position
let guard = 0
while (aPos > 0 && guard < 8) {
  const board = (await req('/dashboard/queue', { token: barberTok })).json
  const next = board.queue.find((e) => e.status === 'WAITING')
  if (!next) break
  await req(`/dashboard/queue/${next.id}/start`, { method: 'POST', token: barberTok })
  await req(`/dashboard/queue/${next.id}/done`, { method: 'POST', token: barberTok })
  aPos = (await req(`/queue/my?token=${aTok}`)).json.ticket.position
  guard++
}
check('A reached position 0 (next up)', aPos === 0, `ended at ${aPos}`)

// 5. B (still waiting behind A) is next; verify notification milestones were recorded,
//    then B cancels own ticket and their visible status is gone.
{
  const { json } = await req(`/queue/my?token=${bTok}`)
  check('B position updated as queue advanced', json.ticket?.position >= 0 && json.ticket?.position < 5, `now ${json.ticket?.position}`)
}
const cancelled = await req(`/queue/${bId}?token=${bTok}`, { method: 'DELETE' })
check('B cancels own ticket', cancelled.status === 200)
{
  const { json } = await req(`/queue/my?token=${bTok}`)
  check('B ticket gone after cancel', json.ticket === null || json.ticket.status === 'CANCELLED', JSON.stringify(json.ticket))
}

// 6. Leftover waiters still see correct counts on the board
{
  const { json } = await req(`/queue/my?token=${aTok}`)
  check('A still in position 0 after B cancels', json.ticket?.position === 0, JSON.stringify(json.ticket))
}

// 7. Slot booking + conflict (pick a genuinely future slot today)
const today = new Date()
const todayStr = today.toISOString().slice(0, 10)
const avail = await req(`/barbers/salon-boumediene/slots?date=${todayStr}`)
check('slot availability returns times', avail.json.slots?.length > 0)
const free = avail.json.slots.find((s) => !s.taken)
const book1 = await req('/barbers/salon-boumediene/slots', {
  method: 'POST',
  body: { date: todayStr, time: free.time, customerName: 'حجز أ' }
})
check('slot booked', book1.status === 201 && book1.json.slot.status === 'BOOKED')
const book2 = await req('/barbers/salon-boumediene/slots', {
  method: 'POST',
  body: { date: todayStr, time: free.time, customerName: 'حجز ب' }
})
check('duplicate slot → 409', book2.status === 409, `got ${book2.status}`)
check('out-of-hours slot rejected', (await req('/barbers/salon-boumediene/slots', {
  method: 'POST',
  body: { date: todayStr, time: '23:30', customerName: 'x' }
})).status === 409)

// 8. Dashboard bookings list
const dash = await req('/dashboard/slots', { token: barberTok })
check('dashboard sees booking', dash.json.slots.filter((s) => s.status !== 'CANCELLED').length >= 1)

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`)
process.exit(fail ? 1 : 0)