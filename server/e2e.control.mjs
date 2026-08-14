// E2E for S10–S13: shop registration defaults, booking, barber notifications,
// appointments, and loyalty.
const BASE = 'http://localhost:3001/api'
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
const d = (offset) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10)
const pad = (n) => String(n).padStart(2, '0')
function timeNowPlus(minutes) {
  const t = new Date(Date.now() + minutes * 60000)
  return `${pad(t.getHours())}:${pad(Math.floor(t.getMinutes() / 5) * 5)}`
}

console.log('== E2E S10-13: control page features ==')

// 1. Register a new shop → defaults present
const reg = await req('/auth/register/barber', {
  method: 'POST',
  body: {
    email: `ctrl${Date.now()}@test.dev`,
    password: 'secret123',
    name: 'حلاق تجريبي',
    shopName: 'صالون تجربة التحكم',
    city: 'وهران'
  }
})
check('register ok', reg.status === 201 && !!reg.json.token)
const tok = reg.json.token
const slug = reg.json.barber.slug

{
  const pub = await req(`/barbers/${slug}`)
  check('new shop has default services', (pub.json.services || []).length >= 3)
  check('new shop booking enabled', pub.json.slotsEnabled === true)
  const avail = await req(`/barbers/${slug}/slots?date=${d(0)}`)
  check('new shop has available slots today', avail.json.slots && avail.json.slots.length > 0, JSON.stringify(avail.json).slice(0, 120))
}

// 2. Booking a turn → barber gets notified
const free = (await req(`/barbers/${slug}/slots?date=${d(0)}`)).json.slots.find((s) => !s.taken && s.time >= timeNowPlus(30))
check('found a future free slot', !!free)
if (free) {
  const book = await req(`/barbers/${slug}/slots`, {
    method: 'POST',
    body: { date: d(0), time: free.time, customerName: 'زبون محجوز', phone: '0550123456' }
  })
  check('booked', book.status === 201)
  const notifs = await req('/dashboard/notifications', { token: tok })
  check('barber notified on booking', notifs.json.notifications.some((n) => n.type === 'slot_booked'), JSON.stringify(notifs.json.notifications.map((n) => n.type)))
}

// 3. Queue join → barber notified; appointments list
{
  const join = await req(`/barbers/${slug}/queue/join`, {
    method: 'POST',
    body: { customerName: 'زبون واقف', phone: '0660111222' }
  })
  check('queue join ok', join.status === 201)
  const notifs = await req('/dashboard/notifications', { token: tok })
  check('barber notified on join', notifs.json.notifications.some((n) => n.type === 'queue_joined'))
  const appts = await req('/dashboard/appointments', { token: tok })
  check('appointments lists the booking', appts.json.appointments.length >= 1)
}

// 4. Guest cancels their turn → barber notified
{
  const join2 = await req(`/barbers/${slug}/queue/join`, { method: 'POST', body: { customerName: 'ملغي' } })
  const id2 = join2.json.entry.id
  const cancelled = await req(`/queue/${id2}?token=${encodeURIComponent(join2.json.token)}`, { method: 'DELETE' })
  check('guest cancel ok', cancelled.status === 200)
  const notifs = await req('/dashboard/notifications', { token: tok })
  check('barber notified on cancel', notifs.json.notifications.some((n) => n.type === 'queue_cancelled'))
}

// 5. Loyalty: every=2 → second paid visit triggers "next free", free visit not counted
{
  await req('/dashboard/settings', { method: 'PATCH', token: tok, body: { loyaltyEvery: 2 } })
  const me = await req('/auth/me', { token: tok })
  check('loyaltyEvery saved', me.json.barber.loyaltyEvery === 2, JSON.stringify(me.json.barber.loyaltyEvery))

  // two visits for the same phone, both paid
  for (let i = 0; i < 2; i++) {
    const j = await req(`/barbers/${slug}/queue/join`, { method: 'POST', body: { customerName: 'زبون ولاء', phone: '0770000001' } })
    await req(`/dashboard/queue/${j.json.entry.id}/start`, { method: 'POST', token: tok })
    await req(`/dashboard/queue/${j.json.entry.id}/done`, { method: 'POST', token: tok, body: { paid: true } })
  }
  const loy = await req('/dashboard/loyalty', { token: tok })
  const c = loy.json.customers.find((x) => x.phone === '0770000001')
  check('loyalty: 2 paid visits tracked', !!c && c.paid === 2, JSON.stringify(loy.json.customers))
  check('loyalty: next visit is free', !!c && c.nextFree === true)
  const notifs = await req('/dashboard/notifications', { token: tok })
  check('barber notified on loyalty milestone', notifs.json.notifications.some((n) => n.type === 'loyalty_reached'))

  // third visit marked FREE → paid stays 2
  const j3 = await req(`/barbers/${slug}/queue/join`, { method: 'POST', body: { customerName: 'زبون ولاء', phone: '0770000001' } })
  await req(`/dashboard/queue/${j3.json.entry.id}/start`, { method: 'POST', token: tok })
  await req(`/dashboard/queue/${j3.json.entry.id}/done`, { method: 'POST', token: tok, body: { paid: false } })
  const loy2 = await req('/dashboard/loyalty', { token: tok })
  const c2 = loy2.json.customers.find((x) => x.phone === '0770000001')
  check('loyalty: free visit not counted as paid', !!c2 && c2.paid === 2 && c2.free === 1, JSON.stringify(c2))
}

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`)
process.exit(fail ? 1 : 0)