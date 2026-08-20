import jwt from 'jsonwebtoken'
import { config } from '../config.js'

export function signUser(user) {
  return jwt.sign({ uid: user.id, role: user.role }, config.jwtSecret, {
    expiresIn: '24h'
  })
}

export function signGuestTicket(entryId) {
  return jwt.sign({ type: 'guest', entryId }, config.jwtSecret, {
    expiresIn: `${config.guestTicketTtlHours}h`
  })
}

export function signBookingToken(slotId) {
  return jwt.sign({ type: 'booking', slotId }, config.jwtSecret, {
    expiresIn: `${config.guestTicketTtlHours}h`
  })
}

export function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret)
}