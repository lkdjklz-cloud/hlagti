const PREFIX = 'hlagti:ticket:'
const BOOK_PREFIX = 'hlagti:booking:'

export function saveTicket(barberId, token) {
  try {
    localStorage.setItem(PREFIX + barberId, token)
  } catch {
    /* storage may be unavailable */
  }
}

export function loadTicket(barberId) {
  try {
    return localStorage.getItem(PREFIX + barberId)
  } catch {
    return null
  }
}

export function clearTicket(barberId) {
  try {
    localStorage.removeItem(PREFIX + barberId)
  } catch {
    /* ignore */
  }
}

export function saveBookingToken(barberId, token) {
  try {
    localStorage.setItem(BOOK_PREFIX + barberId, token)
  } catch {
    /* storage may be unavailable */
  }
}

export function loadBookingToken(barberId) {
  try {
    return localStorage.getItem(BOOK_PREFIX + barberId)
  } catch {
    return null
  }
}

export function clearBookingToken(barberId) {
  try {
    localStorage.removeItem(BOOK_PREFIX + barberId)
  } catch {
    /* ignore */
  }
}