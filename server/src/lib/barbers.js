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

// Start of the server-local day (used for daily ticket numbering).
export function startOfTodayLocal() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}