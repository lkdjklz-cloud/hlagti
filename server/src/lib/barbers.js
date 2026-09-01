import prisma from '../db.js'

export async function resolveBarberBySlug(slug) {
  try {
    return await prisma.barber.findUnique({
      where: { slug },
      include: { services: { orderBy: { sortOrder: 'asc' } } }
    })
  } catch (e) {
    console.log('[db:error] resolveBarberBySlug', slug, e)
    throw e
  }
}

// Start of today in the given timezone (IANA string, e.g. 'Africa/Algiers').
// Falls back to server-local time when no timezone is provided.
export function startOfTodayLocal(timezone) {
  if (!timezone) {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), now.getDate())
  }
  const now = new Date()
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now)
  const get = (type) => Number(parts.find((p) => p.type === type).value)
  return new Date(get('year'), get('month') - 1, get('day'))
}