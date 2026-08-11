const PREFIX = 'hlagti:ticket:'

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