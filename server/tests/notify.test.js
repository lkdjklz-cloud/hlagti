import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import prisma from '../src/db.js'
import { createNotification, hasNotifiedToday, lastPosition } from '../src/notify/notify.js'

const KEY = 'test-position:entry-xyz'

before(async () => {
  await prisma.notification.deleteMany({ where: { key: { startsWith: 'test-' } } })
})

test('createNotification stores + dispatches without subscriptions', async () => {
  const n = await createNotification({
    key: 'test-joined:x',
    type: 'joined',
    title: 'تم الحجز',
    body: 'رقمك 5',
    data: { entryId: 'x' }
  })
  assert.ok(n.id)
  assert.equal(n.type, 'joined')
})

test('hasNotifiedToday dedupes same key', async () => {
  assert.equal(await hasNotifiedToday('test-dedupe:1'), false)
  await createNotification({ key: 'test-dedupe:1', type: 'milestone_one', title: 't', body: 'b' })
  assert.equal(await hasNotifiedToday('test-dedupe:1'), true)
})

test('lastPosition tracks latest stored position', async () => {
  assert.equal(await lastPosition(KEY), null)
  await createNotification({
    key: KEY,
    type: 'position',
    title: 'تحرّك دورك',
    body: '3 أشخاص قبلك',
    data: { entryId: 'entry-xyz', position: 3 }
  })
  assert.equal(await lastPosition(KEY), 3)
  await createNotification({
    key: KEY,
    type: 'position',
    title: 'تحرّك دورك',
    body: '2 أشخاص قبلك',
    data: { entryId: 'entry-xyz', position: 2 }
  })
  assert.equal(await lastPosition(KEY), 2)
})

after(async () => {
  await prisma.notification.deleteMany({ where: { key: { startsWith: 'test-' } } })
  await prisma.$disconnect()
})