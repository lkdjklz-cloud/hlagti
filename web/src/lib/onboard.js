const ONBOARDED_KEY = 'hlagti:onboarded'

export function isOnboarded() {
  try {
    return localStorage.getItem(ONBOARDED_KEY) === '1'
  } catch {
    return true
  }
}

export function markOnboarded() {
  try {
    localStorage.setItem(ONBOARDED_KEY, '1')
  } catch {
    /* ignore */
  }
}