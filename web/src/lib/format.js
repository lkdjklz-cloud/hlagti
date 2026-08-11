export function fmtDuration(min) {
  const total = Math.max(0, Math.round(min || 0))
  const h = Math.floor(total / 60)
  const r = total % 60
  const hs =
    h === 0 ? '' : h === 1 ? 'ساعة' : h === 2 ? 'ساعتين' : h <= 10 ? h + ' ساعات' : h + ' ساعة'
  const rs =
    r === 1 ? 'دقيقة' : r === 2 ? 'دقيقتين' : r <= 10 ? r + ' دقائق' : r + ' دقيقة'
  if (h === 0) return rs
  if (r === 0) return hs
  return hs + ' و ' + rs
}

export function fmtClock(date) {
  const d = new Date(date)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

export function fmtRelative(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'الآن'
  if (mins < 60) return `قبل ${fmtDuration(mins)}`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `قبل ${fmtDuration(hours * 60)}`
  const days = Math.floor(hours / 24)
  return `قبل ${days} يوم`
}

export function fmtPrice(value) {
  return new Intl.NumberFormat('ar-DZ').format(value)
}

const DOW = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت']
const DOW_SHORT = ['أحد', 'إثن', 'ثلا', 'أرب', 'خمس', 'جمع', 'سبت']

export function dayNumber(date) {
  return new Date(date).getDay()
}

export function dowName(date) {
  return DOW[dayNumber(date)]
}

export function dowShort(date) {
  return DOW_SHORT[dayNumber(date)]
}

export function todayKey(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}