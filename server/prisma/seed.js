import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

const WORKING_HOURS = {
  mon: { open: '09:00', close: '22:00' },
  tue: { open: '09:00', close: '22:00' },
  wed: { open: '09:00', close: '22:00' },
  thu: { open: '09:00', close: '22:00' },
  fri: { open: '14:00', close: '22:00' },
  sat: { open: '09:00', close: '22:00' },
  sun: null
}

async function main() {
  console.log('[seed] resetting demo data…')

  await prisma.queueEntry.deleteMany({ where: { barber: { slug: 'salon-boumediene' } } })
  await prisma.slot.deleteMany({ where: { barber: { slug: 'salon-boumediene' } } })
  await prisma.service.deleteMany({ where: { barber: { slug: 'salon-boumediene' } } })
  await prisma.barber.deleteMany({ where: { slug: 'salon-boumediene' } })
  await prisma.user.deleteMany({ where: { email: 'demo@barber.test' } })

  const passwordHash = await bcrypt.hash('demo1234', 10)
  const user = await prisma.user.create({
    data: {
      email: 'demo@barber.test',
      passwordHash,
      name: 'بومدين',
      role: 'BARBER'
    }
  })

  const barber = await prisma.barber.create({
    data: {
      userId: user.id,
      slug: 'salon-boumediene',
      shopName: 'صالون بومدين للحلاقة',
      area: 'القل',
      city: 'وهران',
      bio: 'أفضل حلاق في الحي — النتيجة نظيفة والأسعار معقولة.',
      open: true,
      avgMinutes: 17,
      workingHours: JSON.stringify(WORKING_HOURS),
      slotsEnabled: true,
      slotLengthMinutes: 30
    }
  })

  const services = [
    { name: 'قصّة', price: 350, durationMinutes: 20 },
    { name: 'حلاقة كاملة', price: 500, durationMinutes: 30 },
    { name: 'تهذيب اللحية', price: 200, durationMinutes: 15 },
    { name: 'تنظيف وترطيب', price: 250, durationMinutes: 20 }
  ]
  for (let i = 0; i < services.length; i++) {
    await prisma.service.create({
      data: { ...services[i], barberId: barber.id, sortOrder: i }
    })
  }

  const names = ['ياسين', 'أمين', 'خولة', 'سمير']
  for (let i = 0; i < names.length; i++) {
    await prisma.queueEntry.create({
      data: {
        barberId: barber.id,
        number: i + 1,
        customerName: names[i],
        status: 'WAITING',
        joinedAt: new Date(Date.now() - (25 - i * 3) * 60000)
      }
    })
  }

  console.log('[seed] done.')
  console.log('[seed]  └─ barber slug : salon-boumediene')
  console.log('[seed]  └─ login       : demo@barber.test / demo1234')
  console.log('[seed]  └─ waiting     : 4 seeded entries (نماذج)')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())