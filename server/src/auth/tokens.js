import jwt from 'jsonwebtoken'
import { config } from '../config.js'

export function signUser(user) {
  return {
    accessToken: jwt.sign({ uid: user.id, role: user.role }, config.jwtSecret, {
      expiresIn: '1h'
    }),
    refreshToken: jwt.sign({ uid: user.id, type: 'refresh' }, config.jwtSecret, {
      expiresIn: '30d'
    })
  }
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

export function verifyRefreshToken(token) {
  const decoded = jwt.verify(token, config.jwtSecret)
  if (decoded.type !== 'refresh') throw new Error('invalid_token_type')
  return decoded
}