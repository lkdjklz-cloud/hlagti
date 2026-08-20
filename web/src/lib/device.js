const KEY = 'hlagti:deviceId'

export function getDeviceId() {
  try {
    let id = localStorage.getItem(KEY)
    if (!id) {
      const rand =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
              const r = (Math.random() * 16) | 0
              return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
            })
      id = `dev_${rand}`
      localStorage.setItem(KEY, id)
    }
    return id
  } catch {
    return null
  }
}